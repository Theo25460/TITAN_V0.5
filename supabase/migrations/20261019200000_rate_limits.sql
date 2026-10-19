-- CHEAT16 / CHEAT17: server-side rate limits on the sensitive write paths that had none.
-- A limit sits on the TABLE write (BEFORE trigger), not in each RPC: no existing function body is rewritten and a direct
-- write by an authenticated session is covered as well. Only an authenticated session is limited (auth.uid() set):
-- service role, the billing worker, administration and SQL-editor maintenance are never throttled.
-- Ceilings are generous for an honest player and only stop scripts:
--   own guild join/leave 10/h, purchases 120/h, edits/archives of own sessions 60/h.
-- Friend requests, moment shares/cheers and social challenges already have their own limits (titan_social_rate_limit): untouched.
-- At 75 % of a ceiling one 'rate_limit.near' signal is logged (visible in the moderation queue); at the ceiling the write
-- fails with RATE_LIMITED (SQLSTATE PT429) and nothing is changed. The rejected attempt itself cannot be logged: it rolls back.
-- Additive and backward compatible. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: docs/CDC_WEB_RATE_LIMITS_HANDOFF_2026-10-19.md.

create table if not exists private.titan_rate_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  at timestamptz not null default now()
);
revoke all on table private.titan_rate_events from public, anon, authenticated;
create index if not exists titan_rate_events_lookup_idx on private.titan_rate_events (user_id, bucket, at desc);

create or replace function private.titan_rate_limit(p_user uuid, p_bucket text, p_max integer, p_window interval default interval '1 hour')
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if p_user is null then return; end if;
  -- Serialise concurrent attempts of one user on one bucket so two parallel scripts cannot both pass the check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text || ':' || p_bucket, 0));
  delete from private.titan_rate_events where user_id = p_user and bucket = p_bucket and at < now() - interval '1 day';
  select count(*) into v_count from private.titan_rate_events
   where user_id = p_user and bucket = p_bucket and at > now() - p_window;
  if v_count >= p_max then
    raise exception 'RATE_LIMITED' using errcode = 'PT429', detail = p_bucket;
  end if;
  insert into private.titan_rate_events(user_id, bucket) values (p_user, p_bucket);
  if v_count + 1 = ceil(p_max * 0.75)::integer then
    perform public.titan_log_suspicious_action(p_user, 'rate_limit.near', 'medium', 'RATE_LIMIT_NEAR_' || upper(p_bucket),
      jsonb_build_object('bucket', p_bucket, 'ceiling', p_max, 'windowMinutes', extract(epoch from p_window) / 60));
  end if;
end;
$function$;
revoke all on function private.titan_rate_limit(uuid, text, integer, interval) from public, anon, authenticated;

create or replace function private.titan_rate_limit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row jsonb := to_jsonb(case when TG_OP = 'DELETE' then old else new end);
begin
  -- Not throttled: no authenticated session, or a write made by another trigger or a foreign-key cascade
  -- (an account deleting itself removes its own memberships: that must always succeed).
  if v_uid is null or pg_trigger_depth() > 1 then return case when TG_OP = 'DELETE' then old else new end; end if;
  if TG_TABLE_NAME = 'guild_members' then
    -- Only the caller's own membership counts: a guild disbanding many rows is one action.
    if (v_row ->> 'user_id')::uuid = v_uid then perform private.titan_rate_limit(v_uid, 'guild_membership', 10); end if;
  elsif TG_TABLE_NAME = 'shop_history' and TG_OP = 'INSERT' then
    if (v_row ->> 'user_id')::uuid = v_uid then perform private.titan_rate_limit(v_uid, 'purchase', 120); end if;
  elsif TG_TABLE_NAME = 'training_logs' and TG_OP = 'UPDATE' then
    if new.user_id = v_uid and (new.val, new.date, new.details, new.archived_at) is distinct from (old.val, old.date, old.details, old.archived_at) then
      perform private.titan_rate_limit(v_uid, 'training_change', 60);
    end if;
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;
revoke all on function private.titan_rate_limit_trigger() from public, anon, authenticated;

do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if to_regclass('public.guild_members') is not null and not exists (select 1 from pg_trigger where tgname = 'titan_rate_limit_guild_members') then
    create trigger titan_rate_limit_guild_members before insert or delete on public.guild_members
      for each row execute function private.titan_rate_limit_trigger();
  end if;
  if to_regclass('public.shop_history') is not null and not exists (select 1 from pg_trigger where tgname = 'titan_rate_limit_shop_history') then
    create trigger titan_rate_limit_shop_history before insert on public.shop_history
      for each row execute function private.titan_rate_limit_trigger();
  end if;
  if to_regclass('public.training_logs') is not null and not exists (select 1 from pg_trigger where tgname = 'titan_rate_limit_training_logs') then
    create trigger titan_rate_limit_training_logs before update on public.training_logs
      for each row execute function private.titan_rate_limit_trigger();
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

-- CHEAT16/17: rolling API mutation budgets independent of activity retention.
-- Successful INSERTs and edits only. A replay returns its receipt before any row mutation.
-- DELETE deliberately excluded: erasure must never be rate-limited. Service maintenance and
-- cross-account moderation are trusted paths, not own-account API mutations.
-- Caller owns the transaction; no BEGIN/COMMIT and no session setting left changed.
do $ddl$
declare previous_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  create table if not exists private.titan_training_rate_state (
    user_id uuid not null references auth.users(id) on delete cascade,
    action text not null check (action in ('create', 'history', 'update')),
    times timestamptz[] not null default '{}'::timestamptz[],
    updated_at timestamptz not null default clock_timestamp(),
    primary key (user_id, action),
    check (cardinality(times) <= 600)
  );
  alter table private.titan_training_rate_state enable row level security;
  revoke all on private.titan_training_rate_state from public, anon, authenticated;
  perform set_config('lock_timeout', previous_timeout, true);
end $ddl$;

create or replace function private.titan_limit_training_mutation()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  u uuid := auth.uid();
  a text;
  stamps timestamptz[];
  at_time timestamptz;
  hour_count integer;
  day_count integer;
  hour_limit integer;
  day_limit integer;
begin
  if auth.role() is distinct from 'authenticated' or u is null or u <> new.user_id then return null; end if;
  a := case when tg_op = 'UPDATE' then 'update'
    when coalesce(new.details ->> 'historical', 'false') = 'true' and new.xp = 0 then 'history'
    else 'create' end;
  hour_limit := case a when 'create' then 12 when 'update' then 120 else 300 end;
  day_limit := case a when 'create' then 40 when 'update' then 600 else 300 end;

  -- The conflict and row lock serialize even simultaneous first mutations. Each following
  -- query gets the current READ COMMITTED snapshot, so the final allowance is not shared.
  insert into private.titan_training_rate_state(user_id, action) values (u, a) on conflict do nothing;
  select times into stamps from private.titan_training_rate_state where user_id=u and action=a for update;
  at_time := clock_timestamp(); -- after waiting, never caller-supplied or transaction-start time
  select coalesce(array_agg(t order by t), '{}'::timestamptz[]), count(*)::integer,
    count(*) filter (where t > at_time - interval '1 hour')::integer
    into stamps, day_count, hour_count
    from unnest(stamps) t where t > at_time - interval '24 hours';
  if hour_count >= hour_limit or day_count >= day_limit then
    -- A table INSERT followed by RAISE EXCEPTION would disappear on rollback. LOG is outside
    -- transaction rollback. Only these structured fields are emitted, never the activity payload.
    raise log 'TITAN_TRAINING_RATE_LIMIT owner=% action=% hour=% day=%', u, a, hour_count, day_count;
    raise exception 'TRAINING_RATE_LIMIT' using errcode='23514', hint='Retry after the rolling quota window expires.';
  end if;
  update private.titan_training_rate_state set times=array_append(stamps, at_time), updated_at=at_time
    where user_id=u and action=a;
  -- One low-severity observation at a full budget, not a ban or an invalid-performance verdict.
  if hour_count + 1 = hour_limit or day_count + 1 = day_limit then
    perform public.titan_log_suspicious_action(u, 'training_mutation.budget', 'low', 'TRAINING_MUTATION_BUDGET_REACHED',
      jsonb_build_object('operation', a, 'hour_count', hour_count+1, 'day_count', day_count+1,
        'hour_limit', hour_limit, 'day_limit', day_limit));
  end if;
  return null;
end $function$;
revoke all on function private.titan_limit_training_mutation() from public, anon, authenticated;

do $ddl$
declare previous_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if not exists (select 1 from pg_trigger where tgrelid='public.training_logs'::regclass
      and tgname='titan_limit_training_mutation') then
    create trigger titan_limit_training_mutation after insert or update of val, date, details, archived_at
      on public.training_logs for each row execute function private.titan_limit_training_mutation();
  end if;
  perform set_config('lock_timeout', previous_timeout, true);
end $ddl$;

-- No sport, GPS, note, IP, session ID, metric or receipt is stored in this ledger. At most
-- three rows / 940 timestamps per account. Idle rows are removed daily (up to 48h retention).
create or replace function private.titan_purge_training_rate_state()
returns integer language plpgsql security definer set search_path = '' as $function$
declare n integer;
begin
  delete from private.titan_training_rate_state where updated_at < clock_timestamp() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function private.titan_purge_training_rate_state() from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.titan_purge_training_rate_state() to service_role;
do $schedule$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    if not exists (select 1 from cron.job where jobname='titan_purge_training_rate_state') then
      perform cron.schedule('titan_purge_training_rate_state', '15 4 * * *', 'select private.titan_purge_training_rate_state();');
    end if;
  end if;
end $schedule$;

-- AUD-40 (lot « irremplaçable », 15/11/2026): a time capsule — a short message to oneself, delivered in 3, 6 or 12 months, with a
-- snapshot of one's practice when it was written (effort minutes and active days of the last 30 days) so that, on opening, TITAN can
-- say « then / now ». It only makes sense where the history lives: nobody moves to another app with letters still on their way.
-- Private by construction: no API grant on the table, every function reads and writes the caller's own rows; the message is never
-- shown before its date (pending capsules expose only their delivery date). At most 12 capsules waiting per account, 500 characters,
-- 10 written a day. Suspended accounts cannot write. Exported with the account (extras helper, key timeCapsules) and erased with it.
-- Nothing here grants XP, credits or rewards.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here. Requires 20261115140000 (export layer before_cadence).
-- Rollback: drop function public.titan_capsule_create_v1(text, integer), public.titan_capsules_v1(), public.titan_capsule_open_v1(uuid);
-- re-create private.titan_export_extras_v1 as defined in 20261115140000; drop table private.titan_time_capsules.

create table if not exists private.titan_time_capsules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  months integer not null check (months in (3, 6, 12)),
  deliver_on date not null,
  written_minutes integer not null default 0 check (written_minutes between 0 and 100000),
  written_days integer not null default 0 check (written_days between 0 and 31),
  created_at timestamptz not null default now(),
  opened_at timestamptz
);
create index if not exists titan_time_capsules_user_idx on private.titan_time_capsules (user_id, deliver_on);
alter table private.titan_time_capsules enable row level security;
revoke all on private.titan_time_capsules from public, anon, authenticated;

create or replace function private.titan_practice_30d(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object('minutes', coalesce(round(sum(d.minutes))::integer, 0), 'days', count(*) filter (where d.minutes > 0)::integer)
  from private.titan_effort_days(p_user, now() - interval '30 days', now(), '-infinity'::timestamptz, 90) d;
$function$;
revoke all on function private.titan_practice_30d(uuid) from public, anon, authenticated;

create or replace function public.titan_capsule_create_v1(p_message text, p_months integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_msg text := btrim(regexp_replace(coalesce(p_message, ''), '[[:cntrl:]]', ' ', 'g'));
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_snap jsonb;
  v_id uuid;
  v_on date;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if p_months is null or p_months not in (3, 6, 12) then raise exception 'CAPSULE_DELAY_INVALID' using errcode = '22023'; end if;
  if char_length(v_msg) < 1 or char_length(v_msg) > 500 then raise exception 'CAPSULE_MESSAGE_INVALID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('titan_capsule:' || v_uid::text));
  if (select count(*) from private.titan_time_capsules c where c.user_id = v_uid and c.opened_at is null and c.deliver_on > v_today) >= 12 then
    raise exception 'CAPSULE_LIMIT_12' using errcode = '22023';
  end if;
  if (select count(*) from private.titan_time_capsules c where c.user_id = v_uid and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'RATE_LIMITED' using errcode = '22023';
  end if;
  v_snap := private.titan_practice_30d(v_uid);
  v_on := (v_today + make_interval(months => p_months))::date;
  insert into private.titan_time_capsules (user_id, message, months, deliver_on, written_minutes, written_days)
  values (v_uid, v_msg, p_months, v_on, least(100000, (v_snap ->> 'minutes')::integer), least(31, (v_snap ->> 'days')::integer))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'deliverOn', v_on);
end;
$function$;

/** Delivered capsules carry their message and the « then / now » practice; waiting ones only their date. */
create or replace function public.titan_capsules_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_now jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_now := private.titan_practice_30d(v_uid);
  return jsonb_build_object(
    'delivered', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'message', c.message, 'months', c.months, 'writtenOn', (c.created_at at time zone 'Europe/Paris')::date,
        'deliverOn', c.deliver_on, 'opened', c.opened_at is not null, 'then', jsonb_build_object('minutes', c.written_minutes, 'days', c.written_days), 'now', v_now)
        order by c.deliver_on desc) from private.titan_time_capsules c where c.user_id = v_uid and c.deliver_on <= v_today), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'months', c.months, 'deliverOn', c.deliver_on) order by c.deliver_on)
        from private.titan_time_capsules c where c.user_id = v_uid and c.deliver_on > v_today), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_capsule_open_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update private.titan_time_capsules set opened_at = coalesce(opened_at, now())
   where id = p_id and user_id = v_uid and deliver_on <= (now() at time zone 'Europe/Paris')::date;
  return found;
end;
$function$;

revoke all on function public.titan_capsule_create_v1(text, integer), public.titan_capsules_v1(), public.titan_capsule_open_v1(uuid) from public, anon;
grant execute on function public.titan_capsule_create_v1(text, integer), public.titan_capsules_v1(), public.titan_capsule_open_v1(uuid) to authenticated;

-- The same export layer as the cadence claims (20261115140000), now with the capsules too: no new layer, the release gates stay valid.
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.titan_export_extras_before_cadence_v1(p_uid) || jsonb_build_object(
    'cadenceWeekClaims', coalesce((
      select jsonb_agg(jsonb_build_object('week', c.week_start, 'days', c.days, 'target', c.target, 'credits', c.credits, 'claimed_at', c.claimed_at) order by c.week_start)
      from private.titan_cadence_claims c where c.user_id = p_uid), '[]'::jsonb),
    'timeCapsules', coalesce((
      select jsonb_agg(jsonb_build_object('message', t.message, 'months', t.months, 'deliver_on', t.deliver_on, 'written_minutes', t.written_minutes,
        'written_days', t.written_days, 'created_at', t.created_at, 'opened_at', t.opened_at) order by t.created_at)
      from private.titan_time_capsules t where t.user_id = p_uid), '[]'::jsonb));
$$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

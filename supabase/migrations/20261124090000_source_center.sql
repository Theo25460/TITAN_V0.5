-- V1.6.5 — Centre des sources connectées. What each source provided, where it stopped and how to resume it, read from one place.
-- 1. A consent withdrawal says who withdrew it: the athlete in TITAN ('user') or the provider ('provider': a Garmin deregistration or
--    a permission change). A trigger fills private.titan_source_consents.revoked_by; titan_garmin_deregister_v1 marks its own update.
-- 2. One row per synchronisation attempt (private.titan_source_runs): its window, its outcome ('running', 'ok', 'empty', 'partial',
--    'failed', 'denied'), its counts and the reasons of what was excluded. Santé Connect is read on the phone, so the phone reports its
--    runs (titan_source_run_v1: a run is opened 'running' then closed; one still running after 15 minutes is read as interrupted).
--    Garmin pushes: titan_garmin_ingest_v1 records, per account and per day, what it imported, linked, found already imported or
--    ignored (with the reason it already gave). The 60 latest runs of each source are kept; they are erased with the account.
-- 3. A read after withdrawal is refused: titan_source_run_v1 accepts no reading ('running', 'ok', 'empty', 'partial', 'failed') for a
--    withdrawn source, only the record that the phone was denied. Imports were already refused (titan_import_activity_v1, CONSENT_REQUIRED).
-- 4. titan_source_center_v1 (owner only, read): per source the consent and who withdrew it, the counts (imported, linked, archived,
--    still to review), the sports and fields really received, the Garmin link (linked, last event, end), the 10 latest runs, and the
--    latest history batch (V1.6.4).
-- Nothing changes in imports: the same (source, external id) is still imported once, a session already in the journal is never
-- modified by an import (the athlete's corrections stay), and the rewards rules are untouched.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here. Requires 20261123150000 (V1.6.4, titan_import_batches).
-- Rollback: drop function public.titan_source_center_v1(), public.titan_source_run_v1(text, jsonb), private.titan_source_note_push(uuid, jsonb),
--   private.titan_source_run_json(private.titan_source_runs), private.titan_jsonb_add(jsonb, jsonb), private.titan_garmin_ingest_core(text, jsonb);
--   drop trigger titan_source_consents_revoked_by on private.titan_source_consents; drop function private.titan_source_consent_revoked_by();
--   drop table private.titan_source_runs; alter table private.titan_source_consents drop column revoked_by; then re-create
--   public.titan_garmin_ingest_v1 from 20261110152800_serialize_activity_imports.sql and public.titan_garmin_deregister_v1 from
--   20261110140000_garmin_oauth_state.sql.

-- 1. Who withdrew a consent.
alter table private.titan_source_consents add column if not exists revoked_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'titan_source_consents_revoked_by_check') then
    alter table private.titan_source_consents add constraint titan_source_consents_revoked_by_check check (revoked_by in ('user', 'provider'));
  end if;
end $$;

create or replace function private.titan_source_consent_revoked_by()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.revoked_at is null then
    new.revoked_by := null;
  elsif tg_op = 'INSERT' or old.revoked_at is null then
    new.revoked_by := case when coalesce(current_setting('titan.revoked_by', true), '') = 'provider' then 'provider' else 'user' end;
  end if;
  return new;
end;
$function$;
drop trigger if exists titan_source_consents_revoked_by on private.titan_source_consents;
create trigger titan_source_consents_revoked_by before insert or update of revoked_at on private.titan_source_consents
  for each row execute function private.titan_source_consent_revoked_by();

-- Same body as 20261110140000_garmin_oauth_state.sql; the consent update is marked as the provider's.
create or replace function public.titan_garmin_deregister_v1(p_garmin_user text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if p_garmin_user is null or p_garmin_user !~ '^[A-Za-z0-9_-]{1,128}$' then return 0; end if;
  select user_id into v_uid from private.titan_garmin_links
  where garmin_user_id = p_garmin_user and revoked_at is null;
  if not found then return 0; end if;

  perform 1 from private.titan_source_consents where user_id = v_uid and source = 'garmin' for update;
  update private.titan_garmin_links set revoked_at = now()
  where user_id = v_uid and garmin_user_id = p_garmin_user and revoked_at is null;
  if not found then return 0; end if;
  perform set_config('titan.revoked_by', 'provider', true);
  update private.titan_source_consents set revoked_at = now()
  where user_id = v_uid and source = 'garmin' and revoked_at is null;
  perform set_config('titan.revoked_by', '', true);
  return 1;
end $$;
revoke all on function public.titan_garmin_deregister_v1(text) from public, anon, authenticated;
grant execute on function public.titan_garmin_deregister_v1(text) to service_role;

-- 2. Synchronisation runs.
create table if not exists private.titan_source_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('health_connect', 'garmin')),
  kind text not null check (kind in ('read', 'replay', 'push')),
  day date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  outcome text not null check (outcome in ('running', 'ok', 'empty', 'partial', 'failed', 'denied')),
  error_code text check (error_code ~ '^[A-Z_]{1,40}$'),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  excluded jsonb not null default '{}'::jsonb check (jsonb_typeof(excluded) = 'object'),
  check (window_from is null or window_to is null or window_from <= window_to),
  check ((kind = 'push') = (day is not null))
);
create unique index if not exists titan_source_runs_push_day on private.titan_source_runs (user_id, source, day) where kind = 'push';
create index if not exists titan_source_runs_user_idx on private.titan_source_runs (user_id, source, started_at desc);
alter table private.titan_source_runs enable row level security;
revoke all on private.titan_source_runs from public, anon, authenticated;

-- Adds two objects of counters key by key (integers only; anything else counts as 0).
create or replace function private.titan_jsonb_add(p_a jsonb, p_b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
  from (select k, sum(case when v ~ '^[0-9]{1,9}$' then v::bigint else 0 end) as n
          from (select key as k, value #>> '{}' as v from jsonb_each(coalesce(p_a, '{}'::jsonb))
                union all select key, value #>> '{}' from jsonb_each(coalesce(p_b, '{}'::jsonb))) x
         group by k) y;
$function$;
revoke all on function private.titan_jsonb_add(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.titan_source_run_json(p_r private.titan_source_runs)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object('id', p_r.id, 'source', p_r.source, 'kind', p_r.kind, 'started_at', p_r.started_at, 'finished_at', p_r.finished_at,
    'window_from', p_r.window_from, 'window_to', p_r.window_to, 'outcome', p_r.outcome, 'error_code', p_r.error_code,
    'counts', p_r.counts, 'excluded', p_r.excluded);
$function$;
revoke all on function private.titan_source_run_json(private.titan_source_runs) from public, anon, authenticated;

-- The phone reports a Santé Connect run: opened 'running', then closed once. A closed run is never rewritten.
create or replace function public.titan_source_run_v1(p_source text, p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_kind text;
  v_outcome text;
  v_error text;
  v_started timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  v_counts jsonb := '{}'::jsonb;
  v_excluded jsonb := '{}'::jsonb;
  v_granted boolean;
  v_row private.titan_source_runs;
  k text;
  v text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is distinct from 'health_connect' then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  if jsonb_typeof(p_run) is distinct from 'object' then raise exception 'SOURCE_RUN_INVALID' using errcode = '22023'; end if;
  begin
    v_id := (p_run ->> 'id')::uuid;
    v_started := coalesce((p_run ->> 'started_at')::timestamptz, now());
    v_from := (p_run ->> 'window_from')::timestamptz;
    v_to := (p_run ->> 'window_to')::timestamptz;
  exception when others then raise exception 'SOURCE_RUN_INVALID' using errcode = '22023';
  end;
  v_kind := p_run ->> 'kind';
  v_outcome := p_run ->> 'outcome';
  v_error := nullif(p_run ->> 'error_code', '');
  if v_id is null or v_kind is null or v_kind not in ('read', 'replay') or v_outcome is null
     or v_outcome not in ('running', 'ok', 'empty', 'partial', 'failed', 'denied')
     or (v_error is not null and v_error !~ '^[A-Z_]{1,40}$')
     or v_started > now() + interval '10 minutes' or v_started < now() - interval '2 days'
     or (v_from is not null and (v_from < now() - interval '31 days' or v_from > now() + interval '10 minutes'))
     or (v_to is not null and (v_to > now() + interval '10 minutes' or v_to < v_from))
     or (v_outcome in ('running', 'ok', 'empty', 'partial') and (v_from is null or v_to is null)) then
    raise exception 'SOURCE_RUN_INVALID' using errcode = '22023';
  end if;
  -- Counters: read, imported, linked, duplicate, excluded, failed, review (integers 0..10000). Exclusions: known reasons only.
  if jsonb_typeof(p_run -> 'counts') = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(p_run -> 'counts') loop
      if k not in ('read', 'imported', 'linked', 'duplicate', 'excluded', 'failed', 'review') or v !~ '^[0-9]{1,5}$' or v::int > 10000 then
        raise exception 'SOURCE_RUN_INVALID' using errcode = '22023';
      end if;
      v_counts := v_counts || jsonb_build_object(k, v::int);
    end loop;
  end if;
  if jsonb_typeof(p_run -> 'excluded') = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(p_run -> 'excluded') loop
      if k not in ('unmapped_type', 'unknown_sport', 'invalid_id', 'too_short', 'too_long', 'out_of_range', 'invalid_date', 'invalid_payload', 'refused')
         or v !~ '^[0-9]{1,5}$' or v::int > 10000 then
        raise exception 'SOURCE_RUN_INVALID' using errcode = '22023';
      end if;
      v_excluded := v_excluded || jsonb_build_object(k, v::int);
    end loop;
  end if;

  select c.revoked_at is null into v_granted from private.titan_source_consents c where c.user_id = v_uid and c.source = p_source;
  if v_granted is null then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  -- A withdrawn source is never read: only the record that the phone was denied is accepted.
  if not v_granted and v_outcome <> 'denied' then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'source_run', 120);

  select * into v_row from private.titan_source_runs r where r.id = v_id;
  if found then
    if v_row.user_id <> v_uid or v_row.source <> p_source then raise exception 'SOURCE_RUN_INVALID' using errcode = '22023'; end if;
    if v_row.outcome <> 'running' then return private.titan_source_run_json(v_row); end if;
    update private.titan_source_runs r set outcome = v_outcome, error_code = v_error, counts = v_counts, excluded = v_excluded,
        window_from = coalesce(v_from, r.window_from), window_to = coalesce(v_to, r.window_to),
        finished_at = case when v_outcome = 'running' then null else now() end
     where r.id = v_id returning * into v_row;
  else
    insert into private.titan_source_runs(id, user_id, source, kind, started_at, finished_at, window_from, window_to, outcome, error_code, counts, excluded)
      values (v_id, v_uid, p_source, v_kind, least(v_started, now()), case when v_outcome = 'running' then null else now() end,
              v_from, v_to, v_outcome, v_error, v_counts, v_excluded)
      returning * into v_row;
    delete from private.titan_source_runs r
     where r.user_id = v_uid and r.source = p_source
       and r.id not in (select x.id from private.titan_source_runs x where x.user_id = v_uid and x.source = p_source order by x.started_at desc limit 60);
  end if;
  return private.titan_source_run_json(v_row);
end;
$function$;
revoke all on function public.titan_source_run_v1(text, jsonb) from public, anon;
grant execute on function public.titan_source_run_v1(text, jsonb) to authenticated;

-- One Garmin push result, added to the account's push run of the day.
create or replace function private.titan_source_note_push(p_uid uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text := p_result ->> 'status';
  v_counts jsonb;
  v_excluded jsonb := '{}'::jsonb;
begin
  if p_uid is null or v_status is null then return; end if;
  v_counts := jsonb_build_object('read', 1)
    || case v_status when 'imported' then jsonb_build_object('imported', 1)
                     when 'linked' then jsonb_build_object('linked', 1) || case when (p_result ->> 'needs_review') = 'true' then jsonb_build_object('review', 1) else '{}'::jsonb end
                     when 'duplicate' then jsonb_build_object('duplicate', 1)
                     else jsonb_build_object('excluded', 1) end;
  if v_status = 'ignored' then v_excluded := jsonb_build_object(coalesce(p_result ->> 'reason', 'invalid_payload'), 1); end if;
  insert into private.titan_source_runs as r (id, user_id, source, kind, day, started_at, finished_at, outcome, counts, excluded)
    values (gen_random_uuid(), p_uid, 'garmin', 'push', current_date, now(), now(),
            case when v_status in ('imported', 'linked') then 'ok' else 'empty' end, v_counts, v_excluded)
  on conflict (user_id, source, day) where kind = 'push' do update
    set finished_at = now(),
        counts = private.titan_jsonb_add(r.counts, excluded.counts),
        excluded = private.titan_jsonb_add(r.excluded, excluded.excluded),
        outcome = case when r.outcome = 'ok' or excluded.outcome = 'ok' then 'ok' else 'empty' end;
  delete from private.titan_source_runs r
   where r.user_id = p_uid and r.source = 'garmin'
     and r.id not in (select x.id from private.titan_source_runs x where x.user_id = p_uid and x.source = 'garmin' order by x.started_at desc limit 60);
end;
$function$;
revoke all on function private.titan_source_note_push(uuid, jsonb) from public, anon, authenticated;

-- The body of titan_garmin_ingest_v1 of 20261110152800_serialize_activity_imports.sql, unchanged, under a private name.
create or replace function private.titan_garmin_ingest_core(p_garmin_user text, p_activity jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid;
  v_id text;
  v_sport text;
  v_start numeric;
  v_seconds numeric;
  v_meters numeric;
  v_started timestamptz;
  v_minutes numeric;
  v_km numeric;
  v_result jsonb;
begin
  if p_garmin_user is null or p_garmin_user !~ '^[A-Za-z0-9_-]{1,128}$' or jsonb_typeof(p_activity) is distinct from 'object' then
    return jsonb_build_object('status', 'ignored', 'reason', 'invalid_payload');
  end if;
  select g.user_id into v_uid from private.titan_garmin_links g
   where g.garmin_user_id = p_garmin_user and g.revoked_at is null
     and exists (select 1 from private.titan_source_consents c where c.user_id = g.user_id and c.source = 'garmin' and c.revoked_at is null);
  if v_uid is null then return jsonb_build_object('status', 'ignored', 'reason', 'not_linked'); end if;
  -- Serialize this account's overlap check with other imports and session writes.
  perform 1 from public.profiles p where p.id = v_uid and not coalesce(p.is_suspended, false) for update;
  if not found then return jsonb_build_object('status', 'ignored', 'reason', 'account_unavailable'); end if;

  -- Withdrawal locks consent before changing the link. Recheck both after taking the same locks.
  perform 1 from private.titan_source_consents c
   where c.user_id = v_uid and c.source = 'garmin' and c.revoked_at is null for share;
  if not found then return jsonb_build_object('status', 'ignored', 'reason', 'not_linked'); end if;
  perform 1 from private.titan_garmin_links g
   where g.user_id = v_uid and g.garmin_user_id = p_garmin_user and g.revoked_at is null for update;
  if not found then return jsonb_build_object('status', 'ignored', 'reason', 'not_linked'); end if;

  v_id := p_activity ->> 'summaryId';
  if v_id is null or v_id !~ '^[A-Za-z0-9_.-]{1,100}$' then return jsonb_build_object('status', 'ignored', 'reason', 'invalid_id'); end if;
  v_sport := private.titan_garmin_sport(p_activity ->> 'activityType');
  if v_sport is null then return jsonb_build_object('status', 'ignored', 'reason', 'unmapped_type'); end if;
  if not exists (select 1 from public.sports s where s.id = v_sport and coalesce(s.is_active, true)) then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_sport');
  end if;
  begin
    v_start := (p_activity ->> 'startTimeInSeconds')::numeric;
    v_seconds := (p_activity ->> 'durationInSeconds')::numeric;
    v_meters := coalesce(nullif(p_activity ->> 'distanceInMeters', '')::numeric, 0);
  exception when others then
    return jsonb_build_object('status', 'ignored', 'reason', 'invalid_payload');
  end;
  if v_start is null or v_seconds is null or v_start < 631152000 or v_start > extract(epoch from now()) + 600 then
    return jsonb_build_object('status', 'ignored', 'reason', 'invalid_date');
  end if;
  if v_seconds < 60 then return jsonb_build_object('status', 'ignored', 'reason', 'too_short'); end if;
  if v_seconds > 86400 or v_meters < 0 or v_meters > 1000000 then return jsonb_build_object('status', 'ignored', 'reason', 'out_of_range'); end if;
  v_started := to_timestamp(v_start);
  v_minutes := round(v_seconds / 60.0, 2);
  v_km := case when v_meters > 0 then round(v_meters / 1000.0, 3) else null end;

  perform private.titan_rate_limit(v_uid, 'garmin_ingest', 600);
  v_result := private.titan_import_core(v_uid, 'garmin', 'g-' || v_id, v_sport, v_started, v_minutes, v_km);
  update private.titan_garmin_links set last_event_at = now() where user_id = v_uid;
  return v_result;
end;
$function$;
revoke all on function private.titan_garmin_ingest_core(text, jsonb) from public, anon, authenticated;

-- Same answer as before; what happened is now also kept for the account, when the push belongs to a linked and authorised account.
create or replace function public.titan_garmin_ingest_v1(p_garmin_user text, p_activity jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb := private.titan_garmin_ingest_core(p_garmin_user, p_activity);
  v_uid uuid;
begin
  if coalesce(v_result ->> 'reason', '') not in ('not_linked', 'account_unavailable') then
    select g.user_id into v_uid from private.titan_garmin_links g
     where g.garmin_user_id = p_garmin_user and g.revoked_at is null
       and exists (select 1 from private.titan_source_consents c where c.user_id = g.user_id and c.source = 'garmin' and c.revoked_at is null);
    if v_uid is not null then perform private.titan_source_note_push(v_uid, v_result); end if;
  end if;
  return v_result;
end;
$function$;
revoke all on function public.titan_garmin_ingest_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.titan_garmin_ingest_v1(text, jsonb) to service_role;

-- 4. The center, read by its owner only.
create or replace function public.titan_source_center_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'now', now(),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', c.source,
        'consent', jsonb_build_object('granted', c.revoked_at is null, 'granted_at', c.granted_at, 'revoked_at', c.revoked_at, 'revoked_by', c.revoked_by),
        'counts', (select jsonb_build_object(
            'imported', count(*) filter (where i.status = 'imported' and l.archived_at is null),
            'linked', count(*) filter (where i.status = 'linked'),
            'archived', count(*) filter (where i.status = 'imported' and l.archived_at is not null),
            'review', count(*) filter (where i.needs_review and i.decision is null))
          from private.titan_imported_activities i left join public.training_logs l on l.id = i.log_id
          where i.user_id = v_uid and i.source = c.source),
        'last_import_at', (select max(i.imported_at) from private.titan_imported_activities i where i.user_id = v_uid and i.source = c.source),
        'sports', coalesce((select jsonb_agg(jsonb_build_object('sport', x.sport, 'n', x.n) order by x.n desc, x.sport)
            from (select coalesce(i.sport, l.sport) as sport, count(*) as n
                    from private.titan_imported_activities i left join public.training_logs l on l.id = i.log_id
                   where i.user_id = v_uid and i.source = c.source and coalesce(i.sport, l.sport) is not null
                   group by 1 order by 2 desc, 1 limit 8) x), '[]'::jsonb),
        'fields', (select jsonb_build_object('total', count(*), 'distance', count(*) filter (where i.distance_km is not null),
            'duration', count(*) filter (where i.duration_minutes is not null))
          from private.titan_imported_activities i where i.user_id = v_uid and i.source = c.source),
        'link', case when c.source = 'garmin' then coalesce((
            select jsonb_build_object('linked', g.revoked_at is null, 'linked_at', g.linked_at, 'last_event_at', g.last_event_at, 'ended_at', g.revoked_at)
              from private.titan_garmin_links g where g.user_id = v_uid), jsonb_build_object('linked', false)) end,
        'runs', coalesce((select jsonb_agg(private.titan_source_run_json(r) order by r.started_at desc)
            from (select * from private.titan_source_runs r where r.user_id = v_uid and r.source = c.source order by r.started_at desc limit 10) r), '[]'::jsonb))
        order by c.source)
      from private.titan_source_consents c where c.user_id = v_uid), '[]'::jsonb),
    'batch', (select private.titan_import_batch_json(b) from private.titan_import_batches b where b.user_id = v_uid order by b.updated_at desc limit 1));
end;
$function$;
revoke all on function public.titan_source_center_v1() from public, anon;
grant execute on function public.titan_source_center_v1() to authenticated;

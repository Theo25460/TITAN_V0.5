-- V11-40 (V11-05, GAR-01, GAR-02): Garmin, server side, prepared WITHOUT any Garmin key and disabled until a human turns it on.
-- Garmin reaches TITAN only through the server (the Garmin push is received by a Netlify function that holds the secrets and calls the
-- service-role functions below). A client can never say "this came from Garmin": the client-callable import functions keep refusing the
-- source 'garmin'; only titan_garmin_ingest_v1 (service role) writes it, for an account that linked Garmin AND allowed the source.
-- No Garmin token is stored: the push model needs only the Garmin user id, so there is nothing to steal and nothing to rotate in the database.
-- Reuses the import pipeline of migration 34 (same duplicate rule across Health Connect, Garmin and manual entries, same creation ceilings,
-- same risk score and caps): the pipeline is extracted into private.titan_import_core, and the client function becomes a thin wrapper.
-- Also: the source list gains 'garmin' (consents, imports); consent revocation for Garmin also revokes the link; archiving works for Garmin;
-- the account export gains the Garmin link through a helper (private.titan_export_extras_v1) so future additions touch one place.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_garmin_link_v1(uuid,text), public.titan_garmin_unlink_v1(), public.titan_garmin_status_v1(),
-- public.titan_garmin_deregister_v1(text), public.titan_garmin_ingest_v1(text,jsonb), private.titan_garmin_sport(text); drop table private.titan_garmin_links;
-- then re-apply the definitions of titan_import_activity_v1 / titan_set_source_consent_v1 / titan_archive_imported_v1 (migration 34) and export_own_data
-- (migration 39); drop function private.titan_import_core(...), private.titan_export_extras_v1(uuid); narrow the two source check constraints back.

-- 1. The closed list of sources gains 'garmin'.
do $$
declare
  previous_lock_timeout text := current_setting('lock_timeout');
  c record;
begin
  perform set_config('lock_timeout', '5s', true);
  for c in select con.conname, con.conrelid::regclass as rel from pg_constraint con
            where con.conrelid in ('private.titan_source_consents'::regclass, 'private.titan_imported_activities'::regclass)
              and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%source%health_connect%' and pg_get_constraintdef(con.oid) not like '%garmin%'
  loop
    execute format('alter table %s drop constraint %I', c.rel, c.conname);
    execute format('alter table %s add constraint %I check (source in (''health_connect'', ''garmin''))', c.rel, c.conname);
  end loop;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

-- 2. The link between a TITAN account and a Garmin user. One active link per Garmin user and per account; no token.
create table if not exists private.titan_garmin_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  garmin_user_id text not null check (garmin_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  linked_at timestamptz not null default now(),
  revoked_at timestamp with time zone,
  last_event_at timestamptz
);
create unique index if not exists titan_garmin_links_active_idx on private.titan_garmin_links (garmin_user_id) where revoked_at is null;
alter table private.titan_garmin_links enable row level security;
revoke all on private.titan_garmin_links from public, anon, authenticated;

-- 3. Garmin activity types -> TITAN sports. Types that are not listed are ignored, never guessed. TO CONFIRM against the type list that comes
-- with the access Garmin grants (names recalled from public documentation, not yet checked against an access).
create or replace function private.titan_garmin_sport(p_type text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case upper(coalesce(p_type, ''))
    when 'RUNNING' then 'running' when 'STREET_RUNNING' then 'running' when 'TRACK_RUNNING' then 'running'
    when 'VIRTUAL_RUN' then 'running' when 'OBSTACLE_RUN' then 'running'
    when 'TRAIL_RUNNING' then 'trail' when 'ULTRA_RUN' then 'trail' when 'TREADMILL_RUNNING' then 'treadmill'
    when 'WALKING' then 'walking' when 'CASUAL_WALKING' then 'walking' when 'SPEED_WALKING' then 'walking' when 'HIKING' then 'hiking'
    when 'CYCLING' then 'cycling' when 'ROAD_BIKING' then 'cycling' when 'MOUNTAIN_BIKING' then 'cycling' when 'INDOOR_CYCLING' then 'cycling'
    when 'VIRTUAL_RIDE' then 'cycling' when 'TRACK_CYCLING' then 'cycling' when 'CYCLOCROSS' then 'cycling' when 'BMX' then 'cycling'
    when 'E_BIKE_FITNESS' then 'cycling' when 'E_BIKE_MOUNTAIN' then 'cycling' when 'DOWNHILL_BIKING' then 'cycling'
    when 'RECUMBENT_CYCLING' then 'cycling' when 'GRAVEL_CYCLING' then 'gravel'
    when 'LAP_SWIMMING' then 'swimming' when 'SWIMMING' then 'swimming' when 'OPEN_WATER_SWIMMING' then 'open_water_swimming'
    when 'ROWING' then 'rowing' when 'INDOOR_ROWING' then 'rowing' when 'KAYAKING' then 'kayak' when 'STAND_UP_PADDLEBOARDING' then 'paddle'
    when 'YOGA' then 'yoga' when 'PILATES' then 'pilates' when 'HIIT' then 'hiit' when 'STRENGTH_TRAINING' then 'muscu_gym'
    when 'ELLIPTICAL' then 'elliptical' when 'STAIR_CLIMBING' then 'stair_climbing'
    when 'BOULDERING' then 'bouldering' when 'INDOOR_CLIMBING' then 'climbing' when 'ROCK_CLIMBING' then 'climbing'
    when 'CROSS_COUNTRY_SKIING_WS' then 'cross_country_skiing' when 'RESORT_SKIING_SNOWBOARDING_WS' then 'alpine_skiing'
    when 'SNOWSHOE_WS' then 'snowshoeing'
    else null end;
$function$;
revoke all on function private.titan_garmin_sport(text) from public, anon, authenticated;

-- 4. The import pipeline of migration 34, for a given account. Callers have already checked identity, consent and ranges.
create or replace function private.titan_import_core(
  p_uid uuid, p_source text, p_external_id text, p_sport text, p_started_at timestamptz,
  p_duration_minutes numeric, p_distance_km numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_prev record;
  v_dup record;
  v_details jsonb;
  v_event uuid;
  v_res record;
  v_end timestamptz;
  v_claims text := current_setting('request.jwt.claims', true);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':' || p_source || ':' || p_external_id, 0));

  select i.log_id, i.status into v_prev from private.titan_imported_activities i
   where i.user_id = p_uid and i.source = p_source and i.external_id = p_external_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'log_id', v_prev.log_id, 'previous', v_prev.status);
  end if;

  -- Same sport and a time overlap of at least half of the shorter one with a session already in the journal, from ANY source: counted once.
  v_end := p_started_at + (p_duration_minutes * interval '1 minute');
  select l.id into v_dup
    from public.training_logs l
   where l.user_id = p_uid and l.archived_at is null and l.sport = p_sport
     and l.date < v_end + interval '10 minutes' and l.date > p_started_at - interval '24 hours'
     and (select extract(epoch from least(v_end, l.date + (d.m * interval '1 minute')) - greatest(p_started_at, l.date)) / 60
            from (select coalesce(public.titan_numeric_from_json(l.details, 'duration'), case when l.unit = 'min' then l.val end, 30) as m) d)
         >= 0.5 * least(p_duration_minutes, (select coalesce(public.titan_numeric_from_json(l.details, 'duration'), case when l.unit = 'min' then l.val end, 30)))
   order by l.date
   limit 1;
  if found then
    insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (p_uid, p_source, p_external_id, v_dup.id, 'linked');
    return jsonb_build_object('status', 'linked', 'log_id', v_dup.id);
  end if;

  -- The session is created by the very same function as a manual one, for this account (identity set for this transaction only, then restored).
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  v_event := md5(p_uid::text || ':' || p_source || ':' || p_external_id)::uuid;
  v_details := jsonb_build_object('duration', p_duration_minutes, 'client_event_id', v_event::text);
  if p_distance_km is null then
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_duration_minutes, 'min', v_details, p_started_at);
  else
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_distance_km, 'km', v_details, p_started_at);
  end if;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (p_uid, p_source, p_external_id, v_res.log_id::uuid, 'imported');
  return jsonb_build_object('status', 'imported', 'log_id', v_res.log_id, 'xp', v_res.xp, 'reward_held', v_res.reward_held);
end;
$function$;
revoke all on function private.titan_import_core(uuid, text, text, text, timestamptz, numeric, numeric) from public, anon, authenticated;

-- The client function keeps its contract and its source list (health_connect only: a client never claims Garmin).
create or replace function public.titan_import_activity_v1(
  p_source text, p_external_id text, p_sport text, p_started_at timestamptz,
  p_duration_minutes numeric, p_distance_km numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is distinct from 'health_connect' then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  if p_external_id is null or p_external_id !~ '^[A-Za-z0-9_.:-]{1,128}$' then raise exception 'EXTERNAL_ID_INVALID' using errcode = '22023'; end if;
  if p_started_at is null or p_started_at > now() + interval '10 minutes' or p_started_at < timestamptz '1990-01-01' then
    raise exception 'IMPORT_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then
    raise exception 'IMPORT_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if p_distance_km is not null and (p_distance_km <= 0 or p_distance_km > 1000) then
    raise exception 'IMPORT_DISTANCE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sports s where s.id = p_sport and coalesce(s.is_active, true)) then
    raise exception 'SPORT_UNKNOWN' using errcode = '22023';
  end if;
  if not exists (select 1 from private.titan_source_consents c where c.user_id = v_uid and c.source = p_source and c.revoked_at is null) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  perform private.titan_rate_limit(v_uid, 'activity_import', 300);
  return private.titan_import_core(v_uid, p_source, p_external_id, p_sport, p_started_at, p_duration_minutes, p_distance_km);
end;
$function$;

-- 5. Consent and archiving accept Garmin; revoking Garmin also ends the link.
create or replace function public.titan_set_source_consent_v1(p_source text, p_granted boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is null or p_source not in ('health_connect', 'garmin') then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'source_consent', 30);
  insert into private.titan_source_consents(user_id, source, granted_at, revoked_at)
  values (v_uid, p_source, now(), case when coalesce(p_granted, false) then null else now() end)
  on conflict (user_id, source) do update
    set revoked_at = case when coalesce(p_granted, false) then null else now() end,
        granted_at = case when coalesce(p_granted, false) then now() else private.titan_source_consents.granted_at end;
  if p_source = 'garmin' and not coalesce(p_granted, false) then
    update private.titan_garmin_links set revoked_at = now() where user_id = v_uid and revoked_at is null;
  end if;
  return jsonb_build_object('source', p_source, 'granted', coalesce(p_granted, false),
    'imported', (select count(*) from private.titan_imported_activities i join public.training_logs l on l.id = i.log_id
                  where i.user_id = v_uid and i.source = p_source and i.status = 'imported' and l.archived_at is null));
end;
$function$;

create or replace function public.titan_archive_imported_v1(p_source text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is null or p_source not in ('health_connect', 'garmin') then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'source_archive', 10);
  update public.training_logs l set archived_at = now()
   where l.user_id = v_uid and l.archived_at is null
     and l.id in (select i.log_id from private.titan_imported_activities i where i.user_id = v_uid and i.source = p_source and i.status = 'imported');
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- 6. Garmin functions. Service role only, except the two the player calls.
create or replace function public.titan_garmin_link_v1(p_user uuid, p_garmin_user text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_user is null or p_garmin_user is null or p_garmin_user !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'GARMIN_USER_INVALID' using errcode = '22023'; end if;
  if not exists (select 1 from private.titan_source_consents c where c.user_id = p_user and c.source = 'garmin' and c.revoked_at is null) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  -- A Garmin user can be linked to one account at a time: no second profile, no history split between two accounts.
  if exists (select 1 from private.titan_garmin_links g where g.garmin_user_id = p_garmin_user and g.revoked_at is null and g.user_id <> p_user) then
    raise exception 'GARMIN_ALREADY_LINKED' using errcode = '23505';
  end if;
  insert into private.titan_garmin_links as g (user_id, garmin_user_id, linked_at, revoked_at)
  values (p_user, p_garmin_user, now(), null)
  on conflict (user_id) do update set garmin_user_id = excluded.garmin_user_id, linked_at = now(), revoked_at = null, last_event_at = null;
  return jsonb_build_object('linked', true);
end;
$function$;

create or replace function public.titan_garmin_unlink_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'garmin_unlink', 30);
  update private.titan_garmin_links set revoked_at = now() where user_id = v_uid and revoked_at is null;
  update private.titan_source_consents set revoked_at = now() where user_id = v_uid and source = 'garmin' and revoked_at is null;
  return jsonb_build_object('linked', false);
end;
$function$;

create or replace function public.titan_garmin_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  g private.titan_garmin_links%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into g from private.titan_garmin_links where user_id = v_uid and revoked_at is null;
  if not found then return jsonb_build_object('linked', false); end if;
  return jsonb_build_object('linked', true, 'linked_at', g.linked_at, 'last_event_at', g.last_event_at);
end;
$function$;

-- Garmin tells us the user withdrew TITAN on the Garmin side: end the link and the consent.
create or replace function public.titan_garmin_deregister_v1(p_garmin_user text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_n integer := 0;
  r record;
begin
  if p_garmin_user is null or p_garmin_user !~ '^[A-Za-z0-9_-]{1,128}$' then return 0; end if;
  for r in update private.titan_garmin_links set revoked_at = now() where garmin_user_id = p_garmin_user and revoked_at is null returning user_id loop
    update private.titan_source_consents set revoked_at = now() where user_id = r.user_id and source = 'garmin' and revoked_at is null;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

-- One Garmin activity summary (push). Never raises for a payload that is merely unusable: the sender must be able to acknowledge it.
-- Field names (summaryId, activityType, startTimeInSeconds, durationInSeconds, distanceInMeters) TO CONFIRM against the documentation of the access.
create or replace function public.titan_garmin_ingest_v1(p_garmin_user text, p_activity jsonb)
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
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    return jsonb_build_object('status', 'ignored', 'reason', 'account_unavailable');
  end if;

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

revoke all on function public.titan_garmin_link_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.titan_garmin_deregister_v1(text) from public, anon, authenticated;
revoke all on function public.titan_garmin_ingest_v1(text, jsonb) from public, anon, authenticated;
revoke all on function public.titan_garmin_unlink_v1() from public, anon;
revoke all on function public.titan_garmin_status_v1() from public, anon;
grant execute on function public.titan_garmin_link_v1(uuid, text) to service_role;
grant execute on function public.titan_garmin_deregister_v1(text) to service_role;
grant execute on function public.titan_garmin_ingest_v1(text, jsonb) to service_role;
grant execute on function public.titan_garmin_unlink_v1() to authenticated;
grant execute on function public.titan_garmin_status_v1() to authenticated;

-- 7. Export: future additions go through this helper.
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'garminLink', coalesce((select jsonb_agg(jsonb_build_object('garmin_user_id', g.garmin_user_id, 'linked_at', g.linked_at, 'revoked_at', g.revoked_at, 'last_event_at', g.last_event_at))
                              from private.titan_garmin_links g where g.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;

create or replace function public.export_own_data()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_friendships jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(p), '{}'::jsonb) into v_profile from public.profiles p where p.id = v_uid;

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_friendships
      from public.friendships f where f.user_id_1 = v_uid or f.user_id_2 = v_uid;
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'userId', v_uid,
    'profile', v_profile,
    'trainingLogs', public.titan_export_rows('training_logs', 'user_id', v_uid),
    'activities', public.titan_export_rows('activities', 'user_id', v_uid),
    'messages', public.titan_export_rows('messages', 'sender_id', v_uid),
    'friendships', v_friendships,
    'shopHistory', public.titan_export_rows('shop_history', 'user_id', v_uid),
    'achievements', public.titan_export_rows('user_achievements', 'user_id', v_uid),
    'inventory', public.titan_export_rows('inventory', 'user_id', v_uid),
    'socialChallengesAsChallenger', public.titan_export_rows('social_challenges', 'challenger_id', v_uid),
    'socialChallengesAsOpponent', public.titan_export_rows('social_challenges', 'opponent_id', v_uid),
    'cacheReconciliationReports', public.titan_export_rows('titan_cache_reconciliation_reports', 'user_id', v_uid),
    'suspiciousActions', public.titan_export_rows('titan_suspicious_actions', 'user_id', v_uid),
    -- Added by V11-18.
    'trainingRevisions', public.titan_export_rows('training_revisions', 'user_id', v_uid),
    'goals', public.titan_export_rows('sport_goals', 'user_id', v_uid),
    'adventureProfile', public.titan_export_rows('adventure_profiles', 'user_id', v_uid),
    'adventureProgress', public.titan_export_rows('adventure_progress', 'user_id', v_uid),
    'adventureRewards', public.titan_export_rows('adventure_rewards', 'user_id', v_uid),
    'adventureQuestRewards', public.titan_export_rows('adventure_quest_rewards', 'user_id', v_uid),
    'campaignState', public.titan_export_rows('campaign_state', 'user_id', v_uid),
    'bestiary', public.titan_export_rows('user_bestiary', 'user_id', v_uid),
    'moments', public.titan_export_rows('titan_moments', 'user_id', v_uid),
    'momentCheers', public.titan_export_rows('titan_moment_cheers', 'user_id', v_uid),
    'publicCard', public.titan_export_rows('titan_public_cards', 'user_id', v_uid),
    'expeditions', public.titan_export_rows('titan_expedition_members', 'user_id', v_uid),
    'challengesJoined', public.titan_export_rows('titan_challenge_members', 'user_id', v_uid),
    'guildMembership', public.titan_export_rows('guild_members', 'user_id', v_uid),
    'titanPlusAccess', public.titan_export_rows('premium_access', 'user_id', v_uid),
    'periodicQuestClaims', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_periodic_quest_claims c where c.user_id = v_uid), '[]'::jsonb),
    'sourceConsents', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_source_consents c where c.user_id = v_uid), '[]'::jsonb),
    'importedActivities', coalesce((select jsonb_agg(to_jsonb(i)) from private.titan_imported_activities i where i.user_id = v_uid), '[]'::jsonb),
    'dailyActivity', coalesce((select jsonb_agg(to_jsonb(d) order by d.day, d.source) from private.titan_daily_activity d where d.user_id = v_uid), '[]'::jsonb)
  ) || private.titan_export_extras_v1(v_uid);
end;
$function$;

revoke all on function public.export_own_data() from public, anon;
grant execute on function public.export_own_data() to authenticated;

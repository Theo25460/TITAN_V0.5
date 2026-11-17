-- TITAN Sport excellence, lot C (integrations). Applies after 20261117170000. Additive and idempotent: two function bodies are
-- replaced and one pure function is added; no row is read, changed or deleted by this file, no grant is widened.
-- NOT APPLIED TO PRODUCTION by the session that wrote it: it needs the owner's release approval (docs/SPORT_EXCELLENCE.md).
--
-- 1. The same effort brought by two sources under neighbouring sport ids was counted twice. Garmin sends a treadmill run as
--    « treadmill », Health Connect as « running »; a trail run, an open-water swim, a mountain-bike ride are named differently by
--    Garmin, Health Connect, Strava and the athlete. private.titan_import_core linked an import to the journal only when the sport
--    ids were equal. It now links within one group of neighbouring ids (private.titan_sport_dedupe_group, the same groups as
--    js/core/sport-contracts.js DEDUPE_GROUPS used by both clients before a manual entry). Every other rule is unchanged: same
--    overlap test (half of the shorter effort, start and « saved now » readings), same lock, same idempotence, same creation path.
-- 2. A swim brought by a watch was stored in kilometres (val 2, unit km) while swims are measured in metres: per-sport figures split.
--    A sport whose catalogue unit is « m » now receives metres.
-- 3. titan_archive_imported_v1 refused the source 'archive' (the Strava history import, 20261117140000), although that migration
--    documents archiving it « like other sources ». It is accepted now; nothing else changes (owner only, rate limit, imported only).
-- Rollback: re-apply private.titan_import_core from 20261114180000_v131_import_dedupe.sql and titan_archive_imported_v1 from
-- 20261028110000_garmin_link.sql; drop private.titan_sport_dedupe_group(text).

create or replace function private.titan_sport_dedupe_group(p_sport text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_sport in ('running', 'treadmill', 'trail', 'fell_running', 'orienteering', 'race_walking') then 'run'
    when p_sport in ('cycling', 'cycling_road', 'cycling_indoor', 'spinning', 'mountain_bike', 'gravel', 'cyclocross', 'velotaf', 'handbike', 'para_cycling') then 'ride'
    when p_sport in ('swimming', 'open_water_swimming', 'para_swimming', 'finswimming') then 'swim'
    when p_sport in ('walking', 'nordic_walk', 'hiking', 'trekking', 'rucking', 'snowshoeing') then 'walk'
    when p_sport in ('muscu_gym', 'muscu_home', 'muscu_builder', 'powerlifting', 'weightlifting', 'kettlebell') then 'strength'
    when p_sport in ('rowing', 'rowing_machine', 'coastal_rowing') then 'row'
    when p_sport in ('yoga', 'yoga_mobility', 'stretching', 'pilates') then 'yoga'
    else coalesce(p_sport, '')
  end;
$function$;
revoke all on function private.titan_sport_dedupe_group(text) from public, anon, authenticated;

create or replace function private.titan_import_core(
  p_uid uuid, p_source text, p_external_id text, p_sport text, p_started_at timestamptz,
  p_duration_minutes numeric, p_distance_km numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

  -- Same account, same sport or a neighbouring sport id of the same effort (private.titan_sport_dedupe_group), not archived, and the two efforts share at least half of the shorter one (rule in the file header).
  v_end := p_started_at + (p_duration_minutes * interval '1 minute');
  select l.id into v_dup
    from public.training_logs l
    cross join lateral (select coalesce(public.titan_numeric_from_json(l.details, 'duration'), case when l.unit = 'min' then l.val end, 30) as m) d
   where l.user_id = p_uid and l.archived_at is null
     and private.titan_sport_dedupe_group(l.sport) = private.titan_sport_dedupe_group(p_sport)
     and l.date < v_end + interval '24 hours' and l.date > p_started_at - interval '24 hours'
     and greatest(
           -- Start reading: the journal date is the start of the effort.
           extract(epoch from least(v_end, l.date + (d.m * interval '1 minute')) - greatest(p_started_at, l.date)) / 60,
           -- End reading: a session typed by hand and saved "now" is dated when it was saved, that is when the effort ended.
           case when l.created_at - l.date between interval '-10 minutes' and interval '10 minutes'
                 and coalesce(l.details ->> 'hasGpx', 'false') <> 'true'
                 and not exists (select 1 from private.titan_imported_activities i where i.log_id = l.id and i.status = 'imported')
                then extract(epoch from least(v_end, l.date) - greatest(p_started_at, l.date - (d.m * interval '1 minute'))) / 60
           end)
         >= 0.5 * least(p_duration_minutes, d.m)
   order by l.date
   limit 1
   -- Deletion and moderation can hold the workout before trying to lock the profile.
   -- Retry instead of waiting on that row while holding the profile lock.
   for key share of l nowait;
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
  elsif (select s.unit from public.sports s where s.id = p_sport) = 'm' then
    -- A sport measured in metres (swimming): a watch distance is stored in metres like a hand-typed swim, never as « 2 km ».
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), round(p_distance_km * 1000), 'm', v_details, p_started_at);
  else
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_distance_km, 'km', v_details, p_started_at);
  end if;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (p_uid, p_source, p_external_id, v_res.log_id::uuid, 'imported');
  return jsonb_build_object('status', 'imported', 'log_id', v_res.log_id, 'xp', v_res.xp, 'reward_held', v_res.reward_held);
end;
$function$;

revoke all on function private.titan_import_core(uuid, text, text, text, timestamptz, numeric, numeric) from public, anon, authenticated;

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
  if p_source is null or p_source not in ('health_connect', 'garmin', 'archive') then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'source_archive', 10);
  update public.training_logs l set archived_at = now()
   where l.user_id = v_uid and l.archived_at is null
     and l.id in (select i.log_id from private.titan_imported_activities i where i.user_id = v_uid and i.source = p_source and i.status = 'imported');
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

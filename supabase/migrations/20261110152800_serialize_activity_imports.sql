-- Serialize imported workouts with the existing session writer and honor concurrent source withdrawal.
-- Lock the profile before consent. Garmin takes consent before link, like OAuth and withdrawal.
-- Keep the same RPC signatures and grants. No data backfill or change to reward calculations.

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
  else
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_distance_km, 'km', v_details, p_started_at);
  end if;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (p_uid, p_source, p_external_id, v_res.log_id::uuid, 'imported');
  return jsonb_build_object('status', 'imported', 'log_id', v_res.log_id, 'xp', v_res.xp, 'reward_held', v_res.reward_held);
end;
$function$;

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
  -- Take the session writer's lock before checking overlap in the shared importer.
  perform 1 from public.profiles p where p.id = v_uid and not coalesce(p.is_suspended, false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode = '42501'; end if;
  perform 1 from private.titan_source_consents c
   where c.user_id = v_uid and c.source = p_source and c.revoked_at is null for share;
  if not found then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'activity_import', 300);
  return private.titan_import_core(v_uid, p_source, p_external_id, p_sport, p_started_at, p_duration_minutes, p_distance_km);
end;
$function$;

create or replace function public.titan_import_daily_activity_v1(p_source text, p_day date, p_steps integer)
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
  if p_day is null or p_day > current_date + 1 or p_day < current_date - 400 then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  if p_steps is null or p_steps < 0 or p_steps > 200000 then raise exception 'STEPS_OUT_OF_RANGE' using errcode = '22023'; end if;
  perform 1 from public.profiles p where p.id = v_uid and not coalesce(p.is_suspended, false) for share;
  if not found then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  perform 1 from private.titan_source_consents c
   where c.user_id = v_uid and c.source = p_source and c.revoked_at is null for share;
  if not found then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'daily_import', 600);
  insert into private.titan_daily_activity as d (user_id, source, day, steps)
  values (v_uid, p_source, p_day, p_steps)
  on conflict (user_id, source, day) do update set steps = excluded.steps, updated_at = now();
  return jsonb_build_object('day', p_day, 'steps', p_steps);
end;
$function$;

notify pgrst, 'reload schema';

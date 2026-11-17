-- V1.3.1 (lot 2, docs/v131/lot2-integrations.md). Applies after 20261114170000. Additive and idempotent: one function body is replaced,
-- no row is read, changed or deleted by this file, no grant is widened.
--
-- Defect: a session typed by hand and saved "maintenant" right after the effort, then the same effort sent by Garmin or read from
-- Health Connect, became two sessions and two rewards. A session saved "now" is dated when it is saved, so at the END of the effort;
-- the overlap test of private.titan_import_core read every journal date as the START of the effort, and the two never overlapped.
--
-- Matching rule of an incoming activity (start S = p_started_at, end E = S + p_duration_minutes) against a session L of the journal:
--   L belongs to the same account, is not archived and has the same sport (public.training_logs.sport = p_sport);
--   L.date lies within 24 hours of the activity (a cheap bound, the test below decides);
--   m = L's duration in minutes: details.duration, else val when unit = 'min', else 30;
--   the two efforts share at least HALF OF THE SHORTER ONE (0.5 * least(p_duration_minutes, m)), with L's effort read as
--     [L.date, L.date + m]            always (start reading: GPS, GPX, imports, a date typed by hand), or
--     [L.date - m, L.date]            only when L was saved "now": created_at within 10 minutes of date, no GPS or GPX trace
--                                     (details.hasGpx is not true) and L was not itself created by an import.
-- The first match in date order wins; the activity is then recorded as 'linked' to L and creates nothing, so nothing is granted
-- twice. Everything else is the definition of 20261110152800: same advisory lock, same idempotence by (account, source,
-- external id), same NOWAIT row lock, same creation through public.titan_submit_training_session (reward rules untouched).
-- The function now runs with an empty search_path (every object it names was already schema-qualified).
--
-- Limits, on purpose:
--   - only an import is matched against the journal. A session typed by hand AFTER the watch already brought the same effort is
--     the athlete's own entry and is kept (public.titan_submit_training_session is not changed here);
--   - a session saved offline and sent later, or saved more than 10 minutes after the effort with "now", is read by its start only;
--   - two different sports are never matched; distance, heart rate or place are not compared;
--   - a session saved "now" for an effort done earlier the same day can absorb another effort of the same sport that overlaps the
--     stretch just before the save. The start reading already had the mirror case; such an import is kept as 'linked', never lost.
-- Signature, return shape, SECURITY DEFINER and grants (none for the API roles) are unchanged. The caller owns the transaction.
-- Rollback: re-apply the definition of private.titan_import_core from 20261110152800_serialize_activity_imports.sql.

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

  -- Same account, same sport, not archived, and the two efforts share at least half of the shorter one (rule in the file header).
  v_end := p_started_at + (p_duration_minutes * interval '1 minute');
  select l.id into v_dup
    from public.training_logs l
    cross join lateral (select coalesce(public.titan_numeric_from_json(l.details, 'duration'), case when l.unit = 'min' then l.val end, 30) as m) d
   where l.user_id = p_uid and l.archived_at is null and l.sport = p_sport
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
  else
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_distance_km, 'km', v_details, p_started_at);
  end if;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (p_uid, p_source, p_external_id, v_res.log_id::uuid, 'imported');
  return jsonb_build_object('status', 'imported', 'log_id', v_res.log_id, 'xp', v_res.xp, 'reward_held', v_res.reward_held);
end;
$function$;

revoke all on function private.titan_import_core(uuid, text, text, text, timestamptz, numeric, numeric) from public, anon, authenticated;

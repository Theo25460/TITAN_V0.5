-- TITAN 300 — progression v300 checks. Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid := gen_random_uuid();
begin
  perform set_config('titan.qa_user', a::text, true);
  insert into auth.users(id, raw_user_meta_data) values (a, '{}');
  insert into public.profiles(id, username, credits, level, xp) values (a, 'qa_v300', 0, 1, 0)
    on conflict (id) do update set credits = 0, level = 1, xp = 0;
end $$;

-- Effort calculator: same numbers as js/core/effort.js (tests/ascension-core.test.mjs).
do $$
declare e jsonb;
begin
  e := public.titan_effort_v300('running', 'km', 10, '{"duration":55,"bio":{"rpe":6}}');
  assert (e ->> 'xp')::int = 594 and (e ->> 'estimated')::boolean = false, 'run 10 km / 55 min / RPE 6 = 594 XP';
  e := public.titan_effort_v300('swimming', 'm', 1500, '{}');
  assert (e ->> 'minutes')::numeric = 37.5 and (e ->> 'xp')::int = 375 and (e ->> 'estimated')::boolean, 'swim 1500 m estimated 37.5 min';
  e := public.titan_effort_v300('swimming', 'm', 100, '{}');
  assert (e ->> 'xp')::int = 25, '100 m of swimming is no longer worth more than a 10 km run';
  e := public.titan_effort_v300('walking', 'km', 5, '{}');
  assert (e ->> 'xp')::int = 600, 'walk 5 km estimated at 5 km/h';
  e := public.titan_effort_v300('muscu_gym', 'kg', 4000, '{"exercises":[{"setRows":[{},{},{},{}]},{"setRows":[{},{},{}]},{"sets":5}]}');
  assert (e ->> 'minutes')::numeric = 30 and (e ->> 'xp')::int = 300, '12 sets = 30 min';
  e := public.titan_effort_v300('yoga', 'min', 200, '{"rpe":10}');
  assert (e ->> 'counted')::numeric = 135 and (e ->> 'xp')::int = 1890, 'long sessions count half after 90 min, capped at 135';
  assert public.titan_level_requirement(1) = 500 and public.titan_level_requirement(2) = 1231
     and public.titan_level_requirement(10) = 9976, 'level curve 500 × L^1.3';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_user'), 'role', 'authenticated')::text, true);
do $$
declare r record; r2 record; n integer; ev uuid := gen_random_uuid(); old_ev uuid := gen_random_uuid(); d jsonb;
begin
  -- A real session earns effort-based XP and 10 % credits.
  select * into r from public.titan_submit_training_session('running', 'cardio', 10, 'km',
    jsonb_build_object('client_event_id', ev, 'duration', 55, 'bio', jsonb_build_object('rpe', 6)), now() - interval '1 hour');
  assert r.xp = 594 and r.credits = 59 and r.server_version = 'sport-effort-v300', 'effort XP awarded';
  -- Replaying the same event returns the receipt and creates nothing.
  select * into r2 from public.titan_submit_training_session('running', 'cardio', 10, 'km',
    jsonb_build_object('client_event_id', ev, 'duration', 55, 'bio', jsonb_build_object('rpe', 6)), now() - interval '1 hour');
  select count(*) into n from public.training_logs where user_id = auth.uid();
  assert r2.log_id = r.log_id and n = 1, 'idempotent replay';

  -- History older than 30 days: kept in the journal, never rewarded.
  select * into r from public.titan_submit_training_session('cycling', 'endurance', 40, 'km',
    jsonb_build_object('client_event_id', old_ev, 'duration', 90), now() - interval '45 days');
  select details into d from public.training_logs where id::text = r.log_id;
  assert r.xp = 0 and r.credits = 0 and (d ->> 'historical')::boolean and (d ->> 'serverReward') = 'false', 'history accepted without reward';

  -- Daily cap 1800 XP (rewards counted on the day they are granted).
  select * into r from public.titan_submit_training_session('hiit', 'cardio', 120, 'min',
    jsonb_build_object('client_event_id', gen_random_uuid(), 'rpe', 10), now() - interval '50 minutes');
  assert r.xp = 1206, 'second session capped by the daily allowance (1800 - 594)';
  select * into r from public.titan_submit_training_session('hiit', 'cardio', 60, 'min',
    jsonb_build_object('client_event_id', gen_random_uuid(), 'rpe', 8), now() - interval '40 minutes');
  assert r.xp = 0 and r.requested_xp > 0, 'daily cap reached: logged, explained, not rewarded';
  assert (select level from public.profiles where id = auth.uid()) = 3, '1800 XP on the new curve = level 3';
end $$;
reset role;
rollback;

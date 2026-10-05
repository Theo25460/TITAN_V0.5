-- TITAN 300 — social layer checks. Synthetic identities only; everything is rolled back.
-- Run after 20261005200000_ascension_social.sql (and v300 progression for real effort data).
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
begin
  perform set_config('titan.qa_a', a::text, true);
  perform set_config('titan.qa_b', b::text, true);
  perform set_config('titan.qa_c', c::text, true);
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}'), (c, '{}');
  insert into public.profiles(id, username, credits, level, xp, friend_code, privacy) values
    (a, 'qa_alpha', 0, 1, 0, 'TN-QAAA2', '{"publicProfile": true, "showStats": true, "socialPresence": true}'),
    (b, 'qa_bravo', 0, 1, 0, 'TN-QABB3', '{"publicProfile": true, "showStats": false, "socialPresence": false}'),
    (c, 'qa_charlie', 0, 1, 0, 'TN-QACC4', '{"publicProfile": false}')
  on conflict (id) do update set friend_code = excluded.friend_code, privacy = excluded.privacy;
end $$;

-- A asks B: pending until B accepts. Nobody can find C (private).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_a'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.titan_social_request('tn-qabb3');
  assert r ->> 'status' = 'pending', 'request is pending';
  begin
    perform public.titan_social_request('TN-QACC4');
    assert false, 'private profile must not be findable';
  exception when others then
    assert sqlerrm = 'FRIEND_CODE_NOT_FOUND', 'private profile answers like an unknown code: ' || sqlerrm;
  end;
  r := public.titan_social_overview();
  assert jsonb_array_length(r -> 'friends') = 0 and jsonb_array_length(r -> 'requests_out') = 1, 'no friendship before consent';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_b'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.titan_social_overview();
  assert jsonb_array_length(r -> 'requests_in') = 1, 'B sees the request';
  r := public.titan_social_respond(current_setting('titan.qa_a')::uuid, true);
  assert r ->> 'status' = 'friends', 'B accepts';
  r := public.titan_social_overview();
  assert jsonb_array_length(r -> 'friends') = 1 and (r -> 'friends' -> 0 ->> 'level') is not null, 'A shares stats with B';
end $$;

-- A sees B without stats or presence (B kept them private).
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_a'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; m jsonb; ch jsonb;
begin
  r := public.titan_social_overview();
  assert (r -> 'friends' -> 0 ->> 'level') is null and (r -> 'friends' -> 0 ->> 'last_active') is null, 'B privacy respected';
  m := public.titan_moment_share('record', 'Record sur 10 km', '47:12', 'running', null, 'friends');
  perform set_config('titan.qa_moment', m ->> 'id', true);
  ch := public.titan_challenge_create('Semaine d’effort', 'effort_minutes', null, 300, 7, array[current_setting('titan.qa_b')::uuid, current_setting('titan.qa_c')::uuid]);
  assert (ch ->> 'invited')::int = 1, 'only friends can be invited';
  perform set_config('titan.qa_challenge', ch ->> 'id', true);
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_b'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.titan_moment_cheer(current_setting('titan.qa_moment')::uuid);
  assert (r ->> 'cheered')::boolean and (r ->> 'count')::int = 1, 'friend can cheer';
  r := public.titan_challenge_respond(current_setting('titan.qa_challenge')::uuid, 'join');
  assert r ->> 'status' = 'joined', 'B joins the challenge';
end $$;

-- C is not a friend: no cheer, no moment.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_c'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  begin
    perform public.titan_moment_cheer(current_setting('titan.qa_moment')::uuid);
    assert false, 'stranger cannot cheer';
  exception when others then
    assert sqlerrm = 'MOMENT_NOT_FOUND', sqlerrm;
  end;
  r := public.titan_social_overview();
  assert jsonb_array_length(r -> 'moments') = 0, 'stranger sees no moment';
end $$;

-- Effort data written as the server would (details.effort), then contributions are capped per day.
reset role;
do $$
declare b uuid := current_setting('titan.qa_b')::uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  -- now() is frozen inside a transaction: open the challenge an hour earlier, record the sessions
  -- ten minutes before joining the expedition.
  update public.titan_challenges set starts_at = now() - interval '1 hour' where id = current_setting('titan.qa_challenge')::uuid;
  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details, client_event_id, created_at)
  values (b, 'running', 'cardio', 20, 'km', 0, now() - interval '20 minutes', '{"effort":{"effort_minutes":150},"historical":false}', gen_random_uuid(), now() - interval '10 minutes'),
         (b, 'yoga', 'mobility', 30, 'min', 0, now() - interval '15 minutes', '{"effort":{"effort_minutes":30},"historical":false}', gen_random_uuid(), now() - interval '10 minutes');
  insert into public.titan_expeditions(id, title, story, guardian, starts_at, ends_at, collective_goal, reward_title)
  values ('qa-expedition', 'QA expédition', 'Une expédition de test, annulée à la fin.', 'Le Testeur', now() - interval '1 day', now() + interval '6 days', 600, 'Testeur');
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_b'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; ch jsonb;
begin
  r := public.titan_social_overview();
  select x into ch from jsonb_array_elements(r -> 'challenges') x where x ->> 'id' = current_setting('titan.qa_challenge');
  assert (select (m ->> 'progress')::numeric from jsonb_array_elements(ch -> 'members') m where m ->> 'id' = current_setting('titan.qa_b')) = 90,
    '180 effort minutes on one day count 90';
  r := public.titan_expedition_join('qa-expedition');
  assert (r -> 'me' ->> 'joined')::boolean and (r -> 'me' ->> 'minutes')::numeric = 0, 'sessions recorded before joining do not count';
end $$;

rollback;

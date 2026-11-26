-- V1.9.1: fixtures COMMITTED in a disposable titan_test_ database. Inès follows two coaches; one accepted proposal from each, both on the
-- day of her real outing, and a second outing the same day. Run only by tools/db/test-coach-followup-concurrency.sh (refuses other databases).
do $$
declare c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); a uuid := gen_random_uuid(); l1 uuid; l2 uuid; p1 uuid; p2 uuid;
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); inv jsonb;
begin
  insert into auth.users(id, raw_user_meta_data) values (c1, '{}'), (c2, '{}'), (a, '{}');
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (t1, a, 'running', 9.4, 'km', 10, now() - interval '1 day', '{"duration":52}', now() - interval '1 day'),
    (t2, a, 'running', 4.0, 'km', 10, now() - interval '1 day' + interval '2 hours', '{"duration":25}', now() - interval '1 day');
  set local session_replication_role = origin;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true); inv := public.titan_coach_portal('invite');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  l1 := (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true); inv := public.titan_coach_portal('invite');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  l2 := (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  p1 := (public.titan_coach_portal('assign', jsonb_build_object('link_id', l1, 'title', 'Côtes', 'sport', 'running', 'planned_date', current_date - 1))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  p2 := (public.titan_coach_portal('assign', jsonb_build_object('link_id', l2, 'title', 'Footing', 'sport', 'running', 'planned_date', current_date - 1))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.titan_coach_portal('assignment_status', jsonb_build_object('id', p1, 'revision', 1, 'status', 'accepted'));
  perform public.titan_coach_portal('assignment_status', jsonb_build_object('id', p2, 'revision', 1, 'status', 'accepted'));
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.cf_ids(k text primary key, v uuid);
  insert into public.cf_ids values ('a', a), ('p1', p1), ('p2', p2), ('t1', t1), ('t2', t2) on conflict (k) do update set v = excluded.v;
end $$;

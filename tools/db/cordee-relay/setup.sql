-- V1.8.1: fixtures COMMITTED in a disposable titan_test_ database (two friends of one pilot cordée, each with a confirmed session).
-- Run only by tools/db/test-cordee-relay-concurrency.sh, which refuses any other database.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); id1 uuid;
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  update public.profiles set username = 'cc_' || left(id::text, 4), privacy = '{"publicProfile":true}' where id in (a, b);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.cordee', true, 100, 'QA'), ('screens.cordee_relay', true, 100, 'QA') on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values (a, b, 'accepted');
  id1 := (public.titan_cordee_create_v1('aube', 'soutenue', 28, array[b])->>'id')::uuid;
  perform set_config('request.jwt.claims', '{}', true);
  update public.titan_challenges set starts_at = now() - interval '5 days', ends_at = now() + interval '20 days' where id = id1;
  update public.titan_challenge_members set status = 'joined', joined_at = now() where challenge_id = id1;
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
   (a, 'climbing', 1, 'session', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '2 days'),
   (b, 'running', 5, 'km', 10, now() - interval '1 day', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '1 day');
  set local session_replication_role = origin;
  create table if not exists public.cc_ids(k text primary key, v uuid);
  insert into public.cc_ids values ('a', a), ('b', b), ('id', id1) on conflict (k) do update set v = excluded.v;
end $$;

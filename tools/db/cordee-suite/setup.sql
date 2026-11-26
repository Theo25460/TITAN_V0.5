-- V1.8.3: fixtures COMMITTED in a disposable titan_test_ database. a, b and c finished a cordée together (summited yesterday); b and c
-- may each propose to set off again. Run only by tools/db/test-cordee-suite-concurrency.sh, which refuses any other database.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); id1 uuid;
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}'), (c, '{}');
  update public.profiles set username = 'cs_' || left(id::text, 4), privacy = '{"publicProfile":true}' where id in (a, b, c);
  insert into private.titan_feature_flags(key, enabled, rollout, description)
  values ('screens.cordee', true, 100, 'QA'), ('screens.cordee_suite', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values (a, b, 'accepted'), (a, c, 'accepted');
  id1 := (public.titan_cordee_create_v1('aube', 'reguliere', 14, array[b, c])->>'id')::uuid;
  perform set_config('request.jwt.claims', '{}', true);
  update public.titan_challenge_members set status = 'joined', joined_at = now() - interval '15 days' where challenge_id = id1;
  update public.titan_challenges set starts_at = now() - interval '15 days', ends_at = now() - interval '1 day', summited_at = now() - interval '1 day' where id = id1;
  create table if not exists public.cs_ids(k text primary key, v uuid);
  insert into public.cs_ids values ('a', a), ('b', b), ('c', c), ('id', id1) on conflict (k) do update set v = excluded.v;
end $$;

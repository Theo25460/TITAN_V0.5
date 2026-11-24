-- V1.8.6: fixtures COMMITTED in a disposable titan_test_ database. o administers a club where j, k and m are members; a meeting in 3 days
-- has a capacity of 2 and m already holds one place. Run only by tools/db/test-club-agenda-concurrency.sh, which refuses any other database.
do $$
declare o uuid := gen_random_uuid(); j uuid := gen_random_uuid(); kk uuid := gen_random_uuid(); m uuid := gen_random_uuid(); club uuid; code text; r jsonb;
begin
  insert into auth.users(id, raw_user_meta_data) values (o, '{}'), (j, '{}'), (kk, '{}'), (m, '{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (o, j, kk, m);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.club_agenda', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  club := public.titan_club_create_v1('Club concurrence', null, false);
  code := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = club::text);
  r := public.titan_club_agenda_act_v1(club, 'create', p_form => jsonb_build_object('title', 'Dernière place', 'area', 'Stade', 'durationMin', 60,
    'capacity', 2, 'startsAt', now() + interval '3 days'));
  perform set_config('request.jwt.claims', json_build_object('sub', j, 'role', 'authenticated')::text, true);
  perform public.titan_club_join_v1(code, null);
  perform set_config('request.jwt.claims', json_build_object('sub', kk, 'role', 'authenticated')::text, true);
  perform public.titan_club_join_v1(code, null);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  perform public.titan_club_join_v1(code, null);
  perform public.titan_club_agenda_act_v1(club, 'answer', (r->'upcoming'->0->>'id')::uuid, p_answer => 'yes');
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.cag_ids(k text primary key, v uuid);
  insert into public.cag_ids values ('o', o), ('j', j), ('k', kk), ('m', m), ('club', club), ('slot', (r->'upcoming'->0->>'id')::uuid)
    on conflict (k) do update set v = excluded.v;
end $$;

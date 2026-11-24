-- V1.8.4: fixtures COMMITTED in a disposable titan_test_ database. o administers a club where j is a member; a season runs since today.
-- Run only by tools/db/test-club-season-concurrency.sh, which refuses any other database.
do $$
declare o uuid := gen_random_uuid(); j uuid := gen_random_uuid(); club uuid; code text;
begin
  insert into auth.users(id, raw_user_meta_data) values (o, '{}'), (j, '{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (o, j);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.club_season', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  club := public.titan_club_create_v1('Club concurrence', null, false);
  code := (select x->>'code' from jsonb_array_elements(public.titan_club_my_v1()) x where x->>'id' = club::text);
  perform public.titan_club_season_act_v1(club, 'create', 'Saison concurrence', 'reguliere', 4, (now() at time zone 'Europe/Paris')::date);
  perform set_config('request.jwt.claims', json_build_object('sub', j, 'role', 'authenticated')::text, true);
  perform public.titan_club_join_v1(code, null);
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.csn_ids(k text primary key, v uuid);
  insert into public.csn_ids values ('o', o), ('j', j), ('club', club) on conflict (k) do update set v = excluded.v;
end $$;

-- V1.8.5: fixtures COMMITTED in a disposable titan_test_ database. o administers « Club hôte » and proposes a meeting; a and b each
-- administer another club and both hold the proposal's identifier (read from the code's preview).
-- Run only by tools/db/test-club-match-concurrency.sh, which refuses any other database.
do $$
declare o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ch uuid; ca uuid; cb uuid; r jsonb; p jsonb;
begin
  insert into auth.users(id, raw_user_meta_data) values (o, '{}'), (a, '{}'), (b, '{}');
  update public.profiles set created_at = now() - interval '5 days' where id in (o, a, b);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.club_match', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  ch := public.titan_club_create_v1('Club hôte', null, false);
  r := public.titan_club_match_act_v1(ch, 'propose', 'cooperation', 'reguliere', 1, (now() at time zone 'Europe/Paris')::date + 1);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ca := public.titan_club_create_v1('Club A', null, false);
  p := public.titan_club_match_preview_v1(ca, r->'current'->>'code');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  cb := public.titan_club_create_v1('Club B', null, false);
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.cmt_ids(k text primary key, v uuid);
  insert into public.cmt_ids values ('o', o), ('a', a), ('b', b), ('ch', ch), ('ca', ca), ('cb', cb), ('match', (p->>'id')::uuid)
  on conflict (k) do update set v = excluded.v;
end $$;

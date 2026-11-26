-- V1.9.6: fixtures COMMITTED in a disposable titan_test_ database. Coach Lou (offer Coach) follows three athletes in one group; a block of one
-- week is prepared, its preview key stored for the concurrent sends. Run only by tools/db/test-coach-group-concurrency.sh (refuses other databases).
do $$
declare c uuid := gen_random_uuid(); a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()]; l uuid[] := '{}'; inv jsonb; p jsonb; g jsonb; d jsonb; i integer;
  w date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date + 7;
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (a[1], '{}'), (a[2], '{}'), (a[3], '{}');
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_programs', true, 100, 'QA'), ('screens.coach_groups', true, 100, 'QA')
    on conflict (key) do update set enabled = true;
  for i in 1..3 loop
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); inv := public.titan_coach_portal('invite');
    perform set_config('request.jwt.claims', json_build_object('sub', a[i], 'role', 'authenticated')::text, true);
    l := l || (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  p := public.titan_coach_program_v1('save_program', jsonb_build_object('title', 'Une semaine', 'weeks', 1,
         'sessions', '[{"key":"w1-tue","week":1,"day":2,"title":"Footing 40 min","sport":"running"},{"key":"w1-sat","week":1,"day":6,"title":"Sortie longue","sport":"running"}]'::jsonb));
  g := public.titan_coach_group_v1('create_group', jsonb_build_object('title', 'Groupe', 'link_ids', to_jsonb(l)));
  d := public.titan_coach_group_v1('prepare', jsonb_build_object('group_id', g->>'id', 'program_id', p->>'id', 'start_date', w))->'dispatch';
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.gr_ids(k text primary key, v text);
  insert into public.gr_ids values ('c', c), ('d', d->>'id'), ('k', d->>'preview_key'), ('op', gen_random_uuid()::text), ('op2', gen_random_uuid()::text)
    on conflict (k) do update set v = excluded.v;
end $$;

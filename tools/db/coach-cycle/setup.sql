-- V1.9.5: fixtures COMMITTED in a disposable titan_test_ database. Coach Lou follows Inès; a one-week cycle is sent, accepted, closed;
-- its report holds one decision and is proposed to Inès, whose reading (preview key) is stored for the concurrent validations.
-- Run only by tools/db/test-coach-cycle-concurrency.sh (refuses other databases).
do $$
declare c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); l uuid; inv jsonb; p jsonb; r jsonb; s jsonb; w date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date + 7;
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (a, '{}');
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_programs', true, 100, 'QA'), ('screens.coach_cycle_report', true, 100, 'QA')
    on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); inv := public.titan_coach_portal('invite');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  l := (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  s := '[{"key":"w1-tue","week":1,"day":2,"title":"Footing 40 min","sport":"running"},{"key":"w1-sat","week":1,"day":6,"title":"Sortie longue","sport":"running"}]';
  p := public.titan_coach_program_v1('save_program', jsonb_build_object('title', 'Une semaine', 'weeks', 1, 'sessions', s));
  p := public.titan_coach_program_v1('adapt', jsonb_build_object('link_id', l, 'program_id', p->>'id', 'start_date', w))->'plan';
  perform public.titan_coach_program_v1('send', jsonb_build_object('id', p->>'id', 'revision', p->'revision'));
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.titan_coach_program_v1('answer', jsonb_build_object('id', p->>'id', 'all', 'accept'));
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_coach_program_v1('close', jsonb_build_object('id', p->>'id', 'revision', (public.titan_coach_program_v1('plan', jsonb_build_object('id', p->>'id'))->'revision')));
  r := public.titan_coach_cycle_v1('start', jsonb_build_object('plan_id', p->>'id'))->'report';
  r := public.titan_coach_cycle_v1('save', jsonb_build_object('id', r->>'id', 'revision', r->'revision', 'decisions', '[{"key":"d1","kind":"goal","text":"Courir 12 km"}]'::jsonb))->'report';
  perform public.titan_coach_cycle_v1('propose', jsonb_build_object('id', r->>'id', 'revision', r->'revision'));
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  s := public.titan_coach_cycle_v1('report', jsonb_build_object('id', r->>'id'));
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.cy_ids(k text primary key, v text);
  insert into public.cy_ids values ('c', c), ('a', a), ('r', r->>'id'), ('k', s#>>'{proposal,preview_key}'), ('op', gen_random_uuid()::text), ('op2', gen_random_uuid()::text)
    on conflict (k) do update set v = excluded.v;
end $$;

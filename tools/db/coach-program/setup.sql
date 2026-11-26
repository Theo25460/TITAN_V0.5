-- V1.9.4: fixtures COMMITTED in a disposable titan_test_ database. Coach Lou follows Inès; one programme is a draft ready to send, a
-- second one is sent and accepted, with the preview of a week-2 shift ready to apply.
-- Run only by tools/db/test-coach-program-concurrency.sh (refuses other databases).
do $$
declare c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); l uuid; inv jsonb; d jsonb; p jsonb; s jsonb; w date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date + 7;
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (a, '{}');
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_programs', true, 100, 'QA') on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); inv := public.titan_coach_portal('invite');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  l := (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  s := '[{"key":"w1-tue","week":1,"day":2,"title":"Footing 40 min","sport":"running"},{"key":"w2-tue","week":2,"day":2,"title":"Fractionné","sport":"running"},
         {"key":"w2-sat","week":2,"day":6,"title":"Sortie longue","sport":"running"}]';
  p := public.titan_coach_program_v1('save_program', jsonb_build_object('title', 'Deux semaines', 'weeks', 2, 'sessions', s));
  d := public.titan_coach_program_v1('adapt', jsonb_build_object('link_id', l, 'program_id', p->>'id', 'start_date', w))->'plan';
  -- The second programme: sent, accepted by Inès, and the coach's preview of a week-2 shift.
  p := public.titan_coach_program_v1('adapt', jsonb_build_object('link_id', l, 'program_id', p->>'id', 'start_date', w + 7))->'plan';
  perform public.titan_coach_program_v1('send', jsonb_build_object('id', p->>'id', 'revision', 1));
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.titan_coach_program_v1('answer', jsonb_build_object('id', p->>'id', 'all', 'accept'));
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  s := public.titan_coach_program_v1('revise', jsonb_build_object('id', p->>'id', 'scope', 'week', 'week', 2, 'shift_days', 1, 'dry_run', true));
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.cp_ids(k text primary key, v text);
  insert into public.cp_ids values ('c', c), ('a', a), ('l', l), ('d', d->>'id'), ('p', p->>'id'), ('k', s->>'preview_key'), ('op', gen_random_uuid()::text), ('op2', gen_random_uuid()::text)
    on conflict (k) do update set v = excluded.v;
end $$;

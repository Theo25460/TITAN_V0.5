-- V1.9.3: builds the lot's scenario (Coach Lou, five athletes, two paused links) on a disposable titan_test_ database and prints the
-- server's own answers (review of the week, prepare, resume, send, revocation, the following week) and, for the « before » path, what the
-- existing screens read (snapshot, proposals, follow-up, feedback, check-ins, templates), so the website tests replay real payloads
-- (tests/fixtures/coach-review.json). Everything is rolled back. Dates are relative to the day it runs; ids are fixed.
-- Usage: node tools/db/coach-review/build-fixtures.mjs psql -h … -d titan_test_…
begin;
insert into private.titan_feature_flags(key, enabled, rollout, description) values
  ('screens.coach_review', true, 100, 'QA'), ('screens.coach_followup', true, 100, 'QA'), ('screens.coach_feedback', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
create function pg_temp.id(k text) returns uuid language sql immutable as $$ select ('19300000-0000-4000-8000-' || lpad(k, 12, '0'))::uuid $$;
insert into auth.users(id, raw_user_meta_data) select pg_temp.id(k), '{}' from unnest(array['c1', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) k;
update public.profiles p set username = n.name from (values ('c1', 'Coach Lou'), ('a1', 'Inès'), ('a2', 'Malo'), ('a3', 'Zoé'), ('a4', 'Noé'), ('a5', 'Lina'), ('a6', 'Paul'), ('a7', 'Léa')) n(k, name)
 where p.id = pg_temp.id(n.k);
create function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.p(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_portal(a, d); end $$;
create function pg_temp.f(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_followup_v1(a, d); end $$;
create function pg_temp.fb(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_feedback_v1(a, d); end $$;
create function pg_temp.r(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_review_v1(a, d); end $$;
create function pg_temp.err(u uuid, a text, d jsonb) returns text language plpgsql as $$ begin perform pg_temp.r(u, a, d); return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.link(c uuid, a uuid) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := pg_temp.p(c, 'invite', '{}'); return (pg_temp.p(a, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid; end $$;
do $$
declare c uuid := pg_temp.id('c1'); past date := greatest(date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date - 4, current_date - 7);
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (pg_temp.id('5a3'), pg_temp.id('a3'), 'running', 10.2, 'km', 10, (past + time '07:30') at time zone 'Europe/Paris', '{"duration":55,"note":"Genou sensible"}', now() - interval '3 days'),
    (pg_temp.id('5a5'), pg_temp.id('a5'), 'running', 8.0, 'km', 10, (past + time '07:30') at time zone 'Europe/Paris', '{"duration":44}', now() - interval '3 days');
  set local session_replication_role = origin;
  perform set_config('titan.fx_past', past::text, true);
end $$;
do $$
declare c uuid := pg_temp.id('c1'); l uuid[] := array[]::uuid[]; i integer; t jsonb; tz jsonb; tl jsonb; past date := current_setting('titan.fx_past')::date; nxt date := current_date + 2; k jsonb;
begin
  for i in 1..5 loop l := l || pg_temp.link(c, pg_temp.id('a' || i)); end loop;
  perform pg_temp.p(c, 'assign', jsonb_build_object('link_id', l[1], 'title', 'Footing 45 min', 'sport', 'running', 'planned_date', nxt, 'instructions', 'En aisance'));
  t := pg_temp.p(c, 'assign', jsonb_build_object('link_id', l[2], 'title', 'Fractionné 6 × 400 m', 'sport', 'running', 'planned_date', nxt, 'instructions', ''));
  perform pg_temp.p(pg_temp.id('a2'), 'assignment_status', jsonb_build_object('id', t->>'id', 'revision', 1, 'status', 'accepted'));
  perform pg_temp.f(c, 'propose_change', jsonb_build_object('id', t->>'id', 'revision', 2, 'instructions', '6 × 400 m, récupération 1 min 30', 'note', 'Plus de récupération'));
  tz := pg_temp.p(c, 'assign', jsonb_build_object('link_id', l[3], 'title', 'Sortie longue 10 km', 'sport', 'running', 'planned_date', past, 'instructions', 'Allure confortable'));
  tl := pg_temp.p(c, 'assign', jsonb_build_object('link_id', l[5], 'title', 'Footing 8 km', 'sport', 'running', 'planned_date', past, 'instructions', ''));
  update public.coach_assignments set created_at = created_at - interval '10 days' where id in ((tz->>'id')::uuid, (tl->>'id')::uuid);
  perform pg_temp.p(pg_temp.id('a3'), 'assignment_status', jsonb_build_object('id', tz->>'id', 'revision', 1, 'status', 'accepted'));
  perform pg_temp.p(pg_temp.id('a5'), 'assignment_status', jsonb_build_object('id', tl->>'id', 'revision', 1, 'status', 'accepted'));
  perform pg_temp.f(pg_temp.id('a3'), 'link', jsonb_build_object('id', tz->>'id', 'revision', 2, 'session_id', pg_temp.id('5a3')));
  perform pg_temp.f(pg_temp.id('a5'), 'link', jsonb_build_object('id', tl->>'id', 'revision', 2, 'session_id', pg_temp.id('5a5')));
  k := pg_temp.fb(c, 'compose', jsonb_build_object('id', tz->>'id'));
  perform pg_temp.fb(c, 'give', jsonb_build_object('id', tz->>'id', 'session_key', k->>'session_key', 'observation', 'Allure régulière, bien.'));
  perform pg_temp.as_(c);
  perform public.titan_coach_template_save_v1(null, 'Seuil 3 × 8 min', 'running', 'Échauffement 20 min, 3 × 8 min au seuil, récupération 2 min');
  perform public.titan_coach_template_save_v1(null, 'Footing récupération 40 min', 'running', 'Très facile, en aisance respiratoire');
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.coach_links(coach_id, athlete_id, since_date, accepted_at) values (c, pg_temp.id('a6'), current_date - 30, now() + interval '1 second'), (c, pg_temp.id('a7'), current_date - 30, now() + interval '2 seconds');
  insert into private.titan_coach_checkins(link_id, week_start, scores, note, shared) values
    (l[3], date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date - 7, '{"fatigue":2,"energy":4,"sleep":4,"motivation":5}', 'Bonne semaine', true),
    (l[1], date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date - 7, '{"fatigue":5,"energy":1,"sleep":2,"motivation":2}', 'Semaine très dure au travail', false);
  perform set_config('titan.fx_l', array_to_string(l, ','), true);
end $$;
-- What the existing screens read (the « before » path).
select jsonb_build_object('key', 'snapshot', 'value', pg_temp.p(pg_temp.id('c1'), 'snapshot', '{}'));
select jsonb_build_object('key', 'queue', 'value', pg_temp.f(pg_temp.id('c1'), 'queue', '{}'));
select jsonb_build_object('key', 'assignments:' || x, 'value', pg_temp.p(pg_temp.id('c1'), 'assignments', jsonb_build_object('link_id', x))) from unnest(string_to_array(current_setting('titan.fx_l'), ',')) x;
select jsonb_build_object('key', 'list:' || x, 'value', pg_temp.f(pg_temp.id('c1'), 'list', jsonb_build_object('link_id', x))) from unnest(string_to_array(current_setting('titan.fx_l'), ',')) x;
select jsonb_build_object('key', 'feedback:' || x, 'value', pg_temp.fb(pg_temp.id('c1'), 'list', jsonb_build_object('link_id', x))) from unnest(string_to_array(current_setting('titan.fx_l'), ',')) x;
select jsonb_build_object('key', 'checkins:' || x, 'value', public.titan_coach_checkins_v1(x::uuid)) from (select pg_temp.as_(pg_temp.id('c1'))) s, unnest(string_to_array(current_setting('titan.fx_l'), ',')) x;
select jsonb_build_object('key', 'templates', 'value', public.titan_coach_templates_v1()) from (select pg_temp.as_(pg_temp.id('c1'))) s;
-- The review.
select jsonb_build_object('key', 'week_actionable', 'value', pg_temp.r(pg_temp.id('c1'), 'week', '{}'));
select jsonb_build_object('key', 'week_all', 'value', pg_temp.r(pg_temp.id('c1'), 'week', '{"filter":"all"}'));
select jsonb_build_object('key', 'week_previous', 'value', pg_temp.r(pg_temp.id('c1'), 'week', jsonb_build_object('week', date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date - 7, 'filter', 'all')));
do $$
declare c uuid := pg_temp.id('c1'); l uuid[] := string_to_array(current_setting('titan.fx_l'), ',')::uuid[]; tpl uuid; d jsonb;
begin
  perform pg_temp.as_(c);
  select (e->>'id')::uuid into tpl from jsonb_array_elements(public.titan_coach_templates_v1()) e where e->>'title' = 'Seuil 3 × 8 min';
  d := pg_temp.r(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl, 'planned_date', current_date + 3));
  perform set_config('titan.fx_prep1', d::text, true);
  d := pg_temp.r(c, 'prepare', jsonb_build_object('link_id', l[3], 'revision', 1, 'instructions', 'Échauffement 20 min, 3 × 8 min au seuil, récupération 3 min'));
  perform set_config('titan.fx_prep2', d::text, true);
  perform set_config('titan.fx_resumed', pg_temp.r(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl))::text, true);
  perform set_config('titan.fx_week_resume', pg_temp.r(c, 'week', '{"filter":"all"}')::text, true);
  d := pg_temp.r(c, 'prepare', jsonb_build_object('link_id', l[4], 'template_id', tpl, 'planned_date', current_date + 3));
  perform set_config('titan.fx_prep_noe', d::text, true);
  perform pg_temp.p(pg_temp.id('a4'), 'revoke', jsonb_build_object('link_id', l[4], 'revision', 1));
  perform set_config('titan.fx_send_revoked', pg_temp.err(c, 'send', jsonb_build_object('id', d#>>'{draft,id}', 'revision', 1)), true);
  perform set_config('titan.fx_week_revoked', pg_temp.r(c, 'week', '{"filter":"all"}')::text, true);
  perform set_config('titan.fx_send', pg_temp.r(c, 'send', jsonb_build_object('id', current_setting('titan.fx_prep2')::jsonb#>>'{draft,id}', 'revision', 2))::text, true);
  perform set_config('titan.fx_send_again', pg_temp.r(c, 'send', jsonb_build_object('id', current_setting('titan.fx_prep2')::jsonb#>>'{draft,id}', 'revision', 2))::text, true);
  perform set_config('titan.fx_week_sent', pg_temp.r(c, 'week', '{"filter":"all"}')::text, true);
  perform set_config('titan.fx_detail_sent', pg_temp.f(c, 'detail', jsonb_build_object('id', current_setting('titan.fx_send')::jsonb#>>'{assignment,id}'))::text, true);
  perform set_config('titan.fx_athlete', pg_temp.f(pg_temp.id('a3'), 'athlete', '{}')::text, true);
  perform pg_temp.p(pg_temp.id('a3'), 'assignment_status', jsonb_build_object('id', current_setting('titan.fx_send')::jsonb#>>'{assignment,id}', 'revision', 1, 'status', 'accepted'));
  perform set_config('titan.fx_week_next', pg_temp.r(c, 'week', jsonb_build_object('week', date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date + 7, 'filter', 'all'))::text, true);
end $$;
select jsonb_build_object('key', k, 'value', current_setting('titan.fx_' || k)::jsonb)
  from unnest(array['prep1', 'prep2', 'resumed', 'week_resume', 'prep_noe', 'week_revoked', 'send', 'send_again', 'week_sent', 'detail_sent', 'athlete', 'week_next']) k;
select jsonb_build_object('key', 'send_revoked', 'value', to_jsonb(current_setting('titan.fx_send_revoked')));
rollback;

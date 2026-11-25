-- V1.9.4: builds the lot's scenario (Coach Lou; Zoé, Noé and Paul followed first; Inès and Malo) on a disposable titan_test_ database and
-- prints the server's own answers (template, adaptation and its preview, send and its replay, answers, the case to discuss in the queue
-- and the review, the revisions previewed and applied two weeks later, pause, closing, revocation) so the website and Android tests replay
-- real payloads (tests/fixtures/coach-program.json). Everything is rolled back. Dates are relative to the day it runs; ids are fixed.
-- Usage: node tools/db/coach-program/build-fixtures.mjs psql -h … -d titan_test_…
begin;
insert into private.titan_feature_flags(key, enabled, rollout, description) values
  ('screens.coach_programs', true, 100, 'QA'), ('screens.coach_review', true, 100, 'QA'), ('screens.coach_followup', true, 100, 'QA'), ('screens.coach_feedback', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
create function pg_temp.id(k text) returns uuid language sql immutable as $$ select ('19400000-0000-4000-8000-' || lpad(k, 12, '0'))::uuid $$;
insert into auth.users(id, raw_user_meta_data) select pg_temp.id(k), '{}' from unnest(array['c1', 'a1', 'a2', 'a3', 'a4', 'a5']) k;
update public.profiles p set username = n.name from (values ('c1', 'Coach Lou'), ('a1', 'Zoé'), ('a2', 'Noé'), ('a3', 'Paul'), ('a4', 'Inès'), ('a5', 'Malo')) n(k, name)
 where p.id = pg_temp.id(n.k);
create function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.p(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_portal(a, d); end $$;
create function pg_temp.f(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_followup_v1(a, d); end $$;
create function pg_temp.g(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_program_v1(a, d); end $$;
create function pg_temp.err(u uuid, a text, d jsonb) returns text language plpgsql as $$ begin perform pg_temp.g(u, a, d); return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.link(c uuid, a uuid) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := pg_temp.p(c, 'invite', '{}'); return (pg_temp.p(a, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 60, 'consent', true))->>'id')::uuid; end $$;
create function pg_temp.row(p uuid, k text) returns public.coach_assignments language sql as $$ select * from public.coach_assignments where plan_id = p and plan_key = k $$;
create table pg_temp.out(n serial, k text, v jsonb);
create function pg_temp.keep(k text, v jsonb) returns void language sql as $$ insert into pg_temp.out(k, v) values (k, v) $$;
do $$
declare c uuid := pg_temp.id('c1'); l uuid[] := array[]::uuid[]; i integer;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v194', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  for i in 1..5 loop l := l || pg_temp.link(c, pg_temp.id('a' || i)); end loop;
  perform set_config('request.jwt.claims', '{}', true);
  for i in 1..5 loop update public.coach_links set accepted_at = now() - make_interval(mins => 10 - i) where id = l[i]; end loop;
  perform set_config('titan.fx_l', array_to_string(l, ','), true);
end $$;
do $$
declare
  c uuid := pg_temp.id('c1'); ines uuid := pg_temp.id('a4'); malo uuid := pg_temp.id('a5'); l uuid[] := string_to_array(current_setting('titan.fx_l'), ',')::uuid[];
  wk date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date; s jsonb := '[]'::jsonb; w integer; r jsonb; d jsonb; prog uuid; pi uuid; pm uuid; dec jsonb; x public.coach_assignments;
  s1 uuid := pg_temp.id('5a1'); s2 uuid := pg_temp.id('5a2');
begin
  perform pg_temp.keep('library_empty', pg_temp.g(c, 'library', '{}'));
  for w in 1..4 loop
    s := s || jsonb_build_array(
      jsonb_build_object('key', 'w' || w || '-tue', 'week', w, 'day', 2, 'title', case when w % 2 = 0 then 'Fractionné 6 × 400 m' else 'Footing 40 min' end, 'sport', 'running', 'instructions', 'Échauffement 15 min'),
      jsonb_build_object('key', 'w' || w || '-thu', 'week', w, 'day', 4, 'title', 'Renforcement 30 min', 'sport', 'muscu_home', 'instructions', 'Gainage, fentes, pompes'),
      jsonb_build_object('key', 'w' || w || '-sat', 'week', w, 'day', 6, 'title', case when w = 4 then 'Test 10 km' else 'Sortie longue ' || (8 + 2 * w) || ' km' end, 'sport', 'running', 'instructions', 'Allure confortable'));
  end loop;
  r := pg_temp.g(c, 'save_program', jsonb_build_object('title', 'Course et renforcement — 4 semaines', 'weeks', 4, 'goals', '["Courir 10 km en aisance", "Renforcement deux fois par semaine"]'::jsonb, 'sessions', s));
  perform pg_temp.keep('save_program', r);
  prog := (r->>'id')::uuid;
  perform pg_temp.keep('library', pg_temp.g(c, 'library', '{}'));
  perform pg_temp.keep('program', pg_temp.g(c, 'program', jsonb_build_object('id', prog)));
  perform pg_temp.keep('snapshot', pg_temp.p(c, 'snapshot', '{}'));
  perform pg_temp.keep('snapshot_ines', pg_temp.p(ines, 'snapshot', '{}'));
  perform pg_temp.keep('link_empty', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  -- Adapted for Inès, previewed, sent once.
  d := pg_temp.g(c, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', prog, 'start_date', wk + 7));
  perform pg_temp.keep('adapt', d);
  pi := (d#>>'{plan,id}')::uuid;
  s := (select jsonb_agg(case e->>'key' when 'w2-tue' then e || '{"day":1}' when 'w2-thu' then e || '{"day":7,"title":"Gainage 20 min","instructions":"Planche, gainage latéral"}'
           when 'w2-sat' then e || '{"day":7}' else e end - 'planned_date') from jsonb_array_elements(d#>'{plan,sessions}') e where e->>'key' <> 'w1-thu');
  perform pg_temp.keep('edit', pg_temp.g(c, 'edit', jsonb_build_object('id', pi, 'revision', 1, 'title', 'Course et renforcement — Inès', 'sessions', s)));
  perform pg_temp.keep('link_draft', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('send', pg_temp.g(c, 'send', jsonb_build_object('id', pi, 'revision', 2)));
  perform pg_temp.keep('send_again', pg_temp.g(c, 'send', jsonb_build_object('id', pi, 'revision', 2)));
  perform pg_temp.keep('link_sent', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('assignments_sent', pg_temp.p(c, 'assignments', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('athlete_sent', pg_temp.g(ines, 'athlete', '{}'));
  perform pg_temp.keep('link_ines_sent', pg_temp.g(ines, 'link', jsonb_build_object('link_id', l[4])));
  -- Inès answers: one session to discuss, one declined, the rest accepted.
  dec := (select jsonb_agg(jsonb_build_object('key', k, 'answer', case k when 'w3-sat' then 'discuss' when 'w4-thu' then 'decline' else 'accept' end,
            'note', case k when 'w3-sat' then 'Je préfère des côtes ce samedi-là' end))
            from unnest(array['w1-tue', 'w1-sat', 'w2-tue', 'w2-thu', 'w2-sat', 'w3-tue', 'w3-thu', 'w3-sat', 'w4-tue', 'w4-thu', 'w4-sat']) k);
  perform pg_temp.keep('answer', pg_temp.g(ines, 'answer', jsonb_build_object('id', pi, 'decisions', dec)));
  perform pg_temp.keep('link_answered', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('plan_answered', pg_temp.g(c, 'plan', jsonb_build_object('id', pi)));
  perform pg_temp.keep('queue_discuss', pg_temp.f(c, 'queue', '{}'));
  perform pg_temp.as_(c);
  perform pg_temp.keep('review_discuss', public.titan_coach_review_v1('week', jsonb_build_object('week', wk + 7, 'filter', 'all')));
  -- The coach replaces the session to discuss.
  r := pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w3-sat', 'title', 'Sortie 10 km avec côtes', 'instructions', '6 côtes de 200 m au milieu', 'note', 'Côtes comme demandé', 'dry_run', true));
  perform pg_temp.keep('dry_occurrence', r);
  perform pg_temp.keep('revise_occurrence', pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w3-sat', 'title', 'Sortie 10 km avec côtes',
    'instructions', '6 côtes de 200 m au milieu', 'note', 'Côtes comme demandé', 'preview_key', r->>'preview_key', 'op_id', pg_temp.id('e01'))));
  perform pg_temp.g(ines, 'answer', jsonb_build_object('id', pi, 'decisions', '[{"key":"w3-sat","answer":"accept"}]'::jsonb));
  -- Malo's programme, duplicated from Inès's and sent.
  d := pg_temp.g(c, 'adapt', jsonb_build_object('link_id', l[5], 'plan_id', pi, 'start_date', wk + 7));
  perform pg_temp.keep('adapt_malo', d);
  pm := (d#>>'{plan,id}')::uuid;
  perform pg_temp.g(c, 'send', jsonb_build_object('id', pm, 'revision', 1));
  perform set_config('titan.fx_pi', pi::text, true); perform set_config('titan.fx_pm', pm::text, true);
end $$;
-- Two weeks later: the programme is aged by 14 days; week 1 Tuesday and week 2 Monday are done and linked.
do $$
declare pi uuid := current_setting('titan.fx_pi')::uuid; ines uuid := pg_temp.id('a4'); x public.coach_assignments; d integer := 14;
begin
  update private.titan_coach_plans set start_date = start_date - d, created_at = created_at - make_interval(days => d), sent_at = sent_at - make_interval(days => d) where id = pi;
  update public.coach_assignments set planned_date = planned_date - d, created_at = created_at - make_interval(days => d),
    accepted_version = case when accepted_version is null then null else jsonb_set(accepted_version, '{planned_date}', to_jsonb((accepted_version->>'planned_date')::date - d)) end where plan_id = pi;
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (pg_temp.id('5a1'), ines, 'running', 7.8, 'km', 10, (((pg_temp.row(pi, 'w1-tue')).planned_date) + time '07:00') at time zone 'Europe/Paris', '{"duration":42}', now() - interval '10 days'),
    (pg_temp.id('5a2'), ines, 'running', 8.1, 'km', 10, now() - interval '1 minute', '{"duration":45}', now());
  set local session_replication_role = origin;
  x := pg_temp.row(pi, 'w1-tue'); perform pg_temp.f(ines, 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', pg_temp.id('5a1')));
  x := pg_temp.row(pi, 'w2-tue'); perform pg_temp.f(ines, 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', pg_temp.id('5a2')));
end $$;
do $$
declare
  c uuid := pg_temp.id('c1'); ines uuid := pg_temp.id('a4'); malo uuid := pg_temp.id('a5'); l uuid[] := string_to_array(current_setting('titan.fx_l'), ',')::uuid[];
  pi uuid := current_setting('titan.fx_pi')::uuid; pm uuid := current_setting('titan.fx_pm')::uuid; r jsonb; x public.coach_assignments;
begin
  perform pg_temp.keep('plan_aged', pg_temp.g(c, 'plan', jsonb_build_object('id', pi)));
  perform pg_temp.keep('link_aged', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('week_played', to_jsonb(pg_temp.err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 1, 'shift_days', 2, 'dry_run', true))));
  r := pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche', 'dry_run', true));
  perform pg_temp.keep('dry_week', r);
  perform pg_temp.keep('revise_week', pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche',
    'preview_key', r->>'preview_key', 'op_id', pg_temp.id('e02'))));
  perform pg_temp.keep('revise_week_again', pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche',
    'preview_key', r->>'preview_key', 'op_id', pg_temp.id('e02'))));
  perform pg_temp.keep('plan_week', pg_temp.g(c, 'plan', jsonb_build_object('id', pi)));
  perform pg_temp.keep('athlete_changes', pg_temp.g(ines, 'athlete', '{}'));
  perform pg_temp.keep('link_ines_changes', pg_temp.g(ines, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('answer_changes', pg_temp.g(ines, 'answer', jsonb_build_object('id', pi, 'decisions', '[{"key":"w2-thu","answer":"accept_change"},{"key":"w2-sat","answer":"keep_version"}]'::jsonb)));
  r := pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'rest', 'week', 3, 'shift_days', 7, 'dry_run', true));
  perform pg_temp.keep('dry_rest', r);
  perform pg_temp.keep('revise_rest', pg_temp.g(c, 'revise', jsonb_build_object('id', pi, 'scope', 'rest', 'week', 3, 'shift_days', 7, 'preview_key', r->>'preview_key', 'op_id', pg_temp.id('e03'))));
  perform pg_temp.keep('answer_all', pg_temp.g(ines, 'answer', jsonb_build_object('id', pi, 'all', 'accept')));
  perform pg_temp.keep('plan_rest', pg_temp.g(c, 'plan', jsonb_build_object('id', pi)));
  -- The offer ends: Inès's and Malo's links pause (3 free places, Zoé, Noé and Paul first).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v194', false, 'canceled', 'test', clock_timestamp(), null, 'titan02', null, now(), now(), null, null);
  perform pg_temp.keep('paused_error', to_jsonb(pg_temp.err(c, 'link', jsonb_build_object('link_id', l[4]))));
  perform pg_temp.keep('snapshot_paused', pg_temp.p(c, 'snapshot', '{}'));
  perform pg_temp.keep('athlete_paused', pg_temp.g(ines, 'athlete', '{}'));
  perform pg_temp.keep('link_ines_paused', pg_temp.g(ines, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('snapshot_ines_paused', pg_temp.p(ines, 'snapshot', '{}'));
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v194', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  -- Malo revokes while his programme is open; Inès's cycle is closed.
  perform pg_temp.p(malo, 'revoke', jsonb_build_object('link_id', l[5], 'revision', (select revision from public.coach_links where id = l[5])));
  perform pg_temp.keep('revoked_error', to_jsonb(pg_temp.err(c, 'plan', jsonb_build_object('id', pm))));
  perform pg_temp.keep('athlete_revoked', pg_temp.g(malo, 'athlete', '{}'));
  r := pg_temp.g(c, 'plan', jsonb_build_object('id', pi));
  perform pg_temp.keep('close', pg_temp.g(c, 'close', jsonb_build_object('id', pi, 'revision', r->>'revision')));
  perform pg_temp.keep('plan_closed', pg_temp.g(c, 'plan', jsonb_build_object('id', pi)));
  perform pg_temp.keep('athlete_closed', pg_temp.g(ines, 'athlete', '{}'));
end $$;
select jsonb_build_object('key', k, 'value', v) from pg_temp.out order by n;
rollback;

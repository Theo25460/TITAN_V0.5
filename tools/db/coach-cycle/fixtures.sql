-- V1.9.5: builds the lot's scenario on a disposable titan_test_ database — Coach Lou (Zoé, Noé and Paul followed first, then Inès and
-- Malo), a cycle of six weeks sent to Inès, answered, moved, linked to her journal, closed, with one journal session archived — and prints
-- the server's own answers at each step of the cycle report (opened, saved, proposed, validated item by item, a file downloaded, a note
-- retracted, the access withdrawn, a new validation, the sharing scope revised, the next cycle, a pause, a revocation), so the website
-- and Android tests replay real payloads (tests/fixtures/coach-cycle.json). Everything is rolled back. Dates are relative to the day it
-- runs; ids are fixed. Usage: node tools/db/coach-cycle/build-fixtures.mjs psql -h … -d titan_test_…
begin;
insert into private.titan_feature_flags(key, enabled, rollout, description) values
  ('screens.coach_cycle_report', true, 100, 'QA'), ('screens.coach_programs', true, 100, 'QA'), ('screens.coach_review', true, 100, 'QA'), ('screens.coach_followup', true, 100, 'QA'),
  ('screens.coach_feedback', true, 100, 'QA') on conflict (key) do update set enabled = true;
create function pg_temp.id(k text) returns uuid language sql immutable as $$ select ('19500000-0000-4000-8000-' || lpad(k, 12, '0'))::uuid $$;
insert into auth.users(id, raw_user_meta_data) select pg_temp.id(k), '{}' from unnest(array['c1', 'a1', 'a2', 'a3', 'a4', 'a5']) k;
update public.profiles p set username = n.name from (values ('c1', 'Coach Lou'), ('a1', 'Zoé'), ('a2', 'Noé'), ('a3', 'Paul'), ('a4', 'Inès'), ('a5', 'Malo')) n(k, name)
 where p.id = pg_temp.id(n.k);
create function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.p(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_portal(a, d); end $$;
create function pg_temp.f(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_followup_v1(a, d); end $$;
create function pg_temp.g(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_program_v1(a, d); end $$;
create function pg_temp.y(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_cycle_v1(a, d); end $$;
create function pg_temp.err(u uuid, a text, d jsonb) returns text language plpgsql as $$ begin perform pg_temp.y(u, a, d); return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.link(c uuid, a uuid) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := pg_temp.p(c, 'invite', '{}'); return (pg_temp.p(a, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 90, 'consent', true))->>'id')::uuid; end $$;
create function pg_temp.row(p uuid, k text) returns public.coach_assignments language sql as $$ select * from public.coach_assignments where plan_id = p and plan_key = k $$;
create function pg_temp.log(k text, u uuid, sport text, d date, val numeric, unit text, minutes integer, note text default null) returns uuid language plpgsql as $$
begin
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at)
    values (pg_temp.id(k), u, sport, val, unit, 10, (d + time '07:00') at time zone 'Europe/Paris', jsonb_strip_nulls(jsonb_build_object('duration', minutes, 'note', note)), (d + time '07:00') at time zone 'Europe/Paris');
  set local session_replication_role = origin;
  return pg_temp.id(k);
end $$;
create table pg_temp.out(n serial, k text, v jsonb);
create function pg_temp.keep(k text, v jsonb) returns void language sql as $$ insert into pg_temp.out(k, v) values (k, v) $$;
do $$
declare c uuid := pg_temp.id('c1'); l uuid[] := array[]::uuid[]; i integer;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v195', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  for i in 1..5 loop l := l || pg_temp.link(c, pg_temp.id('a' || i)); end loop;
  perform set_config('request.jwt.claims', '{}', true);
  for i in 1..5 loop update public.coach_links set accepted_at = now() - make_interval(mins => 10 - i) where id = l[i]; end loop;
  perform set_config('titan.fx_l', array_to_string(l, ','), true);
end $$;
do $$
declare
  c uuid := pg_temp.id('c1'); ines uuid := pg_temp.id('a4'); l uuid[] := string_to_array(current_setting('titan.fx_l'), ',')::uuid[];
  wk date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date; d0 date; s jsonb := '[]'::jsonb; w integer; r jsonb; pr jsonb; p uuid; rid uuid; nid uuid;
  dec jsonb; dry jsonb; x public.coach_assignments; ids jsonb; k text; obs jsonb; share jsonb;
begin
  for w in 1..6 loop
    s := s || jsonb_build_array(
      jsonb_build_object('key', 'w' || w || '-tue', 'week', w, 'day', 2, 'title', case when w % 2 = 0 then 'Fractionné 6 × 400 m' else 'Footing 40 min' end, 'sport', 'running', 'instructions', 'Échauffement 15 min'),
      jsonb_build_object('key', 'w' || w || '-thu', 'week', w, 'day', 4, 'title', 'Renforcement 30 min', 'sport', 'muscu_home', 'instructions', 'Gainage, fentes, pompes'),
      jsonb_build_object('key', 'w' || w || '-sat', 'week', w, 'day', 6, 'title', 'Sortie longue ' || (8 + 2 * w) || ' km', 'sport', 'running', 'instructions', 'Allure confortable'));
  end loop;
  r := pg_temp.g(c, 'save_program', jsonb_build_object('title', 'Course et renforcement — 6 semaines', 'weeks', 6, 'goals', '["Courir 10 km en aisance"]'::jsonb, 'sessions', s));
  r := pg_temp.g(c, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', r->>'id', 'start_date', wk + 7))->'plan';
  p := (r->>'id')::uuid;
  perform pg_temp.g(c, 'send', jsonb_build_object('id', p, 'revision', r->'revision'));
  dec := (select jsonb_agg(jsonb_build_object('key', e->>'key', 'answer', case e->>'key' when 'w4-thu' then 'decline' else 'accept' end)) from jsonb_array_elements(s) e where e->>'key' <> 'w6-sat');
  perform pg_temp.g(ines, 'answer', jsonb_build_object('id', p, 'decisions', dec));
  x := pg_temp.row(p, 'w2-sat'); perform pg_temp.f(ines, 'move', jsonb_build_object('id', x.id, 'revision', x.revision, 'date', x.planned_date + 1));
  x := pg_temp.row(p, 'w3-tue'); perform pg_temp.f(ines, 'move', jsonb_build_object('id', x.id, 'revision', x.revision, 'date', x.planned_date + 7));
  x := pg_temp.row(p, 'w5-tue');
  dry := pg_temp.g(c, 'revise', jsonb_build_object('id', p, 'scope', 'occurrence', 'key', 'w5-tue', 'planned_date', x.planned_date + 1, 'dry_run', true));
  perform pg_temp.g(c, 'revise', jsonb_build_object('id', p, 'scope', 'occurrence', 'key', 'w5-tue', 'planned_date', x.planned_date + 1, 'preview_key', dry->>'preview_key', 'op_id', pg_temp.id('e01')));
  perform pg_temp.g(ines, 'answer', jsonb_build_object('id', p, 'decisions', '[{"key":"w5-tue","answer":"accept_change"}]'::jsonb));
  -- Seven weeks pass: the cycle ended last Sunday.
  update private.titan_coach_plans set start_date = start_date - 49, created_at = created_at - interval '49 days', sent_at = sent_at - interval '49 days' where id = p;
  update public.coach_assignments set planned_date = planned_date - 49, moved_date = moved_date - 49, created_at = created_at - interval '49 days',
    accepted_version = case when accepted_version is null then null else jsonb_set(accepted_version, '{planned_date}', to_jsonb((accepted_version->>'planned_date')::date - 49)) end,
    history = jsonb_set(history, '{0,version,planned_date}', to_jsonb((history#>>'{0,version,planned_date}')::date - 49)) where plan_id = p;
  d0 := wk - 42;
  ids := jsonb_build_object(
    'w1-tue', pg_temp.log('5b1', ines, 'running', d0 + 1, 8, 'km', 45, 'Bonnes jambes'), 'w1-thu', pg_temp.log('5b2', ines, 'muscu_home', d0 + 3, 120, 'reps', 30),
    'w1-sat', pg_temp.log('5b3', ines, 'running', d0 + 5, 10, 'km', 60, 'Genou sensible à la fin'), 'w2-tue', pg_temp.log('5b4', ines, 'running', d0 + 8, 7, 'km', 40),
    'w2-sat', pg_temp.log('5b5', ines, 'running', d0 + 13, 12, 'km', 75, 'Sortie décalée, bien passée'), 'w3-tue', pg_temp.log('5b6', ines, 'running', d0 + 22, 8, 'km', 44),
    'w3-sat', pg_temp.log('5b7', ines, 'running', d0 + 19, 14, 'km', 85), 'w5-tue', pg_temp.log('5b8', ines, 'running', d0 + 30, 9, 'km', 50),
    'w5-sat', pg_temp.log('5b9', ines, 'running', d0 + 33, 16, 'km', 100));
  for k in select jsonb_object_keys(ids) loop
    x := pg_temp.row(p, k); perform pg_temp.f(ines, 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', ids->>k));
  end loop;
  x := pg_temp.row(p, 'w4-tue'); perform pg_temp.f(ines, 'declare_done', jsonb_build_object('id', x.id, 'revision', x.revision, 'done', true));
  r := pg_temp.g(c, 'plan', jsonb_build_object('id', p));
  perform pg_temp.g(c, 'close', jsonb_build_object('id', p, 'revision', r->'revision'));
  insert into private.titan_coach_checkins(link_id, week_start, scores, note, shared) values
    (l[4], d0 + 7, '{"fatigue":4,"energy":2,"sleep":3,"motivation":3}', 'Semaine chargée au travail', false), (l[4], d0 + 21, '{"fatigue":2,"energy":4}', null, true);
  -- Inès archives the long run of week 3 in her journal before the report is opened.
  set local session_replication_role = replica; update public.training_logs set archived_at = now() where id = pg_temp.id('5b7'); set local session_replication_role = origin;

  perform pg_temp.keep('snapshot', pg_temp.p(c, 'snapshot', '{}'));
  perform pg_temp.keep('snapshot_ines', pg_temp.p(ines, 'snapshot', '{}'));
  perform pg_temp.keep('program_link', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('program_link_ines', pg_temp.g(ines, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('program_library', pg_temp.g(c, 'library', '{}'));
  perform pg_temp.keep('link_none', pg_temp.y(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('link_ines_none', pg_temp.y(ines, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('athlete_none', pg_temp.y(ines, 'athlete', '{}'));
  -- The coach opens the report, writes two observations tied to source sessions and three decisions, and proposes it.
  r := pg_temp.y(c, 'start', jsonb_build_object('plan_id', p));
  perform pg_temp.keep('start', r);
  rid := (r#>>'{report,id}')::uuid;
  obs := '[{"key":"o1","text":"Les sorties longues passent mieux le dimanche","sources":["w2-sat","w5-sat"]},{"key":"o2","text":"Le renforcement du jeudi reste souvent sans séance liée","sources":["w2-thu","w3-thu","w5-thu"]}]';
  dec := '[{"key":"d1","kind":"goal","text":"Courir 12 km en aisance"},{"key":"d2","kind":"goal","text":"Un renforcement par semaine, le jeudi ou le vendredi"},{"key":"d3","kind":"session","text":"Test 10 km","sport":"running"}]';
  r := pg_temp.y(c, 'save', jsonb_build_object('id', rid, 'revision', 1, 'observations', obs, 'decisions', dec));
  perform pg_temp.keep('save', r);
  perform pg_temp.keep('link_draft', pg_temp.y(c, 'link', jsonb_build_object('link_id', l[4])));
  r := pg_temp.y(c, 'propose', jsonb_build_object('id', rid, 'revision', r#>'{report,revision}'));
  perform pg_temp.keep('propose', r);
  perform pg_temp.keep('propose_again', pg_temp.y(c, 'propose', jsonb_build_object('id', rid, 'revision', 2)));
  perform pg_temp.keep('link_proposed', pg_temp.y(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('report_proposed', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  -- What Inès is asked to validate, and her validation: seven measures out of eight, two notes, one check-in, two decisions approved.
  perform pg_temp.keep('athlete_proposed', pg_temp.y(ines, 'athlete', '{}'));
  perform pg_temp.keep('link_ines_proposed', pg_temp.y(ines, 'link', jsonb_build_object('link_id', l[4])));
  pr := pg_temp.y(ines, 'report', jsonb_build_object('id', rid));
  perform pg_temp.keep('report_ines_proposed', pr);
  share := jsonb_build_object('measures', '["w1-tue","w1-sat","w2-tue","w2-sat","w3-tue","w5-tue","w5-sat"]'::jsonb, 'notes', '["w1-sat","w2-sat"]'::jsonb, 'checkins', jsonb_build_array(d0 + 7));
  r := pg_temp.y(ines, 'validate', jsonb_build_object('id', rid, 'op_id', pg_temp.id('e11'), 'preview_key', pr#>>'{proposal,preview_key}', 'allow_export', true, 'note', 'Bon cycle, le dimanche me va mieux',
    'understood', 'clear', 'share', share, 'decisions', '[{"key":"d1","answer":"approve"},{"key":"d2","answer":"decline"},{"key":"d3","answer":"approve"}]'::jsonb));
  perform pg_temp.keep('validate', r);
  perform pg_temp.keep('validate_again', pg_temp.y(ines, 'validate', jsonb_build_object('id', rid, 'op_id', pg_temp.id('e11'), 'preview_key', pr#>>'{proposal,preview_key}', 'share', share)));
  perform pg_temp.keep('link_published', pg_temp.y(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('report_published', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('athlete_published', pg_temp.y(ines, 'athlete', '{}'));
  perform pg_temp.keep('link_ines_published', pg_temp.y(ines, 'link', jsonb_build_object('link_id', l[4])));
  -- The coach downloads a file of version 1 (both notes are in it); Inès sees it in her log.
  perform pg_temp.keep('export_coach', pg_temp.y(c, 'export', jsonb_build_object('id', rid)));
  perform pg_temp.keep('report_ines_published', pg_temp.y(ines, 'report', jsonb_build_object('id', rid)));
  -- She retracts the note about her knee.
  perform pg_temp.keep('retract', pg_temp.y(ines, 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"note","key":"w1-sat"}]'::jsonb)));
  perform pg_temp.keep('report_retracted', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('export_coach_retracted', pg_temp.y(c, 'export', jsonb_build_object('id', rid)));
  perform pg_temp.keep('export_ines', pg_temp.y(ines, 'export', jsonb_build_object('id', rid)));
  perform pg_temp.keep('report_ines_retracted', pg_temp.y(ines, 'report', jsonb_build_object('id', rid)));
  -- The next cycle: only the approved objective, and where it comes from.
  r := pg_temp.y(c, 'next', jsonb_build_object('id', rid));
  perform pg_temp.keep('next', r);
  nid := (r#>>'{plan,id}')::uuid;
  perform pg_temp.keep('next_again', pg_temp.y(c, 'next', jsonb_build_object('id', rid)));
  perform pg_temp.keep('report_next', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('program_link_next', pg_temp.g(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.g(c, 'send', jsonb_build_object('id', nid, 'revision', r#>'{plan,revision}'));
  perform pg_temp.keep('program_athlete_next', pg_temp.g(ines, 'athlete', '{}'));
  perform pg_temp.keep('report_ines_next', pg_temp.y(ines, 'report', jsonb_build_object('id', rid)));
  -- She withdraws the access to the hosted version: the coach reads no shared content.
  perform pg_temp.keep('withdraw', pg_temp.y(ines, 'withdraw', jsonb_build_object('id', rid)));
  perform pg_temp.keep('report_withdrawn', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('link_withdrawn', pg_temp.y(c, 'link', jsonb_build_object('link_id', l[4])));
  perform pg_temp.keep('withdrawn_error', to_jsonb(pg_temp.err(c, 'export', jsonb_build_object('id', rid))));
  pr := pg_temp.y(ines, 'report', jsonb_build_object('id', rid));
  perform pg_temp.keep('report_ines_withdrawn', pr);
  -- A new validation: version 2 online.
  share := jsonb_build_object('measures', '["w1-tue","w1-sat","w2-tue","w2-sat","w3-tue","w5-tue","w5-sat"]'::jsonb, 'notes', '["w2-sat"]'::jsonb);
  perform pg_temp.keep('validate_v2', pg_temp.y(ines, 'validate', jsonb_build_object('id', rid, 'op_id', pg_temp.id('e12'), 'preview_key', pr#>>'{proposal,preview_key}', 'allow_export', true, 'share', share)));
  perform pg_temp.keep('report_v2', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  -- She narrows her sharing to running: the hosted version waits for a new validation.
  perform pg_temp.p(ines, 'scope', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4]), 'since_date', current_date - 90, 'sport', 'running'));
  perform pg_temp.keep('report_revalidate', pg_temp.y(c, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('revalidate_error', to_jsonb(pg_temp.err(c, 'export', jsonb_build_object('id', rid))));
  perform pg_temp.keep('report_ines_revalidate', pg_temp.y(ines, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.p(ines, 'scope', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4]), 'since_date', current_date - 90));
  -- The offer ends: her link is paused (3 free places, Zoé, Noé and Paul first).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v195', false, 'canceled', 'test', clock_timestamp(), null, 'titan02', null, now(), now(), null, null);
  perform pg_temp.keep('paused_error', to_jsonb(pg_temp.err(c, 'report', jsonb_build_object('id', rid))));
  perform pg_temp.keep('snapshot_paused', pg_temp.p(c, 'snapshot', '{}'));
  perform pg_temp.keep('snapshot_ines_paused', pg_temp.p(ines, 'snapshot', '{}'));
  perform pg_temp.keep('report_ines_paused', pg_temp.y(ines, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('athlete_paused', pg_temp.y(ines, 'athlete', '{}'));
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v195', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  -- She revokes the link: nothing for the coach, by any identifier; she keeps a read-only view.
  perform pg_temp.p(ines, 'revoke', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4])));
  perform pg_temp.keep('revoked_error', to_jsonb(pg_temp.err(c, 'report', jsonb_build_object('id', rid))));
  perform pg_temp.keep('revoked_export_error', to_jsonb(pg_temp.err(c, 'export', jsonb_build_object('plan_id', p))));
  perform pg_temp.keep('revoked_link_error', to_jsonb(pg_temp.err(c, 'link', jsonb_build_object('link_id', l[4]))));
  perform pg_temp.keep('report_ines_revoked', pg_temp.y(ines, 'report', jsonb_build_object('id', rid)));
  perform pg_temp.keep('athlete_revoked', pg_temp.y(ines, 'athlete', '{}'));
  perform pg_temp.keep('snapshot_ines_revoked', pg_temp.p(ines, 'snapshot', '{}'));
end $$;
select jsonb_build_object('key', k, 'value', v) from pg_temp.out order by n;
rollback;

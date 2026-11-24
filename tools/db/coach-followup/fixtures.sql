-- V1.9.1: builds the lot's scenario on a disposable titan_test_ database and prints the server's own answers (coach queue, coach detail,
-- athlete inbox) so the website and Android tests replay real payloads (tests/fixtures/coach-followup.json). Everything is rolled back.
-- Usage: psql -At -d titan_test_… -f tools/db/coach-followup/fixtures.sql (dates are relative to the day it runs; ids are fixed).
begin;
insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
insert into auth.users(id, raw_user_meta_data) values ('19100000-0000-4000-8000-0000000000c1', '{}'), ('19100000-0000-4000-8000-0000000000a1', '{}'), ('19100000-0000-4000-8000-0000000000a2', '{}');
update public.profiles set username = case id::text when '19100000-0000-4000-8000-0000000000c1' then 'Coach Lou' when '19100000-0000-4000-8000-0000000000a1' then 'Inès' else 'Malo' end
 where id in ('19100000-0000-4000-8000-0000000000c1', '19100000-0000-4000-8000-0000000000a1', '19100000-0000-4000-8000-0000000000a2');
set local session_replication_role = replica;
insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
  ('19100000-0000-4000-8000-0000000005a1', '19100000-0000-4000-8000-0000000000a1', 'running', 9.4, 'km', 10, ((current_date - 2) + time '09:30') at time zone 'Europe/Paris', '{"duration":52}', now() - interval '2 days'),
  ('19100000-0000-4000-8000-0000000005a2', '19100000-0000-4000-8000-0000000000a1', 'running', 6.1, 'km', 10, ((current_date - 9) + time '18:30') at time zone 'Europe/Paris', '{"duration":34}', now() - interval '9 days');
set local session_replication_role = origin;
create function pg_temp.as_(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.link(c text, a text) returns uuid language plpgsql as $$
declare inv jsonb; begin perform pg_temp.as_(c); inv := public.titan_coach_portal('invite'); perform pg_temp.as_(a);
  return (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid; end $$;
create function pg_temp.assign(c text, l uuid, t text, s text, d date, i text) returns uuid language plpgsql as $$
begin perform pg_temp.as_(c); return (public.titan_coach_portal('assign', jsonb_build_object('link_id', l, 'title', t, 'sport', s, 'planned_date', d, 'instructions', i))->>'id')::uuid; end $$;
create function pg_temp.f(u text, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_followup_v1(a, d); end $$;
create function pg_temp.p(u text, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_portal(a, d); end $$;
do $$
declare c text := '19100000-0000-4000-8000-0000000000c1'; a text := '19100000-0000-4000-8000-0000000000a1'; b text := '19100000-0000-4000-8000-0000000000a2';
  la uuid := pg_temp.link(c, a); lb uuid := pg_temp.link(c, b); hill uuid; easy uuid; tempo uuid; bike uuid; swim uuid; r jsonb;
begin
  -- Inès: hill session planned 4 days ago, moved to 2 days ago (her outing is there: to match); an easy run with a change proposed; a tempo run declined.
  hill := pg_temp.assign(c, la, 'Côtes · 8 × 45 s', 'running', current_date - 4, 'Échauffement 20 min, 8 côtes de 45 s, retour en trottinant');
  perform pg_temp.p(a, 'assignment_status', jsonb_build_object('id', hill, 'revision', 1, 'status', 'accepted'));
  perform pg_temp.f(a, 'move', jsonb_build_object('id', hill, 'revision', 2, 'date', current_date - 2, 'note', 'Réunion jeudi soir'));
  easy := pg_temp.assign(c, la, 'Footing souple', 'running', current_date + 1, '45 min en aisance');
  perform pg_temp.p(a, 'assignment_status', jsonb_build_object('id', easy, 'revision', 1, 'status', 'accepted'));
  perform pg_temp.f(c, 'propose_change', jsonb_build_object('id', easy, 'revision', 2, 'planned_date', current_date + 3, 'instructions', '50 min dont 10 min allure marathon', 'note', 'On allonge un peu cette semaine'));
  tempo := pg_temp.assign(c, la, 'Tempo 3 × 10 min', 'running', current_date + 5, '');
  perform pg_temp.p(a, 'assignment_status', jsonb_build_object('id', tempo, 'revision', 1, 'status', 'declined'));
  -- Malo: a bike session done but with nothing in his journal, and a new swim proposal waiting.
  bike := pg_temp.assign(c, lb, 'Sortie vélo 2 h', 'cycling', current_date - 3, 'Endurance, cadence 90');
  perform pg_temp.p(b, 'assignment_status', jsonb_build_object('id', bike, 'revision', 1, 'status', 'accepted'));
  perform pg_temp.f(b, 'declare_done', jsonb_build_object('id', bike, 'revision', 2, 'done', true));
  swim := pg_temp.assign(c, lb, 'Natation technique', 'swimming', current_date + 2, '');
  perform set_config('titan.fx_hill', hill::text, true); perform set_config('titan.fx_easy', easy::text, true); perform set_config('titan.fx_la', la::text, true);
end $$;
select jsonb_build_object('key', 'queue_before', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000c1', 'queue', '{}'));
select jsonb_build_object('key', 'athlete_before', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000a1', 'athlete', '{}'));
select jsonb_build_object('key', 'list_before', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000c1', 'list', jsonb_build_object('link_id', current_setting('titan.fx_la'))));
select jsonb_build_object('key', 'link_ok', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000a1', 'link', jsonb_build_object('id', current_setting('titan.fx_hill'), 'revision', 3, 'session_id', '19100000-0000-4000-8000-0000000005a1')));
select jsonb_build_object('key', 'link_refused', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000a1', 'link', jsonb_build_object('id', current_setting('titan.fx_hill'), 'revision', 4, 'session_id', '19100000-0000-4000-8000-0000000005a2')));
select jsonb_build_object('key', 'detail_linked', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000c1', 'detail', jsonb_build_object('id', current_setting('titan.fx_hill'))));
select jsonb_build_object('key', 'queue_after', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000c1', 'queue', '{}'));
select jsonb_build_object('key', 'athlete_after', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000a1', 'athlete', '{}'));
select set_config('request.jwt.claims', '{}', true);
do $$ begin perform pg_temp.p('19100000-0000-4000-8000-0000000000a1', 'revoke', jsonb_build_object('link_id', current_setting('titan.fx_la'), 'revision', (select revision from public.coach_links where id = current_setting('titan.fx_la')::uuid))); end $$;
select jsonb_build_object('key', 'athlete_revoked', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000a1', 'athlete', '{}'));
select jsonb_build_object('key', 'queue_revoked', 'value', pg_temp.f('19100000-0000-4000-8000-0000000000c1', 'queue', '{}'));
rollback;

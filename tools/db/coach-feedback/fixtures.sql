-- V1.9.2: builds the lot's scenario on a disposable titan_test_ database and prints the server's own answers (coach composer, the feedback
-- given, the thread, the athlete's view from their session, the answer, the next proposal after the adjustment, the views after the
-- athlete withdrew the details, after an archive and after revocation) so the website and Android tests replay real payloads
-- (tests/fixtures/coach-feedback.json, assembled by tools/db/coach-feedback/build-fixtures.mjs). Everything is rolled back.
-- Usage: node tools/db/coach-feedback/build-fixtures.mjs <psql args…> -d titan_test_… (dates are relative to the day it runs; ids are fixed).
begin;
insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA'), ('screens.coach_feedback', true, 100, 'QA')
  on conflict (key) do update set enabled = true;
insert into auth.users(id, raw_user_meta_data) values ('19200000-0000-4000-8000-0000000000c1', '{}'), ('19200000-0000-4000-8000-0000000000a1', '{}');
update public.profiles set username = case id::text when '19200000-0000-4000-8000-0000000000c1' then 'Coach Lou' else 'Inès' end
 where id in ('19200000-0000-4000-8000-0000000000c1', '19200000-0000-4000-8000-0000000000a1');
set local session_replication_role = replica;
insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
  ('19200000-0000-4000-8000-0000000005a1', '19200000-0000-4000-8000-0000000000a1', 'muscu_gym', 3840, 'kg', 10, ((current_date - 2) + time '18:00') at time zone 'Europe/Paris',
   '{"duration":55,"note":"Épaule un peu raide","exercises":[{"name":"Squat","sets":4,"reps":6,"weight":80,"setRows":[{"weight":80,"reps":6,"rir":2},{"weight":80,"reps":6,"rir":1},{"weight":80,"reps":6,"rir":1},{"weight":80,"reps":5,"rir":0}]},{"name":"Fentes","sets":3,"reps":10,"weight":20}]}', now() - interval '2 days');
set local session_replication_role = origin;
create function pg_temp.as_(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.p(u text, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_portal(a, d); end $$;
create function pg_temp.fb(u text, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_feedback_v1(a, d); end $$;
create function pg_temp.fberr(u text, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.fb(u, a, d); return '{"error":null}'; exception when others then return jsonb_build_object('error', sqlerrm); end $$;
create function pg_temp.fu(u text, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_followup_v1(a, d); end $$;
create function pg_temp.th(u text, l uuid) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_messages_v1(l, null); end $$;
do $$
declare c text := '19200000-0000-4000-8000-0000000000c1'; a text := '19200000-0000-4000-8000-0000000000a1'; inv jsonb; la uuid; done uuid; nxt uuid; mob uuid;
begin
  inv := pg_temp.p(c, 'invite', '{}');
  la := (pg_temp.p(a, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true, 'share_details', true, 'share_notes', false))->>'id')::uuid;
  done := (pg_temp.p(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Force · Squat 4 × 6', 'sport', 'muscu_gym', 'planned_date', current_date - 2, 'instructions', '4 séries de 6 à 80 kg, RIR 2'))->>'id')::uuid;
  nxt := (pg_temp.p(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Force · Squat 5 × 5', 'sport', 'muscu_gym', 'planned_date', current_date + 3, 'instructions', '5 séries de 5 à 82,5 kg'))->>'id')::uuid;
  mob := (pg_temp.p(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Mobilité hanches', 'sport', 'muscu_gym', 'planned_date', current_date + 5, 'instructions', ''))->>'id')::uuid;
  perform pg_temp.p(a, 'assignment_status', jsonb_build_object('id', done, 'revision', 1, 'status', 'accepted'));
  perform pg_temp.p(a, 'assignment_status', jsonb_build_object('id', nxt, 'revision', 1, 'status', 'accepted'));
  perform pg_temp.p(a, 'assignment_status', jsonb_build_object('id', done, 'revision', 2, 'status', 'completed', 'session_id', '19200000-0000-4000-8000-0000000005a1'));
  perform pg_temp.as_(a); perform public.titan_coach_checkin_v1(la, '{"fatigue":4,"sleep":2}', 'Semaine chargée', true);
  perform set_config('titan.fx_la', la::text, true); perform set_config('titan.fx_done', done::text, true); perform set_config('titan.fx_next', nxt::text, true);
end $$;
-- The athlete's check-in is recorded for the current week; the fixture moves it onto the session's week (the server reads that week).
update private.titan_coach_checkins set week_start = date_trunc('week', current_date - 2)::date where link_id = current_setting('titan.fx_la')::uuid;
select jsonb_build_object('key', 'compose', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'compose', jsonb_build_object('id', current_setting('titan.fx_done'))));
do $$ declare k text := pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'compose', jsonb_build_object('id', current_setting('titan.fx_done')))->>'session_key'; r jsonb;
begin
  r := pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'give', jsonb_build_object('id', current_setting('titan.fx_done'), 'session_key', k,
         'observation', 'La dernière série est descendue à RIR 0 : on garde la charge mais on vise RIR 2 partout.',
         'adjustment', jsonb_build_object('target_id', current_setting('titan.fx_next'), 'instructions', '5 séries de 5 à 80 kg, RIR 2 sur chaque série', 'note', 'On consolide avant de monter')));
  perform set_config('titan.fx_fb', r->>'id', true); perform set_config('titan.fx_key', k, true); perform set_config('titan.fx_given', r::text, true);
end $$;
select jsonb_build_object('key', 'given', 'value', current_setting('titan.fx_given')::jsonb);
select jsonb_build_object('key', 'stale_key', 'value', pg_temp.fberr('19200000-0000-4000-8000-0000000000c1', 'give', jsonb_build_object('id', current_setting('titan.fx_done'), 'session_key', 'ffffffffffffffffffff', 'observation', 'x')));
select jsonb_build_object('key', 'thread_athlete', 'value', pg_temp.th('19200000-0000-4000-8000-0000000000a1', current_setting('titan.fx_la')::uuid));
select jsonb_build_object('key', 'athlete_session', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000a1', 'athlete', jsonb_build_object('session_id', '19200000-0000-4000-8000-0000000005a1')));
select jsonb_build_object('key', 'answer_accepted', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000a1', 'answer', jsonb_build_object('id', current_setting('titan.fx_fb'), 'revision', 1, 'accept', true)));
select jsonb_build_object('key', 'next_after', 'value', pg_temp.fu('19200000-0000-4000-8000-0000000000c1', 'detail', jsonb_build_object('id', current_setting('titan.fx_next'))));
do $$ begin
  perform pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'give', jsonb_build_object('id', current_setting('titan.fx_done'), 'session_key', current_setting('titan.fx_key'),
         'observation', 'Si l’épaule tire encore, on cale une décharge.', 'adjustment', jsonb_build_object('title', 'Décharge', 'sport', 'muscu_gym', 'planned_date', current_date + 8, 'instructions', '3 × 8 à 60 kg')));
end $$;
select jsonb_build_object('key', 'athlete_inbox', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000a1', 'athlete', '{}'));
select jsonb_build_object('key', 'list_coach', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'list', jsonb_build_object('link_id', current_setting('titan.fx_la'))));
-- The athlete withdraws the details and the check-in of that week.
do $$ begin
  perform pg_temp.p('19200000-0000-4000-8000-0000000000a1', 'scope', jsonb_build_object('link_id', current_setting('titan.fx_la'), 'revision', (select revision from public.coach_links where id = current_setting('titan.fx_la')::uuid),
    'since_date', current_date - 30, 'share_details', false, 'share_notes', false));
  perform pg_temp.as_('19200000-0000-4000-8000-0000000000a1'); perform public.titan_coach_checkin_share_v1(current_setting('titan.fx_la')::uuid, date_trunc('week', current_date - 2)::date, false);
end $$;
select jsonb_build_object('key', 'detail_coach_withdrawn', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'detail', jsonb_build_object('id', current_setting('titan.fx_fb'))));
select jsonb_build_object('key', 'list_coach_withdrawn', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'list', jsonb_build_object('link_id', current_setting('titan.fx_la'))));
set local session_replication_role = replica;
update public.training_logs set archived_at = now(), revision = revision + 1 where id = '19200000-0000-4000-8000-0000000005a1';
set local session_replication_role = origin;
select jsonb_build_object('key', 'detail_coach_archived', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000c1', 'detail', jsonb_build_object('id', current_setting('titan.fx_fb'))));
do $$ begin perform pg_temp.p('19200000-0000-4000-8000-0000000000a1', 'revoke', jsonb_build_object('link_id', current_setting('titan.fx_la'), 'revision', (select revision from public.coach_links where id = current_setting('titan.fx_la')::uuid))); end $$;
select jsonb_build_object('key', 'coach_detail_revoked', 'value', pg_temp.fberr('19200000-0000-4000-8000-0000000000c1', 'detail', jsonb_build_object('id', current_setting('titan.fx_fb'))));
select jsonb_build_object('key', 'athlete_revoked', 'value', pg_temp.fb('19200000-0000-4000-8000-0000000000a1', 'athlete', '{}'));
select jsonb_build_object('key', 'journal_after', 'value', (select jsonb_build_object('revision', revision, 'details', details) from public.training_logs where id = '19200000-0000-4000-8000-0000000005a1'));
rollback;

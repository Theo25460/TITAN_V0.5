-- V1.9.2 — Retour sur la séance (20261202090000). The scenario of the lot: after a strength session, the coach leaves a feedback on the measures
-- the athlete chose to share and suggests an adjustment of the next proposal; the athlete reads it from their session, then accepts or
-- declines. Checked here: the feedback lands on the session the coach read (relink and correction refuse a stale key), observation and
-- proposal are separate, the measures follow the link's CURRENT contract in every read (withdrawn details and check-in disappear, a
-- correction is flagged only on what the coach can read), the context survives a correction and an archive, an accepted adjustment is
-- carried into the next proposal, a declined one changes nothing, a stale one is refused, the coach reads nothing after revocation even
-- by the direct link while the athlete keeps a read-only view, and public.training_logs is never written by any feedback action. Full rollback.
begin;
do $$
declare c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); t_sq uuid := gen_random_uuid(); t_other uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (a, '{}'), (s, '{}');
  update public.profiles set username = case id when c then 'Coach Lou' when a then 'Inès' else 'Inconnu' end where id in (c, a, s);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_feedback', false, 100, 'QA') on conflict (key) do update set enabled = false;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (t_sq, a, 'muscu_gym', 3840, 'kg', 10, ((current_date - 2) + time '18:00') at time zone 'Europe/Paris',
     '{"duration":55,"note":"Épaule un peu raide","exercises":[{"name":"Squat","sets":4,"reps":6,"weight":80,"setRows":[{"weight":80,"reps":6,"rir":2},{"weight":80,"reps":6,"rir":1},{"weight":80,"reps":6,"rir":1},{"weight":80,"reps":5,"rir":0}]}]}', now() - interval '2 days'),
    (t_other, a, 'muscu_gym', 1200, 'kg', 10, ((current_date - 1) + time '12:00') at time zone 'Europe/Paris', '{"duration":30,"exercises":[{"name":"Gainage","sets":3}]}', now() - interval '1 day');
  set local session_replication_role = origin;
  perform set_config('titan.fb_c', c::text, true); perform set_config('titan.fb_a', a::text, true); perform set_config('titan.fb_s', s::text, true);
  perform set_config('titan.fb_sq', t_sq::text, true); perform set_config('titan.fb_other', t_other::text, true);
end $$;
create function public.zz_fb_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_fb(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_fb_as(p_user); return public.titan_coach_feedback_v1(p_action, p_data); end $$;
create function public.zz_fb_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_fb(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_fb_portal(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_fb_as(p_user); return public.titan_coach_portal(p_action, p_data); end $$;
create function public.zz_fb_follow(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_fb_as(p_user); return public.titan_coach_followup_v1(p_action, p_data); end $$;
create function public.zz_fb_msgs(p_user uuid, p_link uuid) returns text language plpgsql as $$
begin perform public.zz_fb_as(p_user); return public.titan_coach_messages_v1(p_link, null)::text; exception when others then return sqlerrm; end $$;
create function public.zz_fb_rev(p_id uuid) returns integer language sql security definer as $$ select revision from public.coach_assignments where id = p_id $$;
create function public.zz_fb_lrev(p_id uuid) returns integer language sql security definer as $$ select revision from public.coach_links where id = p_id $$;
-- The journal as a whole, and the athlete's session alone (security definer: the test role cannot read other rows itself).
create function public.zz_fb_journal() returns text language sql security definer as $$ select md5(string_agg(to_jsonb(l)::text, ';' order by l.id)) from public.training_logs l $$;
grant execute on function public.zz_fb_as(uuid), public.zz_fb(uuid, text, jsonb), public.zz_fb_err(uuid, text, jsonb), public.zz_fb_portal(uuid, text, jsonb),
  public.zz_fb_follow(uuid, text, jsonb), public.zz_fb_msgs(uuid, uuid), public.zz_fb_rev(uuid), public.zz_fb_lrev(uuid), public.zz_fb_journal() to authenticated;

-- ---- Part 1: link, proposals, the right session.
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.fb_c')::uuid; a uuid := current_setting('titan.fb_a')::uuid; s uuid := current_setting('titan.fb_s')::uuid;
  t_sq uuid := current_setting('titan.fb_sq')::uuid; t_other uuid := current_setting('titan.fb_other')::uuid;
  inv jsonb; la uuid; done jsonb; nxt jsonb; mob jsonb; r jsonb; k1 text; h text;
begin
  inv := public.zz_fb_portal(c, 'invite');
  la := (public.zz_fb_portal(a, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true, 'share_details', true, 'share_notes', false))->>'id')::uuid;
  done := public.zz_fb_portal(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Force · Squat 4 × 6', 'sport', 'muscu_gym', 'planned_date', current_date - 2, 'instructions', '4 séries de 6 à 80 kg, RIR 2'));
  nxt := public.zz_fb_portal(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Force · Squat 5 × 5', 'sport', 'muscu_gym', 'planned_date', current_date + 3, 'instructions', '5 séries de 5 à 82,5 kg'));
  mob := public.zz_fb_portal(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Mobilité hanches', 'sport', 'muscu_gym', 'planned_date', current_date + 5, 'instructions', ''));
  perform public.zz_fb_portal(a, 'assignment_status', jsonb_build_object('id', done->>'id', 'revision', 1, 'status', 'accepted'));
  perform public.zz_fb_portal(a, 'assignment_status', jsonb_build_object('id', nxt->>'id', 'revision', 1, 'status', 'accepted'));
  perform set_config('titan.fb_la', la::text, true); perform set_config('titan.fb_done', done->>'id', true);
  perform set_config('titan.fb_next', nxt->>'id', true); perform set_config('titan.fb_mob', mob->>'id', true);

  assert public.zz_fb_err(c, 'compose', jsonb_build_object('id', done->>'id')) = 'FEATURE_DISABLED', 'flag closed: nothing is read';
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.coach_feedback';
  set local role authenticated;

  -- Not linked yet: nothing to comment, no key, a feedback is refused.
  r := public.zz_fb(c, 'compose', jsonb_build_object('id', done->>'id'));
  assert (r->>'linked')::boolean is false and r->>'session_key' is null and r->'session' = 'null'::jsonb, 'an unlinked proposal has no session: '||r::text;
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done->>'id', 'session_key', 'x', 'observation', 'Bravo')) = 'NOT_LINKED', 'no feedback without a linked session';
  assert public.zz_fb_err(s, 'compose', jsonb_build_object('id', done->>'id')) = 'SHARING_UNAVAILABLE', 'a stranger reads nothing';
  assert public.zz_fb_err(a, 'compose', jsonb_build_object('id', done->>'id')) = 'SHARING_UNAVAILABLE', 'compose is the coach''s';

  -- The athlete links the wrong session first (Monday core), then fixes it: the coach's key of the first read no longer fits.
  h := public.zz_fb_journal();
  perform public.zz_fb_follow(a, 'link', jsonb_build_object('id', done->>'id', 'revision', public.zz_fb_rev((done->>'id')::uuid), 'session_id', t_other));
  r := public.zz_fb(c, 'compose', jsonb_build_object('id', done->>'id'));
  k1 := r->>'session_key';
  assert r->'session'->>'state' = 'shared' and (r->'session'->>'val')::numeric = 1200, 'the coach reads the session linked now: '||r::text;
  perform public.zz_fb_follow(a, 'unlink', jsonb_build_object('id', done->>'id', 'revision', public.zz_fb_rev((done->>'id')::uuid)));
  perform public.zz_fb_follow(a, 'link', jsonb_build_object('id', done->>'id', 'revision', public.zz_fb_rev((done->>'id')::uuid), 'session_id', t_sq));
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done->>'id', 'session_key', k1, 'observation', 'Bonne séance')) = 'SESSION_CHANGED',
    'a feedback written on the first session is refused once the proposal points at another one';
  assert public.zz_fb_journal() = h, 'linking and unlinking never write the journal';
  perform set_config('titan.fb_k1', k1, true);
end $$;

-- The athlete corrects the strength session (the journal's own edit: value and revision change) while the coach is writing.
reset role;
set local session_replication_role = replica;
update public.training_logs set details = jsonb_set(details, '{duration}', '58'), revision = revision + 1 where id = current_setting('titan.fb_sq')::uuid;
set local session_replication_role = origin;
set local role authenticated;

do $$
declare
  c uuid := current_setting('titan.fb_c')::uuid; a uuid := current_setting('titan.fb_a')::uuid; s uuid := current_setting('titan.fb_s')::uuid;
  t_sq uuid := current_setting('titan.fb_sq')::uuid; la uuid := current_setting('titan.fb_la')::uuid; done uuid := current_setting('titan.fb_done')::uuid;
  nxt uuid := current_setting('titan.fb_next')::uuid; mob uuid := current_setting('titan.fb_mob')::uuid;
  r jsonb; k text; fb jsonb; h text; m text;
begin
  r := public.zz_fb(c, 'compose', jsonb_build_object('id', done));
  k := r->>'session_key';
  -- What the coach reads: date, sport, measures, duration and the exercises (shared); never the note (not shared).
  assert r->'session'->>'state' = 'shared' and r->'session'->>'day' = (current_date - 2)::text and (r->'session'->>'duration')::numeric = 58
     and r->'session'->'exercises'->0->>'name' = 'Squat' and r->'session'->'exercises'->0->'setRows'->3->>'rir' = '0', 'the shared measures, as corrected: '||r::text;
  assert not (r->'session' ? 'note') and r->'session'->'hidden' = '["notes"]'::jsonb and position('Épaule' in r::text) = 0, 'the private note never reaches the coach';
  assert jsonb_array_length(r->'targets') = 2 and r->'targets'->0->>'id' = nxt::text and r->'targets'->1->>'id' = mob::text, 'the open proposals an adjustment may target: '||(r->'targets')::text;
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', current_setting('titan.fb_k1'), 'observation', 'x')) = 'SESSION_CHANGED', 'a correction in between refuses the old key';

  -- The feedback: an observation (in the thread) and, separately, an adjustment of the next proposal, pending.
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', '   ')) = 'BAD_OBSERVATION', 'an observation is required';
  assert public.zz_fb_err(a, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Moi')) = 'COACH_ONLY', 'the athlete does not give a coach feedback';
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'x', 'adjustment', jsonb_build_object('target_id', nxt))) = 'CHANGE_EMPTY', 'an adjustment changes something';
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'x', 'adjustment', jsonb_build_object('target_id', done, 'title', 'y'))) = 'TARGET_UNAVAILABLE', 'never the commented proposal itself';
  h := public.zz_fb_journal();
  fb := public.zz_fb(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'La dernière série est descendue à RIR 0 : on garde la charge mais on vise RIR 2 partout.',
          'adjustment', jsonb_build_object('target_id', nxt, 'instructions', '5 séries de 5 à 80 kg, RIR 2 sur chaque série', 'note', 'On consolide avant de monter')));
  assert fb->>'observation' like 'La dernière série%' and fb->'adjustment'->>'kind' = 'change' and fb->'adjustment'->>'state' = 'pending'
     and fb->'adjustment'->'before'->>'instructions' = '5 séries de 5 à 82,5 kg' and fb->'adjustment'->'after'->>'instructions' = '5 séries de 5 à 80 kg, RIR 2 sur chaque série'
     and fb->'adjustment'->'target'->>'id' = nxt::text and (fb->>'can_withdraw')::boolean and fb->'assignment'->>'id' = done::text and fb->'assignment'->>'session' = 'same', 'feedback given: '||fb::text;
  assert (fb->'session'->>'corrected')::boolean is false and fb->'session'->'exercises'->0->>'name' = 'Squat', 'the measures come with it, read now';
  assert public.zz_fb_journal() = h, 'giving a feedback never writes the journal';
  assert (select count(*) from public.coach_assignments where id = nxt and instructions = '5 séries de 5 à 82,5 kg') = 1, 'nothing changes before the athlete answers';
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Encore', 'adjustment', jsonb_build_object('target_id', nxt, 'title', 'Autre'))) = 'ADJUSTMENT_PENDING',
    'one pending adjustment per proposal at a time';
  -- The thread: the observation is a message of the existing thread, marked as a feedback; the measures are not in it.
  m := public.zz_fb_msgs(a, la);
  assert position(fb->>'id' in m) > 0 and position('La dernière série' in m) > 0 and position('setRows' in m) = 0, 'the thread carries the observation and the feedback id: '||m;
  assert public.zz_fb_err(s, 'detail', jsonb_build_object('id', fb->>'id')) = 'SHARING_UNAVAILABLE', 'a stranger cannot open the direct link';
  perform set_config('titan.fb_fb', fb->>'id', true);

  -- The athlete, from their session: the feedback, the shared measures, what is not shared, and the decision to take.
  r := public.zz_fb(a, 'athlete', jsonb_build_object('session_id', t_sq));
  assert jsonb_array_length(r->'rows') = 1 and r->'rows'->0->>'id' = fb->>'id' and (r->'rows'->0->>'can_answer')::boolean and (r->'rows'->0->>'can_read')::boolean
     and r->'rows'->0->>'coach_name' = 'Coach Lou' and r->'rows'->0->'session'->'hidden' = '["notes"]'::jsonb, 'found from the session: '||r::text;
  assert jsonb_array_length(public.zz_fb(a, 'athlete', jsonb_build_object('session_id', current_setting('titan.fb_other')))->'rows') = 0, 'not on another session';
  assert public.zz_fb_err(c, 'answer', jsonb_build_object('id', fb->>'id', 'revision', 1, 'accept', true)) = 'ATHLETE_ONLY', 'the coach does not answer for the athlete';
end $$;

-- ---- Part 2: corrections after the feedback, sharing withdrawn, check-in.
reset role;
set local session_replication_role = replica;
-- A correction of the private note only: the coach cannot read it, so nothing is flagged for the coach.
update public.training_logs set details = jsonb_set(details, '{note}', '"Épaule OK finalement"'), revision = revision + 1 where id = current_setting('titan.fb_sq')::uuid;
set local session_replication_role = origin;
insert into private.titan_coach_checkins(link_id, week_start, scores, note, shared)
  values (current_setting('titan.fb_la')::uuid, date_trunc('week', current_date - 2)::date, '{"fatigue":4,"sleep":2}', 'Semaine chargée', true);
set local role authenticated;
do $$
declare c uuid := current_setting('titan.fb_c')::uuid; fb text := current_setting('titan.fb_fb'); r jsonb;
begin
  r := public.zz_fb(c, 'detail', jsonb_build_object('id', fb));
  assert (r->'session'->>'corrected')::boolean is false and position('Épaule' in r::text) = 0, 'a private correction raises nothing for the coach: '||r::text;
  assert r->'session'->'checkin'->'scores'->>'fatigue' = '4', 'the shared check-in of that week is in context';
end $$;
reset role;
set local session_replication_role = replica;
update public.training_logs set details = jsonb_set(details, '{exercises,0,setRows,3,reps}', '6'), revision = revision + 1 where id = current_setting('titan.fb_sq')::uuid;
set local session_replication_role = origin;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.fb_c')::uuid; a uuid := current_setting('titan.fb_a')::uuid; la uuid := current_setting('titan.fb_la')::uuid;
  done uuid := current_setting('titan.fb_done')::uuid; fb text := current_setting('titan.fb_fb'); r jsonb; l jsonb; cp jsonb; i jsonb; h text;
begin
  r := public.zz_fb(c, 'detail', jsonb_build_object('id', fb));
  assert (r->'session'->>'corrected')::boolean and r->'session'->'exercises'->0->'setRows'->3->>'reps' = '6', 'a correction of a shared measure is flagged, values shown as now: '||r::text;
  -- The athlete withdraws the details (and the check-in of that week): every coach view and preview loses them at the next read.
  h := public.zz_fb_journal();
  perform public.zz_fb_portal(a, 'scope', jsonb_build_object('link_id', la, 'revision', public.zz_fb_lrev(la), 'since_date', current_date - 30, 'share_details', false, 'share_notes', false));
  perform public.zz_fb_as(a); perform public.titan_coach_checkin_share_v1(la, date_trunc('week', current_date - 2)::date, false);
  r := public.zz_fb(c, 'detail', jsonb_build_object('id', fb));
  l := public.zz_fb(c, 'list', jsonb_build_object('link_id', la));
  cp := public.zz_fb(c, 'compose', jsonb_build_object('id', done));
  i := public.zz_fb(a, 'athlete');
  assert not (r->'session' ? 'exercises') and r->'session'->'hidden' = '["details", "notes"]'::jsonb and r->'session'->'checkin' = 'null'::jsonb
     and (r->'session'->>'val')::numeric = 3840 and (r->'session'->>'corrected')::boolean is false, 'the detail loses the exercises and the check-in: '||r::text;
  assert position('setRows' in l::text) = 0 and position('setRows' in cp::text) = 0 and position('setRows' in i::text) = 0
     and position('Semaine chargée' in l::text) = 0 and position('"fatigue"' in cp::text) = 0, 'list, compose and the athlete''s preview are recomputed too';
  assert r->>'observation' like 'La dernière série%' and r->'adjustment'->>'state' = 'pending', 'the observation and the adjustment stay';
  assert public.zz_fb_journal() = h, 'withdrawing a sharing never writes the journal';
  perform public.zz_fb_portal(a, 'scope', jsonb_build_object('link_id', la, 'revision', public.zz_fb_lrev(la), 'since_date', current_date - 30, 'share_details', true, 'share_notes', false));
end $$;

-- ---- Part 3: the adjustment carried into the next proposal; declined; new session; stale; withdrawn; limit.
do $$
declare
  c uuid := current_setting('titan.fb_c')::uuid; a uuid := current_setting('titan.fb_a')::uuid; la uuid := current_setting('titan.fb_la')::uuid;
  done uuid := current_setting('titan.fb_done')::uuid; nxt uuid := current_setting('titan.fb_next')::uuid; mob uuid := current_setting('titan.fb_mob')::uuid;
  fb text := current_setting('titan.fb_fb'); r jsonb; k text; f2 jsonb; f3 jsonb; f4 jsonb; f5 jsonb; n integer; h text; q jsonb;
begin
  h := public.zz_fb_journal();
  assert public.zz_fb_err(a, 'answer', jsonb_build_object('id', fb, 'revision', 9, 'accept', true)) = 'COACH_CONFLICT', 'a stale screen does not answer';
  r := public.zz_fb(a, 'answer', jsonb_build_object('id', fb, 'revision', 1, 'accept', true));
  assert (r->>'ok')::boolean and r->'row'->'adjustment'->>'state' = 'accepted' and r->'row'->'adjustment'->'result'->>'id' = nxt::text and r->'row'->>'read_at' is not null, 'accepted: '||r::text;
  assert (select instructions from public.coach_assignments where id = nxt) = '5 séries de 5 à 80 kg, RIR 2 sur chaque série'
     and (select status from public.coach_assignments where id = nxt) = 'accepted'
     and (select accepted_version->>'instructions' from public.coach_assignments where id = nxt) = '5 séries de 5 à 82,5 kg', 'carried into the next proposal; its first accepted version is kept';
  q := public.zz_fb_follow(c, 'detail', jsonb_build_object('id', nxt));
  assert (select count(*) from jsonb_array_elements(q->'history') e where e->>'k' = 'adjusted' and e->>'feedback' = fb and e->'after'->>'instructions' like '%RIR 2%') = 1, 'the proposal''s history says where the change comes from: '||(q->'history')::text;
  assert public.zz_fb_err(a, 'answer', jsonb_build_object('id', fb, 'revision', 2, 'accept', false)) = 'INVALID_TRANSITION', 'answered once';
  assert public.zz_fb(c, 'detail', jsonb_build_object('id', fb))->'adjustment'->>'state' = 'accepted', 'the coach sees the decision';

  k := public.zz_fb(c, 'compose', jsonb_build_object('id', done))->>'session_key';
  -- A new session suggested, declined: nothing is created.
  n := (select count(*) from public.coach_assignments where link_id = la);
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'x', 'adjustment', jsonb_build_object('title', 'Décharge'))) = 'ADJUSTMENT_INCOMPLETE', 'a new session needs a title, a sport and a date';
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'x', 'adjustment', jsonb_build_object('title', 'Décharge', 'sport', 'muscu_gym', 'planned_date', current_date - 1))) = 'INVALID_PERIOD', 'never in the past';
  f2 := public.zz_fb(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Si tu sens l’épaule, on peut caler une décharge.',
          'adjustment', jsonb_build_object('title', 'Décharge', 'sport', 'muscu_gym', 'planned_date', current_date + 8, 'instructions', '3 × 8 à 60 kg')));
  r := public.zz_fb(a, 'answer', jsonb_build_object('id', f2->>'id', 'revision', 1, 'accept', false));
  assert r->'row'->'adjustment'->>'state' = 'declined' and r->'row'->'adjustment'->'result' = 'null'::jsonb and (select count(*) from public.coach_assignments where link_id = la) = n, 'declined: nothing created';
  -- A new session accepted: created on the link, already accepted, with its origin.
  f3 := public.zz_fb(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Ajoutons un travail de gainage.',
          'adjustment', jsonb_build_object('title', 'Gainage 20 min', 'sport', 'muscu_gym', 'planned_date', current_date + 6)));
  r := public.zz_fb(a, 'answer', jsonb_build_object('id', f3->>'id', 'revision', 1, 'accept', true));
  assert r->'row'->'adjustment'->'result'->>'status' = 'accepted' and r->'row'->'adjustment'->'result'->>'title' = 'Gainage 20 min' and (select count(*) from public.coach_assignments where link_id = la) = n + 1, 'new session accepted: '||r::text;
  assert (select history->-1->>'k' from public.coach_assignments where id = (r->'row'->'adjustment'->'result'->>'id')::uuid) = 'from_feedback', 'its origin is in its history';
  -- Stale: the targeted proposal is cancelled before the answer.
  f4 := public.zz_fb(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Mobilité utile.', 'adjustment', jsonb_build_object('target_id', mob, 'instructions', '15 min de mobilité')));
  perform public.zz_fb_portal(c, 'cancel_assignment', jsonb_build_object('id', mob, 'revision', public.zz_fb_rev(mob)));
  r := public.zz_fb(a, 'detail', jsonb_build_object('id', f4->>'id'));
  assert r->'adjustment'->>'state' = 'stale' and (r->>'can_answer')::boolean is false, 'shown as outdated: '||r::text;
  r := public.zz_fb(a, 'answer', jsonb_build_object('id', f4->>'id', 'revision', 1, 'accept', true));
  assert (r->>'ok')::boolean is false and r->>'code' = 'ADJUSTMENT_STALE' and (select status from public.coach_assignments where id = mob) = 'cancelled', 'a stale adjustment is refused, the cancelled proposal stays cancelled';
  -- Withdrawn by the coach; then the limit of five feedbacks per session.
  f5 := public.zz_fb(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Une idée pour la suite.', 'adjustment', jsonb_build_object('target_id', nxt, 'title', 'Force · Squat 5 × 5 (80 kg)')));
  assert public.zz_fb_err(a, 'withdraw', jsonb_build_object('id', f5->>'id', 'revision', 1)) = 'COACH_ONLY', 'withdrawing is the coach''s';
  r := public.zz_fb(c, 'withdraw', jsonb_build_object('id', f5->>'id', 'revision', 1));
  assert r->'adjustment'->>'state' = 'withdrawn' and (r->>'can_withdraw')::boolean is false, 'withdrawn';
  assert public.zz_fb_err(c, 'give', jsonb_build_object('id', done, 'session_key', k, 'observation', 'Sixième')) = 'FEEDBACK_LIMIT', 'five feedbacks per session at most';
  assert jsonb_array_length(public.zz_fb(c, 'list', jsonb_build_object('assignment_id', done))->'rows') = 5, 'all five, on the same proposal';
  assert public.zz_fb_journal() = h, 'answers, new sessions and withdrawals never write the journal';
  -- « Compris » on a feedback without adjustment state change.
  r := public.zz_fb(a, 'read', jsonb_build_object('id', f5->>'id'));
  assert r->>'read_at' is not null and (r->>'can_read')::boolean is false, 'read';
end $$;

-- ---- Part 4: archive (context kept), revocation (direct link refused to the coach, read-only for the athlete), export, measure.
reset role;
set local session_replication_role = replica;
update public.training_logs set archived_at = now(), revision = revision + 1 where id = current_setting('titan.fb_sq')::uuid;
set local session_replication_role = origin;
set local role authenticated;
do $$
declare c uuid := current_setting('titan.fb_c')::uuid; a uuid := current_setting('titan.fb_a')::uuid; fb text := current_setting('titan.fb_fb'); r jsonb;
begin
  r := public.zz_fb(c, 'detail', jsonb_build_object('id', fb));
  assert r->'session'->>'state' = 'archived' and not (r->'session' ? 'day') and not (r->'session' ? 'val') and r->>'observation' like 'La dernière série%'
     and r->'adjustment'->>'state' = 'accepted' and r->'assignment'->>'title' = 'Force · Squat 4 × 6', 'archived: no measure for the coach, the context stays: '||r::text;
  r := public.zz_fb(a, 'detail', jsonb_build_object('id', fb));
  assert r->'session'->>'state' = 'archived' and r->'session'->>'day' = (current_date - 2)::text, 'the athlete still sees which session it was';
end $$;
reset role;
set local session_replication_role = replica;
update public.training_logs set archived_at = null, revision = revision + 1 where id = current_setting('titan.fb_sq')::uuid;
set local session_replication_role = origin;
create temporary table fb_session_before on commit drop as select to_jsonb(l) as v from public.training_logs l where l.id = current_setting('titan.fb_sq')::uuid;
grant select on fb_session_before to authenticated;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.fb_c')::uuid; a uuid := current_setting('titan.fb_a')::uuid; la uuid := current_setting('titan.fb_la')::uuid;
  done uuid := current_setting('titan.fb_done')::uuid; fb text := current_setting('titan.fb_fb'); r jsonb; h text;
begin
  h := public.zz_fb_journal();
  perform public.zz_fb_portal(a, 'revoke', jsonb_build_object('link_id', la, 'revision', public.zz_fb_lrev(la)));
  assert public.zz_fb_err(c, 'detail', jsonb_build_object('id', fb)) = 'SHARING_UNAVAILABLE', 'the direct link is refused to the coach after revocation';
  assert public.zz_fb_err(c, 'list', jsonb_build_object('link_id', la)) = 'SHARING_UNAVAILABLE', 'and the list';
  assert public.zz_fb_err(c, 'compose', jsonb_build_object('id', done)) = 'SHARING_UNAVAILABLE', 'and the composer';
  assert public.zz_fb_msgs(c, la) = 'SHARING_UNAVAILABLE', 'and the thread';
  r := public.zz_fb(a, 'detail', jsonb_build_object('id', fb));
  assert r->>'link_state' = 'revoked' and (r->>'can_answer')::boolean is false and (r->>'can_read')::boolean is false and r->>'observation' like 'La dernière série%', 'read-only for the athlete: '||r::text;
  assert jsonb_array_length(public.zz_fb(a, 'athlete', jsonb_build_object('session_id', current_setting('titan.fb_sq')))->'rows') = 5, 'still found from their session';
  assert public.zz_fb_err(a, 'read', jsonb_build_object('id', fb)) = 'SHARING_UNAVAILABLE', 'nothing is written on an ended link';
  assert public.zz_fb_journal() = h and (select v from fb_session_before) = (select to_jsonb(l) from public.training_logs l where l.id = current_setting('titan.fb_sq')::uuid), 'the journal keeps its values';
end $$;
reset role;
do $$
declare x jsonb := private.titan_export_extras_v1(current_setting('titan.fb_a')::uuid); m jsonb := private.titan_coach_feedback_measure();
begin
  assert jsonb_array_length(x->'coachFeedback') = 5 and position('setRows' in (x->'coachFeedback')::text) = 0 and x ? 'lifeChapters' and x ? 'coachMessages', 'exported without measures: '||(x->'coachFeedback')::text;
  assert (m->>'linkedSessions')::int >= 1 and (m->>'withFeedback')::int >= 1 and (m->>'understoodWithAction')::int >= 1 and (m->>'carriedIntoProposal')::int = 2
     and (m->'adjustments'->>'accepted')::int = 2 and (m->'adjustments'->>'declined')::int = 1, 'measure: '||m::text;
  assert not has_function_privilege('authenticated', 'private.titan_coach_feedback_measure()', 'execute') and not has_function_privilege('anon', 'public.titan_coach_feedback_v1(text, jsonb)', 'execute')
     and not has_table_privilege('authenticated', 'private.titan_coach_feedback', 'select'), 'nothing reachable outside the RPC';
end $$;
rollback;

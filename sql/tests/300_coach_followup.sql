-- V1.9.1 — Une séance assignée (20261130101100): proposals become followable. The scenario of the lot: the coach proposes a hill session,
-- the athlete accepts it, moves it two days later and links their real outing; the coach sees the planned date, the date in force, the
-- date done and the decision to take, in one queue filterable by action and by athlete. The accepted version is kept when the coach
-- proposes a change; the athlete sees what changes and answers. A match is only suggested and becomes a link when the athlete confirms.
-- A double link attempt keeps one coherent link and is logged. Pause and revocation follow the link's contract; the athlete still finds
-- their own session; public.training_logs is never written. Full rollback.
begin;
do $$
declare c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  t_sat uuid := gen_random_uuid(); t_other uuid := gen_random_uuid(); t_swim uuid := gen_random_uuid(); t_b uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (a, '{}'), (b, '{}'), (s, '{}');
  update public.profiles set username = case id when c then 'Coach Lou' when a then 'Inès' when b then 'Malo' else 'Inconnu' end where id in (c, a, b, s);
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', false, 100, 'QA') on conflict (key) do update set enabled = false;
  set local session_replication_role = replica;
  -- Inès: her real outing two days ago (the moved day), a run four days ago is not hers to link twice, a swim (other sport).
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (t_sat, a, 'running', 9.4, 'km', 10, ((current_date - 2) + time '09:30') at time zone 'Europe/Paris', '{"duration":52}', now() - interval '2 days'),
    (t_other, a, 'running', 5, 'km', 10, ((current_date - 12) + time '18:00') at time zone 'Europe/Paris', '{"duration":30}', now() - interval '12 days'),
    (t_swim, a, 'swimming', 1.5, 'km', 10, ((current_date - 1) + time '12:00') at time zone 'Europe/Paris', '{"duration":40}', now() - interval '1 day'),
    (t_b, b, 'running', 7, 'km', 10, ((current_date - 1) + time '07:00') at time zone 'Europe/Paris', '{"duration":40}', now() - interval '1 day');
  set local session_replication_role = origin;
  perform set_config('titan.cf_c', c::text, true); perform set_config('titan.cf_a', a::text, true); perform set_config('titan.cf_b', b::text, true); perform set_config('titan.cf_s', s::text, true);
  perform set_config('titan.cf_sat', t_sat::text, true); perform set_config('titan.cf_other', t_other::text, true); perform set_config('titan.cf_swim', t_swim::text, true); perform set_config('titan.cf_tb', t_b::text, true);
  create temporary table cf_journal on commit drop as select md5(string_agg(to_jsonb(l)::text, ';' order by l.id)) as h from public.training_logs l;
end $$;
create function public.zz_cf_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_cf(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_cf_as(p_user); return public.titan_coach_followup_v1(p_action, p_data); end $$;
create function public.zz_cf_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_cf(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_cf_portal(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_cf_as(p_user); return public.titan_coach_portal(p_action, p_data); end $$;
create function public.zz_cf_link(p_coach uuid, p_athlete uuid, p_since date default current_date - 30, p_sport text default null) returns uuid language plpgsql as $$
declare inv jsonb;
begin
  inv := public.zz_cf_portal(p_coach, 'invite');
  return (public.zz_cf_portal(p_athlete, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', p_since, 'consent', true, 'sport', p_sport))->>'id')::uuid;
end $$;
grant execute on function public.zz_cf_as(uuid), public.zz_cf(uuid, text, jsonb), public.zz_cf_err(uuid, text, jsonb), public.zz_cf_portal(uuid, text, jsonb), public.zz_cf_link(uuid, uuid, date, text) to authenticated;
set local role authenticated;

do $$
declare
  c uuid := current_setting('titan.cf_c')::uuid; a uuid := current_setting('titan.cf_a')::uuid; b uuid := current_setting('titan.cf_b')::uuid; s uuid := current_setting('titan.cf_s')::uuid;
  t_sat uuid := current_setting('titan.cf_sat')::uuid; t_other uuid := current_setting('titan.cf_other')::uuid; t_swim uuid := current_setting('titan.cf_swim')::uuid; t_b uuid := current_setting('titan.cf_tb')::uuid;
  la uuid; lb uuid; hill jsonb; r jsonb; q jsonb; easy jsonb; spare jsonb; ok boolean; thu date := current_date - 4; sat date := current_date - 2;
begin
  la := public.zz_cf_link(c, a); lb := public.zz_cf_link(c, b);
  hill := public.zz_cf_portal(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Côtes · 8 × 45 s', 'sport', 'running', 'planned_date', thu, 'instructions', 'Échauffement 20 min, 8 côtes de 45 s, retour en trottinant'));
  assert hill->'history'->0->>'k' = 'proposed' and hill->'history'->0->'version'->>'title' = 'Côtes · 8 × 45 s', 'the trigger opens the history with the proposal: '||(hill->'history')::text;

  -- Closed flag: nothing is read, nothing is written; the portal keeps working.
  assert public.zz_cf_err(c, 'queue') = 'FEATURE_DISABLED', 'flag closed';
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.coach_followup';
  set local role authenticated;

  -- En attente: the coach waits for an answer, the athlete has to answer.
  q := public.zz_cf(c, 'queue');
  assert jsonb_array_length(q->'rows') = 1 and q->'rows'->0->>'state' = 'awaiting' and q->'rows'->0->>'coach_next' = 'wait' and q->'rows'->0->>'athlete_name' = 'Inès', 'waiting for Inès: '||q::text;
  assert public.zz_cf_err(s, 'list', jsonb_build_object('link_id', la)) = 'SHARING_UNAVAILABLE', 'a stranger reads nothing';
  assert public.zz_cf_err(s, 'detail', jsonb_build_object('id', hill->>'id')) = 'SHARING_UNAVAILABLE', 'nor a proposal';
  assert public.zz_cf_err(c, 'move', jsonb_build_object('id', hill->>'id', 'revision', 1, 'date', sat)) = 'ATHLETE_ONLY', 'the coach never moves the athlete''s session';
  r := public.zz_cf_portal(a, 'assignment_status', jsonb_build_object('id', hill->>'id', 'revision', 1, 'status', 'accepted'));
  assert r->'accepted_version'->>'title' = 'Côtes · 8 × 45 s' and r->'accepted_version'->>'planned_date' = thu::text, 'the accepted version is kept, through the existing portal: '||r::text;
  assert public.zz_cf_err(a, 'propose_change', jsonb_build_object('id', hill->>'id', 'revision', 2, 'title', 'x')) = 'COACH_ONLY', 'the athlete does not propose a change';

  -- Reportée: Inès moves Thursday to Saturday, before any link. The coach sees both dates and a gap to handle.
  assert public.zz_cf_err(a, 'move', jsonb_build_object('id', hill->>'id', 'revision', 2, 'date', thu + 60)) = 'INVALID_PERIOD', 'a bounded move';
  r := public.zz_cf(a, 'move', jsonb_build_object('id', hill->>'id', 'revision', 2, 'date', sat, 'note', 'Réunion jeudi soir'));
  assert r->>'moved_date' = sat::text and r->>'planned_date' = thu::text and r->>'effective_date' = sat::text, 'moved: '||r::text;
  assert r->>'state' = 'to_match' and jsonb_array_length(r->'candidates') = 1 and r->'candidates'->0->>'id' = t_sat::text, 'the Saturday outing is suggested to the athlete, not linked: '||r::text;
  assert (select status from public.coach_assignments where id = (hill->>'id')::uuid) = 'accepted', 'a suggestion links nothing';
  q := public.zz_cf(c, 'queue');
  r := (select e from jsonb_array_elements(q->'rows') e where e->>'id' = hill->>'id');
  assert r->>'state' = 'to_match' and r->>'coach_next' = 'wait' and (r->>'candidate_count')::int = 1 and r->'candidates' = 'null'::jsonb and r->>'done_date' is null
     and r->>'planned_date' = thu::text and r->>'moved_date' = sat::text, 'the coach sees the move and waits for the athlete''s confirmation, never the candidate: '||r::text;
  assert (select count(*) from jsonb_array_elements(r->'history') e where e->>'k' = 'moved' and e->>'note' = 'Réunion jeudi soir' and e->>'to' = sat::text) = 1, 'the move is in the history';

  -- Liée: the athlete confirms; the existing link (status completed, session_id) is reused.
  assert public.zz_cf_err(a, 'link', jsonb_build_object('id', hill->>'id', 'revision', 3, 'session_id', t_swim)) = 'INVALID_SESSION', 'another sport is refused';
  assert public.zz_cf_err(a, 'link', jsonb_build_object('id', hill->>'id', 'revision', 3, 'session_id', t_b)) = 'INVALID_SESSION', 'someone else''s session is refused';
  assert public.zz_cf_err(a, 'link', jsonb_build_object('id', hill->>'id', 'revision', 2, 'session_id', t_sat)) = 'COACH_CONFLICT', 'a stale revision is refused';
  r := public.zz_cf(a, 'link', jsonb_build_object('id', hill->>'id', 'revision', 3, 'session_id', t_sat));
  assert (r->>'ok')::boolean and r->'row'->>'state' = 'linked' and r->'row'->>'done_date' = sat::text and (r->'row'->>'gap_days')::int = 2, 'linked: '||r::text;
  assert (select session_id from public.coach_assignments where id = (hill->>'id')::uuid) = t_sat and (select status from public.coach_assignments where id = (hill->>'id')::uuid) = 'completed', 'same link as before';
  r := public.zz_cf(a, 'link', jsonb_build_object('id', hill->>'id', 'revision', 4, 'session_id', t_sat));
  assert (r->>'ok')::boolean and (r->>'already')::boolean, 'the same confirmation twice is harmless';

  -- Double attempt: another session on the linked proposal, and the linked session on another proposal. One link stays; both are logged.
  easy := public.zz_cf_portal(c, 'assign', jsonb_build_object('link_id', la, 'title', 'Footing souple', 'sport', 'running', 'planned_date', sat, 'instructions', ''));
  perform public.zz_cf_portal(a, 'assignment_status', jsonb_build_object('id', easy->>'id', 'revision', 1, 'status', 'accepted'));
  r := public.zz_cf(a, 'link', jsonb_build_object('id', hill->>'id', 'revision', 4, 'session_id', t_other));
  assert not (r->>'ok')::boolean and r->>'code' = 'ALREADY_LINKED' and r->'row'->'linked'->>'session_id' = t_sat::text, 'the link in place wins: '||r::text;
  r := public.zz_cf(a, 'link', jsonb_build_object('id', easy->>'id', 'revision', 2, 'session_id', t_sat));
  assert not (r->>'ok')::boolean and r->>'code' = 'SESSION_ALREADY_LINKED' and r->'row'->>'status' = 'accepted', 'one session, one proposal: '||r::text;
  assert (select count(*) from public.coach_assignments where session_id = t_sat) = 1, 'a single coherent link';
  assert (select count(*) from public.coach_assignments x, jsonb_array_elements(x.history) e where x.link_id = la and e->>'k' = 'link_refused') = 2, 'both refused attempts are in the history';
  ok := false; begin perform public.zz_cf_portal(a, 'assignment_status', jsonb_build_object('id', easy->>'id', 'revision', 2, 'status', 'completed', 'session_id', t_sat)); exception when others then ok := sqlerrm = 'SESSION_ALREADY_LINKED'; end;
  assert ok, 'the portal keeps its own guard';

  -- The coach reads the planned date, the date done and handles the gap; the row leaves the queue until something changes.
  r := public.zz_cf(c, 'detail', jsonb_build_object('id', hill->>'id'));
  assert r->>'state' = 'linked' and r->>'coach_next' = 'gap' and r->>'done_date' = sat::text and r->>'planned_date' = thu::text and r->'linked'->>'val' = '9.4'
     and r->'linked'->>'session_id' is null and r->'accepted_version'->>'planned_date' = thu::text, 'original, date done and linked activity, no journal id for the coach: '||r::text;
  assert public.zz_cf_err(c, 'seen', jsonb_build_object('id', hill->>'id', 'state_key', 'stale')) = 'COACH_CONFLICT', 'a handled gap is the one on screen';
  r := public.zz_cf(c, 'seen', jsonb_build_object('id', hill->>'id', 'state_key', r->>'state_key'));
  assert (r->>'seen')::boolean, 'handled';
  assert not exists (select 1 from jsonb_array_elements(public.zz_cf(c, 'queue')->'rows') e where e->>'id' = hill->>'id'), 'out of the queue';
  r := public.zz_cf(c, 'detail', jsonb_build_object('id', easy->>'id'));
  assert r->>'state' = 'overdue' and r->>'coach_next' = 'gap', 'the easy run of Saturday has no session of its own: an écart: '||r::text;

  -- Proposée à nouveau: the coach changes the accepted easy run; the version in force stays until the athlete answers.
  assert public.zz_cf_err(c, 'propose_change', jsonb_build_object('id', easy->>'id', 'revision', 2, 'title', 'Footing souple')) = 'CHANGE_EMPTY', 'a change changes something';
  r := public.zz_cf(c, 'propose_change', jsonb_build_object('id', easy->>'id', 'revision', 2, 'planned_date', current_date + 2, 'instructions', '40 min en aisance', 'note', 'Plus long cette semaine'));
  assert r->>'state' = 'reproposed' and r->>'coach_next' = 'wait' and r->>'planned_date' = sat::text and r->'pending_change'->>'planned_date' = (current_date + 2)::text
     and r->'pending_change'->>'note' = 'Plus long cette semaine', 'the change waits beside the accepted version: '||r::text;
  assert public.zz_cf_err(c, 'seen', jsonb_build_object('id', easy->>'id', 'state_key', r->>'state_key')) = 'INVALID_TRANSITION', 'waiting is not a gap to handle';
  r := (select e from jsonb_array_elements(public.zz_cf(a, 'athlete')->'rows') e where e->>'id' = easy->>'id');
  assert r->>'state' = 'reproposed' and r->'pending_change'->>'instructions' = '40 min en aisance' and r->>'instructions' = '', 'the athlete sees what changes: '||r::text;
  r := public.zz_cf(a, 'answer_change', jsonb_build_object('id', easy->>'id', 'revision', 3, 'accept', false));
  assert r->>'state' <> 'reproposed' and r->>'planned_date' = sat::text and r->'pending_change' = 'null'::jsonb, 'declined: the accepted version stays';
  r := public.zz_cf(c, 'propose_change', jsonb_build_object('id', easy->>'id', 'revision', 4, 'planned_date', current_date + 2, 'title', 'Footing long'));
  r := public.zz_cf(c, 'withdraw_change', jsonb_build_object('id', easy->>'id', 'revision', 5));
  assert r->'pending_change' = 'null'::jsonb and r->>'title' = 'Footing souple', 'withdrawn by the coach';
  r := public.zz_cf(c, 'propose_change', jsonb_build_object('id', easy->>'id', 'revision', 6, 'planned_date', current_date + 2, 'title', 'Footing long'));
  r := public.zz_cf(a, 'answer_change', jsonb_build_object('id', easy->>'id', 'revision', 7, 'accept', true));
  assert r->>'title' = 'Footing long' and r->>'planned_date' = (current_date + 2)::text and r->>'state' = 'planned' and r->'accepted_version'->>'title' = 'Footing souple'
     and (select count(*) from jsonb_array_elements(r->'history') e where e->>'k' = 'change_accepted' and e->'before'->>'title' = 'Footing souple' and e->'after'->>'title' = 'Footing long') = 1,
     'accepted: the correction applies, the original accepted and the before/after stay readable: '||r::text;
  assert public.zz_cf_err(c, 'propose_change', jsonb_build_object('id', hill->>'id', 'revision', 4, 'title', 'Autre')) = 'INVALID_TRANSITION', 'a linked session is not changed';

  -- Faite sans correspondance, écart, déclinée: what each side can do.
  spare := public.zz_cf_portal(c, 'assign', jsonb_build_object('link_id', lb, 'title', 'Fractionné', 'sport', 'cycling', 'planned_date', current_date - 3, 'instructions', ''));
  perform public.zz_cf_portal(b, 'assignment_status', jsonb_build_object('id', spare->>'id', 'revision', 1, 'status', 'accepted'));
  r := public.zz_cf(c, 'detail', jsonb_build_object('id', spare->>'id'));
  assert r->>'state' = 'overdue' and r->>'coach_next' = 'gap', 'date passed, nothing in the journal: a gap for the coach: '||r::text;
  r := public.zz_cf(b, 'declare_done', jsonb_build_object('id', spare->>'id', 'revision', 2, 'done', true));
  assert r->>'state' = 'done_unmatched', 'done without a match: '||r::text;
  q := public.zz_cf(c, 'queue', jsonb_build_object('action', 'gap'));
  assert (select count(*) from jsonb_array_elements(q->'rows') e where e->>'coach_next' <> 'gap') = 0 and exists (select 1 from jsonb_array_elements(q->'rows') e where e->>'id' = spare->>'id' and e->>'state' = 'done_unmatched'), 'filter by action: '||q::text;
  q := public.zz_cf(c, 'queue', jsonb_build_object('link_id', la));
  assert (select count(*) from jsonb_array_elements(q->'rows') e where e->>'link_id' <> la::text) = 0, 'filter by athlete';
  assert public.zz_cf_err(c, 'queue', jsonb_build_object('action', 'all')) = 'INVALID_INPUT', 'known filters only';
  perform public.zz_cf_portal(c, 'cancel_assignment', jsonb_build_object('id', spare->>'id', 'revision', 3));
  assert (select history->-1->>'k' from public.coach_assignments where id = (spare->>'id')::uuid) = 'cancelled', 'the portal''s cancellation is logged';

  -- The contract of the link decides what the coach reads of a linked session: Malo links a run, then shares cycling only.
  spare := public.zz_cf_portal(c, 'assign', jsonb_build_object('link_id', lb, 'title', 'Sortie tempo', 'sport', 'running', 'planned_date', current_date - 1, 'instructions', ''));
  perform public.zz_cf_portal(b, 'assignment_status', jsonb_build_object('id', spare->>'id', 'revision', 1, 'status', 'accepted'));
  r := public.zz_cf(b, 'link', jsonb_build_object('id', spare->>'id', 'revision', 2, 'session_id', t_b));
  assert (r->>'ok')::boolean and (public.zz_cf(c, 'detail', jsonb_build_object('id', spare->>'id'))->'linked'->>'val') = '7', 'inside the contract the coach reads the session';
  perform public.zz_cf_portal(b, 'scope', jsonb_build_object('link_id', lb, 'revision', (select revision from public.coach_links where id = lb), 'since_date', current_date - 30, 'sport', 'cycling'));
  r := public.zz_cf(c, 'detail', jsonb_build_object('id', spare->>'id'));
  assert r->>'state' = 'linked' and r->'linked' = '{"in_scope": false}'::jsonb and r->>'done_date' is null and r->>'coach_next' = 'gap'
     and not exists (select 1 from jsonb_array_elements(r->'history') e where e ? 'day'), 'outside the contract: linked, nothing more: '||r::text;
  assert public.zz_cf(b, 'detail', jsonb_build_object('id', spare->>'id'))->'linked'->>'session_id' = t_b::text, 'Malo still reads his own session';

  -- Pause (no place left in the coach's offer): the coach reads nothing; the athlete reads, without acting.
  perform set_config('titan.cf_la', la::text, true); perform set_config('titan.cf_easy', easy->>'id', true); perform set_config('titan.cf_hill', hill->>'id', true);
end $$;

reset role;
do $$
declare c uuid := current_setting('titan.cf_c')::uuid; i integer; u uuid;
begin
  for i in 1..3 loop
    u := gen_random_uuid(); insert into auth.users(id, raw_user_meta_data) values (u, '{}');
    insert into public.coach_links(coach_id, athlete_id, since_date, accepted_at) values (c, u, current_date, now() - interval '400 days');
  end loop;
end $$;
set local role authenticated;

do $$
declare c uuid := current_setting('titan.cf_c')::uuid; a uuid := current_setting('titan.cf_a')::uuid; la uuid := current_setting('titan.cf_la')::uuid;
  easy uuid := current_setting('titan.cf_easy')::uuid; hill uuid := current_setting('titan.cf_hill')::uuid; t_sat uuid := current_setting('titan.cf_sat')::uuid; r jsonb;
begin
  assert public.zz_cf_err(c, 'list', jsonb_build_object('link_id', la)) = 'COACH_CAPACITY_PAUSED', 'paused: the coach reads nothing';
  assert public.zz_cf_err(c, 'detail', jsonb_build_object('id', hill)) = 'COACH_CAPACITY_PAUSED', 'nor a proposal';
  assert not exists (select 1 from jsonb_array_elements(public.zz_cf(c, 'queue')->'rows') e where e->>'link_id' = la::text), 'nor in the queue';
  assert (public.zz_cf(c, 'queue')->>'paused')::int >= 1, 'the queue says a link is paused';
  r := public.zz_cf(a, 'list', jsonb_build_object('link_id', la));
  assert jsonb_array_length(r->'rows') = 2 and (select bool_and(not (e->>'can_act')::boolean and e->>'link_state' = 'paused') from jsonb_array_elements(r->'rows') e), 'the athlete reads, read-only: '||r::text;
  assert public.zz_cf_err(a, 'move', jsonb_build_object('id', easy, 'revision', 8, 'date', current_date + 3)) = 'COACH_CAPACITY_PAUSED', 'and does not act while paused';

  -- Revocation: the coach reads nothing; the athlete still finds her proposal and her own session; no journal row changed.
  perform public.zz_cf_portal(a, 'revoke', jsonb_build_object('link_id', la, 'revision', (select revision from public.coach_links where id = la)));
  assert public.zz_cf_err(c, 'detail', jsonb_build_object('id', hill)) = 'SHARING_UNAVAILABLE', 'revoked: nothing for the coach';
  assert public.zz_cf_err(c, 'list', jsonb_build_object('link_id', la)) = 'SHARING_UNAVAILABLE', 'nothing listed';
  r := (select e from jsonb_array_elements(public.zz_cf(a, 'athlete')->'rows') e where e->>'id' = hill::text);
  assert r->>'link_state' = 'revoked' and r->'linked'->>'session_id' = t_sat::text and not (r->>'can_act')::boolean, 'the athlete finds her own session: '||r::text;
  assert public.zz_cf_err(a, 'unlink', jsonb_build_object('id', hill, 'revision', 4)) = 'SHARING_UNAVAILABLE', 'nothing changes after the end';
end $$;

reset role;
do $$
declare m jsonb := private.titan_coach_followup_measure();
begin
  assert (select h from cf_journal) = (select md5(string_agg(to_jsonb(l)::text, ';' order by l.id)) from public.training_logs l), 'public.training_logs unchanged by every action (read as the table owner, all rows)';
  assert (m->>'linked')::int >= 1 and (m->>'refusedLinks')::int = 2 and (m->>'changesAccepted')::int = 1 and (m->>'changesDeclined')::int = 1 and (m->>'gapsHandled')::int = 1, 'measure: '||m::text;
  assert not has_function_privilege('authenticated', 'private.titan_coach_followup_measure()', 'execute'), 'the measure is the team''s';
  assert not has_function_privilege('anon', 'public.titan_coach_followup_v1(text, jsonb)', 'execute'), 'no anonymous access';
end $$;
rollback;

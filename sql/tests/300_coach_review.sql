-- V1.9.3 — Revue de suivi (20261203090000). The scenario of the lot, played with five athletes, empty dossiers and paused links: on Monday a
-- coach opens the review, sees two answers awaited (Inès, Malo), a linked session without feedback (Lina), an athlete ready for the next
-- step (Zoé) and an empty dossier (Noé); two later links are paused by the places of the offer (Paul, Léa) and show their name only. The coach
-- prepares Zoé's next proposal from an existing template, previews the change, is interrupted, resumes the same draft, and sends it; a
-- second send and an identical second preparation create nothing. A revocation and a pause in the middle of the review refuse the send.
-- Zoé answers in her own space; her decision comes back in the review of the following week. A second coach of Inès sees only their own
-- link, and a coach without athletes gets a usable empty review. Each read respects the link's contract (shared check-in only, no private
-- note), public.training_logs is never written. Full rollback.
begin;
do $$
declare
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  names text[] := array['Inès', 'Malo', 'Zoé', 'Noé', 'Lina', 'Paul', 'Léa'];
  i integer; wk date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date; past date;
begin
  past := greatest(wk - 4, current_date - 7);
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (c2, '{}'), (c3, '{}');
  for i in 1..7 loop insert into auth.users(id, raw_user_meta_data) values (a[i], '{}'); end loop;
  update public.profiles set username = 'Coach Lou' where id = c;
  update public.profiles set username = 'Coach Sam' where id = c2;
  update public.profiles set username = 'Coach Nil' where id = c3;
  for i in 1..7 loop update public.profiles set username = names[i] where id = a[i]; end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_review', false, 100, 'QA') on conflict (key) do update set enabled = false;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_feedback', true, 100, 'QA') on conflict (key) do update set enabled = true;
  -- Coach Lou has the Coach offer (5 places), through the billing path.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'rv-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  set local session_replication_role = replica;
  -- Zoé's and Lina's sessions of the past week; Zoé's note is private (her link does not share notes).
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    ('19300000-0000-4000-8000-0000000005a3', a[3], 'running', 10.2, 'km', 10, (past + time '07:30') at time zone 'Europe/Paris', '{"duration":55,"note":"Genou sensible"}', now() - interval '3 days'),
    ('19300000-0000-4000-8000-0000000005a5', a[5], 'running', 8.0, 'km', 10, (past + time '07:30') at time zone 'Europe/Paris', '{"duration":44}', now() - interval '3 days');
  set local session_replication_role = origin;
  perform set_config('titan.rv_c', c::text, true); perform set_config('titan.rv_c2', c2::text, true); perform set_config('titan.rv_c3', c3::text, true);
  perform set_config('titan.rv_a', array_to_string(a, ','), true); perform set_config('titan.rv_wk', wk::text, true); perform set_config('titan.rv_past', past::text, true);
end $$;
create function public.zz_rv_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_rv(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_rv_as(p_user); return public.titan_coach_review_v1(p_action, p_data); end $$;
create function public.zz_rv_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_rv(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_rv_portal(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_rv_as(p_user); return public.titan_coach_portal(p_action, p_data); end $$;
create function public.zz_rv_follow(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_rv_as(p_user); return public.titan_coach_followup_v1(p_action, p_data); end $$;
create function public.zz_rv_fb(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_rv_as(p_user); return public.titan_coach_feedback_v1(p_action, p_data); end $$;
create function public.zz_rv_link(p_coach uuid, p_athlete uuid, p_details boolean default false, p_notes boolean default false) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := public.zz_rv_portal(p_coach, 'invite');
  return (public.zz_rv_portal(p_athlete, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true, 'share_details', p_details, 'share_notes', p_notes))->>'id')::uuid; end $$;
create function public.zz_rv_rev(p_id uuid) returns integer language sql security definer as $$ select revision from public.coach_assignments where id = p_id $$;
create function public.zz_rv_lrev(p_id uuid) returns integer language sql security definer as $$ select revision from public.coach_links where id = p_id $$;
create function public.zz_rv_count(p_link uuid) returns integer language sql security definer as $$ select count(*)::integer from public.coach_assignments where link_id = p_link $$;
create function public.zz_rv_drafts(p_link uuid) returns text language sql security definer as $$ select string_agg(state, ',' order by created_at) from private.titan_coach_review_drafts where link_id = p_link $$;
create function public.zz_rv_journal() returns text language sql security definer as $$ select md5(string_agg(to_jsonb(l)::text, ';' order by l.id)) from public.training_logs l $$;
create function public.zz_rv_age(p_id uuid) returns void language sql security definer as $$ update public.coach_assignments set created_at = created_at - interval '10 days' where id = p_id $$;
grant execute on function public.zz_rv_as(uuid), public.zz_rv(uuid, text, jsonb), public.zz_rv_err(uuid, text, jsonb), public.zz_rv_portal(uuid, text, jsonb),
  public.zz_rv_follow(uuid, text, jsonb), public.zz_rv_fb(uuid, text, jsonb), public.zz_rv_link(uuid, uuid, boolean, boolean), public.zz_rv_rev(uuid), public.zz_rv_lrev(uuid),
  public.zz_rv_count(uuid), public.zz_rv_drafts(uuid), public.zz_rv_journal(), public.zz_rv_age(uuid) to authenticated;

-- ---- Part 1: the five dossiers of Coach Lou, two paused links, a second coach for Inès, a coach without athletes.
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.rv_c')::uuid; c2 uuid := current_setting('titan.rv_c2')::uuid; a uuid[] := string_to_array(current_setting('titan.rv_a'), ',')::uuid[];
  wk date := current_setting('titan.rv_wk')::date; past date := current_setting('titan.rv_past')::date; nxt date := current_date + 2;
  l uuid[] := array[]::uuid[]; i integer; r jsonb; t_ines jsonb; t_malo jsonb; t_zoe jsonb; t_lina jsonb; t_sam jsonb; k text;
begin
  for i in 1..5 loop l := l || public.zz_rv_link(c, a[i], false, false); end loop;
  t_ines := public.zz_rv_portal(c, 'assign', jsonb_build_object('link_id', l[1], 'title', 'Footing 45 min', 'sport', 'running', 'planned_date', nxt, 'instructions', 'En aisance'));
  t_malo := public.zz_rv_portal(c, 'assign', jsonb_build_object('link_id', l[2], 'title', 'Fractionné 6 × 400 m', 'sport', 'running', 'planned_date', nxt, 'instructions', ''));
  perform public.zz_rv_portal(a[2], 'assignment_status', jsonb_build_object('id', t_malo->>'id', 'revision', 1, 'status', 'accepted'));
  perform public.zz_rv_follow(c, 'propose_change', jsonb_build_object('id', t_malo->>'id', 'revision', 2, 'instructions', '6 × 400 m, récupération 1 min 30', 'note', 'Plus de récupération'));
  t_zoe := public.zz_rv_portal(c, 'assign', jsonb_build_object('link_id', l[3], 'title', 'Sortie longue 10 km', 'sport', 'running', 'planned_date', past, 'instructions', 'Allure confortable'));
  t_lina := public.zz_rv_portal(c, 'assign', jsonb_build_object('link_id', l[5], 'title', 'Footing 8 km', 'sport', 'running', 'planned_date', past, 'instructions', ''));
  perform public.zz_rv_age((t_zoe->>'id')::uuid); perform public.zz_rv_age((t_lina->>'id')::uuid);
  perform public.zz_rv_portal(a[3], 'assignment_status', jsonb_build_object('id', t_zoe->>'id', 'revision', 1, 'status', 'accepted'));
  perform public.zz_rv_portal(a[5], 'assignment_status', jsonb_build_object('id', t_lina->>'id', 'revision', 1, 'status', 'accepted'));
  perform public.zz_rv_follow(a[3], 'link', jsonb_build_object('id', t_zoe->>'id', 'revision', 2, 'session_id', '19300000-0000-4000-8000-0000000005a3'));
  perform public.zz_rv_follow(a[5], 'link', jsonb_build_object('id', t_lina->>'id', 'revision', 2, 'session_id', '19300000-0000-4000-8000-0000000005a5'));
  -- Zoé's session already has its feedback (V1.9.2); Lina's has none.
  r := public.zz_rv_fb(c, 'compose', jsonb_build_object('id', t_zoe->>'id'));
  perform public.zz_rv_fb(c, 'give', jsonb_build_object('id', t_zoe->>'id', 'session_key', r->>'session_key', 'observation', 'Allure régulière, bien.'));
  -- Inès is also followed by Coach Sam (free offer), with his own proposal.
  l := l || public.zz_rv_link(c2, a[1]);
  t_sam := public.zz_rv_portal(c2, 'assign', jsonb_build_object('link_id', l[6], 'title', 'Renfo gainage', 'sport', 'running', 'planned_date', nxt, 'instructions', ''));
  -- Coach Lou's template, reused for the next step.
  perform public.zz_rv_as(c);
  perform public.titan_coach_template_save_v1(null, 'Seuil 3 × 8 min', 'running', 'Échauffement 20 min, 3 × 8 min au seuil, récupération 2 min');
  perform set_config('titan.rv_l', array_to_string(l, ','), true);
  perform set_config('titan.rv_t', concat_ws(',', t_ines->>'id', t_malo->>'id', t_zoe->>'id', t_lina->>'id', t_sam->>'id'), true);
end $$;

-- As the service: two later links of Coach Lou, beyond the five places (paused); the check-ins of the past week (Zoé shared, Inès did not).
reset role;
do $$
declare c uuid := current_setting('titan.rv_c')::uuid; a uuid[] := string_to_array(current_setting('titan.rv_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.rv_l'), ',')::uuid[]; i integer;
  wk date := current_setting('titan.rv_wk')::date; p1 uuid; p2 uuid;
begin
  -- The five links were accepted in one transaction (same now()): give them their real order, Inès first, Lina last.
  for i in 1..5 loop update public.coach_links set accepted_at = now() - make_interval(mins => 10 - i) where id = l[i]; end loop;
  insert into public.coach_links(coach_id, athlete_id, since_date, accepted_at) values (c, a[6], current_date - 30, now() + interval '1 second') returning id into p1;
  insert into public.coach_links(coach_id, athlete_id, since_date, accepted_at) values (c, a[7], current_date - 30, now() + interval '2 seconds') returning id into p2;
  insert into private.titan_coach_checkins(link_id, week_start, scores, note, shared) values
    (l[3], wk - 7, '{"fatigue":2,"energy":4,"sleep":4,"motivation":5}', 'Bonne semaine', true),
    (l[1], wk - 7, '{"fatigue":5,"energy":1,"sleep":2,"motivation":2}', 'Semaine très dure au travail', false);
  perform set_config('titan.rv_p', p1::text || ',' || p2::text, true);
  assert private.titan_coach_capacity(c) = 5 and not private.titan_coach_link_active(p1) and not private.titan_coach_link_active(p2)
     and private.titan_coach_link_active(l[5]), 'five places: the two later links are paused';
end $$;
set local role authenticated;

-- ---- Part 2: the review of the week.
do $$
declare
  c uuid := current_setting('titan.rv_c')::uuid; c2 uuid := current_setting('titan.rv_c2')::uuid; c3 uuid := current_setting('titan.rv_c3')::uuid;
  a uuid[] := string_to_array(current_setting('titan.rv_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.rv_l'), ',')::uuid[];
  t uuid[] := string_to_array(current_setting('titan.rv_t'), ',')::uuid[]; p uuid[] := string_to_array(current_setting('titan.rv_p'), ',')::uuid[];
  wk date := current_setting('titan.rv_wk')::date; past date := current_setting('titan.rv_past')::date;
  r jsonb; all_ jsonb; card jsonb; t0 timestamptz; ms numeric;
begin
  assert public.zz_rv_err(c, 'week') = 'FEATURE_DISABLED', 'flag closed: nothing is read';
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.coach_review';
  set local role authenticated;

  t0 := clock_timestamp();
  r := public.zz_rv(c, 'week');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice 'coach_review week (7 links, 5 active): % ms', round(ms, 1);
  assert ms < 2000, 'the review of five athletes answers within the statement budget';
  assert r->>'week' = wk::text and r->'counts'->>'athletes' = '7' and r->'counts'->>'actionable' = '3' and r->'counts'->>'wait' = '2'
     and r->'counts'->>'feedback' = '1' and r->'counts'->>'prepare' = '2' and r->'counts'->>'paused' = '2', 'two answers awaited, one feedback, two to prepare, two paused: '||(r->'counts')::text;
  -- Actionable first: Lina (feedback), then Noé and Zoé (prepare), then the paused names; Inès and Malo (waiting) are left out by default.
  assert (select string_agg(e->>'name' || ':' || (e->>'next'), ' ' order by i) from jsonb_array_elements(r->'cards') with ordinality x(e, i)) = 'Lina:feedback Noé:prepare Zoé:prepare Léa:paused Paul:paused',
    'the actionable cases, paused links named: '||(select string_agg(e->>'name' || ':' || (e->>'next'), ' ') from jsonb_array_elements(r->'cards') e);
  card := (select e from jsonb_array_elements(r->'cards') e where e->>'name' = 'Paul');
  assert card->>'link_state' = 'paused' and not card ? 'items' and not card ? 'draft' and not card ? 'checkin', 'a paused link shows its name only: '||card::text;
  -- Lina: the dossier is her linked session, its source is the session day; Zoé: ready, source = her proposal of the past week, check-in shared.
  card := (select e from jsonb_array_elements(r->'cards') e where e->>'name' = 'Lina');
  assert card->'dossier'->>'id' = t[4]::text and card->'source'->>'kind' = 'session' and card->'source'->>'date' = past::text
     and card->'dossier'->'linked'->>'val' = '8.0' and (card->'dossier'->>'feedback_count')::int = 0, 'Lina: linked session without feedback: '||card::text;
  card := (select e from jsonb_array_elements(r->'cards') e where e->>'name' = 'Zoé');
  assert card->'source'->>'kind' = 'proposal' and card->'source'->>'id' = t[3]::text and card->'dossier'->>'state' = 'linked' and (card->'dossier'->>'feedback_count')::int = 1
     and card->'checkin'->>'week' = (wk - 7)::text and card->'checkin'->'scores'->>'energy' = '4' and card->'draft' = 'null'::jsonb, 'Zoé: ready, with the shared check-in: '||card::text;
  assert position('Genou' in r::text) = 0, 'the private note of a session never reaches the review';
  card := (select e from jsonb_array_elements(r->'cards') e where e->>'name' = 'Noé');
  assert card->'source'->>'kind' = 'empty' and card->>'item_count' = '0' and card->'checkin' = 'null'::jsonb, 'an empty dossier stays usable: '||card::text;

  all_ := public.zz_rv(c, 'week', jsonb_build_object('filter', 'all'));
  assert jsonb_array_length(all_->'cards') = 7, 'all the athletes on demand';
  card := (select e from jsonb_array_elements(all_->'cards') e where e->>'name' = 'Inès');
  assert card->>'next' = 'wait' and card->'dossier'->>'id' = t[1]::text and card->'dossier'->>'state' = 'awaiting' and card->'checkin' = 'null'::jsonb
     and position('Semaine très dure' in all_::text) = 0, 'Inès: awaiting her answer, her unshared check-in is not read: '||card::text;
  assert position(t[5]::text in all_::text) = 0 and position('Renfo gainage' in all_::text) = 0, 'no proposal of Coach Sam in Coach Lou''s review';
  card := (select e from jsonb_array_elements(all_->'cards') e where e->>'name' = 'Malo');
  assert card->>'next' = 'wait' and card->'dossier'->>'state' = 'reproposed', 'Malo: a change awaits his answer';

  -- The second coach: only Inès, only his own proposal. A coach without athletes: an empty, usable review. An athlete has no review.
  r := public.zz_rv(c2, 'week', jsonb_build_object('filter', 'all'));
  assert jsonb_array_length(r->'cards') = 1 and r->'cards'->0->>'name' = 'Inès' and r->'cards'->0->'dossier'->>'id' = t[5]::text
     and position(t[1]::text in r::text) = 0 and position('Footing 45 min' in r::text) = 0, 'Coach Sam reads his own dossier of Inès only: '||r::text;
  r := public.zz_rv(c3, 'week');
  assert jsonb_array_length(r->'cards') = 0 and r->'counts'->>'athletes' = '0', 'an empty review answers';
  assert jsonb_array_length(public.zz_rv(a[1], 'week')->'cards') = 0, 'an athlete reads no review';
  -- Change of period: the week before is read on its own window; a non-Monday or a week too far is refused.
  r := public.zz_rv(c, 'week', jsonb_build_object('week', wk - 7, 'filter', 'all'));
  assert r->>'week' = (wk - 7)::text and jsonb_array_length(r->'cards') = 7, 'the previous week';
  assert public.zz_rv_err(c, 'week', jsonb_build_object('week', wk + 1)) = 'INVALID_PERIOD', 'a week starts on Monday';
  assert public.zz_rv_err(c, 'week', jsonb_build_object('week', wk - 63)) = 'INVALID_PERIOD', 'at most 8 weeks back';
  assert public.zz_rv_err(c, 'week', jsonb_build_object('filter', 'x')) = 'INVALID_INPUT', 'unknown filter';
  perform set_config('titan.rv_h', public.zz_rv_journal(), true);
end $$;

-- ---- Part 3: prepare from a template, preview, interruption and resume, revocation and pause in the middle, send once.
do $$
declare
  c uuid := current_setting('titan.rv_c')::uuid; c2 uuid := current_setting('titan.rv_c2')::uuid;
  a uuid[] := string_to_array(current_setting('titan.rv_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.rv_l'), ',')::uuid[];
  t uuid[] := string_to_array(current_setting('titan.rv_t'), ',')::uuid[]; p uuid[] := string_to_array(current_setting('titan.rv_p'), ',')::uuid[];
  wk date := current_setting('titan.rv_wk')::date; nxt date := current_date + 3; tpl uuid; r jsonb; d jsonb; d2 jsonb; s jsonb; s2 jsonb; card jsonb; n integer;
begin
  perform public.zz_rv_as(c);
  tpl := (public.titan_coach_templates_v1()->0->>'id')::uuid;
  assert public.zz_rv_err(a[3], 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl)) = 'COACH_ONLY', 'the athlete prepares nothing';
  assert public.zz_rv_err(c2, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl)) = 'SHARING_UNAVAILABLE', 'another coach reaches nothing';
  assert public.zz_rv_err(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', gen_random_uuid())) = 'TEMPLATE_UNAVAILABLE', 'an unknown template';
  assert public.zz_rv_err(c, 'prepare', jsonb_build_object('link_id', p[1], 'template_id', tpl)) = 'COACH_CAPACITY_PAUSED', 'nothing is prepared on a paused link';
  assert public.zz_rv_err(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl, 'planned_date', current_date - 1)) = 'INVALID_PERIOD', 'never in the past';

  -- From the template: the preview lists what differs from it (only the date, new).
  d := public.zz_rv(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl, 'planned_date', nxt))->'draft';
  assert d->>'state' = 'draft' and d->'basis'->>'kind' = 'template' and d->'basis'->>'title' = 'Seuil 3 × 8 min' and d->'content'->>'title' = 'Seuil 3 × 8 min'
     and jsonb_array_length(d->'changes') = 1 and d->'changes'->0->>'field' = 'planned_date' and d->'changes'->0->>'after' = nxt::text and (d->>'can_send')::boolean, 'prepared: '||d::text;
  assert public.zz_rv_count(l[3]) = 1, 'preparing sends nothing to the athlete';
  -- The coach adapts the template: the preview shows the instructions before and after.
  d := public.zz_rv(c, 'prepare', jsonb_build_object('link_id', l[3], 'revision', 1, 'instructions', 'Échauffement 20 min, 3 × 8 min au seuil, récupération 3 min'))->'draft';
  assert d->>'revision' = '2' and d->'changes'->1->>'field' = 'instructions' and d->'changes'->1->>'before' like '%récupération 2 min'
     and d->'changes'->1->>'after' like '%récupération 3 min', 'the preview of the change: '||(d->'changes')::text;
  assert public.zz_rv_err(c, 'prepare', jsonb_build_object('link_id', l[3], 'revision', 1, 'title', 'x')) = 'COACH_CONFLICT', 'a stale preview is refused';

  -- Interruption: the coach reloads, preparing again without the revision resumes the same draft, unchanged.
  r := public.zz_rv(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl));
  assert (r->>'resumed')::boolean and r->'draft'->>'id' = d->>'id' and r->'draft'->>'revision' = '2' and r->'draft'->'content'->>'instructions' like '%récupération 3 min', 'resumed: '||r::text;
  card := (select e from jsonb_array_elements(public.zz_rv(c, 'week')->'cards') e where e->>'name' = 'Zoé');
  assert card->>'next' = 'resume' and card->'draft'->>'id' = d->>'id' and card->'source'->>'kind' = 'draft', 'the review says: resume the prepared proposal: '||card::text;

  -- Revocation in the middle of the review: Noé's draft is prepared, Noé revokes, the send is refused and Noé leaves the review.
  d2 := public.zz_rv(c, 'prepare', jsonb_build_object('link_id', l[4], 'title', 'Découverte · footing 30 min', 'sport', 'running', 'planned_date', nxt))->'draft';
  assert d2->'basis'->>'kind' = 'blank' and jsonb_array_length(d2->'changes') = 4, 'a blank draft on an empty dossier: '||d2::text;
  perform public.zz_rv_portal(a[4], 'revoke', jsonb_build_object('link_id', l[4], 'revision', public.zz_rv_lrev(l[4])));
  assert public.zz_rv_err(c, 'send', jsonb_build_object('id', d2->>'id', 'revision', 1)) = 'SHARING_UNAVAILABLE', 'revoked between the read and the send: refused';
  assert public.zz_rv_err(c, 'prepare', jsonb_build_object('link_id', l[4], 'revision', 1, 'title', 'y')) = 'SHARING_UNAVAILABLE', 'and nothing more is prepared';
  assert public.zz_rv_count(l[4]) = 0 and public.zz_rv_drafts(l[4]) = 'draft', 'nothing reached Noé; the draft stays unsent';
  r := public.zz_rv(c, 'week', jsonb_build_object('filter', 'all'));
  assert position(l[4]::text in r::text) = 0 and jsonb_array_length(r->'cards') = 6, 'Noé is no longer in the review';

  -- A pause in the middle (the offer ends: 3 places): Zoé's link (third) stays, Lina's (fifth) pauses and her send is refused.
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'rv-coach-lou', false, 'canceled', 'test', clock_timestamp(), null, 'titan02', null, now(), now(), null, null);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  r := public.zz_rv(c, 'week', jsonb_build_object('filter', 'all'));
  assert (select e->>'next' from jsonb_array_elements(r->'cards') e where e->>'name' = 'Lina') = 'paused', 'Lina paused by the end of the offer: '||(r->'counts')::text;
  assert public.zz_rv_err(c, 'prepare', jsonb_build_object('link_id', l[5], 'template_id', tpl, 'planned_date', nxt)) = 'COACH_CAPACITY_PAUSED', 'nothing is prepared on it';
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'rv-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;

  -- Send: only the revision the coach previewed, once. A second send answers « already », nothing is duplicated.
  assert public.zz_rv_err(c, 'send', jsonb_build_object('id', d->>'id', 'revision', 1)) = 'COACH_CONFLICT', 'the coach sends what they previewed';
  s := public.zz_rv(c, 'send', jsonb_build_object('id', d->>'id', 'revision', 2));
  assert (s->>'ok')::boolean and not (s->>'already')::boolean and s->'draft'->>'state' = 'sent' and s->'assignment'->>'state' = 'awaiting'
     and s->'assignment'->>'title' = 'Seuil 3 × 8 min' and s->'assignment'->>'planned_date' = nxt::text and s->'assignment'->>'coach_next' = 'wait', 'sent: '||s::text;
  s2 := public.zz_rv(c, 'send', jsonb_build_object('id', d->>'id', 'revision', 2));
  assert (s2->>'already')::boolean and s2->'assignment'->>'id' = s->'assignment'->>'id', 'a second send (retry after a lost answer) creates nothing';
  assert public.zz_rv_count(l[3]) = 2, 'one new proposal for Zoé, not two';
  -- The same session prepared again (another tab after the interruption): set aside at the send, never a second proposal.
  r := public.zz_rv(c, 'prepare', jsonb_build_object('link_id', l[3], 'template_id', tpl, 'planned_date', nxt, 'instructions', 'Échauffement 20 min, 3 × 8 min au seuil, récupération 3 min'));
  assert not (r->>'resumed')::boolean and r->'draft'->>'id' <> d->>'id', 'a new draft after the send: '||r::text;
  s2 := public.zz_rv(c, 'send', jsonb_build_object('id', r->'draft'->>'id', 'revision', r->'draft'->>'revision'));
  assert (s2->>'already')::boolean and s2->>'code' = 'ALREADY_PROPOSED' and s2->'assignment'->>'id' = s->'assignment'->>'id' and s2->'draft'->>'state' = 'discarded', 'identical: attached to nothing new: '||s2::text;
  assert public.zz_rv_count(l[3]) = 2 and public.zz_rv_drafts(l[3]) = 'sent,discarded', 'still one proposal; drafts: '||public.zz_rv_drafts(l[3]);
  -- The review now says: sent, waiting for Zoé. The proposal is an ordinary one, logged as coming from the review.
  card := (select e from jsonb_array_elements(public.zz_rv(c, 'week', jsonb_build_object('filter', 'all'))->'cards') e where e->>'name' = 'Zoé');
  assert card->>'next' = 'wait' and jsonb_array_length(card->'sent') = 1 and card->'sent'->0->>'status' = 'proposed' and card->'dossier'->>'from_review' = (current_setting('titan.rv_wk'))::text,
    'Zoé: sent, awaiting her answer: '||card::text;
  r := public.zz_rv_follow(c, 'detail', jsonb_build_object('id', s->'assignment'->>'id'));
  assert exists (select 1 from jsonb_array_elements(r->'history') e where e->>'k' = 'from_review' and e->>'week' = wk::text), 'history: from the review';
  assert public.zz_rv_journal() = current_setting('titan.rv_h'), 'no review action writes the journal';
  perform set_config('titan.rv_sent', s->'assignment'->>'id', true);
end $$;

-- ---- Part 4: Zoé answers in her own space; the decision comes back in the review of the following week. Measure and export.
do $$
declare
  c uuid := current_setting('titan.rv_c')::uuid; a uuid[] := string_to_array(current_setting('titan.rv_a'), ',')::uuid[];
  l uuid[] := string_to_array(current_setting('titan.rv_l'), ',')::uuid[]; wk date := current_setting('titan.rv_wk')::date; sent uuid := current_setting('titan.rv_sent')::uuid;
  r jsonb; card jsonb;
begin
  r := public.zz_rv_follow(a[3], 'athlete');
  assert exists (select 1 from jsonb_array_elements(r->'rows') e where e->>'id' = sent::text and e->>'state' = 'awaiting' and (e->>'can_act')::boolean), 'Zoé finds it in her space';
  perform public.zz_rv_portal(a[3], 'assignment_status', jsonb_build_object('id', sent, 'revision', public.zz_rv_rev(sent), 'status', 'accepted'));
  card := (select e from jsonb_array_elements(public.zz_rv(c, 'week', jsonb_build_object('week', wk + 7, 'filter', 'all'))->'cards') e where e->>'name' = 'Zoé');
  assert jsonb_array_length(card->'previous') = 1 and card->'previous'->0->>'assignment_id' = sent::text and card->'previous'->0->>'status' = 'accepted', 'the decision comes back next week: '||card::text;
  reset role;
  r := private.titan_coach_review_measure();
  assert (r->>'sent')::int = 1 and (r->>'fromTemplate')::int = 1 and (r->>'answered')::int = 1 and (r->'drafts'->>'discarded')::int = 1 and (r->'drafts'->>'draft')::int = 1, 'measure: '||r::text;
  r := private.titan_export_extras_v1(c);
  assert jsonb_array_length(r->'coachReviewDrafts') = 3 and position('Genou' in r::text) = 0, 'the coach''s drafts are in their export: '||(r->'coachReviewDrafts')::text;
  assert not has_table_privilege('authenticated', 'private.titan_coach_review_drafts', 'select') and not has_function_privilege('anon', 'public.titan_coach_review_v1(text, jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'private.titan_coach_review_measure()', 'execute'), 'no API path to the drafts or the measure';
  set local role authenticated;
end $$;
reset role;
rollback;

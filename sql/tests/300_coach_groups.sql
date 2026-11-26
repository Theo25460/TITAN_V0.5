-- V1.9.6 — Suivi collectif individualisé (20261130101600). The scenario of the lot: Coach Lou (offer Coach, 5 places) follows EIGHT athletes
-- in one private group. Sacha ends the link; with seven current links and five places, Léa and Hugo are paused. Lou prepares one block of
-- four weeks from a template; three athletes have a different calendar: Paul starts a week later, Inès moves her Tuesdays to Wednesdays,
-- Malo moves one Saturday to the Sunday and leaves out the race. The preview lists who will receive which version and who will not, and why.
-- The send treats each recipient separately: five programmes sent, two refused for the pause, one for the ended link. A lost answer is
-- replayed (same op_id: nothing written), a second send repeats nothing and the places still hold; once the offer grows (Coach Pro) a
-- resumption serves only Léa and Hugo. Every athlete reads only their own programme. The group review gives the next action per athlete and
-- the coach's load without any personal data. Then: an athlete leaves (the link ends), the group is deleted (the programmes received stay).
-- public.training_logs is never written. Full rollback.
begin;
do $$
declare
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  names text[] := array['Zoé', 'Noé', 'Paul', 'Inès', 'Malo', 'Léa', 'Hugo', 'Sacha'];
  i integer;
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (c2, '{}'), (o, '{}');
  for i in 1..8 loop insert into auth.users(id, raw_user_meta_data) values (a[i], '{}'); end loop;
  update public.profiles set username = 'Coach Lou' where id = c;
  update public.profiles set username = 'Coach Sam' where id = c2;
  update public.profiles set username = 'Ana' where id = o;
  for i in 1..8 loop update public.profiles set username = names[i] where id = a[i]; end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_groups', false, 100, 'QA') on conflict (key) do update set enabled = false;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_programs', true, 100, 'QA') on conflict (key) do update set enabled = true;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_cycle_report', true, 100, 'QA') on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'gr-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'gr-coach-lou-pro', true, 'active', 'test', clock_timestamp(), null, 'titan03', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('titan.gr_c', c::text, true); perform set_config('titan.gr_c2', c2::text, true); perform set_config('titan.gr_o', o::text, true);
  perform set_config('titan.gr_a', array_to_string(a, ','), true);
end $$;
create function public.zz_gr_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_gr(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_gr_as(p_user); return public.titan_coach_group_v1(p_action, p_data); end $$;
create function public.zz_gr_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_gr(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_gr_pg(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_gr_as(p_user); return public.titan_coach_program_v1(p_action, p_data); end $$;
create function public.zz_gr_pg_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_gr_pg(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_gr_portal(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_gr_as(p_user); return public.titan_coach_portal(p_action, p_data); end $$;
create function public.zz_gr_follow(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_gr_as(p_user); return public.titan_coach_followup_v1(p_action, p_data); end $$;
create function public.zz_gr_link(p_coach uuid, p_athlete uuid) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := public.zz_gr_portal(p_coach, 'invite');
  return (public.zz_gr_portal(p_athlete, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 90, 'consent', true))->>'id')::uuid; end $$;
create function public.zz_gr_revoke(p_user uuid, p_link uuid) returns jsonb language plpgsql as $$
begin return public.zz_gr_portal(p_user, 'revoke', jsonb_build_object('link_id', p_link, 'revision', (select revision from public.coach_links where id = p_link))); end $$;
alter function public.zz_gr_revoke(uuid, uuid) security definer;
-- The order of acceptance decides which links a smaller offer pauses (the last ones): one minute apart, as in real life.
create function public.zz_gr_accepted(p_link uuid, p_rank integer) returns void language sql security definer as $$
  update public.coach_links set accepted_at = now() - make_interval(mins => 100 - p_rank) where id = p_link $$;
create function public.zz_gr_journal() returns text language sql security definer as $$ select coalesce(md5(string_agg(to_jsonb(l)::text, ';' order by l.id)), 'empty') from public.training_logs l $$;
create function public.zz_gr_count(p_link uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object('plans', (select count(*) from private.titan_coach_plans where link_id = p_link), 'assignments', (select count(*) from public.coach_assignments where link_id = p_link)) $$;
create function public.zz_gr_totals() returns jsonb language sql security definer as $$
  select jsonb_build_object('plans', (select count(*) from private.titan_coach_plans), 'assignments', (select count(*) from public.coach_assignments),
    'versions', (select count(*) from private.titan_coach_plan_versions), 'sends', (select count(*) from private.titan_coach_dispatch_sends)) $$;

do $$
declare
  c uuid := current_setting('titan.gr_c')::uuid; c2 uuid := current_setting('titan.gr_c2')::uuid; o uuid := current_setting('titan.gr_o')::uuid;
  a uuid[] := string_to_array(current_setting('titan.gr_a'), ',')::uuid[];
  l uuid[] := '{}'; lo uuid; i integer; v_mon date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date + 7;
  s jsonb; prog jsonb; g jsonb; d jsonb; pv jsonb; res jsonb; res2 jsonb; t0 jsonb; t1 jsonb; j0 text; e jsonb; v_txt text; v_plan jsonb; v_key text;
  zoe uuid; noe uuid; paul uuid; ines uuid; malo uuid; lea uuid; hugo uuid; sacha uuid; rev jsonb; m jsonb;
begin
  j0 := public.zz_gr_journal();
  for i in 1..8 loop l := l || public.zz_gr_link(c, a[i]); perform public.zz_gr_accepted(l[i], i); end loop;
  zoe := l[1]; noe := l[2]; paul := l[3]; ines := l[4]; malo := l[5]; lea := l[6]; hugo := l[7]; sacha := l[8];
  lo := public.zz_gr_link(c2, o);

  -- Flag closed: nothing at all.
  assert public.zz_gr_err(c, 'groups') = 'FEATURE_DISABLED', 'the closed flag refuses everything';
  update private.titan_feature_flags set enabled = true where key = 'screens.coach_groups';

  -- The template: four weeks, three sessions a week (Tuesday, Thursday, Saturday), the race on the last Saturday.
  s := '[]'::jsonb;
  for i in 1..4 loop
    s := s || jsonb_build_array(jsonb_build_object('key', 'w' || i || '-tue', 'week', i, 'day', 2, 'title', 'Fractionné ' || i, 'sport', 'running', 'instructions', '6 × 400 m'),
                                jsonb_build_object('key', 'w' || i || '-thu', 'week', i, 'day', 4, 'title', 'Footing ' || i, 'sport', 'running'),
                                jsonb_build_object('key', 'w' || i || '-sat', 'week', i, 'day', 6, 'title', case when i = 4 then 'Course 10 km' else 'Sortie longue ' || i end, 'sport', 'running'));
  end loop;
  prog := public.zz_gr_pg(c, 'save_program', jsonb_build_object('title', 'Bloc 10 km — 4 semaines', 'weeks', 4, 'goals', '["Courir 10 km en 50 min"]'::jsonb, 'sessions', s));

  -- Authorisations: an athlete has no group; another coach can neither use Lou's links nor read Lou's group.
  assert public.zz_gr_err(a[1], 'groups') = 'COACH_ONLY', 'an athlete has no group';
  assert public.zz_gr_err(c2, 'create_group', jsonb_build_object('title', 'Vol', 'link_ids', jsonb_build_array(zoe))) = 'SHARING_UNAVAILABLE', 'another coach cannot add my link';
  g := public.zz_gr(c, 'create_group', jsonb_build_object('title', 'Groupe 10 km du mardi', 'link_ids', to_jsonb(l)));
  assert public.zz_gr_err(c2, 'group', jsonb_build_object('id', g->>'id')) = 'GROUP_UNAVAILABLE', 'another coach cannot read my group';
  assert public.zz_gr_err(c, 'edit_group', jsonb_build_object('id', g->>'id', 'revision', g->'revision', 'link_ids', jsonb_build_array(zoe, lo))) = 'SHARING_UNAVAILABLE', 'a link of another coach is refused';
  assert (public.zz_gr(c, 'group', jsonb_build_object('id', g->>'id'))->'members') @> jsonb_build_array(jsonb_build_object('name', 'Sacha', 'link_state', 'active')), 'eight members';

  -- Lou prepares the block from the template while the eight are linked: eight recipients, each with the common version.
  d := public.zz_gr(c, 'prepare', jsonb_build_object('group_id', g->>'id', 'program_id', prog->>'id', 'start_date', v_mon))->'dispatch';
  assert jsonb_array_length(d->'recipients') = 8 and (d#>>'{counts,individual}')::integer = 0, 'eight recipients, no variant yet';
  assert public.zz_gr_err(c, 'prepare', jsonb_build_object('group_id', g->>'id', 'program_id', gen_random_uuid(), 'start_date', v_mon)) = 'PROGRAM_UNAVAILABLE', 'a template of mine only';
  assert public.zz_gr_err(c, 'prepare', jsonb_build_object('group_id', g->>'id', 'program_id', prog->>'id', 'start_date', v_mon + 1)) = 'INVALID_PERIOD', 'a Monday';
  -- A second block prepared then discarded before any send: nothing remains.
  e := public.zz_gr(c, 'prepare', jsonb_build_object('group_id', g->>'id', 'program_id', prog->>'id', 'start_date', v_mon + 28))->'dispatch';
  perform public.zz_gr(c, 'discard', jsonb_build_object('id', e->>'id'));
  assert public.zz_gr_err(c, 'dispatch', jsonb_build_object('id', e->>'id')) = 'DISPATCH_UNAVAILABLE', 'discarded';

  -- Sacha ends the link, and Lou's Coach Pro offer lapses (back to Coach, 5 places): seven current links for five places, Léa and Hugo
  -- (accepted last) are paused. Inviting a sixth athlete was refused by the offer; a pause only comes from fewer places.
  perform public.zz_gr_revoke(a[8], sacha);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'gr-coach-lou-pro', false, 'canceled', 'test', clock_timestamp(), null, 'titan03', null, now(), now(), null, null);
  assert private.titan_coach_capacity(c) = 5, 'five places';
  g := public.zz_gr(c, 'group', jsonb_build_object('id', g->>'id'));
  assert jsonb_array_length(g->'members') = 8, 'the ended link is still listed (30 days)';
  assert (select count(*) from jsonb_array_elements(g->'members') x where x->>'link_state' = 'paused') = 2, 'two paused';
  assert (select x - 'added_at' from jsonb_array_elements(g->'members') x where x->>'link_id' = sacha::text) = jsonb_build_object('link_id', sacha, 'link_state', 'revoked'), 'an ended link has no name';
  assert (select x->>'link_state' from jsonb_array_elements(g->'members') x where x->>'name' = 'Léa') = 'paused' and (select x->>'link_state' from jsonb_array_elements(g->'members') x where x->>'name' = 'Hugo') = 'paused', 'Léa and Hugo paused';
  assert public.zz_gr_err(c, 'edit_group', jsonb_build_object('id', g->>'id', 'revision', g->'revision', 'link_ids', jsonb_build_array(zoe, sacha))) = 'SHARING_UNAVAILABLE', 'an ended link cannot be added';
  d := public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'));

  -- Variants: Paul starts a week later, Inès moves her Tuesdays to Wednesdays, Malo moves the long run of week 2 to Sunday and skips the race.
  assert public.zz_gr_err(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', paul, 'variant', '{"shift_weeks": 9}'::jsonb)) = 'BAD_VARIANT', 'shift bounded';
  assert public.zz_gr_err(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', paul, 'variant', '{"skip": ["nope"]}'::jsonb)) = 'BAD_VARIANT', 'unknown key';
  assert public.zz_gr_err(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', paul, 'variant', '{"moves": [{"key": "w1-tue", "week": 1, "day": 9}]}'::jsonb)) = 'BAD_VARIANT', 'bad day';
  assert public.zz_gr_err(c2, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', paul, 'variant', '{}'::jsonb)) = 'DISPATCH_UNAVAILABLE', 'another coach cannot touch the block';
  d := public.zz_gr(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', paul, 'variant', '{"shift_weeks": 1}'::jsonb))->'dispatch';
  assert public.zz_gr_err(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', (d->>'revision')::integer - 1, 'link_id', ines, 'variant', '{"day_map": {"2": 3}}'::jsonb)) = 'COACH_CONFLICT', 'stale revision';
  d := public.zz_gr(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', ines, 'variant', '{"day_map": {"2": 3}}'::jsonb))->'dispatch';
  d := public.zz_gr(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', malo, 'variant', '{"moves": [{"key": "w2-sat", "week": 2, "day": 7}], "skip": ["w4-sat"]}'::jsonb))->'dispatch';

  -- The preview: who receives which version, who receives nothing and why.
  pv := public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  assert pv->'counts' = '{"recipients": 8, "individual": 3, "ready": 5, "blocked": 3, "excluded": 0, "sent": 0, "failed": 0}', 'preview counts ' || (pv->'counts')::text;
  assert (select jsonb_object_agg(coalesce(x->>'name', '(suivi arrêté)'), x->>'predict') from jsonb_array_elements(pv->'recipients') x)
       = jsonb_build_object('Zoé', 'ready', 'Noé', 'ready', 'Paul', 'ready', 'Inès', 'ready', 'Malo', 'ready', 'Léa', 'COACH_CAPACITY_PAUSED', 'Hugo', 'COACH_CAPACITY_PAUSED', '(suivi arrêté)', 'SHARING_UNAVAILABLE'),
    'predicted outcome per recipient';
  e := (select x from jsonb_array_elements(pv->'recipients') x where x->>'name' = 'Paul');
  assert (e->>'start_date')::date = v_mon + 7 and (e->>'end_date')::date = v_mon + 34 and (e->>'session_count')::integer = 12 and jsonb_array_length(e->'changes') = 0, 'Paul: one week later, same sessions';
  e := (select x from jsonb_array_elements(pv->'recipients') x where x->>'name' = 'Inès');
  assert (select count(*) from jsonb_array_elements(e->'sessions') z(y) where extract(isodow from (y->>'planned_date')::date) = 3) = 4
     and not exists (select 1 from jsonb_array_elements(e->'sessions') z(y) where extract(isodow from (y->>'planned_date')::date) = 2)
     and jsonb_array_length(e->'changes') = 4, 'Inès: Wednesdays instead of Tuesdays';
  e := (select x from jsonb_array_elements(pv->'recipients') x where x->>'name' = 'Malo');
  assert (e->>'session_count')::integer = 11 and (select string_agg(x->>'kind' || ':' || (x->>'key'), ',' order by x->>'key') from jsonb_array_elements(e->'changes') x) = 'changed:w2-sat,removed:w4-sat'
     and (select (y->>'planned_date')::date from jsonb_array_elements(e->'sessions') z(y) where y->>'key' = 'w2-sat') = v_mon + 13, 'Malo: Sunday, no race';
  e := (select x from jsonb_array_elements(pv->'recipients') x where x->>'link_state' = 'revoked');
  assert not (e ? 'name') and not (e ? 'sessions') and not (e ? 'plan_id'), 'the ended link shows no name and no version';

  -- The send needs the preview the coach read: a change since (a variant) refuses it and writes nothing.
  v_key := pv->>'preview_key';
  t0 := public.zz_gr_totals();
  d := public.zz_gr(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', pv->'revision', 'link_id', zoe, 'variant', '{}'::jsonb))->'dispatch';
  assert public.zz_gr_err(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', v_key, 'op_id', gen_random_uuid())) = 'COACH_CONFLICT', 'stale preview';
  assert public.zz_gr_totals() = t0, 'nothing written on a stale preview';
  pv := public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'));

  -- The send: each recipient separately.
  perform set_config('titan.gr_op1', gen_random_uuid()::text, true);
  res := public.zz_gr(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', pv->>'preview_key', 'op_id', current_setting('titan.gr_op1')));
  assert (res->>'already')::boolean is false, 'first send';
  assert (select jsonb_object_agg(coalesce(x->>'name', '(suivi arrêté)'), coalesce(x->>'error', x->>'status')) from jsonb_array_elements(res->'results') x)
       = jsonb_build_object('Zoé', 'sent', 'Noé', 'sent', 'Paul', 'sent', 'Inès', 'sent', 'Malo', 'sent', 'Léa', 'COACH_CAPACITY_PAUSED', 'Hugo', 'COACH_CAPACITY_PAUSED', '(suivi arrêté)', 'SHARING_UNAVAILABLE'),
    'per-recipient results ' || (res->'results')::text;
  assert res#>'{dispatch,counts}' @> '{"sent": 5, "failed": 3}', 'five sent, three failed';
  assert public.zz_gr_count(zoe) = '{"plans":1,"assignments":12}' and public.zz_gr_count(paul) = '{"plans":1,"assignments":12}' and public.zz_gr_count(malo) = '{"plans":1,"assignments":11}', 'one programme each';
  assert public.zz_gr_count(lea) = '{"plans":0,"assignments":0}' and public.zz_gr_count(hugo) = '{"plans":0,"assignments":0}' and public.zz_gr_count(sacha) = '{"plans":0,"assignments":0}', 'nothing for the refused';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert (select min(planned_date) from public.coach_assignments where link_id = paul) = v_mon + 8, 'Paul starts on the Tuesday of the next week';
  assert (select count(*) from public.coach_assignments where link_id = ines and extract(isodow from planned_date) = 3) = 4, 'Inès on Wednesdays';
  assert (select count(*) from public.coach_assignments where link_id = noe and status = 'proposed' and plan_id is not null) = 12, 'ordinary proposals of a programme';
  assert (select count(*) from private.titan_coach_plans where basis->>'dispatch' = d->>'id' and state = 'sent') = 5, 'five programmes from the block';

  -- A lost answer replayed: same results, nothing written.
  t1 := public.zz_gr_totals();
  res2 := public.zz_gr(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', 'whatever', 'op_id', current_setting('titan.gr_op1')));
  assert (res2->>'already')::boolean and res2->'results' = res->'results', 'replay returns the same results';
  assert public.zz_gr_totals() = t1, 'replay writes nothing';
  -- A second send (new op, fresh preview): only the three remaining are tried; the places still hold; nothing is repeated.
  pv := public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  assert pv->'counts' @> '{"ready": 0, "blocked": 3, "sent": 5}', 'nothing ready while the places are full';
  res2 := public.zz_gr(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', pv->>'preview_key', 'op_id', gen_random_uuid()));
  assert jsonb_array_length(res2->'results') = 3 and not exists (select 1 from jsonb_array_elements(res2->'results') x where x->>'status' = 'sent'), 'second send: only the three, all still refused';
  assert (public.zz_gr_totals() - 'sends') = (t1 - 'sends'), 'second send repeats nothing';
  assert (select count(*) from public.coach_links l where l.coach_id = c and l.revoked_at is null and private.titan_coach_link_active(l.id)) = 5, 'five places, five active';

  -- Lou takes Coach Pro again (15 places): a resumption serves Léa and Hugo only, never the five already served.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'gr-coach-lou-pro', true, 'active', 'test', clock_timestamp(), null, 'titan03', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  assert private.titan_coach_capacity(c) = 15, 'fifteen places';
  pv := public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  assert pv->'counts' @> '{"ready": 2, "blocked": 1, "sent": 5}', 'Léa and Hugo ready';
  res2 := public.zz_gr(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', pv->>'preview_key', 'op_id', gen_random_uuid()));
  assert (select jsonb_object_agg(coalesce(x->>'name', '(suivi arrêté)'), coalesce(x->>'error', x->>'status')) from jsonb_array_elements(res2->'results') x)
       = '{"Léa": "sent", "Hugo": "sent", "(suivi arrêté)": "SHARING_UNAVAILABLE"}', 'resumption ' || (res2->'results')::text;
  assert public.zz_gr_count(zoe) = '{"plans":1,"assignments":12}' and public.zz_gr_count(lea) = '{"plans":1,"assignments":12}', 'no duplicate, Léa served';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert (select attempts from private.titan_coach_dispatch_recipients where link_id = lea) = 3 and (select attempts from private.titan_coach_dispatch_recipients where link_id = zoe) = 1, 'attempts per recipient';
  assert (select completed_at from private.titan_coach_dispatches where id = (d->>'id')::uuid) is null, 'incomplete while Sacha is not excluded';
  -- The coach leaves the ended link out: the block is complete at the next send, which sends nothing.
  pv := public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  pv := public.zz_gr(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', pv->'revision', 'link_id', sacha, 'excluded', true))->'dispatch';
  assert public.zz_gr_err(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', pv->'revision', 'link_id', zoe, 'variant', '{"shift_weeks": 1}'::jsonb)) = 'ALREADY_SENT', 'a sent version is not edited from the block';
  res2 := public.zz_gr(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', pv->>'preview_key', 'op_id', gen_random_uuid()));
  assert res2->'results' = '[]' and res2#>>'{dispatch,completed_at}' is not null, 'complete';
  assert public.zz_gr_err(c, 'discard', jsonb_build_object('id', d->>'id')) = 'ALREADY_SENT', 'a sent block is not discarded';

  -- Confidentiality: each athlete reads only their programme; no group, no other athlete, no variant, no basis.
  v_txt := public.zz_gr_pg(a[1], 'athlete')::text;
  assert jsonb_array_length(public.zz_gr_pg(a[1], 'athlete')->'plans') = 1, 'Zoé: one programme';
  assert v_txt not like '%Groupe 10 km%' and v_txt not like '%Noé%' and v_txt not like '%Inès%' and v_txt not like '%' || noe::text || '%' and v_txt not like '%variant%'
     and v_txt not like '%dispatch%' and v_txt not like '%basis%' and v_txt not like '%' || (d->>'id') || '%', 'nothing of the group in Zoé''s view';
  v_plan := public.zz_gr_pg(a[4], 'athlete')#>'{plans,0}';
  assert public.zz_gr_pg_err(a[1], 'plan', jsonb_build_object('id', v_plan->>'id')) = 'SHARING_UNAVAILABLE', 'Zoé cannot open Inès''s programme';
  assert public.zz_gr_pg_err(a[1], 'link', jsonb_build_object('link_id', ines)) = 'SHARING_UNAVAILABLE', 'nor her link';
  v_txt := public.zz_gr_follow(a[1], 'athlete')::text;
  assert v_txt not like '%Inès%' and v_txt not like '%Groupe 10 km%', 'nor through the follow-up';
  assert public.zz_gr_err(a[1], 'dispatch', jsonb_build_object('id', d->>'id')) = 'COACH_ONLY' and public.zz_gr_err(a[1], 'review', jsonb_build_object('id', g->>'id')) = 'COACH_ONLY', 'no group read for an athlete';

  -- The athletes answer: Zoé accepts all, Noé asks to discuss one session, Paul says nothing yet.
  perform public.zz_gr_pg(a[1], 'answer', jsonb_build_object('id', public.zz_gr_pg(a[1], 'athlete')#>>'{plans,0,id}', 'all', 'accept'));
  v_plan := public.zz_gr_pg(a[2], 'athlete')#>'{plans,0}';
  perform public.zz_gr_pg(a[2], 'answer', jsonb_build_object('id', v_plan->>'id', 'decisions', jsonb_build_array(jsonb_build_object('key', 'w1-tue', 'answer', 'discuss', 'note', 'Genou fragile, je préfère des côtes'))));

  -- The group review: the next action per athlete and the coach's load; counts and states only.
  rev := public.zz_gr(c, 'review', jsonb_build_object('id', g->>'id'));
  assert (select jsonb_object_agg(x->>'name', x#>>'{review,next}') from jsonb_array_elements(rev->'members') x where x ? 'name')
       = '{"Zoé": "none", "Noé": "discuss", "Paul": "wait_answer", "Inès": "wait_answer", "Malo": "wait_answer", "Léa": "wait_answer", "Hugo": "wait_answer"}', 'next actions ' || (rev->'members')::text;
  assert rev->'load' @> '{"members_active": 7, "members_paused": 0, "members_ended": 1, "to_discuss": 1, "feedback": 0, "cases": 1, "with_action": 1, "reports": 0, "capacity": 15, "links_used": 7}', 'load ' || (rev->'load')::text;
  assert (rev->'load'->>'awaiting')::integer = 12 * 4 + 11 + 11, 'answers awaited';
  v_txt := rev::text;
  assert v_txt not like '%Genou%' and v_txt not like '%6 × 400%' and v_txt not like '%instructions%' and v_txt not like '%session_id%', 'no note, no instruction, no journal id in the review';
  -- The individual view (V1.9.1) still shows the discussion to the coach, through the link.
  assert public.zz_gr_follow(c, 'list', jsonb_build_object('link_id', noe))::text like '%Genou fragile%', 'the individual view is where the details are';

  -- A link ends: Malo leaves; the group shows « suivi arrêté », the review has no row for them, Malo keeps their programme read-only.
  perform public.zz_gr_revoke(a[5], malo);
  rev := public.zz_gr(c, 'review', jsonb_build_object('id', g->>'id'));
  assert rev->'load' @> '{"members_active": 6, "members_ended": 2}', 'Malo left';
  assert not exists (select 1 from jsonb_array_elements(rev->'members') x where x->>'name' = 'Malo' or (x->>'link_state' = 'revoked' and x ? 'review')), 'no name, no review for an ended link';
  assert jsonb_array_length(public.zz_gr_pg(a[5], 'athlete')->'plans') = 1 and public.zz_gr_pg(a[5], 'athlete')#>>'{plans,0,link_state}' = 'revoked', 'Malo keeps a read-only programme';
  assert (public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'))->'recipients') @> jsonb_build_array(jsonb_build_object('link_id', malo, 'link_state', 'revoked', 'status', 'sent'))
     and not ((select x from jsonb_array_elements(public.zz_gr(c, 'dispatch', jsonb_build_object('id', d->>'id'))->'recipients') x where x->>'link_id' = malo::text) ? 'plan_id'), 'the block forgets Malo''s name and programme';

  -- Export: the coach finds their groups; an athlete finds none.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert jsonb_array_length(private.titan_export_extras_v1(c)->'coachGroups') = 1 and private.titan_export_extras_v1(a[1])->'coachGroups' = '[]', 'export';
  assert private.titan_export_extras_v1(a[1]) ? 'coachCycleReports', 'the previous export is kept';

  -- Measure (team only, before the group is deleted): seven programmes from one block, three individual, four sends, the refusals by reason.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  m := private.titan_coach_group_measure();
  assert m @> '{"groups": 1, "dispatches": 1, "dispatchesComplete": 1, "recipients": {"sent": 7, "excluded": 1}, "sends": 4, "resumed": 2, "individual": 3, "individualSent": 3,
               "duplicatePlans": 0, "refusals": {"COACH_CAPACITY_PAUSED": 4, "SHARING_UNAVAILABLE": 3}, "refusedNow": {}, "programsSentPerBlock": 7}', 'measure ' || m::text;

  -- Delete the group: the group and its blocks go; every programme received stays, with its answers.
  t1 := public.zz_gr_totals() - 'sends';
  perform public.zz_gr(c, 'delete_group', jsonb_build_object('id', g->>'id'));
  assert public.zz_gr_err(c, 'group', jsonb_build_object('id', g->>'id')) = 'GROUP_UNAVAILABLE', 'deleted';
  assert public.zz_gr_totals() - 'sends' = t1, 'the programmes received stay';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert not exists (select 1 from private.titan_coach_dispatches where id = (d->>'id')::uuid) and not exists (select 1 from private.titan_coach_dispatch_recipients where dispatch_id = (d->>'id')::uuid), 'blocks gone';
  assert (select count(*) from public.coach_assignments where link_id = zoe and status = 'accepted') = 12, 'Zoé''s answers stay';
  assert jsonb_array_length(public.zz_gr_pg(a[1], 'athlete')->'plans') = 1, 'Zoé still reads her programme';
  assert public.zz_gr_pg(c, 'plan', jsonb_build_object('id', public.zz_gr_pg(a[2], 'athlete')#>>'{plans,0,id}'))->>'title' = 'Bloc 10 km — 4 semaines', 'the coach keeps the individual programme';

  -- The journal was never written.
  assert public.zz_gr_journal() = j0, 'journal untouched';
  -- Nobody but the server reads the tables.
  assert not has_table_privilege('authenticated', 'private.titan_coach_groups', 'select') and not has_table_privilege('anon', 'private.titan_coach_dispatch_recipients', 'select'), 'tables private';
  assert not has_function_privilege('authenticated', 'private.titan_coach_group_measure()', 'execute') and not has_function_privilege('anon', 'public.titan_coach_group_v1(text, jsonb)', 'execute'), 'functions';
  perform set_config('request.jwt.claims', '{}', true);
  raise notice 'coach groups: OK';
end $$;
rollback;

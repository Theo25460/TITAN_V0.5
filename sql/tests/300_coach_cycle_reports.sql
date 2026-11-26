-- V1.9.5 — Bilans de cycle partageables (20261205090000). The scenario of the lot, on a cycle of SIX weeks (18 sessions): Coach Lou sends
-- it to Inès, who accepts 16 sessions, declines one and leaves one unanswered; she moves a long run to the Sunday and a Tuesday run to the
-- next week (V1.9.1), the coach moves one session by a day (a revision she accepts). Seven weeks later (the cycle is aged by 49 days, as
-- if they had passed) nine sessions are linked to her journal, one is declared done, the cycle is closed. The coach opens the report: the
-- figures, each with its period and its sources. Inès archives one journal session: the totals follow. The coach writes two observations
-- tied to source sessions and three decisions, and proposes the report. Nothing private is in it: Inès ticks the measures (all but one),
-- two notes and one check-in, approves two decisions, allows a file. The published version is compared with the reference figures. Then:
-- the coach downloads a file; Inès retracts a note (gone from the hosted version, from every stored version and from the next export);
-- she archives a session (the hosted totals follow); she withdraws the access (the coach reads nothing, even directly); she validates again;
-- she narrows her sharing (the hosted version is suspended until a new validation); the coach revises the report (she sends it back, then
-- validates); the next cycle takes ONLY the approved objectives and keeps where they come from; the offer's places drop (paused); she
-- revokes the link (the coach reads nothing by any identifier, she keeps a read-only view for a year). public.training_logs is never
-- written by the report. Full rollback.
begin;
do $$
declare
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  names text[] := array['Zoé', 'Noé', 'Paul', 'Inès', 'Malo'];
  i integer;
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (c2, '{}');
  for i in 1..5 loop insert into auth.users(id, raw_user_meta_data) values (a[i], '{}'); end loop;
  update public.profiles set username = 'Coach Lou' where id = c;
  update public.profiles set username = 'Coach Sam' where id = c2;
  for i in 1..5 loop update public.profiles set username = names[i] where id = a[i]; end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_cycle_report', false, 100, 'QA') on conflict (key) do update set enabled = false;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_programs', true, 100, 'QA') on conflict (key) do update set enabled = true;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'cy-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('titan.cy_c', c::text, true); perform set_config('titan.cy_c2', c2::text, true); perform set_config('titan.cy_a', array_to_string(a, ','), true);
end $$;
create function public.zz_cy_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_cy(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_cy_as(p_user); return public.titan_coach_cycle_v1(p_action, p_data); end $$;
create function public.zz_cy_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_cy(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_cy_pg(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_cy_as(p_user); return public.titan_coach_program_v1(p_action, p_data); end $$;
create function public.zz_cy_portal(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_cy_as(p_user); return public.titan_coach_portal(p_action, p_data); end $$;
create function public.zz_cy_follow(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_cy_as(p_user); return public.titan_coach_followup_v1(p_action, p_data); end $$;
create function public.zz_cy_link(p_coach uuid, p_athlete uuid) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := public.zz_cy_portal(p_coach, 'invite');
  return (public.zz_cy_portal(p_athlete, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 90, 'consent', true))->>'id')::uuid; end $$;
create function public.zz_cy_row(p_plan uuid, p_key text) returns public.coach_assignments language sql security definer as $$ select * from public.coach_assignments where plan_id = p_plan and plan_key = p_key $$;
create function public.zz_cy_journal() returns text language sql security definer as $$ select coalesce(md5(string_agg(to_jsonb(l)::text, ';' order by l.id)), 'empty') from public.training_logs l $$;
-- Time passes: the programme and its proposals move back by p_days (a multiple of 7), including the date each session was first proposed for.
create function public.zz_cy_age(p_plan uuid, p_days integer) returns void language plpgsql security definer as $$
begin
  update private.titan_coach_plans set start_date = start_date - p_days, created_at = created_at - make_interval(days => p_days), sent_at = sent_at - make_interval(days => p_days) where id = p_plan;
  update public.coach_assignments set planned_date = planned_date - p_days, moved_date = moved_date - p_days, created_at = created_at - make_interval(days => p_days),
    accepted_version = case when accepted_version is null then null else jsonb_set(accepted_version, '{planned_date}', to_jsonb((accepted_version->>'planned_date')::date - p_days)) end,
    history = jsonb_set(history, '{0,version,planned_date}', to_jsonb((history#>>'{0,version,planned_date}')::date - p_days))
   where plan_id = p_plan;
end $$;
create function public.zz_cy_log(p_user uuid, p_sport text, p_day date, p_val numeric, p_unit text, p_minutes integer, p_note text default null) returns uuid language plpgsql security definer as $$
declare v uuid := gen_random_uuid(); begin
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at)
    values (v, p_user, p_sport, p_val, p_unit, 10, (p_day + time '07:00') at time zone 'Europe/Paris', jsonb_strip_nulls(jsonb_build_object('duration', p_minutes, 'note', p_note)), (p_day + time '07:00') at time zone 'Europe/Paris');
  set local session_replication_role = origin;
  return v; end $$;
-- The athlete archives a session of their journal (their own act, outside the report).
create function public.zz_cy_archive(p_log uuid) returns void language plpgsql security definer as $$
begin set local session_replication_role = replica; update public.training_logs set archived_at = now() where id = p_log; set local session_replication_role = origin; end $$;
create function public.zz_cy_checkin(p_link uuid, p_week date, p_scores jsonb, p_note text, p_shared boolean) returns void language sql security definer as $$
  insert into private.titan_coach_checkins(link_id, week_start, scores, note, shared) values (p_link, p_week, p_scores, p_note, p_shared) $$;
create function public.zz_cy_stored(p_report uuid) returns text language sql security definer as $$
  select string_agg(v.content::text, ' ' order by v.version) from private.titan_coach_cycle_report_versions v where v.report_id = p_report $$;
create function public.zz_cy_fig(p_totals jsonb, p_id text, p_unit text default null) returns jsonb language sql immutable as $$
  select f from jsonb_array_elements(p_totals->'figures') f where f->>'id' = p_id and (p_unit is null or f->>'unit' = p_unit) $$;
create function public.zz_cy_session(p jsonb, p_key text) returns jsonb language sql immutable as $$ select e from jsonb_array_elements(p->'sessions') e where e->>'key' = p_key $$;
grant execute on function public.zz_cy_as(uuid), public.zz_cy(uuid, text, jsonb), public.zz_cy_err(uuid, text, jsonb), public.zz_cy_pg(uuid, text, jsonb), public.zz_cy_portal(uuid, text, jsonb),
  public.zz_cy_follow(uuid, text, jsonb), public.zz_cy_link(uuid, uuid), public.zz_cy_row(uuid, text), public.zz_cy_journal(), public.zz_cy_age(uuid, integer),
  public.zz_cy_log(uuid, text, date, numeric, text, integer, text), public.zz_cy_archive(uuid), public.zz_cy_checkin(uuid, date, jsonb, text, boolean), public.zz_cy_stored(uuid),
  public.zz_cy_fig(jsonb, text, text), public.zz_cy_session(jsonb, text) to authenticated;

-- ---- Part 0: the links, as the service orders them (Zoé, Noé, Paul first; Inès fourth, Malo fifth: paused if the offer drops to 3).
set local role authenticated;
do $$
declare c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; l uuid[] := array[]::uuid[]; i integer;
begin
  for i in 1..5 loop l := l || public.zz_cy_link(c, a[i]); end loop;
  perform set_config('titan.cy_l', array_to_string(l, ','), true);
end $$;
reset role;
do $$
declare l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[]; i integer;
begin
  for i in 1..5 loop update public.coach_links set accepted_at = now() - make_interval(mins => 10 - i) where id = l[i]; end loop;
end $$;
set local role authenticated;

-- ---- Part 1: six weeks sent to Inès; her answers, two moves of hers, one of the coach. Then seven weeks pass.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[];
  wk date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date; s jsonb := '[]'::jsonb; w integer; r jsonb; p uuid; x public.coach_assignments; dec jsonb; dry jsonb;
begin
  for w in 1..6 loop
    s := s || jsonb_build_array(
      jsonb_build_object('key', 'w' || w || '-tue', 'week', w, 'day', 2, 'title', case when w % 2 = 0 then 'Fractionné 6 × 400 m' else 'Footing 40 min' end, 'sport', 'running'),
      jsonb_build_object('key', 'w' || w || '-thu', 'week', w, 'day', 4, 'title', 'Renforcement 30 min', 'sport', 'muscu_home'),
      jsonb_build_object('key', 'w' || w || '-sat', 'week', w, 'day', 6, 'title', 'Sortie longue ' || (8 + 2 * w) || ' km', 'sport', 'running'));
  end loop;
  r := public.zz_cy_pg(c, 'save_program', jsonb_build_object('title', 'Course et renforcement — 6 semaines', 'weeks', 6, 'goals', '["Courir 10 km en aisance"]'::jsonb, 'sessions', s));
  r := public.zz_cy_pg(c, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', r->>'id', 'start_date', wk + 7))->'plan';
  p := (r->>'id')::uuid;
  perform public.zz_cy_pg(c, 'send', jsonb_build_object('id', p, 'revision', r->'revision'));
  -- Inès: 16 accepted, the strength session of week 4 declined, the long run of week 6 left unanswered.
  dec := (select jsonb_agg(jsonb_build_object('key', e->>'key', 'answer', case e->>'key' when 'w4-thu' then 'decline' else 'accept' end)) from jsonb_array_elements(s) e where e->>'key' <> 'w6-sat');
  perform public.zz_cy_pg(a[4], 'answer', jsonb_build_object('id', p, 'decisions', dec));
  -- She moves the long run of week 2 to the Sunday (same week) and the Tuesday run of week 3 to the next Tuesday (week 4).
  x := public.zz_cy_row(p, 'w2-sat'); perform public.zz_cy_follow(a[4], 'move', jsonb_build_object('id', x.id, 'revision', x.revision, 'date', x.planned_date + 1));
  x := public.zz_cy_row(p, 'w3-tue'); perform public.zz_cy_follow(a[4], 'move', jsonb_build_object('id', x.id, 'revision', x.revision, 'date', x.planned_date + 7));
  -- The coach moves the Tuesday of week 5 to the Wednesday; she accepts the change.
  x := public.zz_cy_row(p, 'w5-tue');
  dry := public.zz_cy_pg(c, 'revise', jsonb_build_object('id', p, 'scope', 'occurrence', 'key', 'w5-tue', 'planned_date', x.planned_date + 1, 'dry_run', true));
  perform public.zz_cy_pg(c, 'revise', jsonb_build_object('id', p, 'scope', 'occurrence', 'key', 'w5-tue', 'planned_date', x.planned_date + 1, 'preview_key', dry->>'preview_key', 'op_id', gen_random_uuid()));
  perform public.zz_cy_pg(a[4], 'answer', jsonb_build_object('id', p, 'decisions', '[{"key":"w5-tue","answer":"accept_change"}]'::jsonb));
  perform public.zz_cy_age(p, 49);
  perform set_config('titan.cy_p', p::text, true); perform set_config('titan.cy_start', (wk - 42)::text, true);
end $$;
-- Her journal over those weeks (her own sessions), then what she linked (V1.9.1), one session declared done, and the cycle closed.
reset role;
do $$
declare a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; p uuid := current_setting('titan.cy_p')::uuid; d0 date := current_setting('titan.cy_start')::date; ids jsonb := '{}'::jsonb;
begin
  ids := ids || jsonb_build_object(
    'w1-tue', public.zz_cy_log(a[4], 'running', d0 + 1, 8, 'km', 45, 'Bonnes jambes'),
    'w1-thu', public.zz_cy_log(a[4], 'muscu_home', d0 + 3, 120, 'reps', 30),
    'w1-sat', public.zz_cy_log(a[4], 'running', d0 + 5, 10, 'km', 60, 'Genou sensible à la fin'),
    'w2-tue', public.zz_cy_log(a[4], 'running', d0 + 8, 7, 'km', 40),
    'w2-sat', public.zz_cy_log(a[4], 'running', d0 + 13, 12, 'km', 75, 'Sortie décalée, bien passée'),
    'w3-tue', public.zz_cy_log(a[4], 'running', d0 + 22, 8, 'km', 44),
    'w3-sat', public.zz_cy_log(a[4], 'running', d0 + 19, 14, 'km', 85),
    'w5-tue', public.zz_cy_log(a[4], 'running', d0 + 30, 9, 'km', 50),
    'w5-sat', public.zz_cy_log(a[4], 'running', d0 + 33, 16, 'km', 100));
  perform set_config('titan.cy_logs', ids::text, true);
end $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; p uuid := current_setting('titan.cy_p')::uuid;
  ids jsonb := current_setting('titan.cy_logs')::jsonb; k text; x public.coach_assignments; r jsonb;
begin
  for k in select jsonb_object_keys(ids) loop
    x := public.zz_cy_row(p, k);
    r := public.zz_cy_follow(a[4], 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', ids->>k));
    assert (r->>'ok')::boolean, 'linked ' || k || ': ' || r::text;
  end loop;
  x := public.zz_cy_row(p, 'w4-tue'); perform public.zz_cy_follow(a[4], 'declare_done', jsonb_build_object('id', x.id, 'revision', x.revision, 'done', true));
  r := public.zz_cy_pg(c, 'plan', jsonb_build_object('id', p));
  r := public.zz_cy_pg(c, 'close', jsonb_build_object('id', p, 'revision', r->'revision'));
  assert r#>>'{plan,state}' = 'closed' and r#>>'{plan,counts,cancelled}' = '1' and r#>>'{plan,counts,linked}' = '9', 'cycle closed: one unanswered session cancelled, nine linked: '||(r#>'{plan,counts}')::text;
  perform set_config('titan.cy_journal', public.zz_cy_journal(), true);
end $$;

-- ---- Part 2: the coach opens the report. Every figure has its period and its sources; an archive in the journal changes the totals.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; c2 uuid := current_setting('titan.cy_c2')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[];
  l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[]; p uuid := current_setting('titan.cy_p')::uuid; d0 date := current_setting('titan.cy_start')::date;
  ids jsonb := current_setting('titan.cy_logs')::jsonb; r jsonb; t jsonb; rid uuid; f jsonb;
begin
  assert public.zz_cy_err(c, 'start', jsonb_build_object('plan_id', p)) = 'FEATURE_DISABLED', 'closed flag: refused by the server';
  reset role; update private.titan_feature_flags set enabled = true where key = 'screens.coach_cycle_report'; set local role authenticated;
  assert public.zz_cy_err(c2, 'start', jsonb_build_object('plan_id', p)) = 'SHARING_UNAVAILABLE', 'another coach cannot open it';
  assert public.zz_cy_err(a[4], 'start', jsonb_build_object('plan_id', p)) = 'COACH_ONLY', 'the athlete does not open the coach''s draft';
  assert public.zz_cy_err(a[5], 'report', jsonb_build_object('plan_id', p)) = 'SHARING_UNAVAILABLE', 'another athlete reads nothing';
  r := public.zz_cy(c, 'start', jsonb_build_object('plan_id', p));
  rid := (r#>>'{report,id}')::uuid;
  assert (r->>'ok')::boolean and not (r->>'already')::boolean and r#>>'{report,state}' = 'draft' and r#>>'{report,hosted}' = 'none', 'report opened as a draft';
  assert (public.zz_cy(c, 'start', jsonb_build_object('plan_id', p))->>'already')::boolean and (select count(*) from jsonb_array_elements(public.zz_cy(c, 'link', jsonb_build_object('link_id', l[4]))->'reports')) = 1, 'opened once';
  assert public.zz_cy_err(a[4], 'report', jsonb_build_object('id', rid)) = 'REPORT_UNAVAILABLE' and jsonb_array_length(public.zz_cy(a[4], 'athlete')->'reports') = 0
     and jsonb_array_length(public.zz_cy(a[4], 'link', jsonb_build_object('link_id', l[4]))->'reports') = 0, 'a draft is invisible to the athlete';
  -- The figures before the archive: 18 proposed, 16 accepted, 9 done, 3 moved, 1 declared, 6 open… 84 km over 8 runs, 529 minutes over 9 sessions.
  t := r#>'{report,draft,totals}';
  assert t#>>'{period,from}' = d0::text and t#>>'{period,to}' = (d0 + 41)::text and t#>>'{period,weeks}' = '6', 'the period of the cycle: six weeks';
  assert public.zz_cy_fig(t, 'proposed')->>'n' = '18' and public.zz_cy_fig(t, 'accepted')->>'n' = '16' and public.zz_cy_fig(t, 'done')->>'n' = '9' and public.zz_cy_fig(t, 'moved')->>'n' = '3'
     and public.zz_cy_fig(t, 'declared')->>'n' = '1' and public.zz_cy_fig(t, 'open')->>'n' = '6' and public.zz_cy_fig(t, 'declined')->>'n' = '1' and public.zz_cy_fig(t, 'cancelled')->>'n' = '1'
     and public.zz_cy_fig(t, 'archived') is null and public.zz_cy_fig(t, 'awaiting') is null, 'counts before the archive: '||(t->'figures')::text;
  assert (public.zz_cy_fig(t, 'volume', 'km')->>'value')::numeric = 84 and public.zz_cy_fig(t, 'volume', 'km')->>'n' = '8' and (public.zz_cy_fig(t, 'duration')->>'value')::numeric = 529
     and (public.zz_cy_fig(t, 'volume', 'reps')->>'value')::numeric = 120, 'measures before the archive';
  -- Inès archives the long run of week 3 in her journal: it is no longer « done », its measure leaves the totals, nothing is counted twice.
  perform public.zz_cy_archive((ids->>'w3-sat')::uuid);
  perform set_config('titan.cy_journal', public.zz_cy_journal(), true);
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  t := r#>'{draft,totals}';
  assert public.zz_cy_fig(t, 'proposed')->>'n' = '18' and public.zz_cy_fig(t, 'accepted')->>'n' = '16' and public.zz_cy_fig(t, 'done')->>'n' = '8' and public.zz_cy_fig(t, 'moved')->>'n' = '3'
     and public.zz_cy_fig(t, 'declared')->>'n' = '1' and public.zz_cy_fig(t, 'open')->>'n' = '6' and public.zz_cy_fig(t, 'declined')->>'n' = '1' and public.zz_cy_fig(t, 'cancelled')->>'n' = '1'
     and public.zz_cy_fig(t, 'archived')->>'n' = '1', 'counts after the archive (8 done + 1 declared + 6 open + 1 declined + 1 cancelled + 1 archived = 18): '||(t->'figures')::text;
  assert (public.zz_cy_fig(t, 'volume', 'km')->>'value')::numeric = 70 and public.zz_cy_fig(t, 'volume', 'km')->>'n' = '7' and (public.zz_cy_fig(t, 'duration')->>'value')::numeric = 444
     and public.zz_cy_fig(t, 'duration')->>'n' = '8', 'measures after the archive: 70 km over 7 runs, 444 minutes over 8 sessions';
  -- Each figure: its period and its sources.
  f := public.zz_cy_fig(t, 'moved');
  assert f->'sources' = '["w2-sat", "w3-tue", "w5-tue"]' and f#>>'{period,from}' = d0::text and f#>>'{period,to}' = (d0 + 41)::text, 'moved: three sessions, named: '||f::text;
  assert public.zz_cy_fig(t, 'archived')->'sources' = '["w3-sat"]' and public.zz_cy_fig(t, 'declared')->'sources' = '["w4-tue"]' and public.zz_cy_fig(t, 'declined')->'sources' = '["w4-thu"]'
     and public.zz_cy_fig(t, 'cancelled')->'sources' = '["w6-sat"]' and jsonb_array_length(public.zz_cy_fig(t, 'volume', 'km')->'sources') = 7, 'sources of each figure';
  -- Week by week, a session counts where it now stands: the run moved from week 3 is in week 4, the long run moved to Sunday stays in week 2.
  assert (select jsonb_agg(jsonb_build_array(w->'planned', w->'done', w->'moved') order by (w->>'week')::integer) from jsonb_array_elements(t->'weeks') w)
       = '[[3,3,0],[3,2,1],[2,0,0],[3,2,1],[3,2,1],[2,0,0]]', 'weeks (planned, done, moved): '||(t->'weeks')::text;
  assert (select sum((w->>'planned')::integer) from jsonb_array_elements(t->'weeks') w) = 16 and t->'outside' is null, 'every session counted once';
  assert t#>>'{weeks,3,period,from}' = (d0 + 21)::text and t#>'{weeks,3,sources}' ? 'w3-tue' and not t#>'{weeks,2,sources}' ? 'w3-tue', 'week 4 names the moved run as a source';
  -- What the coach reads of each session: the facts, the measure inside the link's scope — never a note, never a check-in, never a journal id.
  f := public.zz_cy_session(r->'draft', 'w2-sat');
  assert f->>'outcome' = 'done' and (f->>'moved')::boolean and f->>'moved_by' = 'athlete' and f->>'first_date' = (d0 + 12)::text and f->>'effective_date' = (d0 + 13)::text
     and f#>>'{measure,val}' = '12' and f#>>'{measure,day}' = (d0 + 13)::text and not f ? 'note' and not f ? 'ref' and not f ? 'session_id', 'a moved session done: '||f::text;
  assert public.zz_cy_session(r->'draft', 'w5-tue')->>'moved_by' = 'coach' and public.zz_cy_session(r->'draft', 'w3-sat')->>'outcome' = 'archived'
     and not public.zz_cy_session(r->'draft', 'w3-sat') ? 'measure' and public.zz_cy_session(r->'draft', 'w4-tue')->>'outcome' = 'declared', 'coach move, archive, declaration';
  assert r::text not like '%Genou%' and r::text not like '%Bonnes jambes%' and not (r->'draft') ? 'checkins', 'no private note in the coach''s working copy';
  perform set_config('titan.cy_r', rid::text, true);
end $$;

-- ---- Part 3: two observations tied to source sessions, three decisions; proposed to Inès. Nothing is shared by the proposal.
reset role;
do $$ declare l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[]; d0 date := current_setting('titan.cy_start')::date;
begin
  -- Her check-ins of weeks 2 and 4 (week 4 already shared with the coach by the check-in tool; week 2 never shared).
  perform public.zz_cy_checkin(l[4], d0 + 7, '{"fatigue":4,"energy":2,"sleep":3,"motivation":3}', 'Semaine chargée au travail', false);
  perform public.zz_cy_checkin(l[4], d0 + 21, '{"fatigue":2,"energy":4}', null, true);
end $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; rid uuid := current_setting('titan.cy_r')::uuid;
  d0 date := current_setting('titan.cy_start')::date; r jsonb; obs jsonb; dec jsonb; pr jsonb;
begin
  obs := '[{"key":"o1","text":"Les sorties longues passent mieux le dimanche","sources":["w2-sat","w5-sat"]},{"key":"o2","text":"Le renforcement du jeudi reste souvent sans séance liée","sources":["w2-thu","w3-thu","w5-thu"]}]';
  dec := '[{"key":"d1","kind":"goal","text":"Courir 12 km en aisance"},{"key":"d2","kind":"goal","text":"Un renforcement par semaine, le jeudi ou le vendredi"},{"key":"d3","kind":"session","text":"Test 10 km","sport":"running"}]';
  assert public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 1, 'observations', '[{"text":"X","sources":["w9-tue"]}]'::jsonb)) = 'BAD_SOURCE', 'a source is a session of this cycle';
  assert public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 1, 'observations', '[{"text":"  "}]'::jsonb)) = 'BAD_OBSERVATION', 'an observation says something';
  assert public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 1, 'decisions', '[{"kind":"session","text":"Nage","sport":"ski_sur_lune"}]'::jsonb)) = 'SPORT_UNKNOWN', 'sport of the catalogue';
  assert public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 0, 'observations', obs, 'decisions', dec)) = 'COACH_CONFLICT', 'stale revision';
  assert public.zz_cy_err(a[4], 'save', jsonb_build_object('id', rid, 'revision', 1, 'observations', obs)) = 'COACH_ONLY', 'the athlete never writes the coach''s copy';
  r := public.zz_cy(c, 'save', jsonb_build_object('id', rid, 'revision', 1, 'observations', obs, 'decisions', dec))->'report';
  assert r->>'revision' = '2' and jsonb_array_length(r#>'{draft,observations}') = 2 and r#>'{draft,observations,0,sources}' = '["w2-sat", "w5-sat"]' and jsonb_array_length(r#>'{draft,decisions}') = 3, 'draft saved: '||(r->'draft')::text;
  assert public.zz_cy_err(a[4], 'report', jsonb_build_object('id', rid)) = 'REPORT_UNAVAILABLE', 'still invisible to Inès';
  assert public.zz_cy_err(c, 'propose', jsonb_build_object('id', rid, 'revision', 1)) = 'COACH_CONFLICT', 'propose the revision that was read';
  r := public.zz_cy(c, 'propose', jsonb_build_object('id', rid, 'revision', 2));
  assert r#>>'{report,state}' = 'proposed' and (public.zz_cy(c, 'propose', jsonb_build_object('id', rid, 'revision', 2))->>'already')::boolean, 'proposed once';
  assert public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 3, 'observations', obs)) = 'INVALID_TRANSITION', 'no edit while it waits for her (recall first)';
  -- The coach reads no more than before: the proposal shares nothing.
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert r->>'hosted' = 'none' and not r ? 'published' and r::text not like '%Genou%' and r::text not like '%Semaine chargée%', 'proposed: nothing shared yet';
  -- Inès reads what she is asked to validate: every measure that could be shared, her own notes and check-ins as candidates.
  pr := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert pr->>'state' = 'proposed' and pr->>'hosted' = 'none' and not pr ? 'draft' and not pr ? 'revision' and not pr ? 'published', 'what Inès receives: '||(pr - 'proposal')::text;
  pr := pr->'proposal';
  assert (select count(*) from jsonb_array_elements(pr->'sessions') s where s ? 'measure') = 8 and (select count(*) from jsonb_array_elements(pr->'sessions') s where s ? 'note') = 3
     and jsonb_array_length(pr->'checkins') = 2 and pr#>>'{checkins,0,note}' = 'Semaine chargée au travail' and (pr#>>'{checkins,1,already_shared}')::boolean
     and public.zz_cy_session(pr, 'w1-sat')->>'note' = 'Genou sensible à la fin' and public.zz_cy_session(pr, 'w1-sat')->>'session_id' = current_setting('titan.cy_logs')::jsonb->>'w1-sat'
     and jsonb_array_length(pr->'observations') = 2 and jsonb_array_length(pr->'decisions') = 3 and char_length(pr->>'preview_key') = 16, 'candidates: 8 measures, 3 notes, 2 check-ins';
  perform set_config('titan.cy_key', pr->>'preview_key', true);
end $$;

-- ---- Part 4: Inès's dedicated validation — and the published version against the reference figures.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; rid uuid := current_setting('titan.cy_r')::uuid;
  d0 date := current_setting('titan.cy_start')::date; key text := current_setting('titan.cy_key'); op uuid := gen_random_uuid(); r jsonb; pub jsonb; t jsonb; v jsonb; mine jsonb;
begin
  v := jsonb_build_object('id', rid, 'op_id', op, 'preview_key', key, 'allow_export', true, 'note', 'Bon cycle, le dimanche me va mieux', 'understood', 'clear',
    'share', jsonb_build_object('measures', '["w1-tue","w1-sat","w2-tue","w2-sat","w3-tue","w5-tue","w5-sat"]'::jsonb, 'notes', '["w1-sat","w2-sat"]'::jsonb, 'checkins', jsonb_build_array(d0 + 7)),
    'decisions', '[{"key":"d1","answer":"approve"},{"key":"d2","answer":"decline"},{"key":"d3","answer":"approve"}]'::jsonb);
  assert public.zz_cy_err(c, 'validate', v) = 'ATHLETE_ONLY', 'only Inès validates';
  assert public.zz_cy_err(a[4], 'validate', v || '{"preview_key":"0000000000000000"}') = 'COACH_CONFLICT', 'a stale reading is refused';
  assert public.zz_cy_err(a[4], 'validate', jsonb_set(v, '{share,measures}', '["w3-sat"]')) = 'INVALID_INPUT', 'an archived session has no measure to share';
  assert public.zz_cy_err(a[4], 'validate', jsonb_set(v, '{share,notes}', '["w1-tue","w1-thu"]')) = 'INVALID_INPUT', 'a note goes with its session''s measure';
  assert public.zz_cy_err(a[4], 'validate', jsonb_set(v, '{share,checkins}', jsonb_build_array(d0 + 14))) = 'INVALID_INPUT', 'a check-in of the cycle that exists';
  assert public.zz_cy_err(a[4], 'validate', jsonb_set(v, '{decisions}', '[{"key":"d9","answer":"approve"}]')) = 'INVALID_INPUT', 'a decision of this report';
  assert public.zz_cy_err(a[4], 'validate', v - 'op_id') = 'INVALID_INPUT', 'an op_id for the retry';
  r := public.zz_cy(a[4], 'validate', v);
  assert (r->>'ok')::boolean and not (r->>'already')::boolean and r->>'version' = '1' and r#>>'{report,state}' = 'published' and r#>>'{report,hosted}' = 'online', 'validated: version 1 online';
  r := public.zz_cy(a[4], 'validate', v);
  assert (r->>'already')::boolean and r->>'version' = '1' and jsonb_array_length(r#>'{report,versions}') = 1, 'the same validation replayed: the same version, nothing more';
  mine := r#>'{report,published}';
  -- The coach now reads the published version.
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  pub := r->'published';
  assert r->>'state' = 'published' and r->>'hosted' = 'online' and pub->>'version' = '1' and (pub->>'allow_export')::boolean, 'the coach reads version 1';
  assert pub = mine, 'Inès sees exactly what her coach sees';
  -- Reference figures of the published version (the strength session of week 1 is done but its measure is kept private by Inès).
  t := pub->'totals';
  assert public.zz_cy_fig(t, 'proposed')->>'n' = '18' and public.zz_cy_fig(t, 'accepted')->>'n' = '16' and public.zz_cy_fig(t, 'done')->>'n' = '8' and public.zz_cy_fig(t, 'moved')->>'n' = '3'
     and public.zz_cy_fig(t, 'declared')->>'n' = '1' and public.zz_cy_fig(t, 'open')->>'n' = '6' and public.zz_cy_fig(t, 'declined')->>'n' = '1' and public.zz_cy_fig(t, 'cancelled')->>'n' = '1'
     and public.zz_cy_fig(t, 'archived')->>'n' = '1', 'published counts = reference: '||(t->'figures')::text;
  assert (public.zz_cy_fig(t, 'volume', 'km')->>'value')::numeric = 70 and public.zz_cy_fig(t, 'volume', 'km')->>'n' = '7' and (public.zz_cy_fig(t, 'duration')->>'value')::numeric = 414
     and public.zz_cy_fig(t, 'duration')->>'n' = '7' and public.zz_cy_fig(t, 'volume', 'reps') is null, 'published measures = reference: 70 km, 414 min over the 7 shared sessions';
  assert (select jsonb_agg(jsonb_build_array(w->'planned', w->'done', w->'moved') order by (w->>'week')::integer) from jsonb_array_elements(t->'weeks') w)
       = '[[3,3,0],[3,2,1],[2,0,0],[3,2,1],[3,2,1],[2,0,0]]', 'published weeks = reference';
  -- Only what she ticked: two notes, one check-in, no measure of the strength session, no journal identifier.
  assert public.zz_cy_session(pub, 'w1-sat')->>'note' = 'Genou sensible à la fin' and public.zz_cy_session(pub, 'w2-sat')->>'note' = 'Sortie décalée, bien passée'
     and not public.zz_cy_session(pub, 'w1-tue') ? 'note' and public.zz_cy_session(pub, 'w1-thu')->>'outcome' = 'done' and not public.zz_cy_session(pub, 'w1-thu') ? 'measure'
     and pub::text not like '%Bonnes jambes%' and pub::text not like '%"ref"%' and pub::text not like '%session_id%', 'notes: the two she ticked, nothing else';
  assert jsonb_array_length(pub->'checkins') = 1 and pub#>>'{checkins,0,week}' = (d0 + 7)::text and pub#>>'{checkins,0,note}' = 'Semaine chargée au travail', 'one check-in, the one she ticked';
  -- Two observations tied to their source sessions, each decision with her answer.
  assert pub#>'{observations,0,sources}' = '["w2-sat", "w5-sat"]' and pub#>'{observations,1,sources}' = '["w2-thu", "w3-thu", "w5-thu"]'
     and (select jsonb_agg(d->>'state' order by d->>'key') from jsonb_array_elements(pub->'decisions') d) = '["approved", "declined", "approved"]'
     and pub->>'athlete_note' = 'Bon cycle, le dimanche me va mieux', 'observations, decisions and her word';
  perform set_config('titan.cy_op', op::text, true);
end $$;

-- ---- Part 5: a file is downloaded; a note is retracted; a session is archived; the access is withdrawn; a new validation.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; c2 uuid := current_setting('titan.cy_c2')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[];
  rid uuid := current_setting('titan.cy_r')::uuid; p uuid := current_setting('titan.cy_p')::uuid; ids jsonb := current_setting('titan.cy_logs')::jsonb; r jsonb; x jsonb; t jsonb; pr jsonb;
begin
  -- The coach downloads a file (allowed by Inès for this version): it holds the two notes. It is logged; Inès sees that a copy exists.
  x := public.zz_cy(c, 'export', jsonb_build_object('id', rid));
  assert (x->>'ok')::boolean and x->>'role' = 'coach' and x::text like '%Genou sensible%' and x->>'athlete_name' = 'Inès' and x#>>'{report,version}' = '1', 'export of version 1 (with both notes)';
  assert public.zz_cy_err(c2, 'export', jsonb_build_object('id', rid)) = 'SHARING_UNAVAILABLE', 'no export for anyone else';
  r := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert jsonb_array_length(r->'exports') = 1 and r#>>'{exports,0,role}' = 'coach' and r#>>'{exports,0,fields,notes}' = '2' and r#>>'{exports,0,fields,measures}' = '7'
     and r#>>'{exports,0,fields,checkins}' = '1', 'Inès sees the file her coach downloaded: '||(r->'exports')::text;
  assert not public.zz_cy(c, 'report', jsonb_build_object('id', rid)) ? 'exports', 'the log is hers';
  -- She retracts the note about her knee: gone from the hosted version, from every stored version, from the next export.
  assert public.zz_cy_err(c, 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"note","key":"w2-sat"}]'::jsonb)) = 'ATHLETE_ONLY', 'only Inès retracts';
  assert public.zz_cy_err(a[4], 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"photo","key":"w1-sat"}]'::jsonb)) = 'INVALID_INPUT', 'a known kind';
  r := public.zz_cy(a[4], 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"note","key":"w1-sat"}]'::jsonb));
  assert r->>'retracted' = '1' and r#>'{report,published,retracted}' @> '[{"kind":"note","key":"w1-sat"}]', 'retracted: the kind and the key are kept, not the words';
  assert public.zz_cy(a[4], 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"note","key":"w1-sat"}]'::jsonb))->>'retracted' = '0', 'retracting twice changes nothing';
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert not public.zz_cy_session(r->'published', 'w1-sat') ? 'note' and public.zz_cy_session(r->'published', 'w1-sat')#>>'{measure,val}' = '10'
     and public.zz_cy_session(r->'published', 'w2-sat')->>'note' = 'Sortie décalée, bien passée' and r::text not like '%Genou%', 'the hosted version no longer holds the note';
  assert public.zz_cy_stored(rid) not like '%Genou%', 'nor does any stored version';
  x := public.zz_cy(c, 'export', jsonb_build_object('id', rid));
  assert x::text not like '%Genou%' and x::text like '%Sortie décalée%', 'nor does the next export';
  assert public.zz_cy(a[4], 'export', jsonb_build_object('id', rid))::text not like '%Genou%', 'nor her own export of the report';
  r := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert jsonb_array_length(r->'exports') = 3 and r#>>'{exports,0,role}' = 'athlete' and r#>>'{exports,1,fields,notes}' = '1' and r#>>'{exports,2,fields,notes}' = '2'
     and r#>>'{versions,0,retracted}' = '1', 'the log keeps the earlier file (2 notes) apart from the later ones (1 note)';
  -- She archives the Tuesday run of week 2 after the publication: the hosted version follows (7 done, 63 km, 374 min).
  assert public.zz_cy_journal() = current_setting('titan.cy_journal'), 'the journal was not written by any of this';
  perform public.zz_cy_archive((ids->>'w2-tue')::uuid);
  perform set_config('titan.cy_journal', public.zz_cy_journal(), true);
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  t := r#>'{published,totals}';
  assert public.zz_cy_fig(t, 'done')->>'n' = '7' and public.zz_cy_fig(t, 'archived')->>'n' = '2' and (public.zz_cy_fig(t, 'volume', 'km')->>'value')::numeric = 63
     and (public.zz_cy_fig(t, 'duration')->>'value')::numeric = 374 and public.zz_cy_session(r->'published', 'w2-tue')->>'outcome' = 'archived'
     and (public.zz_cy_session(r->'published', 'w2-tue')->>'source_gone')::boolean and not public.zz_cy_session(r->'published', 'w2-tue') ? 'measure', 'archived after publication: '||(t->'figures')::text;
  -- She withdraws the access to the hosted version: the coach reads no shared content, whatever they call.
  assert public.zz_cy_err(c, 'withdraw', jsonb_build_object('id', rid)) = 'ATHLETE_ONLY', 'only Inès withdraws';
  r := public.zz_cy(a[4], 'withdraw', jsonb_build_object('id', rid));
  assert r#>>'{report,hosted}' = 'withdrawn' and (public.zz_cy(a[4], 'withdraw', jsonb_build_object('id', rid))->>'already')::boolean and r#>'{report,published}' is not null, 'withdrawn; she still reads her version';
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert r->>'hosted' = 'withdrawn' and not r ? 'published' and r::text not like '%Sortie décalée%' and r::text not like '%Semaine chargée%' and r::text not like '%Bon cycle%', 'direct read by the coach: no shared content';
  assert public.zz_cy_err(c, 'export', jsonb_build_object('id', rid)) = 'REPORT_WITHDRAWN' and public.zz_cy_err(c, 'export', jsonb_build_object('plan_id', p)) = 'REPORT_WITHDRAWN'
     and public.zz_cy_err(c, 'next', jsonb_build_object('id', rid)) = 'REPORT_WITHDRAWN', 'no export, no next cycle from a withdrawn version';
  r := public.zz_cy(c, 'link', jsonb_build_object('link_id', r->>'link_id'));
  assert r#>>'{reports,0,hosted}' = 'withdrawn' and r::text not like '%Sortie décalée%', 'the list says withdrawn, nothing more';
  -- A new validation brings a new version online. The archived session is no longer offered; her earlier answers to the decisions stay.
  pr := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid))->'proposal';
  assert not public.zz_cy_session(pr, 'w2-tue') ? 'measure' and (public.zz_cy_session(pr, 'w2-sat')->>'note_shared')::boolean and not (public.zz_cy_session(pr, 'w1-sat')->>'note_shared')::boolean
     and (public.zz_cy_session(pr, 'w1-sat')->>'shared')::boolean and not (public.zz_cy_session(pr, 'w1-thu')->>'shared')::boolean and (pr#>>'{checkins,0,shared}')::boolean, 'her previous choices are remembered: '||(pr->'sessions')::text;
  r := public.zz_cy(a[4], 'validate', jsonb_build_object('id', rid, 'op_id', gen_random_uuid(), 'preview_key', pr->>'preview_key', 'allow_export', true,
    'share', jsonb_build_object('measures', '["w1-tue","w1-sat","w2-sat","w3-tue","w5-tue","w5-sat"]'::jsonb, 'notes', '["w2-sat"]'::jsonb)));
  assert r->>'version' = '2' and r#>>'{report,hosted}' = 'online', 'version 2 online';
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert r#>>'{published,version}' = '2' and (select jsonb_agg(d->>'state' order by d->>'key') from jsonb_array_elements(r#>'{published,decisions}') d) = '["approved", "declined", "approved"]'
     and jsonb_array_length(r#>'{published,checkins}') = 0 and not r#>'{published}' ? 'athlete_note' and jsonb_array_length(r->'versions') = 2, 'version 2: what she ticked this time, her answers kept';
end $$;

-- ---- Part 6: the sharing scope is revised → a new validation; the coach revises the report → sent back, then validated.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[];
  rid uuid := current_setting('titan.cy_r')::uuid; r jsonb; pr jsonb; rev integer;
begin
  -- Inès now shares running only. The hosted version was validated under another scope: suspended until she validates again.
  perform public.zz_cy_portal(a[4], 'scope', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4]), 'since_date', current_date - 90, 'sport', 'running'));
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert r->>'hosted' = 'revalidate' and not r ? 'published' and r::text not like '%Sortie décalée%', 'scope revised: the coach reads no shared content until a new validation';
  assert public.zz_cy_err(c, 'export', jsonb_build_object('id', rid)) = 'REPORT_REVALIDATION' and public.zz_cy_err(c, 'next', jsonb_build_object('id', rid)) = 'REPORT_REVALIDATION', 'no export, no next cycle meanwhile';
  assert public.zz_cy_session(r->'draft', 'w1-thu')->>'outcome' = 'done' and (public.zz_cy_session(r->'draft', 'w1-thu')->>'out_of_scope')::boolean and not public.zz_cy_session(r->'draft', 'w1-thu') ? 'measure', 'outside the scope: done, no measure';
  r := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  pr := r->'proposal';
  assert r->>'hosted' = 'revalidate' and pr#>>'{contract,sport}' = 'running' and not public.zz_cy_session(pr, 'w1-thu') ? 'measure' and public.zz_cy_session(pr, 'w1-thu')->>'in_scope' = 'false', 'Inès is asked to validate under the new scope';
  r := public.zz_cy(a[4], 'validate', jsonb_build_object('id', rid, 'op_id', gen_random_uuid(), 'preview_key', pr->>'preview_key', 'allow_export', true, 'understood', 'unsure',
    'share', jsonb_build_object('measures', '["w1-tue","w1-sat","w2-sat","w3-tue","w5-tue","w5-sat"]'::jsonb, 'notes', '["w2-sat"]'::jsonb)));
  assert r->>'version' = '3' and r#>>'{report,hosted}' = 'online' and public.zz_cy(c, 'report', jsonb_build_object('id', rid))#>>'{published,version}' = '3', 'version 3 online under the new scope';
  -- The coach adds an observation: a new draft. The hosted version stays version 3 and Inès does not see the draft.
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid)); rev := (r->>'revision')::integer;
  r := public.zz_cy(c, 'save', jsonb_build_object('id', rid, 'revision', rev, 'observations', (r#>'{draft,observations}') || '[{"key":"o3","text":"Le test de fin de cycle manque","sources":["w6-sat"]}]'::jsonb,
    'decisions', r#>'{draft,decisions}'))->'report';
  assert r->>'state' = 'draft' and r->>'hosted' = 'online' and jsonb_array_length(r#>'{published,observations}') = 2 and jsonb_array_length(r#>'{draft,observations}') = 3
     and r#>>'{draft,decisions,0,state}' = 'approved', 'a new draft beside the hosted version';
  pr := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert pr->>'state' = 'published' and jsonb_array_length(pr#>'{proposal,observations}') = 2 and pr::text not like '%test de fin de cycle%', 'the draft is invisible to Inès';
  r := public.zz_cy(c, 'propose', jsonb_build_object('id', rid, 'revision', r->'revision'));
  pr := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert pr->>'state' = 'proposed' and jsonb_array_length(pr#>'{proposal,observations}') = 3, 'proposed again: she reads the new observation';
  -- She sends it back with a word; the coach reads the word, corrects, proposes again; she validates.
  assert public.zz_cy_err(c, 'return', jsonb_build_object('id', rid, 'note', 'x')) = 'ATHLETE_ONLY', 'only Inès sends it back';
  perform public.zz_cy(a[4], 'return', jsonb_build_object('id', rid, 'note', 'Le test était prévu, je ne l''ai pas confirmé'));
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert r->>'state' = 'draft' and r->>'returned_note' = 'Le test était prévu, je ne l''ai pas confirmé' and r->>'hosted' = 'online' and r#>>'{published,version}' = '3', 'sent back: version 3 still hosted';
  r := public.zz_cy(c, 'save', jsonb_build_object('id', rid, 'revision', r->'revision', 'observations', jsonb_set(r#>'{draft,observations}', '{2,text}', '"Le test de fin de cycle n’a pas été confirmé"'),
    'decisions', r#>'{draft,decisions}'))->'report';
  perform public.zz_cy(c, 'propose', jsonb_build_object('id', rid, 'revision', r->'revision'));
  assert not public.zz_cy(c, 'report', jsonb_build_object('id', rid)) ? 'returned_note', 'her word is cleared once the coach proposes again';
  pr := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid))->'proposal';
  r := public.zz_cy(a[4], 'validate', jsonb_build_object('id', rid, 'op_id', gen_random_uuid(), 'preview_key', pr->>'preview_key', 'allow_export', false,
    'share', jsonb_build_object('measures', '["w1-tue","w1-sat","w2-sat","w3-tue","w5-tue","w5-sat"]'::jsonb, 'notes', '["w2-sat"]'::jsonb)));
  assert r->>'version' = '4' and r#>>'{report,state}' = 'published', 'version 4';
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert jsonb_array_length(r#>'{published,observations}') = 3 and not (r->>'allow_export')::boolean and jsonb_array_length(r->'versions') = 4, 'the coach reads version 4';
  -- This time she did not allow a file: the coach cannot download one; she still can.
  assert public.zz_cy_err(c, 'export', jsonb_build_object('id', rid)) = 'EXPORT_NOT_ALLOWED' and (public.zz_cy(a[4], 'export', jsonb_build_object('id', rid))->>'ok')::boolean, 'a file only when she allows it';
end $$;

-- ---- Part 7: the next cycle takes only the objectives she approved, and remembers where they come from.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[];
  rid uuid := current_setting('titan.cy_r')::uuid; p uuid := current_setting('titan.cy_p')::uuid; r jsonb; n jsonb; nid uuid;
begin
  assert public.zz_cy_err(a[4], 'next', jsonb_build_object('id', rid)) = 'COACH_ONLY', 'the coach prepares the next cycle';
  r := public.zz_cy(c, 'next', jsonb_build_object('id', rid));
  n := r->'plan'; nid := (n->>'id')::uuid;
  assert (r->>'ok')::boolean and not (r->>'already')::boolean and n->>'state' = 'draft' and n->'goals' = '["Courir 12 km en aisance"]', 'only the approved objective (not the declined one, not the old cycle''s): '||(n->'goals')::text;
  assert jsonb_array_length(n->'sessions') = 19 and (select e->>'title' from jsonb_array_elements(n->'sessions') e where e->>'key' = 'r-d3') = 'Test 10 km', 'the approved session to propose is in the draft';
  assert n#>>'{origin,report_id}' = rid::text and n#>>'{origin,version}' = '4' and n#>>'{origin,plan_id}' = p::text and n#>>'{origin,plan_title}' = 'Course et renforcement — 6 semaines'
     and jsonb_array_length(n#>'{origin,objectives}') = 2 and (n#>>'{origin,objectives,0,kept}')::boolean and n#>>'{origin,objectives,0,approved_at}' is not null
     and (n#>>'{origin,objectives,1,kept}')::boolean, 'origin kept: '||(n->'origin')::text;
  r := public.zz_cy(c, 'next', jsonb_build_object('id', rid));
  assert (r->>'already')::boolean and r#>>'{plan,id}' = nid::text and (select count(*) from jsonb_array_elements(public.zz_cy_pg(c, 'link', jsonb_build_object('link_id', l[4]))->'plans')) = 2, 'replayed: the same draft';
  assert public.zz_cy(c, 'report', jsonb_build_object('id', rid))#>>'{next_plan,id}' = nid::text and not public.zz_cy(a[4], 'report', jsonb_build_object('id', rid)) ? 'next_plan', 'the report names its next cycle (Inès: once it is sent)';
  -- The coach rewords the objective in the draft: the origin still says what was approved, and that it is no longer among the objectives.
  n := public.zz_cy_pg(c, 'edit', jsonb_build_object('id', nid, 'revision', n->'revision', 'goals', '["Courir 12 km sans s’arrêter"]'::jsonb))->'plan';
  assert n#>>'{origin,objectives,0,text}' = 'Courir 12 km en aisance' and not (n#>>'{origin,objectives,0,kept}')::boolean, 'traceability survives an edit';
  n := public.zz_cy_pg(c, 'edit', jsonb_build_object('id', nid, 'revision', n->'revision', 'goals', '["Courir 12 km en aisance"]'::jsonb))->'plan';
  perform public.zz_cy_pg(c, 'send', jsonb_build_object('id', nid, 'revision', n->'revision'));
  n := (select e from jsonb_array_elements(public.zz_cy_pg(a[4], 'athlete')->'plans') e where e->>'id' = nid::text);
  assert n#>>'{origin,plan_title}' = 'Course et renforcement — 6 semaines' and n#>>'{origin,objectives,0,text}' = 'Courir 12 km en aisance', 'Inès sees where the objective of her new cycle comes from';
  assert public.zz_cy(a[4], 'report', jsonb_build_object('id', rid))#>>'{next_plan,state}' = 'sent', 'and her report names the next cycle';
end $$;

-- ---- Part 8: the offer's places drop (the link is paused), then come back.
reset role;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(current_setting('titan.cy_c')::uuid, 'google_play', 'cy-coach-lou', false, 'canceled', 'test', clock_timestamp(), null, 'titan02', null, now(), now(), null, null);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[];
  rid uuid := current_setting('titan.cy_r')::uuid; p uuid := current_setting('titan.cy_p')::uuid; r jsonb;
begin
  assert public.zz_cy_err(c, 'report', jsonb_build_object('id', rid)) = 'COACH_CAPACITY_PAUSED' and public.zz_cy_err(c, 'report', jsonb_build_object('plan_id', p)) = 'COACH_CAPACITY_PAUSED'
     and public.zz_cy_err(c, 'link', jsonb_build_object('link_id', l[4])) = 'COACH_CAPACITY_PAUSED' and public.zz_cy_err(c, 'export', jsonb_build_object('id', rid)) = 'COACH_CAPACITY_PAUSED'
     and public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 1)) = 'COACH_CAPACITY_PAUSED', 'paused: the coach reads and does nothing';
  r := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert r->>'link_state' = 'paused' and r->>'can_act' = 'false' and r#>>'{published,version}' = '4', 'Inès still reads her report';
  assert public.zz_cy_err(a[4], 'validate', jsonb_build_object('id', rid, 'op_id', gen_random_uuid(), 'preview_key', r#>>'{proposal,preview_key}')) = 'COACH_CAPACITY_PAUSED', 'nothing is published while paused';
  -- Retracting stays possible while paused: what she takes back will not be there when the link resumes.
  assert public.zz_cy(a[4], 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"measure","key":"w5-sat"}]'::jsonb))->>'retracted' = '1', 'she retracts a measure while paused';
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'cy-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  r := public.zz_cy(c, 'report', jsonb_build_object('id', rid));
  assert r->>'hosted' = 'online' and public.zz_cy_session(r->'published', 'w5-sat')->>'outcome' = 'done' and not public.zz_cy_session(r->'published', 'w5-sat') ? 'measure'
     and (public.zz_cy_fig(r#>'{published,totals}', 'volume', 'km')->>'value')::numeric = 47, 'places back: version 4, without the measure she retracted (63 − 16 = 47 km)';
end $$;

-- ---- Part 9: Inès revokes the link. The coach reads nothing by any identifier; she keeps a read-only view for a year.
do $$
declare
  c uuid := current_setting('titan.cy_c')::uuid; a uuid[] := string_to_array(current_setting('titan.cy_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.cy_l'), ',')::uuid[];
  rid uuid := current_setting('titan.cy_r')::uuid; p uuid := current_setting('titan.cy_p')::uuid; r jsonb; e jsonb;
begin
  reset role; e := private.titan_export_extras_v1(c); set local role authenticated;
  assert jsonb_array_length(e->'coachCycleReports') = 1 and e#>>'{coachCycleReports,0,published,version}' = '4' and jsonb_array_length(e#>'{coachCycleReports,0,working_copy,observations}') = 3
     and not (e#>'{coachCycleReports,0}') ? 'exports', 'account export of the coach while the version is online';
  perform public.zz_cy_portal(a[4], 'revoke', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4])));
  assert public.zz_cy_err(c, 'report', jsonb_build_object('id', rid)) = 'SHARING_UNAVAILABLE' and public.zz_cy_err(c, 'report', jsonb_build_object('plan_id', p)) = 'SHARING_UNAVAILABLE'
     and public.zz_cy_err(c, 'export', jsonb_build_object('id', rid)) = 'SHARING_UNAVAILABLE' and public.zz_cy_err(c, 'link', jsonb_build_object('link_id', l[4])) = 'SHARING_UNAVAILABLE'
     and public.zz_cy_err(c, 'next', jsonb_build_object('id', rid)) = 'SHARING_UNAVAILABLE' and public.zz_cy_err(c, 'start', jsonb_build_object('plan_id', p)) = 'SHARING_UNAVAILABLE'
     and public.zz_cy_err(c, 'save', jsonb_build_object('id', rid, 'revision', 1)) = 'SHARING_UNAVAILABLE', 'after the revocation: nothing for the coach, by report, by programme or by link';
  reset role; e := private.titan_export_extras_v1(c); set local role authenticated;
  assert not (e#>'{coachCycleReports,0}') ? 'published' and e::text not like '%Sortie décalée%', 'nor in the coach''s account export';
  r := public.zz_cy(a[4], 'report', jsonb_build_object('id', rid));
  assert r->>'link_state' = 'revoked' and r#>>'{published,version}' = '4' and not r ? 'proposal' and public.zz_cy_session(r->'published', 'w2-sat')->>'note' = 'Sortie décalée, bien passée', 'Inès keeps a read-only view';
  assert jsonb_array_length(public.zz_cy(a[4], 'athlete')->'reports') = 1 and (public.zz_cy(a[4], 'export', jsonb_build_object('id', rid))->>'ok')::boolean, 'her list and her own export stay';
  assert public.zz_cy_err(a[4], 'validate', jsonb_build_object('id', rid, 'op_id', gen_random_uuid(), 'preview_key', 'x')) = 'SHARING_UNAVAILABLE', 'nothing new is published on an ended link';
  assert public.zz_cy(a[4], 'retract', jsonb_build_object('id', rid, 'items', '[{"kind":"note","key":"w2-sat"}]'::jsonb))->>'retracted' = '1', 'she may still take a note back';
  reset role; e := private.titan_export_extras_v1(a[4]); set local role authenticated;
  assert jsonb_array_length(e->'coachCycleReports') = 1 and e#>>'{coachCycleReports,0,published,version}' = '4' and not (e#>'{coachCycleReports,0}') ? 'working_copy'
     and jsonb_array_length(e#>'{coachCycleReports,0,exports}') = 5, 'her account export: the version she validated and the files downloaded';
  reset role; update public.coach_links set revoked_at = now() - interval '366 days' where id = l[4]; set local role authenticated;
  assert public.zz_cy_err(a[4], 'report', jsonb_build_object('id', rid)) = 'SHARING_UNAVAILABLE' and jsonb_array_length(public.zz_cy(a[4], 'athlete')->'reports') = 0, 'after a year the read-only view ends';
end $$;

-- ---- Part 10: the journal, the measure and the grants.
reset role;
do $$
declare m jsonb;
begin
  assert public.zz_cy_journal() = current_setting('titan.cy_journal'), 'public.training_logs never written by the report';
  m := private.titan_coach_cycle_measure();
  assert m->>'published' = '1' and m#>>'{reports,published}' = '1' and m->>'versions' = '4' and m->>'retractions' = '3' and m->>'withdrawn' = '0' and m#>>'{exports,coach}' = '2'
     and m#>>'{exports,athlete}' = '3' and m->>'decisionsApproved' = '2' and m->>'cyclesRelaunched' = '1' and m->>'cyclesRelaunchPrepared' = '1' and m->>'understoodClear' = '1'
     and m->>'understoodUnsure' = '1' and m->>'productionMinutesMedian' is not null and m->>'versionsExportAllowed' = '3', 'measure: '||m::text;
  assert not has_function_privilege('authenticated', 'private.titan_coach_cycle_measure()', 'execute')
     and not has_table_privilege('authenticated', 'private.titan_coach_cycle_reports', 'select') and not has_table_privilege('anon', 'private.titan_coach_cycle_report_versions', 'select')
     and not has_table_privilege('authenticated', 'private.titan_coach_cycle_report_exports', 'select')
     and not has_function_privilege('anon', 'public.titan_coach_cycle_v1(text, jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'private.titan_coach_cycle_published(private.titan_coach_cycle_reports, private.titan_coach_plans, public.coach_links)', 'execute'), 'private tables, projection and measure: team only';
  raise notice 'V1.9.5 measure: %', m;
end $$;
rollback;

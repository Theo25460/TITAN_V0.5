-- V1.9.4 — Programmation multi-semaines (20261204090000). The scenario of the lot: Coach Lou prepares four weeks of running and
-- strengthening (a versioned template), adapts it for Inès (preview of the changes), sends it once (a replayed send creates nothing),
-- and sees which sessions she accepted, declined or wants to discuss — the case to discuss comes back in the V1.9.1 queue and the V1.9.3
-- weekly review. Two weeks later (the programme is aged by 14 days, as if they had passed), week 1 is played (one session linked, one
-- overdue) and week 2 has a session done and linked: the coach shifts the whole week 2 by two days — the session done is kept, the accepted
-- ones get a change beside the version accepted — then the rest of the cycle by a week, and replaces one occurrence. Each revision is
-- previewed and applied with the preview's key (a stale preview is refused), replaying it creates nothing, and every version stays. The
-- programme is duplicated for Malo from Inès's, sent, partly accepted and linked, then Malo revokes the link while it is open. The places
-- of the offer drop (both links paused) and come back; Inès narrows her sharing. Inès's cycle is closed. At every step the link's contract
-- applies, the athlete keeps reading their own sessions, and public.training_logs is never written. Full rollback.
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
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_programs', false, 100, 'QA') on conflict (key) do update set enabled = false;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_followup', true, 100, 'QA') on conflict (key) do update set enabled = true;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_review', true, 100, 'QA') on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'pg-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null,
    now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('titan.pg_c', c::text, true); perform set_config('titan.pg_c2', c2::text, true); perform set_config('titan.pg_a', array_to_string(a, ','), true);
end $$;
create function public.zz_pg_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_pg(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_pg_as(p_user); return public.titan_coach_program_v1(p_action, p_data); end $$;
create function public.zz_pg_err(p_user uuid, p_action text, p_data jsonb default '{}') returns text language plpgsql as $$
begin perform public.zz_pg(p_user, p_action, p_data); return 'ok'; exception when others then return sqlerrm; end $$;
create function public.zz_pg_portal(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_pg_as(p_user); return public.titan_coach_portal(p_action, p_data); end $$;
create function public.zz_pg_follow(p_user uuid, p_action text, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_pg_as(p_user); return public.titan_coach_followup_v1(p_action, p_data); end $$;
create function public.zz_pg_review(p_user uuid, p_data jsonb default '{}') returns jsonb language plpgsql as $$
begin perform public.zz_pg_as(p_user); return public.titan_coach_review_v1('week', p_data); end $$;
create function public.zz_pg_link(p_coach uuid, p_athlete uuid) returns uuid language plpgsql as $$
declare inv jsonb; begin inv := public.zz_pg_portal(p_coach, 'invite');
  return (public.zz_pg_portal(p_athlete, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 60, 'consent', true))->>'id')::uuid; end $$;
create function public.zz_pg_row(p_plan uuid, p_key text) returns public.coach_assignments language sql security definer as $$ select * from public.coach_assignments where plan_id = p_plan and plan_key = p_key $$;
create function public.zz_pg_count(p_link uuid) returns integer language sql security definer as $$ select count(*)::integer from public.coach_assignments where link_id = p_link $$;
create function public.zz_pg_versions(p_plan uuid) returns text language sql security definer as $$ select string_agg(version || ':' || kind, ',' order by version) from private.titan_coach_plan_versions where plan_id = p_plan $$;
create function public.zz_pg_week_md5(p_plan uuid, p_week integer) returns text language sql security definer as $$
  select md5(string_agg(to_jsonb(a)::text, ';' order by a.plan_key)) from public.coach_assignments a where a.plan_id = p_plan and a.plan_week = p_week $$;
create function public.zz_pg_journal() returns text language sql security definer as $$ select coalesce(md5(string_agg(to_jsonb(l)::text, ';' order by l.id)), 'empty') from public.training_logs l $$;
-- Time passes: the programme and its proposals move back by p_days (a multiple of 7, so the cycle still starts on a Monday).
create function public.zz_pg_age(p_plan uuid, p_days integer) returns void language plpgsql security definer as $$
begin
  update private.titan_coach_plans set start_date = start_date - p_days, created_at = created_at - make_interval(days => p_days), sent_at = sent_at - make_interval(days => p_days) where id = p_plan;
  update public.coach_assignments set planned_date = planned_date - p_days, moved_date = moved_date - p_days, created_at = created_at - make_interval(days => p_days),
    accepted_version = case when accepted_version is null then null else jsonb_set(accepted_version, '{planned_date}', to_jsonb((accepted_version->>'planned_date')::date - p_days)) end
   where plan_id = p_plan;
end $$;
create function public.zz_pg_log(p_user uuid, p_sport text, p_at timestamptz, p_val numeric, p_unit text) returns uuid language plpgsql security definer as $$
declare v uuid := gen_random_uuid(); begin
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values (v, p_user, p_sport, p_val, p_unit, 10, p_at, '{"duration":45,"note":"Bonnes jambes"}', p_at);
  set local session_replication_role = origin;
  return v; end $$;
grant execute on function public.zz_pg_as(uuid), public.zz_pg(uuid, text, jsonb), public.zz_pg_err(uuid, text, jsonb), public.zz_pg_portal(uuid, text, jsonb),
  public.zz_pg_follow(uuid, text, jsonb), public.zz_pg_review(uuid, jsonb), public.zz_pg_link(uuid, uuid), public.zz_pg_row(uuid, text), public.zz_pg_count(uuid),
  public.zz_pg_versions(uuid), public.zz_pg_week_md5(uuid, integer), public.zz_pg_journal() to authenticated;

-- ---- Part 0: the links, as the service orders them (Zoé, Noé, Paul first; Inès fourth, Malo fifth: paused if the offer drops to 3).
set local role authenticated;
do $$
declare c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; l uuid[] := array[]::uuid[]; i integer;
begin
  for i in 1..5 loop l := l || public.zz_pg_link(c, a[i]); end loop;
  perform set_config('titan.pg_l', array_to_string(l, ','), true);
end $$;
reset role;
do $$
declare l uuid[] := string_to_array(current_setting('titan.pg_l'), ',')::uuid[]; i integer;
begin
  for i in 1..5 loop update public.coach_links set accepted_at = now() - make_interval(mins => 10 - i) where id = l[i]; end loop;
  perform set_config('titan.pg_journal', public.zz_pg_journal(), true);
end $$;
set local role authenticated;

-- ---- Part 1: the template — four weeks of running and strengthening, versioned.
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; c2 uuid := current_setting('titan.pg_c2')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[];
  s jsonb := '[]'::jsonb; w integer; r jsonb; p uuid;
begin
  assert public.zz_pg_err(c, 'library') = 'FEATURE_DISABLED', 'closed flag: refused by the server';
  reset role; update private.titan_feature_flags set enabled = true where key = 'screens.coach_programs'; set local role authenticated;
  for w in 1..4 loop
    s := s || jsonb_build_array(
      jsonb_build_object('key', 'w' || w || '-tue', 'week', w, 'day', 2, 'title', case when w % 2 = 0 then 'Fractionné 6 × 400 m' else 'Footing 40 min' end, 'sport', 'running', 'instructions', 'Échauffement 15 min'),
      jsonb_build_object('key', 'w' || w || '-thu', 'week', w, 'day', 4, 'title', 'Renforcement 30 min', 'sport', 'muscu_home', 'instructions', 'Gainage, fentes, pompes'),
      jsonb_build_object('key', 'w' || w || '-sat', 'week', w, 'day', 6, 'title', 'Sortie longue ' || (8 + 2 * w) || ' km', 'sport', 'running', 'instructions', 'Allure confortable'));
  end loop;
  -- Refused without writing: a session outside the four weeks, an unknown sport, a session without a name, two sessions with one key.
  assert public.zz_pg_err(c, 'save_program', jsonb_build_object('title', 'X', 'weeks', 4, 'sessions', s || '[{"key":"w5","week":5,"day":1,"title":"Trop tard","sport":"running"}]')) = 'BAD_SESSIONS', 'week 5 of 4';
  assert public.zz_pg_err(c, 'save_program', jsonb_build_object('title', 'X', 'weeks', 4, 'sessions', '[{"week":1,"day":1,"title":"Nage","sport":"ski_sur_lune"}]'::jsonb)) = 'SPORT_UNKNOWN', 'sport of the catalogue';
  assert public.zz_pg_err(c, 'save_program', jsonb_build_object('title', 'X', 'weeks', 4, 'sessions', '[{"week":1,"day":1,"title":"  ","sport":"running"}]'::jsonb)) = 'BAD_TITLE', 'a name';
  assert public.zz_pg_err(c, 'save_program', jsonb_build_object('title', 'X', 'weeks', 4, 'sessions', '[{"key":"k","week":1,"day":1,"title":"A","sport":"running"},{"key":"k","week":2,"day":1,"title":"B","sport":"running"}]'::jsonb)) = 'BAD_SESSIONS', 'one key per session';
  r := public.zz_pg(c, 'save_program', jsonb_build_object('title', 'Course et renforcement — 4 semaines', 'weeks', 4,
    'goals', '["Courir 10 km en aisance", "Renforcement deux fois par semaine", ""]'::jsonb, 'sessions', s));
  p := (r->>'id')::uuid;
  assert r->>'version' = '1' and jsonb_array_length(r->'sessions') = 12 and r->'goals' = '["Courir 10 km en aisance", "Renforcement deux fois par semaine"]', 'template v1: 12 sessions, two goals: '||r::text;
  -- A second version: the week 4 long run becomes a 10 km test. A stale version is refused; saving the same content changes nothing.
  s := jsonb_set(s, '{11,title}', '"Test 10 km"');
  assert public.zz_pg_err(c, 'save_program', jsonb_build_object('id', p, 'version', 0, 'title', 'Course et renforcement — 4 semaines', 'weeks', 4, 'sessions', s)) = 'COACH_CONFLICT', 'stale version';
  r := public.zz_pg(c, 'save_program', jsonb_build_object('id', p, 'version', 1, 'title', 'Course et renforcement — 4 semaines', 'weeks', 4,
    'goals', '["Courir 10 km en aisance", "Renforcement deux fois par semaine"]'::jsonb, 'sessions', s));
  assert r->>'version' = '2', 'template v2';
  r := public.zz_pg(c, 'save_program', jsonb_build_object('id', p, 'version', 2, 'title', 'Course et renforcement — 4 semaines', 'weeks', 4,
    'goals', '["Courir 10 km en aisance", "Renforcement deux fois par semaine"]'::jsonb, 'sessions', s));
  assert (r->>'unchanged')::boolean and r->>'version' = '2', 'same content: no third version';
  r := public.zz_pg(c, 'program', jsonb_build_object('id', p));
  assert jsonb_array_length(r->'versions') = 2 and r#>>'{versions,0,sessions,11,title}' = 'Sortie longue 16 km' and r#>>'{versions,1,sessions,11,title}' = 'Test 10 km', 'both versions readable: '||r::text;
  r := public.zz_pg(c, 'library');
  assert jsonb_array_length(r->'programs') = 1 and r#>>'{programs,0,version}' = '2' and r#>>'{programs,0,versions}' = '2', 'library: current version 2 of 2';
  -- Another coach and an athlete never read it.
  assert public.zz_pg_err(c2, 'program', jsonb_build_object('id', p)) = 'PROGRAM_UNAVAILABLE' and public.zz_pg_err(a[4], 'program', jsonb_build_object('id', p)) = 'PROGRAM_UNAVAILABLE', 'private to its coach';
  assert jsonb_array_length(public.zz_pg(c2, 'library')->'programs') = 0, 'another coach: empty library';
  perform set_config('titan.pg_prog', p::text, true);
end $$;

-- ---- Part 2: adapted for Inès (a draft she never sees), previewed, duplicated for Malo, sent once.
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; c2 uuid := current_setting('titan.pg_c2')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[];
  l uuid[] := string_to_array(current_setting('titan.pg_l'), ',')::uuid[]; prog uuid := current_setting('titan.pg_prog')::uuid;
  wk date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date; r jsonb; d jsonb; s jsonb; pi uuid; t0 timestamptz := clock_timestamp(); n integer;
begin
  assert public.zz_pg_err(c, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', prog, 'start_date', wk + 8)) = 'INVALID_PERIOD', 'a cycle starts on a Monday';
  assert public.zz_pg_err(c, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', prog, 'start_date', wk - 7)) = 'INVALID_PERIOD', 'not in a past week';
  assert public.zz_pg_err(c2, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', prog)) = 'SHARING_UNAVAILABLE', 'another coach cannot use Lou''s link';
  assert public.zz_pg_err(a[4], 'adapt', jsonb_build_object('link_id', l[4], 'program_id', prog)) = 'COACH_ONLY', 'the athlete does not prepare';
  d := public.zz_pg(c, 'adapt', jsonb_build_object('link_id', l[4], 'program_id', prog, 'start_date', wk + 7))->'plan';
  pi := (d->>'id')::uuid;
  assert d->>'state' = 'draft' and d->>'start_date' = (wk + 7)::text and d#>>'{program,version}' = '2' and jsonb_array_length(d->'sessions') = 12
     and jsonb_array_length(d->'changes') = 0 and d#>>'{sessions,0,planned_date}' = (wk + 8)::text, 'draft from v2, dated from next Monday: '||d::text;
  -- Inès never sees a draft.
  assert jsonb_array_length(public.zz_pg(a[4], 'link', jsonb_build_object('link_id', l[4]))->'plans') = 0, 'no draft for the athlete';
  assert public.zz_pg_err(a[4], 'plan', jsonb_build_object('id', pi)) = 'SHARING_UNAVAILABLE', 'nor by its id';
  assert jsonb_array_length(public.zz_pg(a[4], 'athlete')->'plans') = 0, 'nor in her list';
  -- Adapted for Inès: week 1 without the Thursday (late work), week 2 moved to Monday and Sunday with core work instead of the Thursday.
  s := (select jsonb_agg(case e->>'key'
           when 'w2-tue' then e || '{"day":1}'
           when 'w2-thu' then e || '{"day":7,"title":"Gainage 20 min","instructions":"Planche, gainage latéral"}'
           when 'w2-sat' then e || '{"day":7}'
           else e end) from jsonb_array_elements(d->'sessions') e where e->>'key' <> 'w1-thu');
  s := (select jsonb_agg(e - 'planned_date') from jsonb_array_elements(s) e);
  assert public.zz_pg_err(c, 'edit', jsonb_build_object('id', pi, 'revision', 0, 'sessions', s)) = 'COACH_CONFLICT', 'stale draft';
  d := public.zz_pg(c, 'edit', jsonb_build_object('id', pi, 'revision', 1, 'title', 'Course et renforcement — Inès', 'sessions', s))->'plan';
  assert d->>'revision' = '2' and jsonb_array_length(d->'sessions') = 11
     and (select string_agg((e->>'key') || ':' || (e->>'kind') || coalesce(':' || (e->'fields')::text, ''), ' ' order by e->>'key') from jsonb_array_elements(d->'changes') e)
         = 'w1-thu:removed w2-sat:changed:["day"] w2-thu:changed:["day", "title", "instructions"] w2-tue:changed:["day"]',
     'preview of the adaptation: '||(d->'changes')::text;
  -- Sent once: 11 ordinary proposals, then a replay answers « already ».
  assert public.zz_pg_err(c, 'send', jsonb_build_object('id', pi, 'revision', 1)) = 'COACH_CONFLICT', 'the coach sends what they previewed';
  r := public.zz_pg(c, 'send', jsonb_build_object('id', pi, 'revision', 2));
  assert (r->>'ok')::boolean and not (r->>'already')::boolean and r#>>'{plan,state}' = 'sent' and r#>>'{plan,version}' = '1'
     and r#>>'{plan,counts,sessions}' = '11' and r#>>'{plan,counts,awaiting}' = '11' and r#>>'{plan,prep_minutes}' is not null, 'sent: '||(r->'plan'->'counts')::text;
  r := public.zz_pg(c, 'send', jsonb_build_object('id', pi, 'revision', 2));
  assert (r->>'already')::boolean and public.zz_pg_count(l[4]) = 11, 'a replayed send creates nothing: '||public.zz_pg_count(l[4]);
  assert (public.zz_pg_row(pi, 'w2-thu')).planned_date = wk + 20 and (public.zz_pg_row(pi, 'w2-thu')).title = 'Gainage 20 min'
     and (public.zz_pg_row(pi, 'w1-tue')).history->1->>'k' = 'from_plan', 'proposals dated by the cycle, origin in their history';
  assert public.zz_pg_versions(pi) = '1:sent', 'version 1 = the send';
  -- Inès finds it in her space; the coach's queue (V1.9.1) knows each proposal belongs to the programme.
  r := public.zz_pg(a[4], 'athlete');
  assert jsonb_array_length(r->'plans') = 1 and r#>>'{plans,0,coach_name}' = 'Coach Lou' and r#>>'{plans,0,can_act}' = 'true' and not (r->'plans'->0) ? 'basis'
     and not (r->'plans'->0) ? 'changes', 'Inès reads the programme, not the coach''s working basis';
  r := public.zz_pg_follow(c, 'queue', jsonb_build_object('link_id', l[4]));
  assert (select count(*) from jsonb_array_elements(r->'rows') e where e#>>'{plan,title}' = 'Course et renforcement — Inès') = 11, 'queue rows carry the programme';
  -- Duplicated for Malo from Inès's programme (as it stands), then sent.
  d := public.zz_pg(c, 'adapt', jsonb_build_object('link_id', l[5], 'plan_id', pi, 'start_date', wk + 7))->'plan';
  assert d#>>'{basis,kind}' = 'plan' and jsonb_array_length(d->'sessions') = 11 and jsonb_array_length(d->'changes') = 0
     and (select e->>'title' from jsonb_array_elements(d->'sessions') e where e->>'key' = 'w2-thu') = 'Gainage 20 min', 'Malo starts from Inès''s programme';
  r := public.zz_pg(c, 'send', jsonb_build_object('id', d->>'id', 'revision', 1));
  assert r#>>'{plan,counts,sessions}' = '11' and public.zz_pg_count(l[5]) = 11, 'Malo''s programme sent';
  perform set_config('titan.pg_pi', pi::text, true); perform set_config('titan.pg_pm', d->>'id', true); perform set_config('titan.pg_wk', wk::text, true);
end $$;

-- ---- Part 3: Inès answers; a session to discuss reaches the queue and the weekly review; the coach replaces it.
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[];
  l uuid[] := string_to_array(current_setting('titan.pg_l'), ',')::uuid[]; pi uuid := current_setting('titan.pg_pi')::uuid; r jsonb; dec jsonb; card jsonb; pv jsonb;
begin
  assert public.zz_pg_err(c, 'answer', jsonb_build_object('id', pi, 'all', 'accept')) = 'ATHLETE_ONLY', 'only Inès answers';
  assert public.zz_pg_err(a[4], 'answer', jsonb_build_object('id', pi, 'decisions', '[{"key":"w9-x","answer":"accept"}]'::jsonb)) = 'INVALID_INPUT', 'unknown session refused';
  -- One session accepted through the portal as before (an older client): the programme reads it.
  perform public.zz_pg_portal(a[4], 'assignment_status', jsonb_build_object('id', (public.zz_pg_row(pi, 'w1-sat')).id, 'revision', 1, 'status', 'accepted'));
  dec := (select jsonb_agg(jsonb_build_object('key', k, 'answer', case k when 'w3-sat' then 'discuss' when 'w4-thu' then 'decline' else 'accept' end,
            'note', case k when 'w3-sat' then 'Je préfère des côtes ce samedi-là' end))
            from unnest(array['w1-tue', 'w2-tue', 'w2-thu', 'w2-sat', 'w3-tue', 'w3-thu', 'w3-sat', 'w4-tue', 'w4-thu', 'w4-sat']) k);
  r := public.zz_pg(a[4], 'answer', jsonb_build_object('id', pi, 'decisions', dec));
  assert r#>>'{plan,counts,accepted}' = '9' and r#>>'{plan,counts,to_discuss}' = '1' and r#>>'{plan,counts,declined}' = '1' and r#>>'{plan,counts,awaiting}' = '0',
    'Inès: 9 accepted, 1 to discuss, 1 declined: '||(r#>'{plan,counts}')::text;
  r := public.zz_pg(a[4], 'answer', jsonb_build_object('id', pi, 'decisions', dec));
  assert (select bool_and(e->>'effect' = 'unchanged') from jsonb_array_elements(r->'results') e), 'replaying the same answers changes nothing: '||(r->'results')::text;
  -- The coach sees which sessions were accepted.
  pv := public.zz_pg(c, 'plan', jsonb_build_object('id', pi));
  assert (select string_agg((e->>'key') || '=' || (e->>'state'), ' ' order by e->>'key') from jsonb_array_elements(pv->'sessions') e)
       = 'w1-sat=planned w1-tue=planned w2-sat=planned w2-thu=planned w2-tue=planned w3-sat=to_discuss w3-thu=planned w3-tue=planned w4-sat=planned w4-thu=declined w4-tue=planned',
    'the coach reads each answer: '||(select string_agg((e->>'key') || '=' || (e->>'state'), ' ') from jsonb_array_elements(pv->'sessions') e);
  assert (select e->>'discuss_note' from jsonb_array_elements(pv->'sessions') e where e->>'key' = 'w3-sat') = 'Je préfère des côtes ce samedi-là', 'her note to discuss';
  assert (public.zz_pg_row(pi, 'w1-tue')).accepted_version->>'planned_date' = (current_setting('titan.pg_wk')::date + 8)::text, 'the accepted version is kept (V1.9.1)';
  -- The case to discuss is a decision for the coach: in the V1.9.1 queue (gap) and the V1.9.3 weekly review.
  r := public.zz_pg_follow(c, 'queue', jsonb_build_object('link_id', l[4], 'action', 'gap'));
  assert jsonb_array_length(r->'rows') = 1 and r#>>'{rows,0,state}' = 'to_discuss' and r#>>'{rows,0,plan,week}' = '3', 'to discuss: a gap in the queue: '||(r->'rows')::text;
  r := public.zz_pg_review(c, jsonb_build_object('week', current_setting('titan.pg_wk')::date + 7, 'filter', 'all'));
  card := (select e from jsonb_array_elements(r->'cards') e where e->>'name' = 'Inès');
  assert card->>'next' = 'gap' and card#>>'{dossier,state}' = 'to_discuss' and card#>>'{dossier,plan,title}' = 'Course et renforcement — Inès'
     and card#>>'{dossier,discuss_note}' = 'Je préfère des côtes ce samedi-là', 'the review shows the session to discuss and its programme: '||card::text;
  -- The coach replaces this occurrence (not answered yet: updated in place), previewed then applied; Inès accepts it.
  r := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w3-sat', 'title', 'Sortie 10 km avec côtes', 'instructions', '6 côtes de 200 m au milieu', 'note', 'Côtes comme demandé', 'dry_run', true));
  assert (r->>'dry_run')::boolean and r#>>'{effects,0,effect}' = 'updated' and r#>>'{effects,0,after,title}' = 'Sortie 10 km avec côtes'
     and (public.zz_pg_row(pi, 'w3-sat')).title = 'Sortie longue 14 km', 'preview only: nothing written';
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w3-sat', 'title', 'Sortie 10 km avec côtes', 'instructions', '6 côtes de 200 m au milieu', 'preview_key', r->>'preview_key')) = 'INVALID_INPUT', 'an applied revision carries its op_id';
  r := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w3-sat', 'title', 'Sortie 10 km avec côtes', 'instructions', '6 côtes de 200 m au milieu',
    'preview_key', r->>'preview_key', 'op_id', '19400000-0000-4000-8000-000000000001', 'note', 'Côtes comme demandé'));
  assert r->>'version' = '2' and (public.zz_pg_row(pi, 'w3-sat')).title = 'Sortie 10 km avec côtes' and (public.zz_pg_row(pi, 'w3-sat')).discuss_at is null
     and (public.zz_pg_row(pi, 'w3-sat')).status = 'proposed', 'replaced, back to awaiting';
  r := public.zz_pg(a[4], 'answer', jsonb_build_object('id', pi, 'decisions', '[{"key":"w3-sat","answer":"accept"}]'::jsonb));
  assert r#>>'{results,0,effect}' = 'accepted' and r#>>'{plan,counts,accepted}' = '10', 'Inès accepts the replacement';
end $$;

-- ---- Part 4: two weeks later. Week 1 is played (Tuesday linked, Saturday overdue); week 2 has its Monday done and linked.
reset role;
do $$ begin perform public.zz_pg_age(current_setting('titan.pg_pi')::uuid, 14); end $$;
do $$
declare a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; pi uuid := current_setting('titan.pg_pi')::uuid; s1 uuid; s2 uuid;
begin
  s1 := public.zz_pg_log(a[4], 'running', (((public.zz_pg_row(pi, 'w1-tue')).planned_date) + time '07:00') at time zone 'Europe/Paris', 7.8, 'km');
  s2 := public.zz_pg_log(a[4], 'running', now() - interval '1 minute', 8.1, 'km');
  perform set_config('titan.pg_s1', s1::text, true); perform set_config('titan.pg_s2', s2::text, true);
end $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; pi uuid := current_setting('titan.pg_pi')::uuid;
  wk date := current_setting('titan.pg_wk')::date; today date := (now() at time zone 'Europe/Paris')::date; r jsonb; r1 jsonb; w1 text; v1 jsonb; x public.coach_assignments;
begin
  x := public.zz_pg_row(pi, 'w1-tue');
  r := public.zz_pg_follow(a[4], 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', current_setting('titan.pg_s1')));
  assert (r->>'ok')::boolean and r#>>'{row,state}' = 'linked', 'week 1 Tuesday linked (V1.9.1)';
  x := public.zz_pg_row(pi, 'w2-tue');
  r := public.zz_pg_follow(a[4], 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', current_setting('titan.pg_s2')));
  assert (r->>'ok')::boolean, 'week 2 Monday done and linked';
  r := public.zz_pg(c, 'plan', jsonb_build_object('id', pi));
  assert r->>'current_week' = '2' and r#>>'{counts,linked}' = '2'
     and (select e->>'state' from jsonb_array_elements(r->'sessions') e where e->>'key' = 'w1-sat') = 'overdue', 'week 2 running, two linked, week 1 Saturday overdue';
  -- Week 1 is history: it is not revised.
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 1, 'shift_days', 2, 'dry_run', true)) = 'WEEK_PLAYED', 'a played week stays';
  w1 := public.zz_pg_week_md5(pi, 1);
  perform set_config('titan.pg_w1', w1, true);
  -- Shift the whole week 2 by two days: the Monday done stays, the two Sundays get a change beside the accepted version.
  r1 := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'dry_run', true, 'note', 'Déplacement pro dimanche'));
  assert (select string_agg((e->>'key') || '=' || (e->>'effect'), ' ' order by e->>'key') from jsonb_array_elements(r1->'effects') e) = 'w2-sat=change_proposed w2-thu=change_proposed w2-tue=kept_done',
    'preview of the week: '||(r1->'effects')::text;
  -- Meanwhile Inès moves her Sunday long run to Saturday (V1.9.1): the preview is stale and its application refused.
  x := public.zz_pg_row(pi, 'w2-sat');
  perform public.zz_pg_follow(a[4], 'move', jsonb_build_object('id', x.id, 'revision', x.revision, 'date', x.planned_date - 1, 'note', 'Plus simple le samedi'));
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche',
    'preview_key', r1->>'preview_key', 'op_id', '19400000-0000-4000-8000-000000000002')) = 'COACH_CONFLICT', 'a stale preview is refused';
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche',
    'preview_key', 'nope', 'op_id', '19400000-0000-4000-8000-000000000002')) = 'COACH_CONFLICT', 'a wrong key too';
  r1 := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'dry_run', true, 'note', 'Déplacement pro dimanche'));
  r := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche',
    'preview_key', r1->>'preview_key', 'op_id', '19400000-0000-4000-8000-000000000002'));
  assert r->>'version' = '3' and r#>>'{summary,counts,change_proposed}' = '2' and r#>>'{summary,counts,kept_done}' = '1', 'week 2 shifted: '||(r->'summary')::text;
  x := public.zz_pg_row(pi, 'w2-thu');
  assert x.planned_date = wk + 6 and x.pending_change->>'planned_date' = (wk + 8)::text and x.pending_change->>'plan_version' = '3'
     and x.accepted_version->>'planned_date' = (wk + 6)::text and x.status = 'accepted', 'accepted session: change waiting, version in force and accepted version kept';
  x := public.zz_pg_row(pi, 'w2-tue');
  assert x.status = 'completed' and x.session_id = current_setting('titan.pg_s2')::uuid and x.planned_date = wk and x.pending_change is null, 'the session done is not replaced';
  assert public.zz_pg_week_md5(pi, 1) = w1, 'week 1 untouched';
  -- Replaying the same revision (a lost answer) returns its version and writes nothing.
  r := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'week', 'week', 2, 'shift_days', 2, 'note', 'Déplacement pro dimanche',
    'preview_key', r1->>'preview_key', 'op_id', '19400000-0000-4000-8000-000000000002'));
  assert (r->>'already')::boolean and r->>'version' = '3' and public.zz_pg_versions(pi) = '1:sent,2:revision,3:revision', 'replay: no new version';
  -- Inès accepts the Thursday change, keeps her version of the long run (moved to Saturday by her).
  r := public.zz_pg(a[4], 'answer', jsonb_build_object('id', pi, 'decisions', '[{"key":"w2-thu","answer":"accept_change"},{"key":"w2-sat","answer":"keep_version"}]'::jsonb));
  assert (select string_agg((e->>'key') || '=' || (e->>'effect'), ' ' order by e->>'key') from jsonb_array_elements(r->'results') e) = 'w2-sat=version_kept w2-thu=change_accepted', 'answers on changes';
  assert (public.zz_pg_row(pi, 'w2-thu')).planned_date = wk + 8 and (public.zz_pg_row(pi, 'w2-thu')).accepted_version->>'planned_date' = (wk + 6)::text
     and (public.zz_pg_row(pi, 'w2-sat')).planned_date = wk + 6 and (public.zz_pg_row(pi, 'w2-sat')).moved_date = wk + 5, 'first accepted version kept; her move kept';
  -- The version of the send still shows week 2 as it was.
  v1 := (select e from jsonb_array_elements(public.zz_pg(c, 'plan', jsonb_build_object('id', pi))->'versions') e where e->>'version' = '1');
  assert (select e->>'planned_date' from jsonb_array_elements(v1->'snapshot') e where e->>'key' = 'w2-thu') = (wk + 20)::text, 'version 1 keeps its dates (before the 14 days of the fixture)';
end $$;

-- ---- Part 5: the rest of the cycle moves by a week; one occurrence is replaced; a done session is never revised.
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; pi uuid := current_setting('titan.pg_pi')::uuid;
  wk date := current_setting('titan.pg_wk')::date; r jsonb; r1 jsonb; x public.coach_assignments; w3 date;
begin
  w3 := (public.zz_pg_row(pi, 'w3-tue')).planned_date;
  r1 := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'rest', 'week', 3, 'shift_days', 7, 'dry_run', true));
  assert (select string_agg((e->>'key') || '=' || (e->>'effect'), ' ' order by e->>'key') from jsonb_array_elements(r1->'effects') e)
       = 'w3-sat=change_proposed w3-thu=change_proposed w3-tue=change_proposed w4-sat=change_proposed w4-thu=kept_declined w4-tue=change_proposed', 'preview of the rest: '||(r1->'effects')::text;
  r := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'rest', 'week', 3, 'shift_days', 7, 'preview_key', r1->>'preview_key', 'op_id', '19400000-0000-4000-8000-000000000003'));
  assert r->>'version' = '4' and r#>>'{plan,counts,changes_pending}' = '5', 'rest shifted, five changes waiting';
  r := public.zz_pg(a[4], 'answer', jsonb_build_object('id', pi, 'all', 'accept'));
  assert (select count(*) from jsonb_array_elements(r->'results') e where e->>'effect' = 'change_accepted') = 5 and r#>>'{plan,counts,changes_pending}' = '0', 'Inès accepts the whole report';
  x := public.zz_pg_row(pi, 'w3-tue');
  assert x.planned_date = w3 + 7 and x.accepted_version->>'planned_date' = w3::text, 'week 3 a week later, its first accepted version kept';
  assert (public.zz_pg_row(pi, 'w4-thu')).status = 'declined' and (public.zz_pg_row(pi, 'w4-thu')).planned_date = w3 + 9, 'the declined session is left as it was';
  -- Replace an accepted occurrence (the week 4 test moves to the track): a change beside the accepted version; Inès accepts.
  r1 := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w4-sat', 'title', 'Test 10 km sur piste', 'instructions', 'À fond sur 10 km, échauffement 20 min', 'dry_run', true));
  assert r1#>>'{effects,0,effect}' = 'change_proposed', 'an accepted occurrence gets a change';
  r := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w4-sat', 'title', 'Test 10 km sur piste', 'instructions', 'À fond sur 10 km, échauffement 20 min',
    'preview_key', r1->>'preview_key', 'op_id', '19400000-0000-4000-8000-000000000004'));
  perform public.zz_pg(a[4], 'answer', jsonb_build_object('id', pi, 'decisions', '[{"key":"w4-sat","answer":"accept_change"}]'::jsonb));
  x := public.zz_pg_row(pi, 'w4-sat');
  assert x.title = 'Test 10 km sur piste' and x.accepted_version->>'title' = 'Test 10 km', 'replaced; the accepted original stays readable';
  -- A session done and linked is never revised; an occurrence outside the dates is refused.
  r1 := public.zz_pg(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w1-tue', 'instructions', 'Autre', 'dry_run', true));
  assert r1#>>'{effects,0,effect}' = 'kept_done', 'the linked session is kept';
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w1-tue', 'instructions', 'Autre', 'preview_key', r1->>'preview_key', 'op_id', gen_random_uuid())) = 'CHANGE_EMPTY', 'nothing to apply';
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'occurrence', 'key', 'w4-tue', 'planned_date', current_date - 3, 'dry_run', true)) = 'INVALID_PERIOD', 'not into the past';
  assert public.zz_pg_week_md5(pi, 1) = current_setting('titan.pg_w1'), 'week 1 still untouched';
  assert public.zz_pg_versions(pi) = '1:sent,2:revision,3:revision,4:revision,5:revision', 'every version kept';
end $$;

-- ---- Part 6: the places of the offer drop (Inès and Malo paused), then come back; Inès narrows her sharing.
reset role;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(current_setting('titan.pg_c')::uuid, 'google_play', 'pg-coach-lou', false, 'canceled', 'test', clock_timestamp(), null, 'titan02', null, now(), now(), null, null);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.pg_l'), ',')::uuid[];
  pi uuid := current_setting('titan.pg_pi')::uuid; r jsonb; s jsonb;
begin
  assert public.zz_pg_err(c, 'link', jsonb_build_object('link_id', l[4])) = 'COACH_CAPACITY_PAUSED' and public.zz_pg_err(c, 'plan', jsonb_build_object('id', pi)) = 'COACH_CAPACITY_PAUSED'
     and public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'rest', 'week', 4, 'shift_days', 1, 'dry_run', true)) = 'COACH_CAPACITY_PAUSED'
     and public.zz_pg_err(c, 'close', jsonb_build_object('id', pi, 'revision', 99)) = 'COACH_CAPACITY_PAUSED', 'paused: the coach reads and does nothing';
  assert jsonb_array_length(public.zz_pg(c, 'link', jsonb_build_object('link_id', l[1]))->'plans') = 0, 'an active link of the same coach still answers';
  r := public.zz_pg(a[4], 'athlete');
  s := (select e from jsonb_array_elements(r#>'{plans,0,sessions}') e where e->>'key' = 'w1-tue');
  assert r#>>'{plans,0,link_state}' = 'paused' and r#>>'{plans,0,can_act}' = 'false' and s->>'state' = 'linked'
     and s#>>'{linked,session_id}' = current_setting('titan.pg_s1') and s#>>'{linked,val}' = '7.8', 'Inès reads her programme and her own session, read-only';
  assert public.zz_pg_err(a[4], 'answer', jsonb_build_object('id', pi, 'all', 'accept')) = 'COACH_CAPACITY_PAUSED', 'and does not answer while paused';
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'pg-coach-lou', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  r := public.zz_pg(c, 'plan', jsonb_build_object('id', pi));
  assert r->>'link_state' = 'active' and r#>>'{counts,linked}' = '2' and jsonb_array_length(r->'versions') = 5
     and (select e#>>'{linked,day}' from jsonb_array_elements(r->'sessions') e where e->>'key' = 'w1-tue') is not null, 'places back: the same links, the same versions';
  -- Inès narrows her sharing to cycling: the coach reads « linked » only for her running sessions, no day, no measure.
  perform public.zz_pg_portal(a[4], 'scope', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4]), 'since_date', current_date - 60, 'sport', 'cycling'));
  r := public.zz_pg(c, 'plan', jsonb_build_object('id', pi));
  s := (select e from jsonb_array_elements(r->'sessions') e where e->>'key' = 'w1-tue');
  assert s->>'state' = 'linked' and s#>>'{linked,in_scope}' = 'false' and s->>'done_date' is null and not (s->'linked') ? 'val'
     and not exists (select 1 from jsonb_array_elements(s->'history') h where h ? 'day'), 'outside her sharing: linked, nothing more: '||s::text;
  s := (select e from jsonb_array_elements(public.zz_pg(a[4], 'athlete')#>'{plans,0,sessions}') e where e->>'key' = 'w1-tue');
  assert s#>>'{linked,val}' = '7.8', 'Inès still reads her session';
  perform public.zz_pg_portal(a[4], 'scope', jsonb_build_object('link_id', l[4], 'revision', (select revision from public.coach_links where id = l[4]), 'since_date', current_date - 60));
end $$;

-- ---- Part 7: Malo accepts and links part of his programme, then revokes the link while it is open; Inès's cycle is closed.
reset role;
do $$ begin perform set_config('titan.pg_s3', public.zz_pg_log((string_to_array(current_setting('titan.pg_a'), ',')::uuid[])[5], 'running', now() - interval '2 minutes', 6.0, 'km')::text, true); end $$;
set local role authenticated;
do $$
declare
  c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; l uuid[] := string_to_array(current_setting('titan.pg_l'), ',')::uuid[];
  pi uuid := current_setting('titan.pg_pi')::uuid; pm uuid := current_setting('titan.pg_pm')::uuid; r jsonb; s jsonb; x public.coach_assignments; n integer;
begin
  r := public.zz_pg(a[5], 'answer', jsonb_build_object('id', pm, 'decisions', '[{"key":"w1-tue","answer":"accept"},{"key":"w1-sat","answer":"accept"}]'::jsonb));
  x := public.zz_pg_row(pm, 'w1-tue');
  perform public.zz_pg_follow(a[5], 'link', jsonb_build_object('id', x.id, 'revision', x.revision, 'session_id', current_setting('titan.pg_s3')));
  n := public.zz_pg_count(l[5]);
  perform public.zz_pg_portal(a[5], 'revoke', jsonb_build_object('link_id', l[5], 'revision', (select revision from public.coach_links where id = l[5])));
  assert public.zz_pg_err(c, 'plan', jsonb_build_object('id', pm)) = 'SHARING_UNAVAILABLE' and public.zz_pg_err(c, 'link', jsonb_build_object('link_id', l[5])) = 'SHARING_UNAVAILABLE'
     and public.zz_pg_err(c, 'revise', jsonb_build_object('id', pm, 'scope', 'rest', 'week', 2, 'shift_days', 1, 'dry_run', true)) = 'SHARING_UNAVAILABLE'
     and public.zz_pg_err(c, 'close', jsonb_build_object('id', pm, 'revision', 2)) = 'SHARING_UNAVAILABLE', 'revoked: the coach loses access';
  assert public.zz_pg_err(a[5], 'answer', jsonb_build_object('id', pm, 'all', 'accept')) = 'SHARING_UNAVAILABLE', 'Malo does not answer on an ended link';
  r := public.zz_pg(a[5], 'athlete');
  s := (select e from jsonb_array_elements(r#>'{plans,0,sessions}') e where e->>'key' = 'w1-tue');
  assert r#>>'{plans,0,link_state}' = 'revoked' and r#>>'{plans,0,can_act}' = 'false' and r#>>'{plans,0,state}' = 'sent'
     and s->>'state' = 'linked' and s#>>'{linked,session_id}' = current_setting('titan.pg_s3') and public.zz_pg_count(l[5]) = n, 'Malo keeps his programme and his session, read-only';
  assert (select count(*) from jsonb_array_elements(public.zz_pg_review(c, '{"filter":"all"}')->'cards') e where e->>'name' = 'Malo') = 0, 'Malo leaves the review';
  -- Inès's cycle ends: nothing waits any more, what she accepted and did stays; replaying the close changes nothing.
  r := public.zz_pg(c, 'plan', jsonb_build_object('id', pi));
  r := public.zz_pg(c, 'close', jsonb_build_object('id', pi, 'revision', r->>'revision'));
  assert r#>>'{plan,state}' = 'closed' and r#>>'{plan,counts,linked}' = '2' and r#>>'{plan,counts,cancelled}' = '0' and r#>>'{plan,counts,declined}' = '1', 'closed: '||(r#>'{plan,counts}')::text;
  r := public.zz_pg(c, 'close', jsonb_build_object('id', pi, 'revision', 0));
  assert (r->>'already')::boolean and public.zz_pg_versions(pi) = '1:sent,2:revision,3:revision,4:revision,5:revision,6:closed', 'one closing version';
  assert public.zz_pg_err(c, 'revise', jsonb_build_object('id', pi, 'scope', 'rest', 'week', 4, 'shift_days', 1, 'dry_run', true)) = 'INVALID_TRANSITION', 'a closed cycle is not revised';
  assert public.zz_pg_err(a[4], 'answer', jsonb_build_object('id', pi, 'all', 'accept')) = 'INVALID_TRANSITION', 'nor answered';
  r := public.zz_pg(a[4], 'athlete');
  assert r#>>'{plans,0,state}' = 'closed' and jsonb_array_length(r#>'{plans,0,versions}') = 6, 'Inès reads the closed cycle and its versions';
end $$;

-- ---- Part 8: the journal, the export, the measure and the grants.
reset role;
do $$
declare c uuid := current_setting('titan.pg_c')::uuid; a uuid[] := string_to_array(current_setting('titan.pg_a'), ',')::uuid[]; e jsonb; m jsonb; v text;
begin
  -- The only rows of public.training_logs are the three sessions this test wrote itself; nothing else changed.
  select coalesce(md5(string_agg(to_jsonb(l)::text, ';' order by l.id)), 'empty') into v from public.training_logs l
   where l.id not in (current_setting('titan.pg_s1')::uuid, current_setting('titan.pg_s2')::uuid, current_setting('titan.pg_s3')::uuid);
  assert v is not distinct from current_setting('titan.pg_journal'), 'public.training_logs never written by the programme';
  assert (select count(*) from public.training_logs where id in (current_setting('titan.pg_s1')::uuid, current_setting('titan.pg_s2')::uuid, current_setting('titan.pg_s3')::uuid)
            and details->>'note' = 'Bonnes jambes' and val in (7.8, 8.1, 6.0)) = 3, 'the athletes'' sessions unchanged';
  e := private.titan_export_extras_v1(c);
  assert jsonb_array_length(e->'coachPrograms') = 1 and jsonb_array_length(e#>'{coachPrograms,0,versions}') = 2 and jsonb_array_length(e->'coachPlans') = 2, 'coach export: template and programmes';
  e := private.titan_export_extras_v1(a[4]);
  assert jsonb_array_length(e->'coachPrograms') = 0 and jsonb_array_length(e->'coachPlans') = 1 and jsonb_array_length(e#>'{coachPlans,0,versions}') = 6, 'Inès''s export: her programme and its versions';
  m := private.titan_coach_program_measure();
  assert m->>'programs' = '1' and m->>'programVersions' = '2' and m#>>'{plans,sent}' = '1' and m#>>'{plans,closed}' = '1' and m->>'revisions' = '4'
     and m->>'plansRevised' = '1' and m->>'plansRevisedWithHistory' = '1' and m->>'prepMinutesMedian' is not null and m->>'linked' = '3', 'measure: '||m::text;
  assert not has_function_privilege('authenticated', 'private.titan_coach_program_measure()', 'execute')
     and not has_table_privilege('authenticated', 'private.titan_coach_plans', 'select') and not has_table_privilege('anon', 'private.titan_coach_programs', 'select')
     and not has_function_privilege('anon', 'public.titan_coach_program_v1(text, jsonb)', 'execute'), 'private tables and measure: team only';
  raise notice 'V1.9.4 measure: %', m;
end $$;
rollback;

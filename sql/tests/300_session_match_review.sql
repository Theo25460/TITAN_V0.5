-- V1.6.2 — Rapprochement des séances (migration 20261130100100). Synthetic accounts only, full rollback.
-- A. A typed mountain-bike ride and the same effort read by Health Connect as « cycling »: ONE counted session; the link keeps what the
--    source said and the rule; replaying the import changes nothing.
-- B. Two runs the same day (morning typed, evening imported) stay two, also after a replay.
-- C. The V15 trap: a morning run typed in the evening with « now » swallows the evening import. The athlete splits it (one new session,
--    normal rewards), replay keeps the split; rejoin archives it without touching rewards; splitting again restores the SAME session.
-- D. Uncertain matches are linked once and flagged: duration gap, distance gap, several candidates. The athlete confirms one.
-- E. A session across midnight; unit change (metres typed, kilometres imported); a link from before V1.6.2 learns its source on replay.
-- F. Ownership: another account sees and decides nothing; the journal table and helpers are private.
begin;
do $$
declare k text;
begin
  foreach k in array array['a','b','c','d'] loop
    perform set_config('titan.sm_'||k, gen_random_uuid()::text, true);
    insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.sm_'||k)::uuid,'{}');
  end loop;
  update public.profiles set created_at = now() - interval '400 days'
   where id in (current_setting('titan.sm_a')::uuid, current_setting('titan.sm_b')::uuid, current_setting('titan.sm_c')::uuid, current_setting('titan.sm_d')::uuid);
  assert private.titan_session_match_reasons(40, 45, 40, null, null, 1) = '{}'::text[], 'a clear match has no reason';
  assert private.titan_session_match_reasons(20, 20, 60, null, null, 1) = array['duration_gap'], 'duration gap 20 vs 60';
  assert private.titan_session_match_reasons(36, 60, 60, null, null, 1) = array['partial_overlap'], 'share 0.6 of the shorter';
  assert private.titan_session_match_reasons(60, 60, 60, 12.5, 10, 1) = array['distance_gap'], 'distance gap 12.5 vs 10';
  assert private.titan_session_match_reasons(50, 50, 50, null, null, 2) = array['several_candidates'], 'two journal candidates';
end $$;

set local role authenticated;
do $$
declare k text;
begin
  foreach k in array array['a','b','c','d'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.sm_'||k),'role','authenticated')::text,true);
    perform public.titan_set_source_consent_v1('health_connect',true);
  end loop;
end $$;

-- A and B.
do $$
declare a uuid := current_setting('titan.sm_a')::uuid; ride record; run record; r jsonb; m jsonb; n int; km numeric; t0 timestamptz := date_trunc('minute', now()) - interval '10 hours';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select * into ride from public.titan_submit_training_session('mountain_bike','cycling',32,'km',jsonb_build_object('duration',120,'note','Boue au col'),t0);
  select count(*), sum(val) into n, km from public.training_logs where user_id=a and archived_at is null;
  assert n=1 and km=32, 'fixture: one typed ride';
  r := public.titan_import_activity_v1('health_connect','sm-hc-ride','cycling',t0 + interval '3 minutes',118);
  assert r->>'status'='linked' and r->>'log_id'=ride.log_id and (r->>'needs_review')::boolean = false, 'A: the import joins the typed ride, certain: '||r::text;
  select count(*), sum(val) into n, km from public.training_logs where user_id=a and archived_at is null;
  assert n=1 and km=32, 'A: still one counted session and 32 km, found '||n||' / '||km;
  m := public.titan_session_matches_v1(ride.log_id::uuid) -> 0;
  assert m->>'source'='health_connect' and m->>'sport'='cycling' and (m->>'duration_minutes')::numeric=118 and m->>'match_rule'='v15_group_overlap'
     and (m->>'started_at')::timestamptz = t0 + interval '3 minutes' and (m->>'match_overlap')::numeric >= 0.98, 'A: the link keeps what the source said: '||m::text;
  assert m->'events'->0->>'action'='linked' and m->'events'->0->>'actor'='engine', 'A: the engine decision is journaled';
  assert (select details->>'note' from public.training_logs where id=ride.log_id::uuid)='Boue au col', 'A: the athlete note is untouched';
  r := public.titan_import_activity_v1('health_connect','sm-hc-ride','cycling',t0 + interval '3 minutes',118);
  assert r->>'status'='duplicate' and r->>'log_id'=ride.log_id and r->>'previous'='linked', 'A: replay answers the link in force: '||r::text;
  assert (select count(*) from public.training_logs where user_id=a and archived_at is null)=1, 'A: replay adds nothing';

  -- B. Morning run typed, evening run imported the same day.
  select * into run from public.titan_submit_training_session('running','cardio',8,'km',jsonb_build_object('duration',45),t0 - interval '1 hour');
  r := public.titan_import_activity_v1('health_connect','sm-hc-evening','running',t0 + interval '8 hours',50);
  assert r->>'status'='imported', 'B: a run eight hours later is another effort: '||r::text;
  r := public.titan_import_activity_v1('health_connect','sm-hc-evening','running',t0 + interval '8 hours',50);
  assert r->>'status'='duplicate' and r->>'previous'='imported', 'B: replay keeps it as it is';
  select count(*) into n from public.training_logs where user_id=a and archived_at is null and sport='running';
  assert n=2, 'B: two runs remain two, found '||n;
end $$;

-- C. Split, replay, split again, rejoin, split again.
do $$
declare b uuid := current_setting('titan.sm_b')::uuid; typed record; r jsonb; m jsonb; v_split uuid; xp0 bigint; xp1 bigint; n int; t1 timestamptz := date_trunc('minute', now()) - interval '2 hours';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  -- The morning run typed at t1+45 min with « now »: dated t1+5 min (its start), 40 minutes long.
  select * into typed from public.titan_submit_training_session('running','cardio',8,'km',jsonb_build_object('duration',40,'note','Footing de ce matin'),t1 + interval '5 minutes');
  r := public.titan_import_activity_v1('health_connect','sm-hc-trap','running',t1,45);
  assert r->>'status'='linked' and r->>'log_id'=typed.log_id, 'C: V15 links the evening run to the morning entry: '||r::text;
  select coalesce(sum(xp),0) into xp0 from public.training_logs where user_id=b;
  m := public.titan_resolve_session_match_v1('health_connect','sm-hc-trap','distinct');
  v_split := (m->>'log_id')::uuid;
  assert m->>'status'='imported' and m->>'decision'='distinct' and (m->>'linked_log_id')::uuid = typed.log_id::uuid and v_split <> typed.log_id::uuid, 'C: split: '||m::text;
  assert (select count(*) from public.training_logs where user_id=b and archived_at is null)=2, 'C: two counted sessions after the split';
  assert (select sport||':'||date::text||':'||(details->>'duration') from public.training_logs where id=v_split) = 'running:'||t1::text||':45', 'C: the split session carries what the source said';
  assert (select details->'match'->'distinct_from'->>0 from public.training_logs where id=v_split) = typed.log_id, 'C: the split session remembers which entry it is not';
  assert (select details->>'note' from public.training_logs where id=typed.log_id::uuid)='Footing de ce matin', 'C: the athlete entry is untouched';
  select coalesce(sum(xp),0) into xp1 from public.training_logs where user_id=b;
  r := public.titan_import_activity_v1('health_connect','sm-hc-trap','running',t1,45);
  assert r->>'status'='duplicate' and (r->>'log_id')::uuid=v_split and r->>'decision'='distinct', 'C: replay keeps the split: '||r::text;
  m := public.titan_resolve_session_match_v1('health_connect','sm-hc-trap','distinct');
  assert (m->>'log_id')::uuid=v_split and (select count(*) from public.training_logs where user_id=b)=2, 'C: deciding twice creates nothing';

  m := public.titan_resolve_session_match_v1('health_connect','sm-hc-trap','same');
  assert m->>'status'='linked' and m->>'log_id'=typed.log_id and (m->>'split_log_id')::uuid=v_split, 'C: rejoin: '||m::text;
  assert (select count(*) from public.training_logs where user_id=b and archived_at is null)=1, 'C: one counted session after rejoin';
  assert (select archived_at is not null from public.training_logs where id=v_split), 'C: the split session is archived, not deleted';
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=b)=xp1, 'C: rejoin grants and removes no reward';
  r := public.titan_import_activity_v1('health_connect','sm-hc-trap','running',t1,45);
  assert r->>'status'='duplicate' and r->>'log_id'=typed.log_id and r->>'decision'='same', 'C: replay keeps the rejoin: '||r::text;

  m := public.titan_resolve_session_match_v1('health_connect','sm-hc-trap','distinct');
  assert (m->>'log_id')::uuid=v_split, 'C: splitting again restores the same session: '||m::text;
  select count(*) into n from public.training_logs where user_id=b;
  assert n=2 and (select coalesce(sum(xp),0) from public.training_logs where user_id=b)=xp1, 'C: no new row and no new reward on the second split';
  assert (select count(*) from public.training_logs where user_id=b and archived_at is null)=2, 'C: two counted sessions again';
  assert (select string_agg(e->>'action', ',') from jsonb_array_elements(m->'events') e) = 'linked,split,rejoined,split', 'C: every decision is journaled: '||(m->'events')::text;
  assert xp1 >= xp0, 'C: the split session earned under the normal rules';
end $$;

-- D. Uncertain matches.
do $$
declare c uuid := current_setting('titan.sm_c')::uuid; s record; r jsonb; m jsonb; t2 timestamptz := date_trunc('minute', now()) - interval '30 hours';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  select * into s from public.titan_submit_training_session('muscu_gym','strength',60,'min',jsonb_build_object('duration',60),t2);
  r := public.titan_import_activity_v1('health_connect','sm-hc-lift','weightlifting',t2 + interval '40 minutes',20);
  assert r->>'status'='linked' and (r->>'needs_review')::boolean and r->'reasons' ? 'duration_gap', 'D: 20 min watch at the end of 60 min typed is uncertain: '||r::text;
  assert (select count(*) from public.training_logs where user_id=c and archived_at is null)=1, 'D: still counted once';
  m := public.titan_session_matches_v1() -> 0;
  assert (m->>'needs_review')::boolean and m->'events'->0->>'action'='flagged', 'D: listed as to check: '||m::text;
  m := public.titan_resolve_session_match_v1('health_connect','sm-hc-lift','same');
  assert m->>'decision'='same' and not (m->>'needs_review')::boolean and m->'events'->1->>'action'='confirmed', 'D: confirmed by the athlete: '||m::text;
  assert (select count(*) from public.training_logs where user_id=c and archived_at is null)=1, 'D: confirming changes no count';

  perform public.titan_submit_training_session('running','cardio',10,'km',jsonb_build_object('duration',60),t2 + interval '3 hours');
  r := public.titan_import_activity_v1('health_connect','sm-hc-gps','running',t2 + interval '3 hours',60,12.5);
  assert r->>'status'='linked' and r->'reasons' ? 'distance_gap', 'D: 12.5 km for a typed 10 km is uncertain: '||r::text;

  perform public.titan_submit_training_session('cycling','cycling',30,'km',jsonb_build_object('duration',60),t2 + interval '6 hours');
  perform public.titan_submit_training_session('cycling','cycling',30,'km',jsonb_build_object('duration',59),t2 + interval '6 hours 1 minute');
  r := public.titan_import_activity_v1('health_connect','sm-hc-twice','cycling',t2 + interval '6 hours',60);
  assert r->>'status'='linked' and r->'reasons' ? 'several_candidates', 'D: two typed entries match the import: '||r::text;
end $$;

-- E. Midnight, units, a link from before V1.6.2.
do $$
declare d uuid := current_setting('titan.sm_d')::uuid; night record; swim record; r jsonb; m jsonb; mid timestamptz := date_trunc('day', now()) - interval '1 day';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',d,'role','authenticated')::text,true);
  -- 23:30 → 00:40 across midnight, typed as a trail run; Health Connect brings « running » from 23:28 for 72 minutes.
  select * into night from public.titan_submit_training_session('trail','cardio',12,'km',jsonb_build_object('duration',70),mid - interval '30 minutes');
  r := public.titan_import_activity_v1('health_connect','sm-hc-night','running',mid - interval '32 minutes',72);
  assert r->>'status'='linked' and r->>'log_id'=night.log_id and not (r->>'needs_review')::boolean, 'E: the run across midnight is one session: '||r::text;
  -- Another run the next morning, after midnight, is another effort.
  r := public.titan_import_activity_v1('health_connect','sm-hc-after','running',mid + interval '50 minutes',40);
  assert r->>'status'='imported', 'E: a run 00:50 → 01:30 is another effort: '||r::text;

  -- A swim typed in metres, imported in kilometres: no distance gap.
  select * into swim from public.titan_submit_training_session('swimming','water',1500,'m',jsonb_build_object('duration',35),mid + interval '8 hours');
  r := public.titan_import_activity_v1('health_connect','sm-hc-swim','open_water_swimming',mid + interval '8 hours',35,1.5);
  assert r->>'status'='linked' and r->>'log_id'=swim.log_id and r->'reasons' = '[]'::jsonb, 'E: 1 500 m typed and 1.5 km imported agree: '||r::text;
end $$;
reset role;
do $$
declare d uuid := current_setting('titan.sm_d')::uuid; l uuid; r jsonb; m jsonb;
begin
  -- A link written before V1.6.2: no source values.
  select id into l from public.training_logs where user_id=d and sport='trail';
  insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (d, 'health_connect', 'sm-hc-old', l, 'linked');
  perform set_config('titan.sm_old_log', l::text, true);
end $$;
set local role authenticated;
do $$
declare d uuid := current_setting('titan.sm_d')::uuid; r jsonb; m jsonb; ok boolean := false;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',d,'role','authenticated')::text,true);
  select x into m from jsonb_array_elements(public.titan_session_matches_v1(current_setting('titan.sm_old_log')::uuid)) x where x->>'external_id'='sm-hc-old';
  assert m->>'started_at' is null, 'E: an old link has no source values';
  begin perform public.titan_resolve_session_match_v1('health_connect','sm-hc-old','distinct'); exception when others then ok := sqlerrm='MATCH_SOURCE_UNKNOWN'; end;
  assert ok, 'E: an old link cannot be split before its source is known';
  r := public.titan_import_activity_v1('health_connect','sm-hc-old','running',now() - interval '30 hours',40);
  assert r->>'status'='duplicate', 'E: replay of an old link';
  select x into m from jsonb_array_elements(public.titan_session_matches_v1(current_setting('titan.sm_old_log')::uuid)) x where x->>'external_id'='sm-hc-old';
  assert m->>'sport'='running' and (m->>'duration_minutes')::numeric=40 and m->>'status'='linked' and m->>'decision' is null, 'E: replay fills what the source says, nothing else: '||m::text;

  -- F. Ownership.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.sm_a'),'role','authenticated')::text,true);
  assert not exists (select 1 from jsonb_array_elements(public.titan_session_matches_v1()) x where x->>'external_id' like 'sm-hc-night%'), 'F: A sees nothing of D';
  assert public.titan_session_matches_v1(current_setting('titan.sm_old_log')::uuid) = '[]'::jsonb, 'F: A cannot read a session of D';
  ok := false;
  begin perform public.titan_resolve_session_match_v1('health_connect','sm-hc-night','distinct'); exception when others then ok := sqlerrm='MATCH_UNKNOWN'; end;
  assert ok, 'F: A cannot decide for D';
  ok := false;
  begin perform public.titan_resolve_session_match_v1('health_connect','sm-hc-ride','maybe'); exception when others then ok := sqlerrm='DECISION_INVALID'; end;
  assert ok, 'F: only same or distinct';
end $$;
reset role;
do $$
begin
  assert not has_table_privilege('authenticated','private.titan_imported_activities','select'), 'F: the links and their journal are private';
  assert not has_function_privilege('anon','public.titan_session_matches_v1(uuid)','execute'), 'F: no anonymous read';
  assert not has_function_privilege('anon','public.titan_resolve_session_match_v1(text,text,text)','execute'), 'F: no anonymous decision';
  assert not has_function_privilege('authenticated','private.titan_session_shared_minutes(public.training_logs,timestamptz,numeric)','execute'), 'F: private helper';
  assert (select jsonb_array_length(events) from private.titan_imported_activities where user_id = current_setting('titan.sm_b')::uuid and external_id = 'sm-hc-trap') = 4, 'F: four journal entries for C';
  assert private.titan_session_match_trim((select jsonb_agg(n) from generate_series(1, 60) n)) = (select jsonb_agg(n) from generate_series(12, 60) n), 'F: the journal keeps the 49 latest entries';
end $$;
rollback;

-- V1.6.5 — Centre des sources connectées (migration 20261130100500). Synthetic accounts only, full rollback.
-- A. Santé Connect read on the phone: a run is opened then closed; the same window resumed twice imports nothing twice; a session the
--    athlete corrected is never rewritten by a resume; the center reads consent, counts, sports, fields and runs.
-- B. Withdrawal: no reading is accepted any more (run refused, import refused), only the record that the phone was denied; the
--    consent says the athlete withdrew it; what was imported stays and the existing archive action still works.
-- C. Interruption: a run left « running » stays as it was; a later resume of the same window closes the gap without duplicates.
-- D. Garmin push: every result is kept per account and per day (imported, linked, already imported, ignored with its reason); a
--    deregistration from Garmin is marked as the provider's; nothing is kept for a push once the link ended.
-- E. Ownership: another account reads nothing and cannot close someone else's run; no anonymous access; a closed run is never rewritten.
begin;
do $$
declare k text;
begin
  foreach k in array array['a','b'] loop
    perform set_config('titan.sc_'||k, gen_random_uuid()::text, true);
    insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.sc_'||k)::uuid,'{}');
  end loop;
  update public.profiles set created_at = now() - interval '400 days'
   where id in (current_setting('titan.sc_a')::uuid, current_setting('titan.sc_b')::uuid);
  assert not has_function_privilege('anon','public.titan_source_center_v1()','execute'), 'anonymous cannot read the center';
  assert not has_function_privilege('anon','public.titan_source_run_v1(text,jsonb)','execute'), 'anonymous cannot report a run';
  assert has_function_privilege('authenticated','public.titan_source_center_v1()','execute'), 'the athlete reads the center';
  assert not has_table_privilege('authenticated','private.titan_source_runs','select'), 'no API grant on the runs';
  assert not has_function_privilege('authenticated','private.titan_source_note_push(uuid,jsonb)','execute'), 'a player cannot write a push run';
  assert not has_function_privilege('authenticated','public.titan_garmin_ingest_v1(text,jsonb)','execute'), 'a player still cannot ingest';
end $$;

set local role authenticated;
do $$
declare
  a uuid := current_setting('titan.sc_a')::uuid;
  t0 timestamptz := date_trunc('minute', now()) - interval '20 days';
  run1 uuid := gen_random_uuid(); run2 uuid := gen_random_uuid(); run3 uuid := gen_random_uuid();
  r jsonb; c jsonb; s jsonb; ok boolean; n int; typed record; row public.training_logs%rowtype; xp0 bigint;
  w_from timestamptz := now() - interval '28 days'; w_to timestamptz := now();
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_source_run_v1('health_connect', jsonb_build_object('id',run1,'kind','read','outcome','running','window_from',w_from,'window_to',w_to)); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end;
  assert ok, 'no run before any consent';
  perform public.titan_set_source_consent_v1('health_connect', true);
  ok:=false; begin perform public.titan_source_run_v1('garmin', jsonb_build_object('id',run1,'kind','read','outcome','ok')); exception when others then ok:=sqlerrm='SOURCE_UNKNOWN'; end;
  assert ok, 'a client never reports a Garmin run';
  ok:=false; begin perform public.titan_source_run_v1('health_connect', jsonb_build_object('id',run1,'kind','read','outcome','ok','window_from',now()-interval '60 days','window_to',now())); exception when others then ok:=sqlerrm='SOURCE_RUN_INVALID'; end;
  assert ok, 'a window longer than the source allows is refused';
  ok:=false; begin perform public.titan_source_run_v1('health_connect', jsonb_build_object('id',run1,'kind','read','outcome','ok','window_from',w_from,'window_to',w_to,'excluded',jsonb_build_object('heart_rate',1))); exception when others then ok:=sqlerrm='SOURCE_RUN_INVALID'; end;
  assert ok, 'an unknown exclusion reason is refused';

  -- A typed run the athlete then corrects (10,4 → 10 km): the source must never rewrite it.
  select * into typed from public.titan_submit_training_session('running','cardio',10.4,'km',jsonb_build_object('duration',52,'note','Mon fractionné'),t0);
  select * into row from public.training_logs where id = typed.log_id::uuid;
  perform public.titan_update_training_session(row.id, row.revision, '{"val":10,"duration":50}'::jsonb);
  select coalesce(sum(xp),0) into xp0 from public.training_logs where user_id=a;

  -- A. First reading: opened, then the phone imports what it found, then closes the run.
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run1,'started_at',now() - interval '2 hours','kind','replay','outcome','running','window_from',w_from,'window_to',w_to));
  assert r->>'outcome'='running' and r->>'finished_at' is null, 'A: an open run: '||r::text;
  r := public.titan_import_activity_v1('health_connect','hc-run-1','running',t0 + interval '3 minutes',51,null);
  assert r->>'status'='linked', 'A: the watch run is linked to the typed one: '||r::text;
  r := public.titan_import_activity_v1('health_connect','hc-ride-1','cycling',t0 + interval '2 days',90,null);
  assert r->>'status'='imported', 'A: a ride is imported: '||r::text;
  r := public.titan_import_activity_v1('health_connect','hc-walk-1','walking',t0 + interval '5 days',40,null);
  assert r->>'status'='imported', 'A: a walk is imported: '||r::text;
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run1,'kind','replay','outcome','ok','window_from',w_from,'window_to',w_to,
        'counts',jsonb_build_object('read',4,'imported',2,'linked',1,'excluded',1),'excluded',jsonb_build_object('unmapped_type',1)));
  assert r->>'outcome'='ok' and r->>'finished_at' is not null and (r->'excluded'->>'unmapped_type')::int=1, 'A: closed: '||r::text;
  -- A closed run is never rewritten (a lost answer replayed returns the same row).
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run1,'kind','replay','outcome','failed','error_code','NETWORK'));
  assert r->>'outcome'='ok', 'E: a closed run stays closed: '||r::text;
  select count(*) into n from public.training_logs where user_id=a and archived_at is null; assert n=3, 'A: 3 sessions in the journal, got '||n;

  -- A second resume of the same window: everything answers « duplicate », nothing is added, the correction stays.
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run2,'started_at',now() - interval '1 hour','kind','replay','outcome','running','window_from',w_from,'window_to',w_to));
  r := public.titan_import_activity_v1('health_connect','hc-run-1','running',t0 + interval '3 minutes',51,null); assert r->>'status'='duplicate', 'A2: '||r::text;
  r := public.titan_import_activity_v1('health_connect','hc-ride-1','cycling',t0 + interval '2 days',90,null); assert r->>'status'='duplicate', 'A2: '||r::text;
  r := public.titan_import_activity_v1('health_connect','hc-walk-1','walking',t0 + interval '5 days',40,null); assert r->>'status'='duplicate', 'A2: '||r::text;
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run2,'kind','replay','outcome','empty','window_from',w_from,'window_to',w_to,'counts',jsonb_build_object('read',3,'duplicate',3)));
  select count(*) into n from public.training_logs where user_id=a and archived_at is null; assert n=3, 'A2: still 3 sessions, got '||n;
  c := public.titan_source_center_v1();
  s := (select x from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect');
  assert (s->'fields'->>'total')::int = 3, 'A2: 3 import links: '||(s->'fields')::text;
  select * into row from public.training_logs where id = typed.log_id::uuid;
  assert row.val = 10 and (row.details->>'duration')::numeric = 50 and row.details->>'note' = 'Mon fractionné', 'A2: the correction and the note stay: '||row.val||' '||row.details::text;
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=a) = xp0 + (select coalesce(sum(xp),0) from public.training_logs where user_id=a and sport in ('cycling','walking')), 'A2: only the two new sessions carry XP';

  c := public.titan_source_center_v1();
  s := (select x from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect');
  assert (s->'consent'->>'granted')::boolean and s->'consent'->>'revoked_by' is null, 'A: consent given: '||s::text;
  assert (s->'counts'->>'imported')::int = 2 and (s->'counts'->>'linked')::int = 1, 'A: counts: '||(s->'counts')::text;
  assert jsonb_array_length(s->'runs') = 2 and s->'runs'->0->>'id' = run2::text and s->'runs'->0->>'outcome'='empty', 'A: newest run first: '||(s->'runs')::text;
  assert (s->'fields'->>'total')::int = 3 and (s->'fields'->>'distance')::int = 0, 'A: Santé Connect sends no distance: '||(s->'fields')::text;
  assert jsonb_array_length(s->'sports') = 3, 'A: three sports received: '||(s->'sports')::text;
  assert s->'link' = 'null'::jsonb or s->'link' is null, 'A: no Garmin link on Santé Connect';

  -- C. Interrupted: a run left « running » (the app was closed); a later resume closes the gap without duplicates.
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run3,'started_at',now() - interval '30 minutes','kind','replay','outcome','running','window_from',w_from,'window_to',w_to,'counts',jsonb_build_object('read',2,'imported',0)));
  r := public.titan_import_activity_v1('health_connect','hc-swim-1','swimming',now() - interval '1 day',35,null); assert r->>'status'='imported', 'C: '||r::text;
  c := public.titan_source_center_v1();
  assert (select x->'runs'->0->>'outcome' from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect') = 'running', 'C: the interrupted run stays open';
  perform set_config('titan.sc_run3', run3::text, true);
  perform set_config('titan.sc_wfrom', w_from::text, true);
  perform set_config('titan.sc_wto', w_to::text, true);

  -- B. Withdrawal: reading is refused, only « denied » is recorded; imports are refused; what was imported stays.
  perform public.titan_set_source_consent_v1('health_connect', false);
  ok:=false; begin perform public.titan_source_run_v1('health_connect', jsonb_build_object('id',gen_random_uuid(),'kind','read','outcome','running','window_from',w_from,'window_to',w_to)); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end;
  assert ok, 'B: no reading after withdrawal';
  ok:=false; begin perform public.titan_source_run_v1('health_connect', jsonb_build_object('id',run3,'kind','replay','outcome','ok','window_from',w_from,'window_to',w_to)); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end;
  assert ok, 'B: even closing an open run as a reading is refused after withdrawal';
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-late-1','running',now() - interval '2 hours',30,null); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end;
  assert ok, 'B: no import after withdrawal';
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',gen_random_uuid(),'kind','read','outcome','denied','error_code','CONSENT_REQUIRED'));
  assert r->>'outcome'='denied', 'B: the denial is recorded: '||r::text;
  c := public.titan_source_center_v1();
  s := (select x from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect');
  assert not (s->'consent'->>'granted')::boolean and s->'consent'->>'revoked_by'='user', 'B: withdrawn by the athlete: '||(s->'consent')::text;
  assert (s->'counts'->>'imported')::int = 3, 'B: imported sessions stay in the journal: '||(s->'counts')::text;
  n := public.titan_archive_imported_v1('health_connect');
  assert n = 3, 'B: the existing archive action archives the 3 imported sessions, got '||n;
  select count(*) into n from public.training_logs where user_id=a and archived_at is null; assert n=1, 'B: only the typed (corrected) run stays in the journal, got '||n;
  c := public.titan_source_center_v1();
  s := (select x from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect');
  assert (s->'counts'->>'archived')::int = 3 and (s->'counts'->>'imported')::int = 0, 'B: archived counted apart: '||(s->'counts')::text;
end $$;

-- C (end). Consent given again, the open run is closed by the resume of the same window: nothing twice.
do $$
declare
  a uuid := current_setting('titan.sc_a')::uuid; b uuid := current_setting('titan.sc_b')::uuid;
  run3 uuid := current_setting('titan.sc_run3')::uuid; r jsonb; c jsonb; s jsonb; n int; ok boolean;
  w_from timestamptz := current_setting('titan.sc_wfrom')::timestamptz; w_to timestamptz := current_setting('titan.sc_wto')::timestamptz;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('health_connect', true);
  c := public.titan_source_center_v1();
  assert (select x->'consent'->>'revoked_by' from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect') is null, 'C: given again, no withdrawal shown';
  r := public.titan_import_activity_v1('health_connect','hc-swim-1','swimming',now() - interval '1 day',35,null); assert r->>'status'='duplicate', 'C: the swim imported before the interruption is not imported twice: '||r::text;
  r := public.titan_source_run_v1('health_connect', jsonb_build_object('id',run3,'kind','replay','outcome','empty','window_from',w_from,'window_to',w_to,'counts',jsonb_build_object('read',1,'duplicate',1)));
  assert r->>'outcome'='empty' and r->>'finished_at' is not null, 'C: the interrupted run is closed: '||r::text;
  c := public.titan_source_center_v1();
  assert (select (x->'fields'->>'total')::int from jsonb_array_elements(c->'sources') x where x->>'source'='health_connect') = 4, 'C: 4 links in all';

  -- E. Another account reads nothing of A and cannot close A's run.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  c := public.titan_source_center_v1();
  assert jsonb_array_length(c->'sources') = 0 and c->'batch' = 'null'::jsonb, 'E: B sees nothing: '||c::text;
  perform public.titan_set_source_consent_v1('health_connect', true);
  ok:=false; begin perform public.titan_source_run_v1('health_connect', jsonb_build_object('id',run3,'kind','replay','outcome','failed','error_code','NETWORK')); exception when others then ok:=sqlerrm='SOURCE_RUN_INVALID'; end;
  assert ok, 'E: B cannot touch the run of A';
  perform public.titan_set_source_consent_v1('garmin', true);
end $$;
reset role;

-- D. Garmin push, as the server receives it.
set local role service_role;
do $$
declare b uuid := current_setting('titan.sc_b')::uuid; r jsonb; t0 numeric := floor(extract(epoch from now() - interval '5 hours'));
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.titan_garmin_link_v1(b,'garmin-user-sc');
  r := public.titan_garmin_ingest_v1('garmin-user-sc', jsonb_build_object('summaryId','sc-1','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',2400,'distanceInMeters',8500));
  assert r->>'status'='imported', 'D: imported: '||r::text;
  r := public.titan_garmin_ingest_v1('garmin-user-sc', jsonb_build_object('summaryId','sc-1','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',2400,'distanceInMeters',8500));
  assert r->>'status'='duplicate', 'D: the same activity pushed again: '||r::text;
  r := public.titan_garmin_ingest_v1('garmin-user-sc', jsonb_build_object('summaryId','sc-2','activityType','UNKNOWN_THING','startTimeInSeconds',t0,'durationInSeconds',2400));
  assert r->>'reason'='unmapped_type', 'D: '||r::text;
  r := public.titan_garmin_ingest_v1('garmin-user-sc', jsonb_build_object('summaryId','sc-3','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',20));
  assert r->>'reason'='too_short', 'D: '||r::text;
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.sc_b')::uuid; run record;
begin
  select * into run from private.titan_source_runs where user_id=b and source='garmin' and kind='push';
  assert run.day = current_date and run.outcome='ok', 'D: one push run today';
  assert (run.counts->>'read')::int=4 and (run.counts->>'imported')::int=1 and (run.counts->>'duplicate')::int=1 and (run.counts->>'excluded')::int=2, 'D: counts '||run.counts::text;
  assert (run.excluded->>'unmapped_type')::int=1 and (run.excluded->>'too_short')::int=1, 'D: reasons '||run.excluded::text;
end $$;
set local role service_role;
do $$
declare r jsonb; t0 numeric := floor(extract(epoch from now() - interval '4 hours'));
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  -- Garmin says TITAN was removed on its side.
  assert public.titan_garmin_deregister_v1('garmin-user-sc') = 1, 'D: deregistered';
  r := public.titan_garmin_ingest_v1('garmin-user-sc', jsonb_build_object('summaryId','sc-4','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',1800));
  assert r->>'reason'='not_linked', 'D: nothing after the end of the link: '||r::text;
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.sc_b')::uuid; run record;
begin
  select * into run from private.titan_source_runs where user_id=b and source='garmin' and kind='push';
  assert (run.counts->>'read')::int=4, 'D: nothing is kept for a push once the link ended: '||run.counts::text;
end $$;

set local role authenticated;
do $$
declare b uuid := current_setting('titan.sc_b')::uuid; c jsonb; s jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  c := public.titan_source_center_v1();
  s := (select x from jsonb_array_elements(c->'sources') x where x->>'source'='garmin');
  assert not (s->'consent'->>'granted')::boolean and s->'consent'->>'revoked_by'='provider', 'D: withdrawn by Garmin: '||(s->'consent')::text;
  assert not (s->'link'->>'linked')::boolean and s->'link'->>'ended_at' is not null and s->'link'->>'last_event_at' is not null, 'D: the link ended: '||(s->'link')::text;
  assert s->'runs'->0->>'kind'='push' and (s->'runs'->0->'excluded'->>'too_short')::int=1, 'D: the push run is readable: '||(s->'runs')::text;
  assert (s->'counts'->>'imported')::int = 1 and (s->'fields'->>'distance')::int = 1, 'D: one Garmin activity with a distance: '||s::text;
  -- The athlete gives the consent again: the withdrawal mark disappears (the link must be made again).
  perform public.titan_set_source_consent_v1('garmin', true);
  c := public.titan_source_center_v1();
  s := (select x from jsonb_array_elements(c->'sources') x where x->>'source'='garmin');
  assert (s->'consent'->>'granted')::boolean and s->'consent'->>'revoked_by' is null and not (s->'link'->>'linked')::boolean, 'D: consent again, link to redo: '||s::text;
  perform public.titan_set_source_consent_v1('garmin', false);
  c := public.titan_source_center_v1();
  assert (select x->'consent'->>'revoked_by' from jsonb_array_elements(c->'sources') x where x->>'source'='garmin') = 'user', 'D: withdrawn in TITAN this time';
end $$;
reset role;

do $$
declare a uuid := current_setting('titan.sc_a')::uuid;
begin
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_source_runs where user_id = a), 'the runs are erased with the account';
end $$;
rollback;

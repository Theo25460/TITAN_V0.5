-- V1.3.1 (migration 20261114180000). Synthetic accounts only, full rollback.
-- The same effort counted once whatever brought it first: a session typed by hand and saved "now" (dated at the END of the effort),
-- then the same effort pushed by Garmin or read from Health Connect, is one session and one reward; an import followed by the same
-- effort from another source stays one session; two efforts that are really different are both kept (no false merge), including a
-- GPS-dated session and an imported one created within minutes of their own start; a replay changes nothing.
-- Also stated: the direction this migration does not cover (a manual entry typed AFTER the import is the athlete's own and is kept).
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); f record;
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}');
  perform set_config('titan.dd_a',a::text,true); perform set_config('titan.dd_b',b::text,true); perform set_config('titan.dd_c',c::text,true);
  assert (select count(*) from public.sports where id in ('running','cycling','walking','hiking','rowing') and coalesce(is_active,true)) = 5, 'fixture sports';
  -- The contract of the function itself is unchanged: same signature and return type, definer rights, closed to the API roles.
  select p.prosecdef, p.proconfig, pg_get_function_result(p.oid) as result into f
    from pg_proc p where p.oid = to_regprocedure('private.titan_import_core(uuid,text,text,text,timestamptz,numeric,numeric)');
  assert f.prosecdef and f.result = 'jsonb', 'security definer, returns jsonb';
  assert f.proconfig = array['search_path=""'], 'empty search_path: ' || coalesce(f.proconfig::text, 'none');
  assert not has_function_privilege('anon','private.titan_import_core(uuid,text,text,text,timestamptz,numeric,numeric)','execute')
     and not has_function_privilege('authenticated','private.titan_import_core(uuid,text,text,text,timestamptz,numeric,numeric)','execute'), 'no API role can call the import core';
end $$;

-- The three players allow their sources (the Garmin link itself comes from the server).
set local role authenticated;
do $$
declare k text;
begin
  foreach k in array array['a','b','c'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.dd_'||k),'role','authenticated')::text,true);
    perform public.titan_set_source_consent_v1('garmin',true);
    perform public.titan_set_source_consent_v1('health_connect',true);
  end loop;
end $$;
reset role;
set local role service_role;
do $$
begin
  perform public.titan_garmin_link_v1(current_setting('titan.dd_a')::uuid,'dd-garmin-a');
  perform public.titan_garmin_link_v1(current_setting('titan.dd_b')::uuid,'dd-garmin-b');
  perform public.titan_garmin_link_v1(current_setting('titan.dd_c')::uuid,'dd-garmin-c');
end $$;
reset role;

-- 1. MANUAL THEN GARMIN. A 40 min run, typed by hand one minute after it ended and saved "now"; then the watch synchronises.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.dd_a')::uuid; res record;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select * into res from public.titan_submit_training_session('running','cardio',8,'km',jsonb_build_object('duration',40),now() - interval '1 minute');
  perform set_config('titan.dd_run',res.log_id,true);
  -- And a 45 min ride saved "now" the same way, for the Health Connect case below.
  select * into res from public.titan_submit_training_session('cycling','cardio',45,'min',jsonb_build_object('duration',45),now() - interval '3 minutes');
  perform set_config('titan.dd_ride',res.log_id,true);
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.dd_a')::uuid;
begin
  perform set_config('titan.dd_xp',(select xp from public.profiles where id=a)::text,true);
  perform set_config('titan.dd_credits',(select credits from public.profiles where id=a)::text,true);
  perform set_config('titan.dd_holds',(select count(*) from private.titan_reward_holds where user_id=a)::text,true);
end $$;
set local role service_role;
do $$
declare a uuid := current_setting('titan.dd_a')::uuid; r jsonb; n int;
  t_run numeric := floor(extract(epoch from now() - interval '42 minutes'));
begin
  r := public.titan_garmin_ingest_v1('dd-garmin-a', jsonb_build_object('summaryId','dd-run','activityType','RUNNING','startTimeInSeconds',t_run,'durationInSeconds',2400,'distanceInMeters',8050));
  assert r->>'status'='linked' and r->>'log_id'=current_setting('titan.dd_run'), 'manual then Garmin: the push joins the session typed by hand: '||r::text;
  r := public.titan_garmin_ingest_v1('dd-garmin-a', jsonb_build_object('summaryId','dd-run','activityType','RUNNING','startTimeInSeconds',t_run,'durationInSeconds',2400,'distanceInMeters',8050));
  assert r->>'status'='duplicate' and r->>'previous'='linked', 'a replay of the push changes nothing: '||r::text;
  select count(*) into n from public.training_logs where user_id=a and sport='running'; assert n=1, 'one run in the journal, found '||n;
end $$;
reset role;

-- 2. MANUAL THEN HEALTH CONNECT, same account: the ride read from the phone joins the ride typed by hand.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.dd_a')::uuid; r jsonb; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_import_activity_v1('health_connect','dd-hc-ride','cycling',now() - interval '49 minutes',46);
  assert r->>'status'='linked' and r->>'log_id'=current_setting('titan.dd_ride'), 'manual then Health Connect: linked: '||r::text;
  select count(*) into n from public.training_logs where user_id=a and sport='cycling'; assert n=1, 'one ride in the journal, found '||n;
end $$;
reset role;

-- THE REWARD IS GRANTED ONCE: the two imports above created no session, no receipt, no hold, and moved neither XP nor credits.
do $$
declare a uuid := current_setting('titan.dd_a')::uuid; n int;
begin
  assert (select xp from public.profiles where id=a) = current_setting('titan.dd_xp')::int, 'XP unchanged by the two linked imports';
  assert (select credits from public.profiles where id=a) = current_setting('titan.dd_credits')::int, 'credits unchanged by the two linked imports';
  assert (select count(*) from private.titan_reward_holds where user_id=a) = current_setting('titan.dd_holds')::int, 'no new held reward';
  select count(*) into n from public.training_receipts where user_id=a; assert n=2, 'two receipts: the two sessions typed by hand, found '||n;
  select count(*) into n from public.training_logs where user_id=a; assert n=2, 'two sessions in all, found '||n;
  select count(*) into n from private.titan_imported_activities where user_id=a and status='linked'; assert n=2, 'both imports are kept as linked, found '||n;
end $$;

-- 3. HEALTH CONNECT THEN GARMIN (account b): the phone brought the walk first, the watch pushes the same walk.
set local role authenticated;
do $$
declare b uuid := current_setting('titan.dd_b')::uuid; r jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_import_activity_v1('health_connect','dd-hc-walk','walking',now() - interval '5 hours',60);
  assert r->>'status'='imported', 'Health Connect brings the walk: '||r::text;
  perform set_config('titan.dd_walk',r->>'log_id',true);
end $$;
reset role;
set local role service_role;
do $$
declare b uuid := current_setting('titan.dd_b')::uuid; r jsonb; n int;
begin
  r := public.titan_garmin_ingest_v1('dd-garmin-b', jsonb_build_object('summaryId','dd-walk','activityType','WALKING',
    'startTimeInSeconds',floor(extract(epoch from now() - interval '5 hours' + interval '2 minutes')),'durationInSeconds',3480,'distanceInMeters',5200));
  assert r->>'status'='linked' and r->>'log_id'=current_setting('titan.dd_walk'), 'Health Connect then Garmin: one walk: '||r::text;
  select count(*) into n from public.training_logs where user_id=b and sport='walking'; assert n=1, 'one walk in the journal, found '||n;
end $$;
reset role;

-- 4. GARMIN THEN MANUAL (account b). The watch brought the row first; the athlete then types the same row by hand.
-- Not covered by this migration: the import core is not involved, and an entry typed by hand is never dropped silently.
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.titan_garmin_ingest_v1('dd-garmin-b', jsonb_build_object('summaryId','dd-row','activityType','ROWING',
    'startTimeInSeconds',floor(extract(epoch from now() - interval '32 minutes')),'durationInSeconds',1800,'distanceInMeters',6000));
  assert r->>'status'='imported', 'Garmin brings the rowing session first: '||r::text;
end $$;
reset role;
set local role authenticated;
do $$
declare b uuid := current_setting('titan.dd_b')::uuid; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_submit_training_session('rowing','cardio',30,'min',jsonb_build_object('duration',30),now() - interval '1 minute');
  select count(*) into n from public.training_logs where user_id=b and sport='rowing';
  assert n=2, 'documented limit: the entry typed after the import is kept as its own session, found '||n;
end $$;
reset role;
-- The watch sending that row again still creates nothing.
set local role service_role;
do $$
declare b uuid := current_setting('titan.dd_b')::uuid; r jsonb; n int;
begin
  r := public.titan_garmin_ingest_v1('dd-garmin-b', jsonb_build_object('summaryId','dd-row','activityType','ROWING',
    'startTimeInSeconds',floor(extract(epoch from now() - interval '32 minutes')),'durationInSeconds',1800,'distanceInMeters',6000));
  assert r->>'status'='duplicate', 'a replay after the manual entry is a no-op: '||r::text;
  select count(*) into n from public.training_logs where user_id=b and sport='rowing'; assert n=2, 'still two, found '||n;
end $$;
reset role;

-- 5. TWO EFFORTS THAT ARE REALLY DIFFERENT ARE BOTH KEPT (account c).
set local role authenticated;
do $$
declare c uuid := current_setting('titan.dd_c')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  -- 5a. A morning run entered with its real time (a date typed by hand), an evening run on the watch.
  perform public.titan_submit_training_session('running','cardio',7,'km',jsonb_build_object('duration',40),now() - interval '9 hours');
  -- 5b. A 30 min ride saved "now"; the watch holds another ride that ended before this one began.
  perform public.titan_submit_training_session('cycling','cardio',30,'min',jsonb_build_object('duration',30),now() - interval '1 minute');
  -- 5c. A 6 min hike recorded with the GPS: dated at its START, saved 7 minutes later. It must never be read as "saved at the end".
  perform public.titan_submit_training_session('hiking','cardio',0.5,'km',jsonb_build_object('duration',6,'hasGpx',true),now() - interval '7 minutes');
  -- 5d. A 6 min walk imported from the phone within minutes of its start: an import always carries a real start.
  perform public.titan_import_activity_v1('health_connect','dd-hc-short','walking',now() - interval '7 minutes',6);
end $$;
reset role;
set local role service_role;
do $$
declare c uuid := current_setting('titan.dd_c')::uuid; r jsonb; n int;
  at_s numeric := floor(extract(epoch from now()));
begin
  r := public.titan_garmin_ingest_v1('dd-garmin-c', jsonb_build_object('summaryId','dd-evening','activityType','RUNNING','startTimeInSeconds',at_s - 3*3600,'durationInSeconds',2400,'distanceInMeters',7000));
  assert r->>'status'='imported', '5a: a morning run and an evening run are two sessions: '||r::text;
  r := public.titan_garmin_ingest_v1('dd-garmin-c', jsonb_build_object('summaryId','dd-earlier-ride','activityType','CYCLING','startTimeInSeconds',at_s - 75*60,'durationInSeconds',2400,'distanceInMeters',15000));
  assert r->>'status'='imported', '5b: a ride that ended before the saved one began is its own session: '||r::text;
  r := public.titan_garmin_ingest_v1('dd-garmin-c', jsonb_build_object('summaryId','dd-hike-before','activityType','HIKING','startTimeInSeconds',at_s - 14*60,'durationInSeconds',360,'distanceInMeters',500));
  assert r->>'status'='imported', '5c: the hike that ended when the GPS-dated one started is not absorbed: '||r::text;
  r := public.titan_garmin_ingest_v1('dd-garmin-c', jsonb_build_object('summaryId','dd-walk-before','activityType','WALKING','startTimeInSeconds',at_s - 14*60,'durationInSeconds',360,'distanceInMeters',450));
  assert r->>'status'='imported', '5d: the walk that ended when the imported one started is not absorbed: '||r::text;
end $$;
reset role;
do $$
declare c uuid := current_setting('titan.dd_c')::uuid; n int;
begin
  select count(*) into n from public.training_logs where user_id=c; assert n=8, 'eight sessions kept for the four pairs, found '||n;
  select count(*) into n from private.titan_imported_activities where user_id=c and status='linked'; assert n=0, 'nothing was merged, found '||n;
end $$;
rollback;

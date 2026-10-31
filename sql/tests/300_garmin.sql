-- V11-40 (GAR-01, GAR-02): Garmin through the server only. A client can never claim Garmin; the push is ingested for a linked account that
-- allowed the source; duplicates across Health Connect, Garmin and manual entries are counted once; unusable payloads are acknowledged and
-- ignored; unlinking and Garmin-side withdrawal end everything; nothing outside the account is visible. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  perform set_config('titan.ga_a',a::text,true); perform set_config('titan.ga_b',b::text,true);
  assert not has_table_privilege('authenticated','private.titan_garmin_links','select'), 'no API grant on the link table';
  assert not has_function_privilege('authenticated','public.titan_garmin_ingest_v1(text,jsonb)','execute'), 'a player cannot ingest';
  assert not has_function_privilege('anon','public.titan_garmin_ingest_v1(text,jsonb)','execute'), 'anonymous cannot ingest';
  assert not has_function_privilege('authenticated','public.titan_garmin_link_v1(uuid,text)','execute'), 'a player cannot link';
  assert not has_function_privilege('authenticated','public.titan_garmin_deregister_v1(text)','execute'), 'a player cannot deregister';
  assert has_function_privilege('service_role','public.titan_garmin_ingest_v1(text,jsonb)','execute'), 'the server can ingest';
end $$;

-- The players allow the source (the link itself comes from the server after the OAuth consent).
set local role authenticated;
do $$
declare ok boolean; a uuid := current_setting('titan.ga_a')::uuid; b uuid := current_setting('titan.ga_b')::uuid; r jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert not (public.titan_garmin_status_v1()->>'linked')::boolean,'not linked at first';
  ok:=false; begin perform public.titan_import_activity_v1('garmin','x1','running',now()-interval '3 hours',30,5); exception when others then ok:=sqlerrm='SOURCE_UNKNOWN'; end; assert ok,'a client cannot claim Garmin';
  ok:=false; begin perform public.titan_import_daily_activity_v1('garmin',current_date,5000); exception when others then ok:=sqlerrm='SOURCE_UNKNOWN'; end; assert ok,'nor for steps';
  ok:=false; begin perform public.titan_garmin_ingest_v1('g1','{}'::jsonb); exception when others then ok:=true; end; assert ok,'a client cannot call the ingest';
  perform public.titan_set_source_consent_v1('garmin',true);
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('garmin',true);
  perform public.titan_set_source_consent_v1('health_connect',true);
end $$;
reset role;

-- The server side.
set local role service_role;
do $$
declare ok boolean; a uuid := current_setting('titan.ga_a')::uuid; b uuid := current_setting('titan.ga_b')::uuid; r jsonb; n int;
  t0 numeric := floor(extract(epoch from now() - interval '5 hours'));
  act jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  ok:=false; begin perform public.titan_garmin_link_v1(a,'bad id!'); exception when others then ok:=sqlerrm='GARMIN_USER_INVALID'; end; assert ok,'garmin user id format';
  perform public.titan_garmin_link_v1(a,'garmin-user-a');
  ok:=false; begin perform public.titan_garmin_link_v1(b,'garmin-user-a'); exception when others then ok:=sqlerrm='GARMIN_ALREADY_LINKED'; end; assert ok,'one Garmin user, one account';

  act := jsonb_build_object('summaryId','s-1001','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',2400,'distanceInMeters',8500);
  r := public.titan_garmin_ingest_v1('garmin-user-a', act);
  assert r->>'status'='imported','first activity: '||r::text;
  select count(*) into n from public.training_logs where user_id=a and sport='running' and unit='km' and val=8.5; assert n=1,'a running session of 8.5 km exists for a';
  assert not exists (select 1 from public.training_logs where user_id=a and details::text ilike '%garmin%'),'provenance is not written in the free details';
  assert public.titan_garmin_ingest_v1('garmin-user-a', act)->>'status'='duplicate','the same push again is a no-op';
  r := public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-1002','activityType','STREET_RUNNING','startTimeInSeconds',t0+120,'durationInSeconds',2300,'distanceInMeters',8400));
  assert r->>'status'='linked','the same effort under another id is linked, not counted twice: '||r::text;

  -- Duration-only activity (no distance) is a time session; a swim on a mapped type.
  r := public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-1003','activityType','YOGA','startTimeInSeconds',t0-86400,'durationInSeconds',1800));
  assert r->>'status'='imported','yoga without distance';
  select count(*) into n from public.training_logs where user_id=a and sport='yoga' and unit='min'; assert n=1,'a time session';

  -- Unusable payloads are acknowledged and ignored.
  assert public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-1','activityType','PARAGLIDING','startTimeInSeconds',t0,'durationInSeconds',2400))->>'reason'='unmapped_type','unknown type is not guessed';
  assert public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-2','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',30))->>'reason'='too_short','under a minute';
  assert public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-3','activityType','RUNNING','startTimeInSeconds',extract(epoch from now())+86400,'durationInSeconds',2400))->>'reason'='invalid_date','future';
  assert public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-4','activityType','RUNNING','startTimeInSeconds','soon','durationInSeconds',2400))->>'reason'='invalid_payload','not a number';
  assert public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','bad id','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',2400))->>'reason'='invalid_id','id format';
  assert public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-5','activityType','RUNNING','startTimeInSeconds',t0,'durationInSeconds',90000))->>'reason'='out_of_range','over a day';
  assert public.titan_garmin_ingest_v1('garmin-user-a', '[]'::jsonb)->>'reason'='invalid_payload','not an object';
  assert public.titan_garmin_ingest_v1('someone-else', act)->>'reason'='not_linked','unknown Garmin user';
  select count(*) into n from public.training_logs where user_id=a; assert n=2,'only the two real sessions exist: '||n;
end $$;
reset role;

-- Cross-source: a session already imported from Health Connect absorbs the same Garmin activity.
set local role authenticated;
do $$
declare b uuid := current_setting('titan.ga_b')::uuid; r jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_import_activity_v1('health_connect','hc-b1','cycling',now()-interval '6 hours',60,25);
  assert r->>'status'='imported','health connect session for b';
end $$;
reset role;
set local role service_role;
do $$
declare b uuid := current_setting('titan.ga_b')::uuid; r jsonb; n int;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.titan_garmin_link_v1(b,'garmin-user-b');
  r := public.titan_garmin_ingest_v1('garmin-user-b', jsonb_build_object('summaryId','s-b1','activityType','ROAD_BIKING','startTimeInSeconds',floor(extract(epoch from now()-interval '6 hours'))+60,'durationInSeconds',3500,'distanceInMeters',24800));
  assert r->>'status'='linked','the Garmin copy of a Health Connect session is linked: '||r::text;
  select count(*) into n from public.training_logs where user_id=b; assert n=1,'counted once';
end $$;
reset role;

-- Status, unlink, withdrawal on the Garmin side.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.ga_a')::uuid; r jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_garmin_status_v1(); assert (r->>'linked')::boolean and r ? 'last_event_at','linked: '||r::text;
  assert jsonb_array_length(public.titan_sources_v1())=1 and (public.titan_sources_v1()->0->>'imported')::int=2,'the sources screen counts what Garmin brought';
  assert jsonb_array_length(public.export_own_data()->'garminLink')=1,'the link is exported';
  assert not (public.titan_garmin_unlink_v1()->>'linked')::boolean,'unlinked';
  assert not (public.titan_garmin_status_v1()->>'linked')::boolean,'status says so';
  assert public.titan_archive_imported_v1('garmin')=2,'what Garmin brought can be archived';
end $$;
reset role;
set local role service_role;
do $$
declare a uuid := current_setting('titan.ga_a')::uuid; b uuid := current_setting('titan.ga_b')::uuid; r jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  r := public.titan_garmin_ingest_v1('garmin-user-a', jsonb_build_object('summaryId','s-9','activityType','RUNNING','startTimeInSeconds',floor(extract(epoch from now()-interval '2 hours')),'durationInSeconds',2400));
  assert r->>'reason'='not_linked','after unlinking nothing is received: '||r::text;
  assert public.titan_garmin_deregister_v1('garmin-user-b')=1,'Garmin tells us the user withdrew';
  assert public.titan_garmin_deregister_v1('garmin-user-b')=0,'a second notice changes nothing';
  assert public.titan_garmin_ingest_v1('garmin-user-b', jsonb_build_object('summaryId','s-b2','activityType','RUNNING','startTimeInSeconds',floor(extract(epoch from now()-interval '1 hours')),'durationInSeconds',2400))->>'reason'='not_linked','withdrawn';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from private.titan_source_consents where user_id=current_setting('titan.ga_b')::uuid and source='garmin' and revoked_at is null),'the consent ended too';
end $$;

-- Revoking the consent in TITAN ends a link too, and a re-grant does not silently resume it.
set local role authenticated;
do $$
declare b uuid := current_setting('titan.ga_b')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('garmin',true);
  assert not (public.titan_garmin_status_v1()->>'linked')::boolean,'a new consent does not bring the old link back';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.ga_a')::uuid;
begin
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_garmin_links where user_id = a),'the link is erased with the account';
end $$;
rollback;

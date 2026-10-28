-- V11-06 (server half, ADR-003): consent per source, idempotent import by (source, external id), overlap with the journal counted once,
-- same anti-cheat and caps as a manual session, provenance unforgeable, nothing readable by another account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  perform set_config('titan.ai_a',a::text,true); perform set_config('titan.ai_b',b::text,true);
  assert exists (select 1 from public.sports where id='running'), 'fixture sport';
  assert not has_table_privilege('authenticated','private.titan_imported_activities','select'), 'provenance table has no API grant';
  assert not has_table_privilege('anon','private.titan_source_consents','select'), 'consent table has no API grant';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; r2 jsonb; n int; a uuid := current_setting('titan.ai_a')::uuid; t0 timestamptz := now() - interval '3 hours';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  -- No consent, no import.
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-1','running',t0,40,6); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end; assert ok,'refused without consent';
  ok:=false; begin perform public.titan_set_source_consent_v1('garmin',true); exception when others then ok:=sqlerrm='SOURCE_UNKNOWN'; end; assert ok,'closed list of sources';
  r:=public.titan_set_source_consent_v1('health_connect',true); assert (r->>'granted')::boolean,'consent given';

  -- Validation.
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','bad id!','running',t0,40,6); exception when others then ok:=sqlerrm='EXTERNAL_ID_INVALID'; end; assert ok,'external id format';
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-x','nope-sport',t0,40,6); exception when others then ok:=sqlerrm='SPORT_UNKNOWN'; end; assert ok,'unknown sport';
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-x','running',t0,2000,6); exception when others then ok:=sqlerrm='IMPORT_DURATION_OUT_OF_RANGE'; end; assert ok,'duration bound';
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-x','running',now()+interval '2 days',40,6); exception when others then ok:=sqlerrm='IMPORT_DATE_OUT_OF_RANGE'; end; assert ok,'no future';
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-x','running',t0,40,5000); exception when others then ok:=sqlerrm='IMPORT_DISTANCE_OUT_OF_RANGE'; end; assert ok,'distance bound';

  -- Import, replay, never twice.
  r:=public.titan_import_activity_v1('health_connect','hc-1','running',t0,40,6);
  assert r->>'status'='imported' and (r->>'log_id') is not null,'first import creates a session: '||r::text;
  r2:=public.titan_import_activity_v1('health_connect','hc-1','running',t0,40,6);
  assert r2->>'status'='duplicate' and r2->>'log_id'=r->>'log_id','replay is a no-op';
  select count(*) into n from public.training_logs where user_id=a; assert n=1,'one session';

  -- Provenance is not what the client says: details carry no source claim.
  assert not exists (select 1 from public.training_logs where user_id=a and details ? 'source'),'no provenance in details';

  -- Same effort arriving under another id (another app relaying the same workout) is linked, not counted twice.
  r2:=public.titan_import_activity_v1('health_connect','hc-1-bis','running',t0 + interval '5 minutes',38,6);
  assert r2->>'status'='linked' and r2->>'log_id'=r->>'log_id','overlap linked to the existing session';
  select count(*) into n from public.training_logs where user_id=a; assert n=1,'still one session';

  -- A manual session already there absorbs the import instead of doubling it.
  perform public.titan_submit_training_session('cycling','cardio',45,'min',jsonb_build_object('duration',45),now()-interval '6 hours');
  r2:=public.titan_import_activity_v1('health_connect','hc-2','cycling',now()-interval '6 hours' + interval '2 minutes',44,15);
  assert r2->>'status'='linked','manual session absorbs the import';
  -- A different sport at the same time is not a duplicate.
  r2:=public.titan_import_activity_v1('health_connect','hc-3','yoga',now()-interval '6 hours',30);
  assert r2->>'status'='imported','another sport is its own session';

  -- Old data: imported as history, no reward.
  r2:=public.titan_import_activity_v1('health_connect','hc-old','running',now()-interval '90 days',50,8);
  assert r2->>'status'='imported' and (r2->>'xp')::int=0,'history older than 30 days earns nothing';

  -- Another account sees nothing and can import the same external id on its own.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ai_b'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-1','running',t0,40,6); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end; assert ok,'consent is per account';
  perform public.titan_set_source_consent_v1('health_connect',true);
  r2:=public.titan_import_activity_v1('health_connect','hc-1','running',t0,40,6);
  assert r2->>'status'='imported' and r2->>'log_id'<>r->>'log_id','same external id, other account: its own session';

  -- Revocation stops imports; archiving removes only what the source brought.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r2:=public.titan_set_source_consent_v1('health_connect',false); assert not (r2->>'granted')::boolean and (r2->>'imported')::int=3,'three imported sessions remain: '||r2::text;
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','hc-9','running',t0 - interval '1 day',30,5); exception when others then ok:=sqlerrm='CONSENT_REQUIRED'; end; assert ok,'revoked: no more import';
  n:=public.titan_archive_imported_v1('health_connect'); assert n=3,'archived what the source brought, not the manual session';
  select count(*) into n from public.training_logs where user_id=a and archived_at is null; assert n=1,'the manual cycling session stays';

  -- Anonymous cannot do anything.
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_import_activity_v1('health_connect','z','running',t0,40,6); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
rollback;

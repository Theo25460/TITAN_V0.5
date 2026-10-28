-- V11-18: the account export contains every kind of data the account holds, only its own, and the account deletion leaves nothing
-- behind in the V1.1 private tables. Synthetic identities, real RPCs with API roles, full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  perform set_config('titan.ex_a',a::text,true); perform set_config('titan.ex_b',b::text,true);
  insert into public.adventure_rewards(user_id,world_id,chapter,source_ids) values (a,'aube',1,array[gen_random_uuid()]);
  insert into public.adventure_rewards(user_id,world_id,chapter,source_ids) values (b,'aube',1,array[gen_random_uuid()]);
  insert into private.titan_source_consents(user_id,source) values (a,'health_connect'),(b,'health_connect');
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.ex_a')::uuid; r jsonb; k text; need text[] := array[
  'trainingLogs','activities','messages','friendships','shopHistory','achievements','inventory','socialChallengesAsChallenger','socialChallengesAsOpponent',
  'cacheReconciliationReports','suspiciousActions','trainingRevisions','goals','adventureProfile','adventureProgress','adventureRewards','adventureQuestRewards',
  'campaignState','bestiary','moments','momentCheers','publicCard','expeditions','challengesJoined','guildMembership','titanPlusAccess',
  'periodicQuestClaims','sourceConsents','importedActivities'];
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_set_source_consent_v1('health_connect',true);
  perform public.titan_import_activity_v1('health_connect','ex-1','running',now()-interval '2 hours',30,5);
  r := public.export_own_data();
  foreach k in array need loop assert r ? k, 'export has key '||k; assert jsonb_typeof(r->k)='array', k||' is a list'; end loop;
  assert r->>'userId' = a::text, 'own id';
  assert jsonb_array_length(r->'adventureRewards') = 1 and (r->'adventureRewards'->0->>'user_id') = a::text, 'only own adventure rows';
  assert jsonb_array_length(r->'sourceConsents') = 1 and jsonb_array_length(r->'importedActivities') = 1, 'V1.1 private data is exported';
  assert jsonb_array_length(r->'trainingLogs') = 1, 'the imported session is a normal journal row';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin perform public.export_own_data(); assert false,'anonymous must be refused'; exception when others then assert sqlerrm <> 'anonymous must be refused', 'anonymous refused'; end;
end $$;
reset role;
-- Deleting the account leaves nothing in the V1.1 private tables.
do $$
declare a uuid := current_setting('titan.ex_a')::uuid;
begin
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_source_consents where user_id = a), 'consents erased';
  assert not exists (select 1 from private.titan_imported_activities where user_id = a), 'imported activities erased';
  assert not exists (select 1 from private.titan_periodic_quest_claims where user_id = a), 'claims erased';
  assert exists (select 1 from private.titan_source_consents where user_id = current_setting('titan.ex_b')::uuid), 'the other account is untouched';
end $$;
rollback;

-- Web security contracts. Synthetic identities, restricted API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
begin
  perform set_config('titan.qa_a',a::text,true);
  perform set_config('titan.qa_b',b::text,true);
  perform set_config('titan.qa_s',s::text,true);
  -- user_metadata is editable by the client and must never grant administrative authority.
  insert into auth.users(id,raw_user_meta_data) values
    (a,'{"role":"super_admin","is_admin":true,"is_elite":true}'),(b,'{}'),(s,'{}');
  assert (select role='user' and is_admin=false and is_elite=false from public.profiles where id=a),
    'signup user_metadata does not grant privileges before fixture customization';
  insert into public.profiles(id,username,credits,xp,level,role,is_elite,is_suspended,inventory,game_state)
  values (a,'qa_security_a',1250,1800,3,'user',false,false,'{"safe":1}','{"campaign":{"keep":true}}'),
         (b,'qa_security_b',500,100,1,'user',true,false,'{}','{}'),
         (s,'qa_security_suspended',0,0,1,'user',false,true,'{}','{}')
  on conflict(id) do update set credits=excluded.credits,xp=excluded.xp,level=excluded.level,
    role=excluded.role,is_elite=excluded.is_elite,is_suspended=excluded.is_suspended,
    inventory=excluded.inventory,game_state=excluded.game_state;
  -- Positive fixture for the legacy inventory table, so its isolation check is not vacuous.
  insert into public.items(id,name,type,stat,val,price) values(2147483000,'QA legacy cosmetic','cosmetic','appearance',0,0);
  insert into public.inventory(user_id,item_id) values(b,2147483000);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_b'),'role','authenticated')::text,true);
do $$
declare r record; g uuid; j jsonb;
begin
  assert (select count(*)=1 from public.inventory where user_id=auth.uid()),'B can read its legacy inventory fixture';
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',30),now()-interval '1 hour');
  perform set_config('titan.qa_log_b',r.log_id,true);
  insert into public.sport_goals(user_id,title,metric,target,start_date,end_date)
    values(auth.uid(),'Objectif privé B','sessions',3,current_date,current_date+7) returning id into g;
  perform set_config('titan.qa_goal_b',g::text,true);
  perform public.titan_purchase_shop_item('cos_frame_neon');
  j:=public.export_own_data();
  assert j->>'userId'=auth.uid()::text and j#>>'{profile,id}'=auth.uid()::text,'B exports its own profile';
  assert jsonb_array_length(j->'trainingLogs')=1 and jsonb_array_length(j->'shopHistory')=1
    and jsonb_array_length(j->'inventory')=1,'owner export includes populated collections';
  assert j#>>'{trainingLogs,0,user_id}'=auth.uid()::text and j#>>'{shopHistory,0,user_id}'=auth.uid()::text
    and j#>>'{inventory,0,user_id}'=auth.uid()::text,'exported collections belong to B';
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_a'),'role','authenticated',
  'user_metadata',json_build_object('role','super_admin','is_admin',true))::text,true);
do $$
declare j jsonb; r record; v integer; g uuid;
begin
  assert not private.titan_is_moderator_or_admin(auth.uid()),'user_metadata does not grant admin';
  assert (select count(*) from public.profiles)=1,'only own profile is readable';
  assert not exists(select 1 from public.training_logs where user_id=current_setting('titan.qa_b')::uuid),'other sessions hidden';
  assert not exists(select 1 from public.sport_goals where user_id=current_setting('titan.qa_b')::uuid),'other goals hidden';
  assert not exists(select 1 from public.shop_history where user_id=current_setting('titan.qa_b')::uuid),'other purchases hidden';
  assert not exists(select 1 from public.inventory where user_id=current_setting('titan.qa_b')::uuid),'other inventory hidden';
  j:=public.export_own_data();
  assert j->>'userId'=auth.uid()::text and j#>>'{profile,id}'=auth.uid()::text,'export is bound to caller';
  assert jsonb_array_length(j->'trainingLogs')=0 and jsonb_array_length(j->'shopHistory')=0
    and jsonb_array_length(j->'inventory')=0,'export never includes B data';

  -- Direct updates must neither rewrite one's own economy nor mutate another profile.
  update public.profiles set credits=999999,xp=999999,is_elite=true,role='super_admin' where id=auth.uid();
  assert (select credits=1250 and xp=1800 and is_elite=false and role='user' from public.profiles where id=auth.uid()),'direct profile tampering has no effect';
  update public.training_logs set val=999 where id=current_setting('titan.qa_log_b')::uuid;
  get diagnostics v=row_count; assert v=0,'direct other-session mutation affects no row';
  begin
    perform public.titan_update_training_session(current_setting('titan.qa_log_b')::uuid,1,'{"note":"forged"}');
    assert false,'editing another session must fail';
  exception when insufficient_privilege then assert sqlerrm='SESSION_NOT_FOUND',sqlerrm; end;
  begin
    perform public.titan_update_training_session(current_setting('titan.qa_log_b')::uuid,1,'{"archived":true}');
    assert false,'archiving another session must fail';
  exception when insufficient_privilege then assert sqlerrm='SESSION_NOT_FOUND',sqlerrm; end;

  begin
    insert into public.sport_goals(user_id,title,metric,target,start_date,end_date)
    values(current_setting('titan.qa_b')::uuid,'Usurpation','sessions',1,current_date,current_date+7);
    assert false,'goal creation for another user must fail';
  exception when insufficient_privilege then null; end;
  insert into public.sport_goals(user_id,title,metric,target,start_date,end_date)
    values(auth.uid(),'Objectif A','sessions',3,current_date,current_date+7) returning id into g;
  begin
    update public.sport_goals set user_id=current_setting('titan.qa_b')::uuid where id=g;
    assert false,'goal owner transfer must fail';
  exception when insufficient_privilege then null; end;
  update public.sport_goals set target=999 where id=current_setting('titan.qa_goal_b')::uuid;
  get diagnostics v=row_count; assert v=0,'goal of B remains unchanged';
  update public.sport_goals set target=4 where id=g;
  assert (select target=4 and revision=2 from public.sport_goals where id=g),'valid goal edit still works';
  begin
    insert into public.inventory(user_id,item_id) values(auth.uid(),1);
    assert false,'client inventory insertion must fail';
  exception when insufficient_privilege then null; end;

  select state_version into v from public.profiles where id=auth.uid();
  j:=public.titan_save_profile_state(jsonb_build_object(
    'meta',jsonb_build_object('profileVersion',v),'history',jsonb_build_array(jsonb_build_object('user_id',current_setting('titan.qa_b'))),
    'user',jsonb_build_object('id',current_setting('titan.qa_b'),'credits',999999,'xp',999999,'level',99,
      'is_elite',true,'is_admin',true,'role','super_admin','inventory',jsonb_build_object('forged',1),
      'favoriteSports',jsonb_build_array('running'),'cadencePauses',jsonb_build_array('2026-W40'))),
    'Athlète QA',null,'{"forged":1}',null,999999);
  assert j->>'id'=auth.uid()::text and j#>>'{game_state,user,id}'=auth.uid()::text,'client identity ignored';
  assert (j->>'credits')::int=1250 and (j->>'xp')::int=1800 and (j->>'level')::int=3,'server economy preserved';
  assert (j->>'is_elite')::boolean=false and j->'inventory'='{"safe":1}'::jsonb,'premium and inventory preserved';
  assert j#>>'{game_state,user,role}' is null and j#>>'{game_state,user,is_admin}' is null,'client privilege fields discarded';
  assert j#>'{game_state,user,favoriteSports}'='["running"]'::jsonb and j#>'{game_state,user,cadencePauses}'='["2026-W40"]'::jsonb,'allowed preferences still sync';
  assert j#>>'{game_state,campaign,keep}'='true' and not(j->'game_state'?'history'),'existing state preserved without injected history';
  begin
    perform public.titan_save_profile_state(jsonb_build_object('meta',jsonb_build_object('profileVersion',v),'user','{}'::jsonb));
    assert false,'stale profile save must fail';
  exception when serialization_failure then assert sqlerrm='PROFILE_VERSION_CONFLICT',sqlerrm; end;
  begin
    perform public.titan_save_profile_state('[]'); assert false,'nonobject state must fail';
  exception when invalid_parameter_value then assert sqlerrm='STATE_MUST_BE_OBJECT',sqlerrm; end;
  begin
    perform public.titan_save_profile_state('{"user":[]}'); assert false,'nonobject user must fail';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.titan_save_profile_state(jsonb_build_object('padding',repeat('x',350001))); assert false,'oversized state must fail';
  exception when program_limit_exceeded then assert sqlerrm='STATE_TOO_LARGE',sqlerrm; end;

  -- Retired combat cannot mint rewards even with extreme client reward parameters.
  select * into r from public.titan_submit_combat_victory('qa_forged','BOSS','boss','Forged boss',500,1000000,10000000,'{"reward_xp":999999,"reward_credits":999999}');
  assert r.reward_xp=0 and r.reward_credits=0 and r.xp_after=1800 and r.credits_after=1250
    and r.level_after=3,'combat earns no economy';
  j:=public.titan_submit_cache_reconciliation(jsonb_build_object('user',jsonb_build_object('id',current_setting('titan.qa_b'),
    'xp',999999,'credits',999999,'level',99,'is_elite',true,'inventory',jsonb_build_object('forged',1))));
  assert j#>>'{cloudSummary,userId}'=auth.uid()::text,'reconciliation reads caller only';
  assert j->'riskFlags'?'LOCAL_USER_ID_MISMATCH','forged identity is flagged';
  assert (select credits=1250 and xp=1800 and level=3 and is_elite=false and inventory='{"safe":1}'::jsonb from public.profiles where id=auth.uid()),'reconciliation never changes protected state';

  -- Normal sport, record source, edit and archive remain available.
  select * into r from public.titan_submit_training_session('yoga','mobility',30,'min',
    jsonb_build_object('client_event_id',gen_random_uuid(),'user_id',current_setting('titan.qa_b'),
      'reward_xp',999999,'reward_credits',999999),now()-interval '2 hours');
  assert r.xp=300 and r.credits=30,'session rewards are computed by the server, not declared by the client';
  begin
    perform public.titan_update_training_session(r.log_id::uuid,1,
      jsonb_build_object('xp',999999,'credits',999999,'user_id',current_setting('titan.qa_b')));
    assert false,'protected session fields must not be editable';
  exception when invalid_parameter_value then assert sqlerrm='PATCH_INVALID',sqlerrm; end;
  j:=public.titan_update_training_session(r.log_id::uuid,1,'{"note":"corrigée"}');
  assert j->>'user_id'=auth.uid()::text and j#>>'{details,note}'='corrigée','valid own-session edit works';
  j:=public.titan_update_training_session(r.log_id::uuid,2,'{"archived":true}');
  assert j->>'archived_at' is not null and (j->>'revision')::int=3,'own-session archive works';
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_s'),'role','authenticated')::text,true);
do $$
begin
  begin
    perform public.titan_save_profile_state('{}'); assert false,'suspended profile save must fail';
  exception when insufficient_privilege then assert sqlerrm='PROFILE_UNAVAILABLE',sqlerrm; end;
  begin
    perform public.titan_submit_training_session('yoga','mobility',30,'min',jsonb_build_object('client_event_id',gen_random_uuid()),now());
    assert false,'suspended training submission must fail';
  exception when insufficient_privilege then assert sqlerrm in ('PROFILE_UNAVAILABLE','ACCOUNT_SUSPENDED'),sqlerrm; end;
end $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
begin
  begin perform public.titan_save_profile_state('{}'); assert false,'anonymous save refused'; exception when insufficient_privilege then null; end;
  begin perform public.export_own_data(); assert false,'anonymous export refused'; exception when insufficient_privilege then null; end;
  begin perform public.titan_update_training_session(current_setting('titan.qa_log_b')::uuid,1,'{}'); assert false,'anonymous edit refused'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
begin
  assert (select val=5 and revision=1 and archived_at is null from public.training_logs where id=current_setting('titan.qa_log_b')::uuid),'B session preserved after all attacks';
  assert (select target=3 and revision=1 from public.sport_goals where id=current_setting('titan.qa_goal_b')::uuid),'B goal preserved';
  assert (select is_elite and role='user' and credits=80 and xp=400 from public.profiles where id=current_setting('titan.qa_b')::uuid),'B entitlement and economy preserved';
end $$;
rollback;

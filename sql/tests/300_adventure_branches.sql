-- V1.5.0 — Bifurcations. Synthetic and rolled back. Every API call runs as authenticated/anon.
-- A (la corniche) and B (les ruines) log exactly the same sessions on the same days: different route, scene and clue,
-- identical effort asked, identical XP/credits/campaign. C already passed the choice before the pilot (keeps its version).
-- D has a campaign but no encounter journey. Also covered: pending session, activity before the decision, duplicate import,
-- stable decision, old-client v1 claims gated by the branch condition, export, non-pilot world.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
begin
 perform set_config('titan.br_a',a::text,true); perform set_config('titan.br_b',b::text,true);
 perform set_config('titan.br_c',c::text,true); perform set_config('titan.br_d',d::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}'),(d,'{}');
 set local session_replication_role=replica;
 insert into public.profiles(id,username,level,xp,credits,is_suspended)
 values(a,'qa_br_a',1,100,10,false),(b,'qa_br_b',1,100,10,false),(c,'qa_br_c',1,100,10,false),(d,'qa_br_d',1,100,10,false)
 on conflict(id) do update set is_suspended=false,xp=100,credits=10;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 select u,'aube',9,'rhythm','UTC',now()-interval '30 days' from unnest(array[a,b,c,d]) u;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 values(a,'marees',9,'rhythm','UTC',now()-interval '30 days');
 set local session_replication_role=origin;
end $$;

-- Pilot objects are closed to the API roles.
do $$begin
 assert not has_table_privilege('authenticated','private.adventure_branch_entries','select'),'entries have no API grant';
 assert not has_function_privilege('anon','public.titan_adventure_branch_snapshot_v1(text)','execute'),'anon snapshot';
 assert not has_function_privilege('anon','public.titan_adventure_branch_action_v1(text,text,integer,integer,text)','execute'),'anon action';
 assert not has_function_privilege('authenticated','private.titan_adventure_branch_state(uuid,text)','execute'),'state is private';
 assert (private.titan_adventure_branch_current('aube')->>'version')::integer=1;
 assert private.titan_adventure_branch_current('marees') is null,'single pilot arc';
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_branch_snapshot_v1('aube'); raise exception 'anon snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_branch_action_v1('aube','enter'); raise exception 'anon enter'; exception when insufficient_privilege then null; end;
end $$;

-- Journeys start through the passthrough (same v1 rules), then a deterministic fixture.
set local role authenticated;
do $$declare s jsonb; u text;begin
 foreach u in array array[current_setting('titan.br_a'),current_setting('titan.br_b'),current_setting('titan.br_c')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_branch_action_v1('aube','start');
  assert (s->>'active')::boolean and s->>'version'='1' and (s->>'branchContract')::integer=1;
  assert s->'branch'->>'state'='available','compatible point offered: '||(s->'branch')::text;
 end loop;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.br_d'),'role','authenticated')::text,true);
 s:=public.titan_adventure_branch_snapshot_v1('aube'); assert s->'branch'->>'state'='none';
 begin perform public.titan_adventure_branch_action_v1('aube','enter'); raise exception 'enter without journey';
 exception when raise_exception then assert sqlerrm='JOURNEY_NOT_STARTED',sqlerrm; end;
end $$;
reset role;
update private.adventure_journeys set started_at=now()-interval '30 days',target=15
 where user_id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid,current_setting('titan.br_c')::uuid);
-- Same four sessions before the pilot for A, B and C: running, bloc, badminton, musculation (20 effort points each).
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select u::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from unnest(array[current_setting('titan.br_a'),current_setting('titan.br_b'),current_setting('titan.br_c')]) u,
 (values('running',20),('bouldering',19),('badminton',18),('muscu_builder',17)) s(sport,n);
set local session_replication_role=origin;

-- C passes the choice with the pre-pilot client: its campaign keeps its original version.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.br_c'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 perform public.titan_adventure_rpg_action_v1('aube','claim',1);
 perform public.titan_adventure_rpg_action_v1('aube','claim',2,0);
 s:=public.titan_adventure_branch_snapshot_v1('aube'); assert s->'branch'->>'state'='legacy','campaign already past the choice';
 begin perform public.titan_adventure_branch_action_v1('aube','enter'); raise exception 'legacy entered';
 exception when raise_exception then assert sqlerrm='BRANCH_INCOMPATIBLE',sqlerrm; end;
 s:=public.titan_adventure_rpg_action_v1('aube','claim',3); -- legacy milestones keep the v1 conditions
 assert exists(select 1 from jsonb_array_elements(s->'rewards') r where (r->>'ordinal')::integer=3);
end $$;

-- A: explicit entry, then an explicit and stable decision.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.br_a'),'role','authenticated')::text,true);
do $$declare s jsonb; again jsonb;begin
 begin perform public.titan_adventure_branch_action_v1('aube','confirm',null,null,'corniche'); raise exception 'confirm before entry';
 exception when raise_exception then assert sqlerrm='BRANCH_NOT_ENTERED',sqlerrm; end;
 s:=public.titan_adventure_branch_action_v1('aube','enter');
 assert s->'branch'->>'state'='entered' and s->'branch'->>'pilot'='aube-arc1' and (s->'branch'->>'version')::integer=1;
 again:=public.titan_adventure_branch_action_v1('aube','enter'); assert again->'branch'->>'enteredAt'=s->'branch'->>'enteredAt','entry idempotent';
 begin perform public.titan_adventure_branch_action_v1('aube','confirm',null,null,'corniche'); raise exception 'unready decision';
 exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end; -- milestone 1 not earned yet
 s:=public.titan_adventure_branch_action_v1('aube','claim',1);
 begin perform public.titan_adventure_branch_action_v1('aube','confirm',null,null,'falaise'); raise exception 'unknown route';
 exception when raise_exception then assert sqlerrm='INVALID_ROUTE',sqlerrm; end;
 s:=public.titan_adventure_branch_action_v1('aube','confirm',null,null,'corniche');
 assert s->'branch'->>'state'='confirmed' and s->'branch'->>'route'='corniche',(s->'branch')::text;
 again:=public.titan_adventure_branch_action_v1('aube','confirm',null,null,'ruines');
 assert again->'branch'->>'route'='corniche','second confirmation cannot change the route';
 again:=public.titan_adventure_rpg_action_v1('aube','claim',2,1);
 assert (select count(*)=1 and min((r->>'choice')::integer)=0 from jsonb_array_elements(again->'rewards') r where (r->>'ordinal')::integer=2),
  'old client cannot change it: '||(again->'rewards')::text;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.br_b'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 perform public.titan_adventure_branch_action_v1('aube','enter');
 perform public.titan_adventure_branch_action_v1('aube','claim',1);
 s:=public.titan_adventure_branch_action_v1('aube','confirm',null,null,'ruines');
 assert s->'branch'->>'route'='ruines';
end $$;
reset role;

-- The decision is dated ten days ago; sessions after it are identical for A and B.
update private.adventure_encounter_rewards set earned_at=now()-interval '10 days'
 where ordinal=2 and world_id='aube' and user_id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid);
update private.adventure_branch_entries set entered_at=now()-interval '11 days'
 where user_id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid);
create temp table br_before on commit drop as
 select id,xp,credits,(select to_jsonb(p) from public.adventure_progress p where p.user_id=f.id and p.world_id='aube') campaign
 from public.profiles f where id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid);
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details,status)
select u::uuid,s.sport,'training',20,'min',0,s.d,s.c,
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb,s.status
from unnest(array[current_setting('titan.br_a'),current_setting('titan.br_b')]) u,
 (values('running',now()-interval '9 days',now()-interval '9 days','valid'),          -- counts
        ('badminton',now()-interval '8 days',now()-interval '8 days','pending_review'),-- still pending
        ('bouldering',now()-interval '12 days',now(),'valid'))                         -- typed late, done before the decision
 s(sport,d,c,status);
set local session_replication_role=origin;

set local role authenticated;
do $$declare s jsonb; u text; prev jsonb;begin
 foreach u in array array[current_setting('titan.br_a'),current_setting('titan.br_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_branch_action_v1('aube','sync');
  assert (s->'branch'->>'effortSince')::numeric=20 and (s->'branch'->>'daysSince')::integer=1,
   'pending and pre-decision activity excluded: '||(s->'branch')::text;
  assert (s->'branch'->'steps'->0->>'branchReady')::boolean and not (s->'branch'->'steps'->1->>'branchReady')::boolean;
  assert (s->'branch'->'steps'->0->>'effortTarget')::integer=15 and (s->'branch'->'steps'->1->>'effortTarget')::integer=30;
  assert (s->'branch'->'steps'->1->>'daysTarget')::integer=2;
  assert (select (m->>'ready')::boolean from jsonb_array_elements(s->'milestones') m where (m->>'ordinal')::integer=3);
  s:=public.titan_adventure_branch_action_v1('aube','claim',3);
  assert s->'branch'->'clue'->>'state'='found';
  -- The v1 rules alone would open milestone 4 (cumulative effort and days); the branch condition keeps it closed.
  assert not (select (m->>'ready')::boolean from jsonb_array_elements(s->'milestones') m where (m->>'ordinal')::integer=4);
  begin perform public.titan_adventure_rpg_action_v1('aube','claim',4); raise exception 'old client skipped the branch condition';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  begin perform public.titan_adventure_branch_action_v1('aube','claim',4); raise exception 'branch claim skipped its condition';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  if prev is not null then
   assert prev->'branch'->>'effortSince'=s->'branch'->>'effortSince' and prev->'branch'->>'daysSince'=s->'branch'->>'daysSince','same effort';
   assert prev->'branch'->'clue'->>'id'<>s->'branch'->'clue'->>'id','different clues';
  end if;
  prev:=s;
 end loop;
end $$;
reset role;

-- Late validation: the step moves only after a sync. A duplicate import adds nothing.
set local session_replication_role=replica; -- moderation validates the pending session (fixture shortcut)
update public.training_logs set status='valid' where sport='badminton' and status='pending_review'
 and user_id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; r jsonb; u text; results jsonb:='[]';begin
 foreach u in array array[current_setting('titan.br_a'),current_setting('titan.br_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_branch_snapshot_v1('aube');
  assert (s->'branch'->>'daysSince')::integer=1,'read-only snapshot never imports a late validation';
  s:=public.titan_adventure_branch_action_v1('aube','sync');
  assert (s->'branch'->>'effortSince')::numeric=40 and (s->'branch'->>'daysSince')::integer=2,(s->'branch')::text;
  -- Duplicate import of a workout: imported once, replay and overlap counted once.
  perform public.titan_set_source_consent_v1('health_connect',true);
  r:=public.titan_import_activity_v1('health_connect','br-1','running',now()-interval '3 days',30,5);
  assert r->>'status'='imported',r::text;
  assert public.titan_import_activity_v1('health_connect','br-1','running',now()-interval '3 days',30,5)->>'status'='duplicate';
  assert public.titan_import_activity_v1('health_connect','br-1-bis','running',now()-interval '3 days'+interval '4 minutes',28,5)->>'status'='linked';
  s:=public.titan_adventure_branch_action_v1('aube','sync');
  s:=public.titan_adventure_branch_action_v1('aube','sync');
  assert (s->'branch'->>'daysSince')::integer=3,'one more day, once';
  s:=public.titan_adventure_branch_action_v1('aube','claim',4);
  assert s->'branch'->'clue'->>'state'='usable',(s->'branch')::text;
  results:=results||jsonb_build_array(jsonb_build_object('route',s->'branch'->>'route','clue',s->'branch'->'clue'->>'id',
   'effort',s->'branch'->>'effortSince','days',s->'branch'->>'daysSince',
   'targets',(select jsonb_agg(jsonb_build_array(x->'effortTarget',x->'daysTarget')) from jsonb_array_elements(s->'branch'->'steps') x),
   'rewards',jsonb_array_length(s->'rewards'),'xp',(select xp from public.profiles where id=auth.uid()),
   'credits',(select credits from public.profiles where id=auth.uid())));
 end loop;
 assert results->0->>'route'='corniche' and results->1->>'route'='ruines';
 assert results->0->>'clue'='prise' and results->1->>'clue'='serment','two distinct usable clues';
 assert results->0->'targets'=results->1->'targets' and results->0->>'effort'=results->1->>'effort'
   and results->0->>'days'=results->1->>'days' and results->0->>'rewards'=results->1->>'rewards','equal effort on both routes: '||results::text;
 assert results->0->>'xp'=results->1->>'xp' and results->0->>'credits'=results->1->>'credits','same economy on both routes';
end $$;
reset role;

do $$declare s jsonb; o record;begin
 -- The pilot itself never touched XP, credits or the campaign: only the import (normal session rules) did, identically.
 for o in select b.*,p.xp now_xp,p.credits now_credits,(select to_jsonb(x) from public.adventure_progress x where x.user_id=b.id and x.world_id='aube') now_campaign
   from br_before b join public.profiles p on p.id=b.id loop
  assert o.campaign=o.now_campaign,'campaign version and frozen objectives unchanged';
 end loop;
 assert (select xp=100 and credits=10 from public.profiles where id=current_setting('titan.br_c')::uuid),'legacy economy untouched';
 assert (select count(*) from public.training_logs where sport='running' and date>now()-interval '4 days'
   and user_id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid))=2,'one imported session per account';
 assert (select count(*) from private.adventure_effort_ledger e join public.training_logs t on t.id=e.source_id
   where t.sport='running' and t.date>now()-interval '4 days' and e.user_id in (current_setting('titan.br_a')::uuid,current_setting('titan.br_b')::uuid))=2,
   'the imported workout is attributed once per account';
 s:=private.titan_export_extras_v1(current_setting('titan.br_a')::uuid);
 assert s ? 'adventureRpg' and s ? 'routes' and jsonb_array_length(s->'adventureBranches')=1,'export keeps earlier sections';
 assert s->'adventureBranches'->0->>'pilot'='aube-arc1' and not (s->'adventureBranches'->0 ? 'user_id');
end $$;

-- Another world and another account see nothing of the pilot.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.br_a'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 perform public.titan_adventure_branch_action_v1('marees','start');
 s:=public.titan_adventure_branch_snapshot_v1('marees'); assert s->'branch'->>'state'='none';
 begin perform public.titan_adventure_branch_action_v1('marees','enter'); raise exception 'non-pilot world entered';
 exception when raise_exception then assert sqlerrm='BRANCH_UNAVAILABLE',sqlerrm; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.br_d'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 s:=public.titan_adventure_branch_snapshot_v1('aube');
 assert s->>'owner'=current_setting('titan.br_d') and s->'branch'->>'state'='none' and jsonb_array_length(s->'rewards')=0;
end $$;
reset role;
rollback;

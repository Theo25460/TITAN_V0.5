-- V1.5.1 — Gardiens. Synthetic and rolled back. Every API call runs as authenticated/anon.
-- A (la corniche) and B (les ruines) reach the Veilleur with the V1.5.0 usable clue and log exactly the same sessions on the
-- same days. Both observe, prepare (with wrong answers corrected) and resolve with the same frozen thresholds; they end with two
-- distinct outcomes and the same usual reward. Also covered: no contribution validated yet, pending session, corrected session
-- (archived then restored through the real edit API), old client claiming the mini-boss directly, double confirmation, legacy
-- pilot account, export, non-pilot world, closed API surface.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
begin
 perform set_config('titan.gd_a',a::text,true); perform set_config('titan.gd_b',b::text,true); perform set_config('titan.gd_c',c::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}');
 set local session_replication_role=replica;
 insert into public.profiles(id,username,level,xp,credits,is_suspended)
 values(a,'qa_gd_a',1,100,10,false),(b,'qa_gd_b',1,100,10,false),(c,'qa_gd_c',1,100,10,false)
 on conflict(id) do update set is_suspended=false,xp=100,credits=10;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 select u,'aube',9,'rhythm','UTC',now()-interval '40 days' from unnest(array[a,b,c]) u;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 values(a,'marees',9,'rhythm','UTC',now()-interval '40 days');
 set local session_replication_role=origin;
end $$;

-- Guardian objects are closed to the API roles.
do $$begin
 assert not has_table_privilege('authenticated','private.adventure_guardian_encounters','select'),'encounters have no API grant';
 assert not has_function_privilege('anon','public.titan_adventure_guardian_snapshot_v1(text)','execute'),'anon snapshot';
 assert not has_function_privilege('anon','public.titan_adventure_guardian_action_v1(text,text,integer,integer,text,text)','execute'),'anon action';
 assert not has_function_privilege('authenticated','private.titan_adventure_guardian_state(uuid,text,jsonb)','execute'),'state is private';
 assert (private.titan_adventure_guardian_current('aube')->>'id')='veilleur' and private.titan_adventure_guardian_current('marees') is null,'one guardian';
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_guardian_snapshot_v1('aube'); raise exception 'anon snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_guardian_action_v1('aube','resolve'); raise exception 'anon resolve'; exception when insufficient_privilege then null; end;
end $$;

-- Journeys start through the guardian passthrough (guardian -> branch -> v1, same rules).
set local role authenticated;
do $$declare s jsonb; u text;begin
 foreach u in array array[current_setting('titan.gd_a'),current_setting('titan.gd_b'),current_setting('titan.gd_c')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_guardian_action_v1('aube','start');
  assert (s->>'active')::boolean and (s->>'guardianContract')::integer=1 and (s->>'branchContract')::integer=1;
  assert s->'guardian'->>'state'='none','no route yet: '||(s->'guardian')::text;
 end loop;
end $$;
reset role;
-- Fixture: A and B confirmed their V1.5.0 route 20 days ago and made their clue usable (V1.5.0 is proven by 300_adventure_branches).
-- C did the same and also earned ordinal 6 before the guardian existed.
update private.adventure_journeys set started_at=now()-interval '30 days',target=15
 where user_id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid,current_setting('titan.gd_c')::uuid);
set local session_replication_role=replica;
insert into private.adventure_branch_entries(user_id,world_id,pilot,version,entered_at)
select u::uuid,'aube','aube-arc1',1,now()-interval '21 days'
 from unnest(array[current_setting('titan.gd_a'),current_setting('titan.gd_b'),current_setting('titan.gd_c')]) u;
insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
select x.u::uuid,'aube',o,case when o=2 then x.choice end,now()-interval '20 days'+o*interval '1 hour'
 from (values(current_setting('titan.gd_a'),0),(current_setting('titan.gd_b'),1),(current_setting('titan.gd_c'),0)) x(u,choice),
  generate_series(1,4) o;
insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,earned_at)
select current_setting('titan.gd_c')::uuid,'aube',o,now()-interval '5 days' from generate_series(5,6) o;
set local session_replication_role=origin;

set local role authenticated;
do $$declare s jsonb; u text;begin
 foreach u in array array[current_setting('titan.gd_a'),current_setting('titan.gd_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_guardian_snapshot_v1('aube');
  assert s->'branch'->>'state'='confirmed' and s->'branch'->'clue'->>'state'='usable',(s->'branch')::text;
  assert s->'guardian'->>'state'='observe' and (s->'guardian'->'threshold'->>'ordinal')::integer=5,(s->'guardian')::text;
  assert not (s->'guardian'->'threshold'->>'ready')::boolean,'no session yet';
  assert (s->'guardian'->'threshold'->>'effortTarget')::numeric=75 and (s->'guardian'->'threshold'->>'daysTarget')::integer=3,
   'observation = frozen v1 milestone 5 (5 x target, 3 days)';
  begin perform public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,'fissure'); raise exception 'prepared before observing';
  exception when raise_exception then assert sqlerrm='GUARDIAN_NOT_OBSERVED',sqlerrm; end;
  begin perform public.titan_adventure_guardian_action_v1('aube','resolve'); raise exception 'resolved before observing';
  exception when raise_exception then assert sqlerrm='GUARDIAN_NOT_OBSERVED',sqlerrm; end;
  begin perform public.titan_adventure_guardian_action_v1('aube','claim',5); raise exception 'observed without sessions';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
 end loop;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.gd_c'),'role','authenticated')::text,true);
 s:=public.titan_adventure_guardian_snapshot_v1('aube');
 assert s->'guardian'->>'state'='legacy' and s->'guardian'->>'outcome' is null,'pre-guardian mini-boss kept, no outcome invented';
 begin perform public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,'fissure'); raise exception 'legacy prepared';
 exception when raise_exception then assert sqlerrm='GUARDIAN_INCOMPATIBLE',sqlerrm; end;
end $$;
reset role;

-- Same three sessions for A and B (running, bouldering, badminton): 80 effort points on 3 distinct days.
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select u::uuid,s.sport,'training',s.e,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 jsonb_build_object('serverReward',true,'effort',jsonb_build_object('minutes',s.e,'effort_minutes',s.e),'bio',jsonb_build_object('rpe',5))
from unnest(array[current_setting('titan.gd_a'),current_setting('titan.gd_b')]) u,
 (values('running',10,30),('bouldering',9,30),('badminton',8,20)) s(sport,n,e);
set local session_replication_role=origin;
create temp table gd_before on commit drop as select id,xp,credits from public.profiles
 where id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid);

set local role authenticated;
do $$declare s jsonb; u text; wrong text; other text; right_sign text; prepared timestamptz;begin
 foreach u in array array[current_setting('titan.gd_a'),current_setting('titan.gd_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_guardian_action_v1('aube','sync');
  assert (s->'guardian'->'threshold'->>'ready')::boolean and (s->>'effort')::numeric=80 and (s->>'days')::integer=3,(s->'guardian')::text;
  -- Observe: the usual claim of ordinal 5 (the step prescribed by the chapter) opens the encounter.
  s:=public.titan_adventure_guardian_action_v1('aube','claim',5);
  assert s->'guardian'->>'state'='prepare' and s->'guardian'->>'observedAt' is not null,(s->'guardian')::text;
  assert s->'guardian'->'signs'='["fissure","gravure","mousse"]'::jsonb,'same three signs on both routes';
  begin perform public.titan_adventure_guardian_action_v1('aube','resolve'); raise exception 'resolved unprepared';
  exception when raise_exception then assert sqlerrm='GUARDIAN_NOT_PREPARED',sqlerrm; end;
  begin perform public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,'falaise'); raise exception 'unknown sign';
  exception when raise_exception then assert sqlerrm='INVALID_SIGN',sqlerrm; end;
  if s->'guardian'->>'route'='corniche' then right_sign:='fissure'; other:='gravure'; else right_sign:='gravure'; other:='fissure'; end if;
  -- Two wrong interpretations, each recorded with concrete state, then corrected.
  s:=public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,'mousse');
  assert s->'guardian'->>'state'='prepare' and (s->'guardian'->>'attempts')::integer=1 and s->'guardian'->>'lastSign'='mousse'
   and not (s->'guardian'->>'lastCorrect')::boolean,(s->'guardian')::text;
  s:=public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,other);
  assert s->'guardian'->>'state'='prepare' and (s->'guardian'->>'attempts')::integer=2,'the other route''s sign is wrong here';
  s:=public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,right_sign);
  assert (s->'guardian'->>'lastCorrect')::boolean and s->'guardian'->>'preparedAt' is not null and (s->'guardian'->>'attempts')::integer=3;
  -- Prepared, but the frozen milestone 6 (6 x 15 = 90 points, 3 days) is not reached: no contribution validated since.
  assert s->'guardian'->>'state'='waiting' and (s->'guardian'->'threshold'->>'effortTarget')::numeric=90
   and (s->'guardian'->'threshold'->>'daysTarget')::integer=3 and (s->'guardian'->'sincePrepared'->>'sessions')::integer=0,(s->'guardian')::text;
  prepared:=(s->'guardian'->>'preparedAt')::timestamptz;
  s:=public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,'mousse');
  assert (s->'guardian'->>'preparedAt')::timestamptz=prepared and (s->'guardian'->>'attempts')::integer=3,'preparation is stable';
  begin perform public.titan_adventure_guardian_action_v1('aube','resolve'); raise exception 'resolved below the threshold';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  s:=public.titan_adventure_guardian_snapshot_v1('aube');
  assert s->'guardian'->>'outcome' is null and s->'guardian'->>'state'='waiting','a refused resolution leaves no outcome';
 end loop;
end $$;
reset role;

-- The first imports and the preparation happened during earlier visits (one transaction here: date them before the next imports).
update private.adventure_effort_ledger set created_at=now()-interval '2 hours'
 where user_id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid);
update private.adventure_guardian_encounters set prepared_at=now()-interval '1 hour'
 where user_id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid);
-- A session still pending review, then the next eligible contribution (same for A and B).
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details,status)
select u::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now(),
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb,s.status
from unnest(array[current_setting('titan.gd_a'),current_setting('titan.gd_b')]) u,
 (values('muscu_builder',2,'pending_review')) s(sport,n,status);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; u text;begin
 foreach u in array array[current_setting('titan.gd_a'),current_setting('titan.gd_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_guardian_action_v1('aube','sync');
  assert s->'guardian'->>'state'='waiting' and (s->'guardian'->'sincePrepared'->>'sessions')::integer=0,'pending session excluded';
 end loop;
end $$;
reset role;
set local session_replication_role=replica; -- moderation validates it (fixture shortcut)
update public.training_logs set status='valid' where sport='muscu_builder' and status='pending_review'
 and user_id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; u text; l record; edited jsonb;begin
 foreach u in array array[current_setting('titan.gd_a'),current_setting('titan.gd_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_guardian_snapshot_v1('aube');
  assert s->'guardian'->>'state'='waiting','read-only snapshot never imports';
  s:=public.titan_adventure_guardian_action_v1('aube','sync');
  assert s->'guardian'->>'state'='ready' and (s->'guardian'->'sincePrepared'->>'sessions')::integer=1
   and (s->'guardian'->'sincePrepared'->>'effort')::numeric=20 and (s->>'effort')::numeric=100,(s->'guardian')::text;
  -- Corrected session: the player archives it through the real edit API, then restores it.
  select id,revision into l from public.training_logs where user_id=auth.uid() and sport='muscu_builder';
  edited:=public.titan_update_training_session(l.id,l.revision,'{"archived":true}');
  s:=public.titan_adventure_guardian_snapshot_v1('aube');
  assert s->'guardian'->>'state'='waiting' and (s->'guardian'->'corrected'->>'sessions')::integer=1
   and (s->'guardian'->'corrected'->>'effort')::numeric=20 and (s->>'effort')::numeric=80,'an archived session stops counting: '||(s->'guardian')::text;
  begin perform public.titan_adventure_guardian_action_v1('aube','resolve'); raise exception 'resolved on a corrected session';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  edited:=public.titan_update_training_session(l.id,(edited->>'revision')::integer,'{"archived":false}');
  s:=public.titan_adventure_guardian_snapshot_v1('aube');
  assert s->'guardian'->>'state'='ready' and (s->'guardian'->'corrected'->>'sessions')::integer=0,'restored session counts again';
  -- An old client asks the mini-boss reward directly through v1: the frozen thresholds are met, the outcome is not.
  begin perform public.titan_adventure_rpg_action_v1('aube','claim',6); raise exception 'old client skipped the resolution';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  begin perform public.titan_adventure_branch_action_v1('aube','claim',6); raise exception 'branch client skipped the resolution';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
 end loop;
end $$;

-- Resolve, twice: one outcome, one reward, nothing else changes.
do $$declare s jsonb; again jsonb; u text; results jsonb:='[]';begin
 foreach u in array array[current_setting('titan.gd_a'),current_setting('titan.gd_b')] loop
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_guardian_action_v1('aube','resolve');
  assert s->'guardian'->>'state'='resolved' and s->'guardian'->>'resolvedAt' is not null,(s->'guardian')::text;
  assert exists(select 1 from jsonb_array_elements(s->'rewards') r where (r->>'ordinal')::integer=6),'usual mini-boss reward';
  again:=public.titan_adventure_guardian_action_v1('aube','resolve');
  assert again->'guardian'->>'outcome'=s->'guardian'->>'outcome' and again->'guardian'->>'resolvedAt'=s->'guardian'->>'resolvedAt','double confirmation keeps one outcome';
  again:=public.titan_adventure_guardian_action_v1('aube','prepare',null,null,null,'mousse');
  assert again->'guardian'->>'state'='resolved' and (again->'guardian'->>'attempts')::integer=3,'nothing reopens';
  assert (select count(*) from jsonb_array_elements(again->'rewards') r where (r->>'ordinal')::integer=6)=1,'one mini-boss reward';
  results:=results||jsonb_build_array(jsonb_build_object('route',s->'guardian'->>'route','clue',s->'guardian'->>'clue','outcome',s->'guardian'->>'outcome',
   'obs',(select jsonb_build_array(m->'effortTarget',m->'daysTarget',m->'chapter') from jsonb_array_elements(s->'milestones') m where (m->>'ordinal')::integer=5),
   'res',(select jsonb_build_array(m->'effortTarget',m->'daysTarget',m->'chapter') from jsonb_array_elements(s->'milestones') m where (m->>'ordinal')::integer=6),
   'effort',s->>'effort','days',s->>'days','rewards',jsonb_array_length(s->'rewards'),
   'xp',(select xp from public.profiles where id=auth.uid()),'credits',(select credits from public.profiles where id=auth.uid())));
 end loop;
 assert results->0->>'route'='corniche' and results->0->>'clue'='prise' and results->0->>'outcome'='passage_rouvert',results::text;
 assert results->1->>'route'='ruines' and results->1->>'clue'='serment' and results->1->>'outcome'='serment_restitue',results::text;
 assert results->0->'obs'=results->1->'obs' and results->0->'res'=results->1->'res' and results->0->>'effort'=results->1->>'effort'
  and results->0->>'days'=results->1->>'days' and results->0->>'rewards'=results->1->>'rewards','same effort, same rewards: '||results::text;
 assert results->0->>'xp'=results->1->>'xp' and results->0->>'credits'=results->1->>'credits','same economy on both routes';
 raise notice 'V1.5.1 two resolutions %',results::text;
end $$;
reset role;

do $$declare s jsonb;begin
 assert (select count(*) from private.adventure_encounter_rewards where world_id='aube' and ordinal=6
   and user_id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid))=2,'one reward row per account';
 assert (select count(*)=2 and count(distinct outcome)=2 from private.adventure_guardian_encounters
   where user_id in (current_setting('titan.gd_a')::uuid,current_setting('titan.gd_b')::uuid)),'one encounter row per account, two outcomes';
 assert (select bool_and(p.xp=b.xp and p.credits=b.credits) from gd_before b join public.profiles p on p.id=b.id),'the guardian never touches XP or credits';
 s:=private.titan_export_extras_v1(current_setting('titan.gd_a')::uuid);
 assert s ? 'adventureRpg' and s ? 'adventureBranches' and jsonb_array_length(s->'adventureGuardians')=1,'export keeps earlier sections';
 assert s->'adventureGuardians'->0->>'outcome'='passage_rouvert' and not (s->'adventureGuardians'->0 ? 'user_id');
end $$;

-- Another world sees no guardian.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.gd_a'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 perform public.titan_adventure_guardian_action_v1('marees','start');
 s:=public.titan_adventure_guardian_snapshot_v1('marees'); assert s->'guardian'->>'state'='none';
 begin perform public.titan_adventure_guardian_action_v1('marees','prepare',null,null,null,'fissure'); raise exception 'non-pilot guardian';
 exception when raise_exception then assert sqlerrm='GUARDIAN_UNAVAILABLE',sqlerrm; end;
 begin perform public.titan_adventure_guardian_action_v1('aube','attack'); raise exception 'unknown action';
 exception when raise_exception then assert sqlerrm='INVALID_ACTION',sqlerrm; end;
end $$;
reset role;
rollback;

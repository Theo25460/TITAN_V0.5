-- V1.5.3 — Quatre mondes, quatre mécaniques. Synthetic and rolled back. Every API call runs as authenticated/anon.
-- Eight accounts log exactly the same admissible history (same sessions, same days, five different sports): one account per
-- world and per route. Each plays the first arc of its world through the common campaign API: entry, choice, route scene and
-- clue, observation, the world's mechanic (with a wrong answer corrected), resolution. All eight end with eight distinct
-- resolutions, on the same thresholds, with the same rewards, XP and credits. A ninth account (Marées) plays with another sport
-- and other hours and reaches the same thresholds. Also covered: a Marées journey that had passed the choice before V1.5.3
-- (legacy, version and acquired rewards kept), an old client skipping a gated step, the V1.5.1 sign API refused outside the
-- Vallée, malformed answers not counted, the answer read back on another device, the expected answer never sent, export,
-- closed API surface.
begin;
do $$
declare u uuid; i integer;
begin
 for i in 1..10 loop
  u:=gen_random_uuid(); perform set_config('titan.cp_'||i,u::text,true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
 end loop;
 set local session_replication_role=replica;
 for i in 1..10 loop
  u:=current_setting('titan.cp_'||i)::uuid;
  insert into public.profiles(id,username,level,xp,credits,is_suspended) values(u,'qa_cp_'||i,1,100,10,false)
   on conflict(id) do update set is_suspended=false,xp=100,credits=10;
 end loop;
 -- 1..8: (world, route) = aube corniche/ruines, marees carte/gardienne, forge soufflet/artisans, aurores constellations/histoire.
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 select current_setting('titan.cp_'||x.i)::uuid,x.w,9,'rhythm','UTC',now()-interval '40 days'
  from (values(1,'aube'),(2,'aube'),(3,'marees'),(4,'marees'),(5,'forge'),(6,'forge'),(7,'aurores'),(8,'aurores'),(9,'marees'),(10,'marees')) x(i,w);
 set local session_replication_role=origin;
end $$;
create temp table cp_plan(i integer primary key, world text, route text, wrong text[], invalid text[], answer text[]) on commit drop;
insert into cp_plan values
 (1,'aube','corniche',array['mousse'],array['falaise'],array['fissure']),
 (2,'aube','ruines',array['fissure'],array['gravure','mousse'],array['gravure']),
 (3,'marees','carte',array['est','est','chenal'],array['est','ouest'],array['est','ouest','chenal']),
 (4,'marees','gardienne',array['calme','est','chenal'],array['calme','nord','large'],array['calme','est','large']),
 (5,'forge','soufflet',array['charniere','buse','cuir'],array['charniere','charniere','buse'],array['charniere','cuir','buse']),
 (6,'forge','artisans',array['ressort','axe','tete'],array['axe','ressort','marteau'],array['axe','ressort','tete']),
 (7,'aurores','constellations',array['cairn','rocher','col'],array['cairn','cairn','col'],array['cairn','lac','col']),
 (8,'aurores','histoire',array['rocher','pin','cairn'],array['rocher','pin','pin'],array['rocher','pin','col']),
 (9,'marees','carte',array['est','ouest','large'],array['est'],array['est','ouest','chenal']);
grant select on cp_plan to authenticated;

-- Closed API surface; the common configuration feeds the V1.5.0 and V1.5.1 contracts, the Vallée literals are unchanged.
do $$declare w text;begin
 assert not has_function_privilege('anon','public.titan_adventure_campaign_snapshot_v1(text)','execute'),'anon snapshot';
 assert not has_function_privilege('anon','public.titan_adventure_campaign_action_v1(text,text,integer,integer,text,text[])','execute'),'anon action';
 assert not has_function_privilege('authenticated','private.titan_adventure_campaign_config(text,integer)','execute'),'config is private';
 assert not has_function_privilege('authenticated','private.titan_adventure_mechanic_check(text,jsonb,text[])','execute'),'check is private';
 assert not has_function_privilege('authenticated','private.titan_adventure_mechanic_state(uuid,text,jsonb)','execute'),'state is private';
 assert private.titan_adventure_branch_config('aube-arc1',1)->'routes'='[{"id":"corniche","choice":0,"clue":"prise"},{"id":"ruines","choice":1,"clue":"serment"}]'::jsonb;
 assert private.titan_adventure_guardian_config('veilleur',1)->'signs'='["fissure","gravure","mousse"]'::jsonb;
 foreach w in array array['marees','forge','aurores'] loop
  assert private.titan_adventure_branch_current(w)->>'id'=w||'-arc1' and private.titan_adventure_branch_current(w)->'steps'=private.titan_adventure_branch_current('aube')->'steps',
   'same conditions in every world: '||w;
  assert private.titan_adventure_guardian_current(w)->>'pilot'=w||'-arc1' and (private.titan_adventure_guardian_current(w)->>'ordinal')::integer=6
   and (private.titan_adventure_guardian_current(w)->>'observeOrdinal')::integer=5;
  -- Conditions only know effort and days: no real time window, no compulsory discipline anywhere in the contract.
  assert private.titan_adventure_campaign_current(w)::text !~* '"(sport|discipline|family|hour|window|time|weekday|minute)',w;
 end loop;
 assert private.titan_adventure_campaign_config('marees-arc1',2) is null and private.titan_adventure_branch_config('marees-arc1',2) is null,'no unknown version';
 -- The primitive: one token per slot from its pool, distinct pieces/beacons, first wrong slot.
 assert private.titan_adventure_mechanic_check('sequence',private.titan_adventure_guardian_config('artisan',1)->'routes'->0,array['charniere','buse','cuir'])
  ='{"valid":true,"correct":false,"firstWrong":2}'::jsonb;
 assert private.titan_adventure_mechanic_check('sequence',private.titan_adventure_guardian_config('artisan',1)->'routes'->0,array['cuir','cuir','buse'])->>'valid'='false';
 assert private.titan_adventure_mechanic_check('chart',private.titan_adventure_guardian_config('gardienne',1)->'routes'->0,array['est','est','chenal'])
  ='{"valid":true,"correct":false,"firstWrong":2}'::jsonb,'chart allows the same current twice';
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_campaign_snapshot_v1('marees'); raise exception 'anon snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_campaign_action_v1('marees','solve',null,null,null,array['est']); raise exception 'anon solve'; exception when insufficient_privilege then null; end;
end $$;

-- Start every journal through the campaign API (campaign -> guardian -> branch -> v1, same rules).
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select x.i,x.w from (values(1,'aube'),(2,'aube'),(3,'marees'),(4,'marees'),(5,'forge'),(6,'forge'),(7,'aurores'),(8,'aurores'),(9,'marees'),(10,'marees')) x(i,w) loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.w,'start');
  assert (s->>'active')::boolean and (s->>'campaignContract')::integer=1 and s->>'campaign'=p.w||'-arc1',s::text;
  assert s->'branch'->>'state'='available' and s->'guardian'->>'state'='none' and s->'mechanic'->>'state'='none',s::text;
 end loop;
end $$;
reset role;
update private.adventure_journeys set started_at=now()-interval '30 days',target=15
 where user_id in (select current_setting('titan.cp_'||i)::uuid from generate_series(1,10) i);
-- Fixture for account 10: a Marées journey that passed the choice before V1.5.3 (two rewards, choice 1), never entered.
set local session_replication_role=replica;
insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
values(current_setting('titan.cp_10')::uuid,'marees',1,null,now()-interval '25 days'),(current_setting('titan.cp_10')::uuid,'marees',2,1,now()-interval '24 days');
-- The same two first sessions for accounts 1..8 (running, bouldering); account 9 swims at other hours.
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.cp_'||i)::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from generate_series(1,8) i,(values('running',20),('bouldering',19)) s(sport,n);
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.cp_9')::uuid,'swimming','training',20,'min',0,
 date_trunc('day',now())-n*interval '1 day'+interval '5 hours 40 minutes',date_trunc('day',now())-n*interval '1 day'+interval '5 hours 41 minutes',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from (values(20),(19)) s(n);
set local session_replication_role=origin;

-- Legacy: the old chapter keeps its version and its acquired rewards; no entry, no mechanic, no route invented.
set local role authenticated;
do $$declare s jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_10'),'role','authenticated')::text,true);
 s:=public.titan_adventure_campaign_snapshot_v1('marees');
 assert s->'branch'->>'state'='legacy' and s->'guardian'->>'state'='none' and s->'mechanic'->>'state'='none',s::text;
 assert jsonb_array_length(s->'rewards')=2 and (s->'rewards'->1->>'choice')::integer=1 and (s->>'chapter')::integer=9,'acquired rewards and chapter kept';
 begin perform public.titan_adventure_campaign_action_v1('marees','enter'); raise exception 'legacy entered';
 exception when raise_exception then assert sqlerrm='BRANCH_INCOMPATIBLE',sqlerrm; end;
 begin perform public.titan_adventure_campaign_action_v1('marees','solve',null,null,null,array['est','ouest','chenal']); raise exception 'legacy solved';
 exception when raise_exception then assert sqlerrm='GUARDIAN_UNAVAILABLE',sqlerrm; end;
end $$;

-- Entry and choice: the first milestone, explicit entry, then the route (the engine's canonical choice of ordinal 2).
do $$declare s jsonb; p record;begin
 for p in select * from cp_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  assert (s->>'effort')::numeric=40 and (s->>'days')::integer=2,p.i||' '||s::text;
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',1);
  begin perform public.titan_adventure_campaign_action_v1(p.world,'confirm',null,null,p.route); raise exception 'confirmed before entry';
  exception when raise_exception then assert sqlerrm='BRANCH_NOT_ENTERED',sqlerrm; end;
  s:=public.titan_adventure_campaign_action_v1(p.world,'enter');
  assert s->'branch'->>'state'='entered',s::text;
  begin perform public.titan_adventure_campaign_action_v1(p.world,'confirm',null,null,'nulle-part'); raise exception 'unknown route';
  exception when raise_exception then assert sqlerrm='INVALID_ROUTE',sqlerrm; end;
  s:=public.titan_adventure_campaign_action_v1(p.world,'confirm',null,null,p.route);
  assert s->'branch'->>'state'='confirmed' and s->'branch'->>'route'=p.route,s::text;
 end loop;
end $$;
reset role;
-- The decision was taken during an earlier visit (one transaction here: date it before the next sessions).
update private.adventure_encounter_rewards set earned_at=now()-interval '15 days'
 where ordinal in (1,2) and user_id in (select current_setting('titan.cp_'||i)::uuid from generate_series(1,9) i);
update private.adventure_branch_entries set entered_at=now()-interval '16 days'
 where user_id in (select current_setting('titan.cp_'||i)::uuid from generate_series(1,9) i);
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.cp_'||i)::uuid,'badminton','training',20,'min',0,now()-interval '10 days',now()-interval '10 days',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb from generate_series(1,8) i;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
values(current_setting('titan.cp_9')::uuid,'swimming','training',20,'min',0,date_trunc('day',now())-interval '10 days'+interval '22 hours 50 minutes',
 date_trunc('day',now())-interval '10 days'+interval '22 hours 51 minutes','{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}');
set local session_replication_role=origin;

-- Scene (step 3): 1 x target and 1 day since the decision; clue (step 4) not yet: an old client cannot skip it.
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select * from cp_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  assert (s->'branch'->>'effortSince')::numeric=20 and (s->'branch'->>'daysSince')::integer=1,p.i||' '||(s->'branch')::text;
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',3);
  assert (s->'branch'->'steps'->0->>'earned')::boolean and s->'branch'->'clue'->>'state'='found',(s->'branch')::text;
  begin perform public.titan_adventure_rpg_action_v1(p.world,'claim',4); raise exception 'old client skipped the clue step';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
 end loop;
end $$;
reset role;
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.cp_'||i)::uuid,'muscu_builder','training',20,'min',0,now()-interval '8 days',now()-interval '8 days',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb from generate_series(1,8) i;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
values(current_setting('titan.cp_9')::uuid,'swimming','training',20,'min',0,date_trunc('day',now())-interval '8 days'+interval '13 hours',
 date_trunc('day',now())-interval '8 days'+interval '13 hours 1 minute','{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}');
set local session_replication_role=origin;

-- Clue (step 4), observation (milestone 5), then the world's mechanic.
set local role authenticated;
do $$declare s jsonb; again jsonb; p record; bad text;begin
 for p in select * from cp_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',4);
  assert s->'branch'->'clue'->>'state'='usable' and s->'guardian'->>'state'='observe',(s->'guardian')::text;
  begin perform public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.answer); raise exception 'solved before observing';
  exception when raise_exception then assert sqlerrm='GUARDIAN_NOT_OBSERVED',sqlerrm; end;
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',5);
  assert s->'guardian'->>'state'='prepare' and s->'mechanic'->>'state'='prepare' and (s->'mechanic'->>'attempts')::integer=0,(s->'mechanic')::text;
  assert s->'mechanic'->>'primitive'=case p.world when 'aube' then 'pick' when 'marees' then 'chart' when 'forge' then 'sequence' else 'link' end;
  -- The expected answer never leaves the server.
  assert position('"answer"' in s::text)=0 and position('"sign"' in s::text)=0,'no expected answer in the snapshot';
  if p.world<>'aube' then
   begin perform public.titan_adventure_guardian_action_v1(p.world,'prepare',null,null,null,'fissure'); raise exception 'V1.5.1 sign outside the Vallée';
   exception when raise_exception then assert sqlerrm='INVALID_SIGN',sqlerrm; end;
  end if;
  -- A malformed answer is refused and not counted.
  begin perform public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.invalid); raise exception 'malformed answer % accepted',p.invalid;
  exception when raise_exception then assert sqlerrm in ('INVALID_ANSWER','INVALID_SIGN'),sqlerrm; end;
  -- A wrong answer: counted, its first wrong slot is returned for a concrete feedback, and it can be corrected.
  s:=public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.wrong);
  assert s->'guardian'->>'state'='prepare' and (s->'mechanic'->>'attempts')::integer=1 and not (s->'mechanic'->>'lastCorrect')::boolean
   and (s->'mechanic'->>'firstWrong')::integer between 1 and 3 and s->'mechanic'->'lastAnswer'=to_jsonb(p.wrong),p.i||' '||(s->'mechanic')::text;
  -- Another device resumes: it reads the same board and the same feedback.
  again:=public.titan_adventure_campaign_snapshot_v1(p.world);
  assert again->'mechanic'=s->'mechanic','same state on another device';
  begin perform public.titan_adventure_campaign_action_v1(p.world,'resolve'); raise exception 'resolved unsolved';
  exception when raise_exception then assert sqlerrm='GUARDIAN_NOT_PREPARED',sqlerrm; end;
  s:=public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.answer);
  assert (s->'mechanic'->>'lastCorrect')::boolean and (s->'mechanic'->>'solved')::boolean and (s->'mechanic'->>'attempts')::integer=2
   and s->'guardian'->>'state'='waiting',p.i||' '||s::text;
  -- Stable once solved: a late wrong answer from a device left on the board is not counted.
  again:=public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.wrong);
  assert (again->'mechanic'->>'attempts')::integer=2 and (again->'mechanic'->>'lastCorrect')::boolean,'solution is stable';
  -- Milestone 6 (6 x 15 = 90 points, 3 days) is not reached yet (80): an old client cannot take the mini-boss either.
  begin perform public.titan_adventure_campaign_action_v1(p.world,'resolve'); raise exception 'resolved below the threshold';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
 end loop;
end $$;
reset role;
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.cp_'||i)::uuid,'cycling','training',20,'min',0,now()-interval '2 days',now()-interval '2 days',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb from generate_series(1,8) i;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
values(current_setting('titan.cp_9')::uuid,'swimming','training',20,'min',0,date_trunc('day',now())-interval '2 days'+interval '3 hours',
 date_trunc('day',now())-interval '2 days'+interval '3 hours 1 minute','{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}');
set local session_replication_role=origin;
create temp table cp_before on commit drop as select id,xp,credits from public.profiles
 where id in (select current_setting('titan.cp_'||i)::uuid from generate_series(1,9) i);

-- Resolution: one outcome per account, the usual mini-boss reward, nothing else changes.
set local role authenticated;
do $$declare s jsonb; again jsonb; p record; results jsonb:='[]'; first jsonb;begin
 for p in select * from cp_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  begin perform public.titan_adventure_rpg_action_v1(p.world,'claim',6); raise exception 'old client skipped the resolution';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  assert s->'guardian'->>'state'='ready',(s->'guardian')::text;
  s:=public.titan_adventure_campaign_action_v1(p.world,'resolve');
  again:=public.titan_adventure_campaign_action_v1(p.world,'resolve');
  assert s->'guardian'->>'state'='resolved' and again->'guardian'->>'outcome'=s->'guardian'->>'outcome'
   and again->'guardian'->>'resolvedAt'=s->'guardian'->>'resolvedAt','one outcome, stable';
  assert (select count(*) from jsonb_array_elements(again->'rewards') r where (r->>'ordinal')::integer=6)=1,'one mini-boss reward';
  results:=results||jsonb_build_array(jsonb_build_object('i',p.i,'world',p.world,'route',s->'guardian'->>'route','clue',s->'guardian'->>'clue',
   'outcome',s->'guardian'->>'outcome','attempts',(s->'mechanic'->>'attempts')::integer,
   'thresholds',(select jsonb_agg(jsonb_build_array(m->'effortTarget',m->'daysTarget',m->'chapter') order by (m->>'ordinal')::integer)
     from jsonb_array_elements(s->'milestones') m where (m->>'ordinal')::integer between 1 and 6),
   'steps',(select jsonb_agg(jsonb_build_array(x->'effortTarget',x->'daysTarget') order by (x->>'ordinal')::integer) from jsonb_array_elements(s->'branch'->'steps') x),
   'effort',(s->>'effort')::numeric,'days',(s->>'days')::integer,'rewards',jsonb_array_length(s->'rewards'),
   'xp',(select xp from public.profiles where id=auth.uid()),'credits',(select credits from public.profiles where id=auth.uid())));
 end loop;
 first:=results->0;
 for i in 0..jsonb_array_length(results)-1 loop
  assert results->i->'thresholds'=first->'thresholds' and results->i->'steps'=first->'steps' and results->i->'effort'=first->'effort'
   and results->i->'days'=first->'days' and results->i->'rewards'=first->'rewards' and results->i->'xp'=first->'xp'
   and results->i->'credits'=first->'credits' and (results->i->>'attempts')::integer=2,'same sport constraints and economy: '||(results->i)::text;
 end loop;
 assert (select count(distinct x->>'outcome') from jsonb_array_elements(results) x where (x->>'i')::integer<=8)=8,'eight distinct resolutions: '||results::text;
 assert (select string_agg(x->>'outcome',',' order by (x->>'i')::integer) from jsonb_array_elements(results) x)
  ='passage_rouvert,serment_restitue,chenal_ouvert,large_franchi,foyer_ranime,enclume_chantante,balises_rallumees,recit_transmis,chenal_ouvert',results::text;
 raise notice 'V1.5.3 four worlds %',results::text;
end $$;
reset role;

do $$declare s jsonb;begin
 assert (select bool_and(p.xp=b.xp and p.credits=b.credits) from cp_before b join public.profiles p on p.id=b.id),'the campaigns never touch XP or credits';
 assert (select count(*) from private.adventure_guardian_encounters where user_id in (select current_setting('titan.cp_'||i)::uuid from generate_series(1,9) i))=9;
 -- The legacy account was not touched by anyone.
 assert (select count(*) from private.adventure_encounter_rewards where user_id=current_setting('titan.cp_10')::uuid)=2
  and not exists(select 1 from private.adventure_branch_entries where user_id=current_setting('titan.cp_10')::uuid);
 s:=private.titan_export_extras_v1(current_setting('titan.cp_5')::uuid);
 assert s ? 'adventureRpg' and s ? 'adventureBranches' and s ? 'adventureConsequences' and jsonb_array_length(s->'adventureGuardians')=1,'export keeps earlier sections';
 assert s->'adventureGuardians'->0->>'outcome'='foyer_ranime' and s->'adventureGuardians'->0->'last_answer'='["charniere","cuir","buse"]'::jsonb
  and s->'adventureBranches'->0->>'pilot'='forge-arc1' and not (s->'adventureGuardians'->0 ? 'user_id'),s::text;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.cp_3'),'role','authenticated')::text,true);
do $$begin
 begin perform public.titan_adventure_campaign_action_v1('marees','attack'); raise exception 'unknown action';
 exception when raise_exception then assert sqlerrm='INVALID_ACTION',sqlerrm; end;
 begin perform public.titan_adventure_campaign_action_v1('atlantide','solve',null,null,null,array['est']); raise exception 'unknown world';
 exception when raise_exception then assert sqlerrm='INVALID_WORLD',sqlerrm; end;
end $$;
reset role;
rollback;

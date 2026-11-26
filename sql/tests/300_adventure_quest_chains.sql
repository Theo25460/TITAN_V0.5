-- V1.5.4 — Quêtes entre les mondes. Synthetic and rolled back. Every API call runs as authenticated/anon.
-- The clues come from the canonical state of the existing arcs, produced here by the real APIs (no fixture for them): the
-- Vallée de l'Aube on both routes (V1.5.0 choice, V1.5.1 Veilleur, V1.5.2 access discovered) and the Îles des Marées on both
-- routes (V1.5.3 Gardienne). Accounts:
--   1 aube ruines   -> atelier-oublie by symbole-cerf (manner cle)        2 aube corniche -> atelier-oublie by cairn-fendu (motifs)
--   3 marees carte  -> feux-cote by feu-chenal (lanterne)                 4 marees gardienne -> feux-cote by couplet-etoile (livre)
--   5 aube ruines, access not discovered: no clue, nothing open           6 aube legacy (choice passed before V1.5.0): nothing
--   7 a profile without any journey: nothing, no error                    8 marees carte: engaged in feux-cote, then a new version
-- Covered: two accounts with different routes find and finish each chain; prerequisites (no clue, no access); replays of every
-- confirmation and of the sync never duplicate a clue; a second device reads the same notebook; a definitive manner; the next
-- encounter opens with any sport at any hour, never with a session on hold; the main campaigns, XP, credits and rewards are
-- untouched and continue without any chain; a new version never takes away an engaged access; metrics; export; closed API.
begin;
do $$
declare u uuid; i integer;
begin
 for i in 1..8 loop
  u:=gen_random_uuid(); perform set_config('titan.qc_'||i,u::text,true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
 end loop;
 set local session_replication_role=replica;
 for i in 1..8 loop
  u:=current_setting('titan.qc_'||i)::uuid;
  insert into public.profiles(id,username,level,xp,credits,is_suspended) values(u,'qa_qc_'||i,1,100,10,false)
   on conflict(id) do update set is_suspended=false,xp=100,credits=10;
 end loop;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 select current_setting('titan.qc_'||x.i)::uuid,x.w,9,'rhythm','UTC',now()-interval '40 days'
  from (values(1,'aube'),(2,'aube'),(3,'marees'),(4,'marees'),(5,'aube'),(6,'aube'),(8,'marees')) x(i,w);
 set local session_replication_role=origin;
end $$;
-- Players of an arc (account, world, route, the right answer of its mechanic).
create temp table qc_plan(i integer primary key, world text, route text, answer text[]) on commit drop;
insert into qc_plan values
 (1,'aube','ruines',array['gravure']),(2,'aube','corniche',array['fissure']),
 (3,'marees','carte',array['est','ouest','chenal']),(4,'marees','gardienne',array['calme','est','large']),
 (5,'aube','ruines',array['gravure']),(8,'marees','carte',array['est','ouest','chenal']);
grant select on qc_plan to authenticated;

-- Closed API surface; the contract is private.
do $$begin
 assert not has_function_privilege('anon','public.titan_adventure_quests_v1()','execute'),'anon notebook';
 assert not has_function_privilege('anon','public.titan_adventure_quest_action_v1(text,text,text[],text)','execute'),'anon action';
 assert not has_function_privilege('authenticated','private.titan_adventure_quest_config(text,integer)','execute'),'config is private';
 assert not has_function_privilege('authenticated','private.titan_adventure_quest_fact(uuid,jsonb)','execute'),'fact is private';
 assert not has_function_privilege('authenticated','private.titan_adventure_quest_metrics_v1()','execute'),'metrics are private';
 assert not has_table_privilege('authenticated','private.adventure_quests','select'),'table is private';
 assert private.titan_adventure_quest_catalog()=array['atelier-oublie','feux-cote'];
 assert private.titan_adventure_quest_config('atelier-oublie',2) is null,'no unknown version';
 -- No trigger reads the chains: nothing in the main campaigns can wait for one.
 assert not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and p.prosrc ~ '(private\.adventure_quests\M|titan_adventure_quest_(state|fact|action|config|current|catalog)|titan_adventure_quests_v1)'),'no gate on a chain';
 -- Conditions only know story facts and active days: no time window, no compulsory discipline.
 assert private.titan_adventure_quest_current('atelier-oublie')::text||private.titan_adventure_quest_current('feux-cote')::text
  !~* '"(sport|discipline|family|hour|window|time|weekday|minute|xp|credit|reward)','no sport, hour or reward in the contract';
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_quests_v1(); raise exception 'anon notebook'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_quest_action_v1('atelier-oublie','start'); raise exception 'anon start'; exception when insufficient_privilege then null; end;
end $$;

-- The existing arcs, played through their own APIs (same session history as 300_adventure_campaigns).
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select x.i,x.w from (values(1,'aube'),(2,'aube'),(3,'marees'),(4,'marees'),(5,'aube'),(6,'aube'),(8,'marees')) x(i,w) loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.w,'start');
  assert (s->>'active')::boolean,s::text;
 end loop;
end $$;
reset role;
update private.adventure_journeys set started_at=now()-interval '30 days',target=15
 where user_id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,8) i);
set local session_replication_role=replica;
-- Account 6: a Vallée journey that passed the choice before V1.5.0 (two rewards, choice 1), never entered.
insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
values(current_setting('titan.qc_6')::uuid,'aube',1,null,now()-interval '25 days'),(current_setting('titan.qc_6')::uuid,'aube',2,1,now()-interval '24 days');
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.qc_'||p.i)::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from qc_plan p,(values('running',20),('bouldering',19)) s(sport,n);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select * from qc_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',1);
  s:=public.titan_adventure_campaign_action_v1(p.world,'enter');
  s:=public.titan_adventure_campaign_action_v1(p.world,'confirm',null,null,p.route);
  assert s->'branch'->>'state'='confirmed' and s->'branch'->>'route'=p.route,s::text;
 end loop;
end $$;
reset role;
update private.adventure_encounter_rewards set earned_at=now()-interval '15 days'
 where ordinal in (1,2) and user_id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,5) i union select current_setting('titan.qc_8')::uuid);
update private.adventure_branch_entries set entered_at=now()-interval '16 days'
 where user_id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,8) i);
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.qc_'||p.i)::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from qc_plan p,(values('badminton',10),('muscu_builder',8),('cycling',2)) s(sport,n);
set local session_replication_role=origin;
create temp table qc_before on commit drop as select id,xp,credits from public.profiles
 where id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,8) i);
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select * from qc_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',3);
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',4);
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',5);
  s:=public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.answer);
  s:=public.titan_adventure_campaign_action_v1(p.world,'resolve');
  assert s->'guardian'->>'state'='resolved',p.i||' '||(s->'guardian')::text;
 end loop;
 -- Before any discovery in the Vallée: the Marées outcomes are clues already, the Vallée ones need their access discovered.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_1'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert s->'chains'->0->>'state'='locked' and jsonb_array_length(s->'clues')=0,s::text;
 -- V1.5.2: the access of each Vallée route, through its own API (account 5 never discovers it).
 s:=public.titan_adventure_consequence_action_v1('aube','discover',array['cerf']);
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_2'),'role','authenticated')::text,true);
 s:=public.titan_adventure_consequence_action_v1('aube','discover',array['cairn','pin']);
 assert s->'items'->0->>'state'='open',s::text;
 -- Account 5 tries the archive once with a wrong engraving: its access exists but is not discovered, so no clue.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_5'),'role','authenticated')::text,true);
 s:=public.titan_adventure_consequence_action_v1('aube','discover',array['vague']);
 assert s->'items'->0->>'state'='discover' and (s->'items'->0->>'attempts')::integer=1,s::text;
end $$;
reset role;
create temp table qc_campaigns on commit drop as
 select p.i,p.world,public.titan_adventure_campaign_snapshot_v1(p.world) s from qc_plan p where false;
do $$declare p record;begin
 for p in select * from qc_plan loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  insert into qc_campaigns values(p.i,p.world,public.titan_adventure_campaign_snapshot_v1(p.world));
 end loop;
end $$;

-- Prerequisites: each account sees exactly the chain its own arc opened, with the clue, its origin, its state, its destination.
set local role authenticated;
do $$declare s jsonb; c jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_1'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert (s->>'contract')::integer=1 and s->>'owner'=auth.uid()::text and jsonb_array_length(s->'chains')=2,s::text;
 assert s->'chains'->0->>'id'='atelier-oublie' and s->'chains'->0->>'state'='available' and s->'chains'->0->>'clue'='symbole-cerf',s::text;
 assert s->'chains'->1->>'state'='locked' and s->'chains'->1->>'clue' is null,'feux-cote stays locked without a Marées outcome';
 assert jsonb_array_length(s->'clues')=1,s::text;
 c:=s->'clues'->0;
 assert c->>'id'='symbole-cerf' and c->>'state'='found' and c->>'chain'='atelier-oublie' and c->>'destination'='forge'
  and c->'origin'->>'world'='aube' and c->'origin'->>'arc'='aube-arc1' and c->'origin'->>'route'='ruines'
  and c->'origin'->>'outcome'='serment_restitue' and c->>'foundAt' is not null,c::text;
 -- The expected mark never leaves the server.
 assert position('"answer"' in s::text)=0,'no expected mark in the notebook';
 -- Alternative route: the corniche player opens the same chain with another clue.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_2'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert s->'chains'->0->>'state'='available' and s->'chains'->0->>'clue'='cairn-fendu' and s->'clues'->0->'origin'->>'route'='corniche',s::text;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_3'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert s->'chains'->0->>'state'='locked' and s->'chains'->1->>'state'='available' and s->'chains'->1->>'clue'='feu-chenal'
  and s->'clues'->0->>'destination'='aurores',s::text;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_4'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert s->'chains'->1->>'state'='available' and s->'chains'->1->>'clue'='couplet-etoile' and s->'clues'->0->'origin'->>'route'='gardienne',s::text;
 -- No clue, no access: the Veilleur resolved without the access discovered, a legacy journey, a profile without journey.
 for i in 5..7 loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||i),'role','authenticated')::text,true);
  s:=public.titan_adventure_quests_v1();
  assert s->'chains'->0->>'state'='locked' and s->'chains'->1->>'state'='locked' and jsonb_array_length(s->'clues')=0,i||' '||s::text;
  begin perform public.titan_adventure_quest_action_v1('atelier-oublie','start'); raise exception 'started without a clue';
  exception when raise_exception then assert sqlerrm='QUEST_LOCKED',sqlerrm; end;
 end loop;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_1'),'role','authenticated')::text,true);
 begin perform public.titan_adventure_quest_action_v1('feux-cote','start'); raise exception 'started with the clue of another chain';
 exception when raise_exception then assert sqlerrm='QUEST_LOCKED',sqlerrm; end;
 begin perform public.titan_adventure_quest_action_v1('atelier-oublie','link',array['cerf']); raise exception 'linked before start';
 exception when raise_exception then assert sqlerrm='QUEST_NOT_STARTED',sqlerrm; end;
 begin perform public.titan_adventure_quest_action_v1('atlantide','start'); raise exception 'unknown chain';
 exception when raise_exception then assert sqlerrm='QUEST_UNAVAILABLE',sqlerrm; end;
 begin perform public.titan_adventure_quest_action_v1('atelier-oublie','fly'); raise exception 'unknown action';
 exception when raise_exception then assert sqlerrm='INVALID_ACTION',sqlerrm; end;
end $$;

-- Four accounts, two routes per chain: start, link (one wrong mark corrected), choose, wait for the next encounter.
create temp table qc_chain(i integer primary key, chain text, clue text, wrong text[], invalid text[], answer text[], manner text, outcome text) on commit drop;
insert into qc_chain values
 (1,'atelier-oublie','symbole-cerf',array['roue'],array['cerf','cairn'],array['cerf'],'cle','cle_forgee'),
 (2,'atelier-oublie','cairn-fendu',array['cerf'],array['enclume'],array['cairn'],'motifs','motifs_transmis'),
 (3,'feux-cote','feu-chenal',array['lac'],array[]::text[],array['phare'],'lanterne','feu_rallume'),
 (4,'feux-cote','couplet-etoile',array['phare'],array['soleil'],array['etoile'],'livre','route_consignee'),
 (8,'feux-cote','feu-chenal',array['etoile'],array['phare','lac'],array['phare'],'livre','route_consignee');
grant select on qc_chain to authenticated;
do $$declare s jsonb; again jsonb; c jsonb; p record;begin
 for p in select * from qc_chain where i<>8 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_quest_action_v1(p.chain,'start');
  -- A replay of the start (a second device, a double tap) changes nothing.
  again:=public.titan_adventure_quest_action_v1(p.chain,'start');
  select x into c from jsonb_array_elements(again->'chains') x where x->>'id'=p.chain;
  assert c->>'state'='link' and c->>'clue'=p.clue and (c->>'attempts')::integer=0 and c->>'startedAt'=(select x->>'startedAt' from jsonb_array_elements(s->'chains') x where x->>'id'=p.chain),c::text;
  assert again->'clues'->0->>'state'='followed' and jsonb_array_length(again->'clues')=1,again::text;
  begin perform public.titan_adventure_quest_action_v1(p.chain,'choose',null,p.manner); raise exception 'chose before linking';
  exception when raise_exception then assert sqlerrm='QUEST_NOT_LINKED',sqlerrm; end;
  -- A malformed answer is refused and not counted.
  begin perform public.titan_adventure_quest_action_v1(p.chain,'link',p.invalid); raise exception 'malformed answer % accepted',p.invalid;
  exception when raise_exception then assert sqlerrm='INVALID_ANSWER',sqlerrm; end;
  s:=public.titan_adventure_quest_action_v1(p.chain,'link',p.wrong);
  select x into c from jsonb_array_elements(s->'chains') x where x->>'id'=p.chain;
  assert c->>'state'='link' and (c->>'attempts')::integer=1 and not (c->>'lastCorrect')::boolean and c->'lastAnswer'=to_jsonb(p.wrong),c::text;
  -- Another device resumes on the same board and the same feedback.
  assert public.titan_adventure_quests_v1()=s,'same notebook on another device';
  s:=public.titan_adventure_quest_action_v1(p.chain,'link',p.answer);
  again:=public.titan_adventure_quest_action_v1(p.chain,'link',p.wrong);
  select x into c from jsonb_array_elements(again->'chains') x where x->>'id'=p.chain;
  assert c->>'state'='choose' and (c->>'attempts')::integer=2 and (c->>'lastCorrect')::boolean and c->>'linkedAt' is not null,'linked once, late answer not counted: '||c::text;
  assert again->'clues'->0->>'state'='linked',again::text;
  begin perform public.titan_adventure_quest_action_v1(p.chain,'choose',null,'nulle-part'); raise exception 'unknown manner';
  exception when raise_exception then assert sqlerrm='INVALID_MANNER',sqlerrm; end;
  begin perform public.titan_adventure_quest_action_v1(p.chain,'resolve'); raise exception 'resolved before the choice';
  exception when raise_exception then assert sqlerrm='QUEST_NOT_CHOSEN',sqlerrm; end;
  s:=public.titan_adventure_quest_action_v1(p.chain,'choose',null,p.manner);
  -- Definitive: the other manner sent later (another device) returns the canonical one.
  again:=public.titan_adventure_quest_action_v1(p.chain,'choose',null,case p.manner when 'cle' then 'motifs' when 'motifs' then 'cle' when 'lanterne' then 'livre' else 'lanterne' end);
  select x into c from jsonb_array_elements(again->'chains') x where x->>'id'=p.chain;
  assert c->>'manner'=p.manner and c->>'state' in ('waiting','ready'),c::text;
 end loop;
end $$;
reset role;
-- The choice was made during an earlier visit, after every session of the arcs: nothing confirmed since.
update private.adventure_quests set chosen_at=now()-interval '1 day',linked_at=now()-interval '1 day 1 hour',started_at=now()-interval '1 day 2 hours'
 where user_id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,4) i);
-- A session on hold for account 1 and a session the day before the choice for account 2: neither counts.
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details,status)
values(current_setting('titan.qc_1')::uuid,'swimming','training',20,'min',0,now()-interval '20 hours',now()-interval '20 hours',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}','pending_review'),
 (current_setting('titan.qc_2')::uuid,'yoga','training',20,'min',0,now()-interval '30 hours',now()-interval '30 hours',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}','valid');
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; c jsonb; p record;begin
 for p in select * from qc_chain where i<>8 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_quests_v1();
  select x into c from jsonb_array_elements(s->'chains') x where x->>'id'=p.chain;
  assert c->>'state'='waiting' and (c->>'days')::integer=0 and (c->>'daysTarget')::integer=1,c::text;
  begin perform public.titan_adventure_quest_action_v1(p.chain,'resolve'); raise exception 'resolved before the next encounter';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
 end loop;
end $$;
reset role;
-- One confirmed session each after the choice, four sports: any of them opens the scene (account 1's session counts once
-- validated).
set local session_replication_role=replica;
update public.training_logs set status='valid' where user_id=current_setting('titan.qc_1')::uuid and status='pending_review';
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.qc_'||x.i)::uuid,x.sport,'training',20,'min',0,now()-x.h,now()-x.h,
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from (values(2,'yoga',interval '10 hours'),(3,'rowing',interval '8 hours'),(4,'climbing',interval '3 hours')) x(i,sport,h);
set local session_replication_role=origin;

-- The next encounter: the scene of the chosen manner, one outcome per account, nothing else earned.
set local role authenticated;
do $$declare s jsonb; again jsonb; c jsonb; p record; results jsonb:='[]';begin
 for p in select * from qc_chain where i<>8 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_quests_v1();
  select x into c from jsonb_array_elements(s->'chains') x where x->>'id'=p.chain;
  assert c->>'state'='ready' and (c->>'days')::integer=1,c::text;
  s:=public.titan_adventure_quest_action_v1(p.chain,'resolve');
  again:=public.titan_adventure_quest_action_v1(p.chain,'resolve');
  select x into c from jsonb_array_elements(again->'chains') x where x->>'id'=p.chain;
  assert c->>'state'='resolved' and c->>'outcome'=p.outcome and c->>'resolvedAt'=(select x->>'resolvedAt' from jsonb_array_elements(s->'chains') x where x->>'id'=p.chain),'one outcome, stable: '||c::text;
  assert again->'clues'->0->>'state'='used' and jsonb_array_length(again->'clues')=1,again::text;
  results:=results||jsonb_build_array(jsonb_build_object('i',p.i,'chain',p.chain,'clue',c->>'clue','manner',c->>'manner','outcome',c->>'outcome','attempts',(c->>'attempts')::integer));
 end loop;
 assert (select string_agg(x->>'chain'||':'||(x->>'clue')||':'||(x->>'outcome'),',' order by (x->>'i')::integer) from jsonb_array_elements(results) x)
  ='atelier-oublie:symbole-cerf:cle_forgee,atelier-oublie:cairn-fendu:motifs_transmis,feux-cote:feu-chenal:feu_rallume,feux-cote:couplet-etoile:route_consignee',results::text;
 raise notice 'V1.5.4 chains %',results::text;
end $$;
reset role;

-- Independence: the main campaigns are exactly as they were (snapshots equal), XP and credits unchanged, and the campaign
-- continues the same way with or without a chain (account 1 played one, account 5 never had a clue).
do $$declare c record; now_s jsonb;begin
 for c in select * from qc_campaigns loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||c.i),'role','authenticated')::text,true);
  now_s:=public.titan_adventure_campaign_snapshot_v1(c.world);
  assert now_s=c.s,'campaign snapshot unchanged by the chains: '||c.i;
 end loop;
 assert (select bool_and(p.xp=b.xp and p.credits=b.credits) from qc_before b join public.profiles p on p.id=b.id),'the chains never touch XP or credits';
end $$;
-- Replays: every confirmation of the arcs (V1.5.0 confirm, V1.5.1/V1.5.3 resolve, V1.5.2 discover), the sync, then the chain
-- actions again, twice, on two "devices": still one clue per account, one row per chain, nothing changed.
create temp table qc_notebooks on commit drop as select 0 i, '{}'::jsonb s where false;
do $$declare p record;begin
 for p in select * from qc_chain where i<>8 loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  insert into qc_notebooks values(p.i,public.titan_adventure_quests_v1());
 end loop;
end $$;
grant select on qc_notebooks to authenticated;
set local role authenticated;
do $$declare s jsonb; p record; n integer;begin
 for p in select c.*,q.world,q.route,q.answer qa from qc_chain c join qc_plan q using(i) where i<>8 loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_'||p.i),'role','authenticated')::text,true);
  for n in 1..2 loop
   perform public.titan_adventure_campaign_action_v1(p.world,'confirm',null,null,p.route);
   perform public.titan_adventure_campaign_action_v1(p.world,'sync');
   perform public.titan_adventure_campaign_action_v1(p.world,'resolve');
   if p.world='aube' then perform public.titan_adventure_consequence_action_v1('aube','discover',case p.route when 'ruines' then array['cerf'] else array['cairn','pin'] end); end if;
   perform public.titan_adventure_quest_action_v1(p.chain,'start');
   perform public.titan_adventure_quest_action_v1(p.chain,'link',p.answer);
   perform public.titan_adventure_quest_action_v1(p.chain,'choose',null,p.manner);
   s:=public.titan_adventure_quest_action_v1(p.chain,'resolve');
  end loop;
  assert s=(select x.s from qc_notebooks x where x.i=p.i),'replays change nothing: '||s::text;
  assert jsonb_array_length(s->'clues')=1,s::text;
 end loop;
end $$;
reset role;
do $$begin
 assert (select count(*) from private.adventure_quests where user_id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,8) i))=4,'one row per account and chain';
 assert (select bool_and(attempts=2) from private.adventure_quests where user_id in (select current_setting('titan.qc_'||i)::uuid from generate_series(1,4) i)),'attempts not inflated by replays';
end $$;
-- The campaign then continues the same way: accounts 1 (chain played) and 5 (no clue) log the same sessions and sync.
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.qc_'||i)::uuid,'running','training',20,'min',0,now()-interval '2 hours',now()-interval '2 hours',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb from (values(1),(5)) x(i);
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
values(current_setting('titan.qc_5')::uuid,'swimming','training',20,'min',0,now()-interval '20 hours',now()-interval '20 hours',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}');
set local session_replication_role=origin;
set local role authenticated;
do $$declare a jsonb; b jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_1'),'role','authenticated')::text,true);
 a:=public.titan_adventure_campaign_action_v1('aube','sync');
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_5'),'role','authenticated')::text,true);
 b:=public.titan_adventure_campaign_action_v1('aube','sync');
 assert (select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(m) e(k,v) where k !~ 'At$') order by (m->>'ordinal')::integer) from jsonb_array_elements(a->'milestones') m)
  =(select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(m) e(k,v) where k !~ 'At$') order by (m->>'ordinal')::integer) from jsonb_array_elements(b->'milestones') m)
  and a->'effort'=b->'effort' and a->'days'=b->'days'
  and jsonb_array_length(a->'rewards')=jsonb_array_length(b->'rewards'),'same campaign with or without a chain: '||(a->'milestones')::text||(b->'milestones')::text;
end $$;
reset role;

-- A new version: account 8 is engaged in feux-cote v1 (linked), account 3 resolved it. A v2 becomes current with another
-- set of clues; the engaged accounts keep their version, their clue and their access. (Simulated, then rolled back.)
set local role authenticated;
do $$declare s jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_8'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quest_action_v1('feux-cote','start');
 s:=public.titan_adventure_quest_action_v1('feux-cote','link',array['phare']);
 assert s->'chains'->1->>'state'='choose',s::text;
end $$;
reset role;
savepoint qc_v2;
create or replace function private.titan_adventure_quest_current(p_id text)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case p_id
    when 'atelier-oublie' then private.titan_adventure_quest_config('atelier-oublie', 1)
    when 'feux-cote' then jsonb_set(jsonb_set(private.titan_adventure_quest_config('feux-cote', 1), '{version}', '2'),
      '{clues}', '[{"id":"balise-recit","origin":{"fact":"outcome","world":"aurores","arc":"aurores-arc1","route":"histoire","outcome":"recit_transmis","guardian":"sentinelle"},"answer":"lac"}]')
  end;
$$;
set local role authenticated;
do $$declare s jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_8'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert s->'chains'->1->>'state'='choose' and (s->'chains'->1->>'version')::integer=1 and s->'chains'->1->>'clue'='feu-chenal',s::text;
 assert s->'clues'->0->>'id'='feu-chenal' and s->'clues'->0->>'state'='linked','the engaged clue is still in the notebook: '||s::text;
 s:=public.titan_adventure_quest_action_v1('feux-cote','choose',null,'livre');
 assert s->'chains'->1->>'manner'='livre' and s->'chains'->1->>'state'='waiting',s::text;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qc_3'),'role','authenticated')::text,true);
 s:=public.titan_adventure_quests_v1();
 assert s->'chains'->1->>'state'='resolved' and (s->'chains'->1->>'version')::integer=1 and s->'chains'->1->>'outcome'='feu_rallume',s::text;
 -- Account 4 never engaged in v2's clue and has no Aurores outcome: only an unstarted account sees the new conditions.
end $$;
reset role;
rollback to savepoint qc_v2;

-- A chain outcome is a fact a later chain can require (dependency kind "chain").
do $$begin
 assert private.titan_adventure_quest_fact(current_setting('titan.qc_1')::uuid,'{"fact":"chain","chain":"atelier-oublie","outcome":"cle_forgee"}') is not null;
 assert private.titan_adventure_quest_fact(current_setting('titan.qc_1')::uuid,'{"fact":"chain","chain":"atelier-oublie","outcome":"motifs_transmis"}') is null;
 assert private.titan_adventure_quest_fact(current_setting('titan.qc_1')::uuid,'{"fact":"weekday","world":"aube"}') is null,'unknown fact: never acquired';
end $$;

-- Measurement: per chain and entry clue, accounts holding the clue, then started, linked, chosen, resolved.
do $$declare r record; m text:='';begin
 for r in select * from private.titan_adventure_quest_metrics_v1() loop
  m:=m||format('%s/%s %s>%s>%s>%s>%s; ',r.chain,r.clue,r.found_accounts,r.started_accounts,r.linked_accounts,r.chosen_accounts,r.resolved_accounts);
 end loop;
 raise notice 'V1.5.4 metrics %',m;
 -- Synthetic accounts of the earlier tests are rolled back, so only this file's accounts exist here.
 assert m='atelier-oublie/symbole-cerf 1>1>1>1>1; atelier-oublie/cairn-fendu 1>1>1>1>1; feux-cote/feu-chenal 2>2>2>1>1; feux-cote/couplet-etoile 1>1>1>1>1; ',m;
end $$;

-- Export keeps the earlier sections; deleting the clue's journey removes the chain (as for the V1.5.2 access).
do $$declare s jsonb;begin
 s:=private.titan_export_extras_v1(current_setting('titan.qc_1')::uuid);
 assert s ? 'adventureRpg' and s ? 'adventureBranches' and s ? 'adventureGuardians' and s ? 'adventureConsequences','earlier sections kept';
 assert jsonb_array_length(s->'adventureQuests')=1 and s->'adventureQuests'->0->>'outcome'='cle_forgee' and s->'adventureQuests'->0->>'clue'='symbole-cerf'
  and not (s->'adventureQuests'->0 ? 'user_id'),s::text;
 delete from private.adventure_journeys where user_id=current_setting('titan.qc_4')::uuid and world_id='marees';
 assert not exists(select 1 from private.adventure_quests where user_id=current_setting('titan.qc_4')::uuid),'chain removed with its origin';
end $$;
rollback;

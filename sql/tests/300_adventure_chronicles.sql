-- V1.5.5 — Chroniques et aventures rejouables. Synthetic and rolled back. Every API call runs as authenticated/anon.
-- The first playthroughs are produced by the real APIs of V1.5.0 to V1.5.4 (no fixture), then replayed. Accounts:
--   1 aube ruines, V1.5.2 access + V1.5.4 chain   -> run 2 on the corniche, played to its end (the two stories of the scenario)
--   2 aube corniche                               -> run 2 on the ruines abandoned, then run 3 started
--   3 marees carte                                -> run 2 on the Gardienne's route, played to its end (another mechanic)
--   4 aube legacy: arc 1 earned before V1.5.0      -> the old campaign is read as it was played, then a run 2 starts
--   5 aube ruines, arc not achieved               -> no replay
--   6 a profile without any journey               -> an empty chronicle, no error
--   7 aube ruines, never replays                  -> control: same sessions as account 1, same campaign, same rewards
-- Covered: the chronicle of decisions, clues and outcomes of run 1 read from the existing facts; two runs of the same arc kept
-- distinct and read back identically by another device; one active run (double start); the steps of a run counted only on
-- sessions created and dated after its choice, on this world's ledger, never on an older, backdated or pending session; the
-- mechanic, its attempts and its stable answer; one outcome per run; abandon; versions; no reward, XP or credit created and the
-- outcome active in the world unchanged; metrics; export; closed API.
begin;
do $$
declare u uuid; i integer;
begin
 for i in 1..7 loop
  u:=gen_random_uuid(); perform set_config('titan.ch_'||i,u::text,true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
 end loop;
 set local session_replication_role=replica;
 for i in 1..7 loop
  u:=current_setting('titan.ch_'||i)::uuid;
  insert into public.profiles(id,username,level,xp,credits,is_suspended) values(u,'qa_ch_'||i,1,100,10,false)
   on conflict(id) do update set is_suspended=false,xp=100,credits=10;
 end loop;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 select current_setting('titan.ch_'||x.i)::uuid,x.w,9,'rhythm','UTC',now()-interval '40 days'
  from (values(1,'aube'),(1,'marees'),(2,'aube'),(3,'marees'),(4,'aube'),(5,'aube'),(7,'aube')) x(i,w);
 set local session_replication_role=origin;
end $$;
create temp table ch_plan(i integer primary key, world text, route text, answer text[]) on commit drop;
insert into ch_plan values
 (1,'aube','ruines',array['gravure']),(2,'aube','corniche',array['fissure']),(3,'marees','carte',array['est','ouest','chenal']),
 (5,'aube','ruines',array['gravure']),(7,'aube','ruines',array['gravure']);
grant select on ch_plan to authenticated;
-- Server payloads captured along the way: with psql -v chronicle_fixture=<file>, they become the fixture of the client tests
-- (tests/fixtures/adventure-chronicles.json), so the Web and Android view models are checked against real server answers.
create temp table ch_payloads(name text primary key, payload jsonb not null) on commit drop;
grant select,insert on ch_payloads to authenticated;

-- Closed API surface; the rules are private and only know story steps, effort points and active days.
do $$begin
 assert not has_function_privilege('anon','public.titan_adventure_chronicles_v1()','execute'),'anon chronicle';
 assert not has_function_privilege('anon','public.titan_adventure_chronicle_action_v1(text,text,integer,text,text,text[])','execute'),'anon action';
 assert has_function_privilege('authenticated','public.titan_adventure_chronicles_v1()','execute'),'chronicle for players';
 assert not has_function_privilege('authenticated','private.titan_adventure_chronicle_config(integer)','execute'),'rules are private';
 assert not has_function_privilege('authenticated','private.titan_adventure_chronicle_metrics_v1()','execute'),'metrics are private';
 assert not has_table_privilege('authenticated','private.adventure_arc_runs','select'),'runs are private';
 assert not has_table_privilege('authenticated','private.adventure_chronicle_events','select'),'events are private';
 assert private.titan_adventure_chronicle_config(2) is null,'no unknown rules';
 assert private.titan_adventure_chronicle_config(1)::text !~* '"(sport|discipline|family|hour|window|time|weekday|minute|xp|credit|reward|beacon)',
  'no sport, hour or reward in the rules';
 -- No trigger reads a run: nothing in the campaigns, the rewards or the economy can depend on a replay.
 assert not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal
  and p.prosrc ~ '(adventure_arc_runs|adventure_chronicle_events|titan_adventure_chronicle_)'),'no gate on a run';
 -- A replay writes only its own tables: no reward, profile, ledger, beacon or wallet table in the action.
 assert pg_get_functiondef('public.titan_adventure_chronicle_action_v1(text,text,integer,text,text,text[])'::regprocedure)
  !~ '(insert into|update|delete from)\s+(public\.(profiles|training_logs|adventure_progress)|private\.(adventure_encounter_rewards|adventure_family_rewards|adventure_effort_ledger|adventure_guardian_encounters|adventure_consequences|adventure_quests))',
  'the replay never writes a reward, a profile or the ledger';
 assert private.titan_adventure_chronicle_arc_config('aube-arc1',1)->'guardian'->>'id'='veilleur';
 assert private.titan_adventure_chronicle_arc_config('marees-arc1',1)->'guardian'->>'id'='gardienne';
 assert private.titan_adventure_chronicle_arc_config('aube-arc1',2) is null,'unknown arc version';
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_chronicles_v1(); raise exception 'anon chronicle'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_chronicle_action_v1('aube','start'); raise exception 'anon start'; exception when insufficient_privilege then null; end;
end $$;

-- The first playthroughs, through the real APIs of the arcs (same session history as 300_adventure_quest_chains).
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select x.i,x.w from (values(1,'aube'),(2,'aube'),(3,'marees'),(4,'aube'),(5,'aube'),(7,'aube')) x(i,w) loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.w,'start');
  assert (s->>'active')::boolean,s::text;
 end loop;
 -- Account 6: no journey at all, an empty chronicle and no error.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_6'),'role','authenticated')::text,true);
 s:=public.titan_adventure_chronicles_v1();
 assert (s->>'contract')::integer=1 and s->>'owner'=auth.uid()::text and s->'arcs'='[]'::jsonb,s::text;
 insert into ch_payloads values('empty',s);
 begin perform public.titan_adventure_chronicle_action_v1('aube','start'); raise exception 'started without a journey';
 exception when raise_exception then assert sqlerrm='CHRONICLE_UNAVAILABLE',sqlerrm; end;
end $$;
reset role;
update private.adventure_journeys set started_at=now()-interval '30 days',target=15
 where user_id in (select current_setting('titan.ch_'||i)::uuid from generate_series(1,7) i);
set local session_replication_role=replica;
-- Account 4: the Vallée's first arc fully earned before V1.5.0 (v1 journal, choice 1 "Écouter le passeur"), never entered.
insert into private.adventure_encounter_rewards(user_id,world_id,ordinal,choice,earned_at)
select current_setting('titan.ch_4')::uuid,'aube',n,case when n=2 then 1 end,now()-interval '29 days'+n*interval '1 day' from generate_series(1,6) n;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.ch_'||p.i)::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from ch_plan p,(values('running',20),('bouldering',19)) s(sport,n);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select * from ch_plan order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',1);
  s:=public.titan_adventure_campaign_action_v1(p.world,'enter');
  s:=public.titan_adventure_campaign_action_v1(p.world,'confirm',null,null,p.route);
  assert s->'branch'->>'state'='confirmed' and s->'branch'->>'route'=p.route,s::text;
 end loop;
end $$;
reset role;
update private.adventure_encounter_rewards set earned_at=now()-interval '15 days'
 where ordinal in (1,2) and user_id in (select i from (select current_setting('titan.ch_'||k)::uuid i from unnest(array[1,2,3,5,7]) k) x);
update private.adventure_branch_entries set entered_at=now()-interval '16 days'
 where user_id in (select current_setting('titan.ch_'||i)::uuid from generate_series(1,7) i);
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.ch_'||p.i)::uuid,s.sport,'training',20,'min',0,now()-s.n*interval '1 day',now()-s.n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from ch_plan p,(values('badminton',10),('muscu_builder',8),('cycling',6)) s(sport,n);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; p record;begin
 for p in select * from ch_plan where i<>5 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_campaign_action_v1(p.world,'sync');
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',3);
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',4);
  s:=public.titan_adventure_campaign_action_v1(p.world,'claim',5);
  s:=public.titan_adventure_campaign_action_v1(p.world,'solve',null,null,null,p.answer);
  s:=public.titan_adventure_campaign_action_v1(p.world,'resolve');
  assert s->'guardian'->>'state'='resolved',p.i||' '||(s->'guardian')::text;
 end loop;
 -- Account 5 stops after the scene: its arc is not achieved.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_5'),'role','authenticated')::text,true);
 s:=public.titan_adventure_campaign_action_v1('aube','sync');
 s:=public.titan_adventure_campaign_action_v1('aube','claim',3);
 -- Account 1: the V1.5.2 access of its route, then the V1.5.4 chain its clue opens (both through their own APIs).
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 s:=public.titan_adventure_consequence_action_v1('aube','discover',array['cerf']);
 s:=public.titan_adventure_quest_action_v1('atelier-oublie','start');
 s:=public.titan_adventure_quest_action_v1('atelier-oublie','link',array['cerf']);
end $$;
reset role;
-- The first playthroughs happened during the previous week.
update private.adventure_encounter_rewards set earned_at=now()-interval '5 days 12 hours'+ordinal*interval '10 minutes'
 where ordinal between 3 and 6 and user_id in (select current_setting('titan.ch_'||i)::uuid from generate_series(1,7) i) and world_id<>'aube' or
       (ordinal between 3 and 6 and world_id='aube' and user_id in (select current_setting('titan.ch_'||k)::uuid from unnest(array[1,2,5,7]) k));
update private.adventure_guardian_encounters set prepared_at=now()-interval '5 days 11 hours',resolved_at=now()-interval '5 days 10 hours',
  created_at=now()-interval '5 days 11 hours'
 where user_id in (select current_setting('titan.ch_'||i)::uuid from generate_series(1,7) i);
update private.adventure_consequences set discovered_at=now()-interval '5 days 9 hours',created_at=now()-interval '5 days 9 hours'
 where user_id=current_setting('titan.ch_1')::uuid;
update private.adventure_quests set started_at=now()-interval '5 days 8 hours',linked_at=now()-interval '5 days 8 hours'
 where user_id=current_setting('titan.ch_1')::uuid;

-- What a replay must never change: rewards, titles, campaign progress, the arcs' canonical facts, XP and credits.
create temp table ch_frozen on commit drop as
 select 'rewards' k,user_id,jsonb_agg(to_jsonb(r) order by world_id,ordinal) v from private.adventure_encounter_rewards r group by user_id
 union all select 'guardians',user_id,jsonb_agg(to_jsonb(g) order by world_id) from private.adventure_guardian_encounters g group by user_id
 union all select 'consequences',user_id,jsonb_agg(to_jsonb(c) order by world_id) from private.adventure_consequences c group by user_id
 union all select 'quests',user_id,jsonb_agg(to_jsonb(q) order by chain) from private.adventure_quests q group by user_id
 union all select 'entries',user_id,jsonb_agg(to_jsonb(e) order by world_id) from private.adventure_branch_entries e group by user_id
 union all select 'progress',user_id,jsonb_agg(to_jsonb(a) order by world_id) from public.adventure_progress a group by user_id
 union all select 'profile',id,jsonb_build_object('xp',xp,'credits',credits,'level',level) from public.profiles;
delete from ch_frozen where user_id not in (select current_setting('titan.ch_'||i)::uuid from generate_series(1,7) i);

-- Run 1 read from the existing facts: decisions, clues, outcomes, the access of the Camp and the chain between worlds.
set local role authenticated;
do $$declare s jsonb; a jsonb; o jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 s:=public.titan_adventure_chronicles_v1();
 assert jsonb_array_length(s->'arcs')=1,s::text;
 insert into ch_payloads values('original',s);
 a:=s->'arcs'->0; o:=a->'runs'->0;
 assert a->>'world'='aube' and a->>'arc'='aube-arc1' and (a->>'completed')::boolean and (a->>'replayable')::boolean and a->'activeRun'='null'::jsonb,a::text;
 assert (o->>'run')::integer=1 and o->>'kind'='pilot' and (o->>'version')::integer=1 and o->>'state'='completed' and o->>'route'='ruines'
  and o->>'clue'='serment' and o->>'outcome'='serment_restitue' and jsonb_array_length(o->'milestones')=6 and o->>'chosenAt' is not null,o::text;
 assert (o->'guardian'->>'attempts')::integer=1 and o->'guardian'->>'preparedAt' is not null,o::text;
 assert o->'consequence'->>'id'='veilleur-retour' and o->'consequence'->>'discoveredAt' is not null,o::text;
 assert o->'quests'->0->>'chain'='atelier-oublie' and o->'quests'->0->>'clue'='symbole-cerf' and o->'quests'->0->>'linkedAt' is not null,o::text;
 assert a->'activeOutcome'->>'outcome'='serment_restitue' and a->'activeOutcome'->>'route'='ruines',a::text;
 assert a->'discovered'='[{"route":"corniche","scene":false,"clue":false,"outcome":false},{"route":"ruines","scene":true,"clue":true,"outcome":true}]'::jsonb,a::text;
 -- The old account: the campaign is read as it was played (v1 journal), with its six milestones and its choice.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_4'),'role','authenticated')::text,true);
 insert into ch_payloads values('legacy',public.titan_adventure_chronicles_v1());
 a:=public.titan_adventure_chronicles_v1()->'arcs'->0; o:=a->'runs'->0;
 assert o->>'kind'='legacy' and o->'version'='null'::jsonb and (o->>'choice')::integer=1 and o->'route'='null'::jsonb
  and jsonb_array_length(o->'milestones')=6 and o->>'state'='completed' and o->'guardian'='null'::jsonb,o::text;
 assert (a->>'completed')::boolean and (a->>'replayable')::boolean and a->'activeOutcome'='null'::jsonb,a::text;
 -- An arc not achieved is readable but cannot be replayed.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_5'),'role','authenticated')::text,true);
 insert into ch_payloads values('playing',public.titan_adventure_chronicles_v1());
 a:=public.titan_adventure_chronicles_v1()->'arcs'->0;
 assert a->'runs'->0->>'state'='playing' and a->'runs'->0->>'route'='ruines' and not (a->>'completed')::boolean and not (a->>'replayable')::boolean,a::text;
 begin perform public.titan_adventure_chronicle_action_v1('aube','start'); raise exception 'replayed an arc not achieved';
 exception when raise_exception then assert sqlerrm='ARC_NOT_COMPLETED',sqlerrm; end;
 begin perform public.titan_adventure_chronicle_action_v1('aube','choose',null,'corniche'); raise exception 'chose without a run';
 exception when raise_exception then assert sqlerrm='REPLAY_NOT_STARTED',sqlerrm; end;
 begin perform public.titan_adventure_chronicle_action_v1('aube','fly'); raise exception 'unknown action';
 exception when raise_exception then assert sqlerrm='INVALID_ACTION',sqlerrm; end;
 begin perform public.titan_adventure_chronicle_action_v1('atlantide','start'); raise exception 'unknown world';
 exception when raise_exception then assert sqlerrm='INVALID_WORLD',sqlerrm; end;
end $$;

-- A new playthrough: one active run per arc, a route definitive for the run, steps counted only after its choice.
create temp table ch_replay(i integer primary key, world text, route text, other text, wrong text[], invalid text[], answer text[], outcome text) on commit drop;
insert into ch_replay values
 (1,'aube','corniche','ruines',array['gravure'],array['fissure','gravure'],array['fissure'],'passage_rouvert'),
 (3,'marees','gardienne','carte',array['est','ouest','chenal'],array['calme','est','vers-le-sud'],array['calme','est','large'],'large_franchi'),
 (4,'aube','corniche','ruines',array['mousse'],array['lierre'],array['fissure'],'passage_rouvert');
grant select on ch_replay to authenticated;
do $$declare s jsonb; again jsonb; a jsonb; r jsonb; p record;begin
 for p in select * from ch_replay order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_chronicle_action_v1(p.world,'start');
  -- A double tap or a second device: the run already active comes back, nothing else is created.
  again:=public.titan_adventure_chronicle_action_v1(p.world,'start');
  if p.i=1 then insert into ch_payloads values('choose',again); end if;
  a:=again->'arcs'->0; r:=a->'runs'->1;
  assert jsonb_array_length(a->'runs')=2 and (a->>'activeRun')::integer=2 and not (a->>'replayable')::boolean
   and (r->>'run')::integer=2 and r->>'kind'='replay' and r->>'state'='choose' and (r->>'version')::integer=1 and (r->>'rules')::integer=1
   and r->>'startedAt'=(s->'arcs'->0->'runs'->1->>'startedAt'),a::text;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'advance',null,null,'scene'); raise exception 'advanced before the choice';
  exception when raise_exception then assert sqlerrm='REPLAY_NOT_CHOSEN',sqlerrm; end;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'choose',null,'nulle-part'); raise exception 'unknown route';
  exception when raise_exception then assert sqlerrm='INVALID_ROUTE',sqlerrm; end;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'choose',1,p.route); raise exception 'changed run 1';
  exception when raise_exception then assert sqlerrm='REPLAY_NOT_ACTIVE',sqlerrm; end;
  s:=public.titan_adventure_chronicle_action_v1(p.world,'choose',2,p.route);
  -- Definitive for this run: the other route sent later (another device) returns the route already recorded.
  again:=public.titan_adventure_chronicle_action_v1(p.world,'choose',2,p.other);
  if p.i=1 then insert into ch_payloads values('scene-waiting',again); end if;
  r:=again->'arcs'->0->'runs'->1;
  assert r->>'route'=p.route and r->>'state'='scene' and not (r->>'ready')::boolean,r::text;
  -- Every earlier session is in this world's ledger, none counts for the new run.
  assert (r->>'effortSince')::numeric=0 and (r->>'daysSince')::integer=0,r::text;
  assert (public.titan_adventure_campaign_snapshot_v1(p.world)->>'effort')::numeric>=100 or p.i=4,'earlier sessions are in this world''s ledger';
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'advance',null,null,'scene'); raise exception 'scene before effort';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'advance',null,null,'clue'); raise exception 'clue before scene';
  exception when raise_exception then assert sqlerrm='REPLAY_STEP_ORDER',sqlerrm; end;
  -- The expected answer of the mechanic never leaves the server.
  assert position('"answer"' in again::text)=0,'no expected answer in the chronicle';
 end loop;
end $$;
reset role;
-- The runs were chosen five days ago; every session of the first playthroughs is older.
update private.adventure_arc_runs set started_at=now()-interval '5 days 1 hour',chosen_at=now()-interval '5 days'
 where user_id in (select current_setting('titan.ch_'||i)::uuid from generate_series(1,7) i);
-- Account 1 also travels in the Marées: a session after the Vallée run's choice, imported there first, belongs to that world.
set local role authenticated;
do $$begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 perform public.titan_adventure_campaign_action_v1('marees','start');
end $$;
reset role;
update private.adventure_journeys set started_at=now()-interval '30 days',target=15 where user_id=current_setting('titan.ch_1')::uuid and world_id='marees';
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
values(current_setting('titan.ch_1')::uuid,'hiking','training',20,'min',0,now()-interval '4 days 12 hours',now()-interval '4 days 12 hours',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}');
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 s:=public.titan_adventure_campaign_action_v1('marees','sync');
 assert (s->>'effort')::numeric=20,'the hike is attributed to the Marées: '||s::text;
end $$;
reset role;
set local session_replication_role=replica;
-- Account 1 (replay) and account 7 (control) log the same four sessions after the choice; account 3 too. Accounts 1 and 7 also
-- have a session entered after the choice but dated before it (backdated) and a session still on hold: neither counts for the run.
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.ch_'||x.i)::uuid,s.sport,'training',20,'min',0,now()-s.d*interval '1 day',now()-s.d*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb
from (values(1),(3),(7)) x(i),(values('swimming',4),('yoga',3),('rowing',2),('climbing',1)) s(sport,d);
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details,status)
select current_setting('titan.ch_'||x.i)::uuid,s.sport,'training',20,'min',0,now()-s.dated,now()-s.created,
 '{"serverReward":true,"effort":{"minutes":20,"effort_minutes":20},"bio":{"rpe":5}}'::jsonb,s.status
from (values(1),(7)) x(i),(values('running',interval '6 days',interval '1 hour','valid'),('walking',interval '2 hours',interval '2 hours','pending_review')) s(sport,dated,created,status);
set local session_replication_role=origin;

set local role authenticated;
do $$declare s jsonb; again jsonb; r jsonb; p record; k text;begin
 for p in select * from ch_replay where i<>4 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  -- The sessions reach this world's ledger through the usual import (the chronicle's sync is the campaign's sync).
  s:=public.titan_adventure_chronicle_action_v1(p.world,'sync');
  if p.i=1 then insert into ch_payloads values('scene-ready',s); end if;
  r:=s->'arcs'->0->'runs'->1;
  assert (r->>'effortSince')::numeric=80 and (r->>'daysSince')::integer=4,'only the four sessions after the choice, in this world: '||r::text;
  foreach k in array array['scene','clue','observe'] loop
   assert r->>'state'=k and (r->>'ready')::boolean,k||' '||r::text;
   s:=public.titan_adventure_chronicle_action_v1(p.world,'advance',2,null,k);
   -- Replaying a step already discovered changes nothing.
   again:=public.titan_adventure_chronicle_action_v1(p.world,'advance',2,null,k);
   assert again=s,'replayed step '||k;
   r:=s->'arcs'->0->'runs'->1;
  end loop;
  assert r->>'state'='prepare' and r->>'clue' is not null and r->'mechanic'->>'primitive'=case p.world when 'aube' then 'pick' else 'chart' end,r::text;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'resolve'); raise exception 'resolved before the mechanic';
  exception when raise_exception then assert sqlerrm='GUARDIAN_NOT_PREPARED',sqlerrm; end;
  -- A malformed answer is refused and not counted; a wrong one is recorded and corrected without effort.
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'solve',null,null,null,p.invalid); raise exception 'malformed answer accepted';
  exception when raise_exception then assert sqlerrm='INVALID_ANSWER',sqlerrm; end;
  s:=public.titan_adventure_chronicle_action_v1(p.world,'solve',null,null,null,p.wrong);
  if p.i=1 then insert into ch_payloads values('prepare-wrong',s); end if;
  r:=s->'arcs'->0->'runs'->1;
  assert r->>'state'='prepare' and (r->'mechanic'->>'attempts')::integer=1 and not (r->'mechanic'->>'lastCorrect')::boolean
   and (r->'mechanic'->>'firstWrong')::integer=1 and r->'mechanic'->'lastAnswer'=to_jsonb(p.wrong),r::text;
  -- Another device reads the same run and the same feedback.
  assert public.titan_adventure_chronicles_v1()=s,'same chronicle on another device';
  s:=public.titan_adventure_chronicle_action_v1(p.world,'solve',null,null,null,p.answer);
  again:=public.titan_adventure_chronicle_action_v1(p.world,'solve',null,null,null,p.wrong);
  if p.i=1 then insert into ch_payloads values('resolve-ready',again); end if;
  r:=again->'arcs'->0->'runs'->1;
  assert r->>'state'='resolve' and (r->>'ready')::boolean and (r->'mechanic'->>'attempts')::integer=2 and (r->'mechanic'->>'solved')::boolean,
   'solved once, the late answer not counted: '||r::text;
 end loop;
end $$;
reset role;
-- Two counted sessions are corrected (put on hold for review): they no longer count, and the resolution waits for its threshold.
set local session_replication_role=replica;
update public.training_logs set status='pending_review' where sport in ('rowing','climbing')
 and user_id in (select current_setting('titan.ch_'||i)::uuid from unnest(array[1,3]) i);
set local session_replication_role=origin;
set local role authenticated;
do $$declare r jsonb; p record;begin
 for p in select * from ch_replay where i<>4 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  r:=public.titan_adventure_chronicles_v1()->'arcs'->0->'runs'->1;
  assert r->>'state'='resolve' and not (r->>'ready')::boolean and (r->>'effortSince')::numeric=40 and (r->>'daysSince')::integer=2,r::text;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'resolve'); raise exception 'resolved below the threshold';
  exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE',sqlerrm; end;
 end loop;
end $$;
reset role;
set local session_replication_role=replica;
update public.training_logs set status='valid' where sport in ('rowing','climbing')
 and user_id in (select current_setting('titan.ch_'||i)::uuid from unnest(array[1,3]) i);
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; again jsonb; r jsonb; p record; results jsonb:='[]';begin
 for p in select * from ch_replay where i<>4 order by i loop
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_'||p.i),'role','authenticated')::text,true);
  s:=public.titan_adventure_chronicle_action_v1(p.world,'resolve');
  again:=public.titan_adventure_chronicle_action_v1(p.world,'resolve');
  insert into ch_payloads values(case p.i when 1 then 'resolved' else 'resolved-marees' end,again);
  r:=again->'arcs'->0->'runs'->1;
  assert r->>'state'='resolved' and r->>'outcome'=p.outcome and r->>'resolvedAt'=(s->'arcs'->0->'runs'->1->>'resolvedAt'),'one outcome, stable: '||r::text;
  assert again->'arcs'->0->'activeRun'='null'::jsonb and (again->'arcs'->0->>'replayable')::boolean,again::text;
  begin perform public.titan_adventure_chronicle_action_v1(p.world,'solve',null,null,null,p.answer); raise exception 'changed a finished run';
  exception when raise_exception then assert sqlerrm='REPLAY_NOT_STARTED',sqlerrm; end;
  results:=results||jsonb_build_array(jsonb_build_object('i',p.i,'world',p.world,
   'stories',(select string_agg((x->>'run')||':'||(x->>'route')||'>'||(x->>'outcome'),' | ' order by (x->>'run')::integer) from jsonb_array_elements(again->'arcs'->0->'runs') x)));
 end loop;
 assert (select string_agg(x->>'stories',' ; ' order by (x->>'i')::integer) from jsonb_array_elements(results) x)
  ='1:ruines>serment_restitue | 2:corniche>passage_rouvert ; 1:carte>chenal_ouvert | 2:gardienne>large_franchi',results::text;
 raise notice 'V1.5.5 two stories per arc %',results::text;
end $$;

-- The two stories of the scenario stay distinct; the world keeps the outcome of run 1 (access, notebook, campaign).
do $$declare a jsonb; o jsonb; r jsonb; q jsonb; c jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 a:=public.titan_adventure_chronicles_v1()->'arcs'->0; o:=a->'runs'->0; r:=a->'runs'->1;
 assert o->>'route'='ruines' and o->>'clue'='serment' and o->>'outcome'='serment_restitue','run 1 unchanged: '||o::text;
 assert r->>'route'='corniche' and r->>'clue'='prise' and r->>'outcome'='passage_rouvert'
  and (select bool_and(x->>'at' is not null) from jsonb_array_elements(r->'steps') x),'run 2: '||r::text;
 assert a->'discovered'='[{"route":"corniche","scene":true,"clue":true,"outcome":true},{"route":"ruines","scene":true,"clue":true,"outcome":true}]'::jsonb,a::text;
 assert a->'activeOutcome'->>'outcome'='serment_restitue' and (a->'activeOutcome'->>'run')::integer=1,'the world keeps run 1''s outcome: '||a::text;
 c:=public.titan_adventure_consequences_v1()->'items'->0;
 assert c->>'outcome'='serment_restitue' and c->>'state'='open','the Camp keeps the access of run 1: '||c::text;
 q:=public.titan_adventure_quests_v1();
 assert jsonb_array_length(q->'clues')=1 and q->'clues'->0->>'id'='symbole-cerf','the notebook keeps the clue of run 1 only: '||q::text;
 assert (select g->>'state' from jsonb_array_elements(q->'chains') g where g->>'id'='atelier-oublie')='choose',q::text;
end $$;
reset role;

-- Rewards are attributable once, by their own contract: the replay changed none of them, and the campaign of account 1
-- (two runs) and account 7 (one run), with the same sessions, are the same.
do $$declare f record;begin
 for f in select * from ch_frozen loop
  assert f.v=(case f.k
   when 'rewards' then (select jsonb_agg(to_jsonb(r) order by world_id,ordinal) from private.adventure_encounter_rewards r where user_id=f.user_id)
   when 'guardians' then (select jsonb_agg(to_jsonb(g) order by world_id) from private.adventure_guardian_encounters g where user_id=f.user_id)
   when 'consequences' then (select jsonb_agg(to_jsonb(c) order by world_id) from private.adventure_consequences c where user_id=f.user_id)
   when 'quests' then (select jsonb_agg(to_jsonb(q) order by chain) from private.adventure_quests q where user_id=f.user_id)
   when 'entries' then (select jsonb_agg(to_jsonb(e) order by world_id) from private.adventure_branch_entries e where user_id=f.user_id)
   when 'progress' then (select jsonb_agg(to_jsonb(a) order by world_id) from public.adventure_progress a where user_id=f.user_id)
   when 'profile' then (select jsonb_build_object('xp',xp,'credits',credits,'level',level) from public.profiles where id=f.user_id) end),
   'unchanged by the replays: '||f.k;
 end loop;
end $$;
set local role authenticated;
do $$declare a jsonb; b jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_7'),'role','authenticated')::text,true);
 b:=public.titan_adventure_campaign_action_v1('aube','sync');
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 a:=public.titan_adventure_campaign_action_v1('aube','sync');
 assert (select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(m) e(k,v) where k !~ 'At$') order by (m->>'ordinal')::integer) from jsonb_array_elements(a->'milestones') m)
  =(select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(m) e(k,v) where k !~ 'At$') order by (m->>'ordinal')::integer) from jsonb_array_elements(b->'milestones') m)
  and a->'effort'=b->'effort' and a->'days'=b->'days' and jsonb_array_length(a->'rewards')=jsonb_array_length(b->'rewards')
  and (select jsonb_agg(x->'family' order by x->>'family') from jsonb_array_elements(a->'familyTitles') x)
     is not distinct from (select jsonb_agg(x->'family' order by x->>'family') from jsonb_array_elements(b->'familyTitles') x),
  'same campaign with or without a replay: '||a::text||b::text;
end $$;
reset role;
do $$begin
 -- The ledger: each session once, one world; the pending one never; a replay attributes nothing.
 assert (select count(*)||':'||sum(effort) from private.adventure_effort_ledger where user_id=current_setting('titan.ch_1')::uuid and world_id='aube')
       =(select count(*)||':'||sum(effort) from private.adventure_effort_ledger where user_id=current_setting('titan.ch_7')::uuid),'the same Vallée ledger with or without a replay';
 assert exists(select 1 from private.adventure_effort_ledger l join public.training_logs t on t.id=l.source_id where t.sport='running'
  and t.created_at>t.date+interval '1 day' and l.user_id=current_setting('titan.ch_1')::uuid),'the backdated session is imported once, like any session, for the campaign only';
 assert not exists(select 1 from private.adventure_effort_ledger l join public.training_logs t on t.id=l.source_id where t.status='pending_review'
  and l.user_id=current_setting('titan.ch_1')::uuid),'a session on hold is never imported';
end $$;

-- Abandon: account 2 starts a run on the ruines, abandons it, starts run 3. Run 2 stays readable, nothing else changes.
set local role authenticated;
do $$declare s jsonb; a jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_2'),'role','authenticated')::text,true);
 s:=public.titan_adventure_chronicle_action_v1('aube','start');
 s:=public.titan_adventure_chronicle_action_v1('aube','choose',null,'ruines');
 s:=public.titan_adventure_chronicle_action_v1('aube','abandon',2);
 a:=public.titan_adventure_chronicle_action_v1('aube','abandon')->'arcs'->0;
 assert a->'runs'->1->>'state'='abandoned' and a->'runs'->1->>'route'='ruines' and a->'runs'->1->>'abandonedAt'=(s->'arcs'->0->'runs'->1->>'abandonedAt')
  and a->'activeRun'='null'::jsonb and (a->>'replayable')::boolean,'abandoned once: '||a::text;
 begin perform public.titan_adventure_chronicle_action_v1('aube','advance',null,null,'scene'); raise exception 'advanced an abandoned run';
 exception when raise_exception then assert sqlerrm='REPLAY_NOT_STARTED',sqlerrm; end;
 insert into ch_payloads values('abandoned',public.titan_adventure_chronicle_action_v1('aube','start'));
 a:=public.titan_adventure_chronicles_v1()->'arcs'->0;
 assert jsonb_array_length(a->'runs')=3 and (a->>'activeRun')::integer=3 and a->'runs'->2->>'state'='choose' and a->'runs'->1->>'state'='abandoned',a::text;
 assert a->'discovered'->1='{"route":"ruines","scene":false,"clue":false,"outcome":false}'::jsonb,'an abandoned choice discovers no scene: '||a::text;
 assert a->'activeOutcome'->>'outcome'='passage_rouvert',a::text;
 -- The old account starts its first run of the versioned arc; its v1 journal stays as it was.
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_4'),'role','authenticated')::text,true);
 a:=public.titan_adventure_chronicles_v1()->'arcs'->0;
 assert a->'runs'->0->>'kind'='legacy' and a->'runs'->1->>'route'='corniche' and a->'runs'->1->>'state'='scene',a::text;
end $$;
reset role;
do $$begin
 assert (select count(*) from private.adventure_arc_runs where user_id=current_setting('titan.ch_2')::uuid)=2,'runs 2 and 3';
 assert (select count(*) from private.adventure_arc_runs where resolved_at is null and abandoned_at is null and user_id=current_setting('titan.ch_2')::uuid)=1,'one active run';
 -- The partial unique index refuses a second active run, whatever function would try.
 begin
  insert into private.adventure_arc_runs(user_id,world_id,arc,run,version,rules) values(current_setting('titan.ch_2')::uuid,'aube','aube-arc1',9,1,1);
  raise exception 'two active runs';
 exception when unique_violation then null; end;
end $$;

-- Versions: rules v2 become current (other thresholds); a running run keeps its rules and its arc version. (Rolled back.)
savepoint ch_v2;
create or replace function private.titan_adventure_chronicle_config(p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_version = 1 then
    $cfg${"id":"chroniques","version":1,"arcs":["aube-arc1","marees-arc1","forge-arc1","aurores-arc1"],"maxRuns":100,"steps":[{"kind":"scene","effortTargets":1,"daysTarget":1},{"kind":"clue","effortTargets":2,"daysTarget":2},{"kind":"observe","effortTargets":3,"daysTarget":3},{"kind":"prepare"},{"kind":"resolve","effortTargets":4,"daysTarget":3}]}$cfg$::jsonb
  when p_version = 2 then
    $cfg${"id":"chroniques","version":2,"arcs":["aube-arc1","marees-arc1","forge-arc1","aurores-arc1"],"maxRuns":100,"steps":[{"kind":"scene","effortTargets":9,"daysTarget":9},{"kind":"clue","effortTargets":9,"daysTarget":9},{"kind":"observe","effortTargets":9,"daysTarget":9},{"kind":"prepare"},{"kind":"resolve","effortTargets":9,"daysTarget":9}]}$cfg$::jsonb
  end;
$$;
create or replace function private.titan_adventure_chronicle_current()
returns integer language sql immutable security invoker set search_path = '' as $$ select 2; $$;
set local role authenticated;
do $$declare a jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_4'),'role','authenticated')::text,true);
 a:=public.titan_adventure_chronicles_v1()->'arcs'->0;
 assert (a->'runs'->1->>'rules')::integer=1 and (a->'runs'->1->'steps'->0->>'effortTarget')::integer=15,'the running run keeps rules v1: '||a::text;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 a:=public.titan_adventure_chronicle_action_v1('aube','start')->'arcs'->0;
 assert (a->'runs'->2->>'rules')::integer=2 and (a->'runs'->1->>'rules')::integer=1 and a->'runs'->1->>'outcome'='passage_rouvert','a new run takes the new rules: '||a::text;
end $$;
reset role;
rollback to savepoint ch_v2;

-- Reading the chronicle again (measure): account 1 reopens both stories the next day, account 3 one story the same day.
set local role authenticated;
do $$declare s jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_1'),'role','authenticated')::text,true);
 s:=public.titan_adventure_chronicle_action_v1('aube','read',1);
 s:=public.titan_adventure_chronicle_action_v1('aube','read',2);
 assert (s->'arcs'->0->>'reads')::integer=2,s::text;
 begin perform public.titan_adventure_chronicle_action_v1('aube','read',7); raise exception 'read a run that does not exist';
 exception when raise_exception then assert sqlerrm='INVALID_RUN',sqlerrm; end;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ch_3'),'role','authenticated')::text,true);
 s:=public.titan_adventure_chronicle_action_v1('marees','read',2);
end $$;
reset role;
update private.adventure_chronicle_events set at=now()-interval '4 days' where kind='read' and user_id=current_setting('titan.ch_1')::uuid;
update private.adventure_chronicle_events set at=now()-interval '5 days 9 hours' where kind='read' and user_id=current_setting('titan.ch_3')::uuid;
do $$declare r record; m text:='';begin
 for r in select * from private.titan_adventure_chronicle_metrics_v1() loop
  m:=m||format('%s %s>%s>%s>%s>%s>%s; ',r.arc,r.completed_accounts,r.returning_readers,r.replay_started,r.replay_resolved,r.other_resolution,r.replay_abandoned);
 end loop;
 raise notice 'V1.5.5 metrics %',m;
 -- Only this file's synthetic accounts exist here (earlier tests are rolled back).
 assert m='aube-arc1 4>1>3>1>1>1; marees-arc1 1>0>1>1>1>0; forge-arc1 0>0>0>0>0>0; aurores-arc1 0>0>0>0>0>0; ',m;
end $$;

-- Export keeps every earlier section and adds the runs; deleting the journey removes the runs and their events.
do $$declare s jsonb;begin
 s:=private.titan_export_extras_v1(current_setting('titan.ch_1')::uuid);
 assert s ? 'adventureRpg' and s ? 'adventureBranches' and s ? 'adventureGuardians' and s ? 'adventureConsequences' and s ? 'adventureQuests','earlier sections kept';
 assert jsonb_array_length(s->'adventureRuns')=1 and s->'adventureRuns'->0->>'route'='corniche' and s->'adventureRuns'->0->>'outcome'='passage_rouvert'
  and not (s->'adventureRuns'->0 ? 'user_id'),s::text;
 assert jsonb_array_length(s->'adventureChronicleEvents')=4 and not (s->'adventureChronicleEvents'->0 ? 'user_id'),s::text;
 delete from private.adventure_journeys where user_id=current_setting('titan.ch_3')::uuid and world_id='marees';
 assert not exists(select 1 from private.adventure_arc_runs where user_id=current_setting('titan.ch_3')::uuid),'runs removed with the journey';
 assert not exists(select 1 from private.adventure_chronicle_events where user_id=current_setting('titan.ch_3')::uuid),'events removed with the journey';
end $$;
\if :{?chronicle_fixture}
\pset tuples_only on
\pset format unaligned
\o :chronicle_fixture
select jsonb_pretty(jsonb_object_agg(name,payload order by name)) from ch_payloads;
\o
\endif
rollback;

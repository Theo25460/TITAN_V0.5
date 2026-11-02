-- Entire test is synthetic and rolled back. All API calls execute as authenticated/anon.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
 perform set_config('titan.rpg_a',a::text,true); perform set_config('titan.rpg_b',b::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
 set local session_replication_role=replica;
 insert into public.profiles(id,username,level,xp,credits,is_suspended) values(a,'qa_rpg_a',1,100,10,false),(b,'qa_rpg_b',1,100,10,false)
 on conflict(id) do update set is_suspended=false,xp=100,credits=10;
 insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at)
 values(a,'aube',9,'rhythm','UTC',now()-interval '30 days'),(a,'marees',9,'rhythm','UTC',now()-interval '30 days'),(b,'aube',9,'rhythm','UTC',now()-interval '30 days');
 set local session_replication_role=origin;
end $$;
set local role anon;
do $$begin
 begin perform public.titan_adventure_rpg_snapshot_v1('aube'); raise exception 'anon executed snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_attest_sensor_v1(gen_random_uuid(),30,0.5,'native_verified'); raise exception 'anon attested sensor'; exception when insufficient_privilege then null; end;
 begin perform public.titan_adventure_rpg_action_v1('aube','start'); raise exception 'anon executed action'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.rpg_a'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 s:=public.titan_adventure_rpg_action_v1('aube','start'); assert (s->>'active')::boolean;
 assert jsonb_array_length(s->'milestones')=18;
 begin perform public.titan_adventure_attest_sensor_v1(gen_random_uuid(),30,0.5,'native_verified'); raise exception 'client forged sensor proof'; exception when insufficient_privilege then null; end;
 assert (s->'curve'->>'candidateActive')::boolean=false;
 begin perform public.titan_adventure_rpg_action_v1('aube','claim',1); raise exception 'unearned victory'; exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE'; end;
 begin insert into private.adventure_effort_ledger(user_id,source_id,world_id,day,effort,candidate_v2,family)
 values(auth.uid(),gen_random_uuid(),'aube',current_date,90,'{}','cardio'); raise exception 'direct ledger writable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Fixture12 eligible days, repeated huge same-day sessions, plus invalid/foreign proofs.
update private.adventure_journeys set started_at=now()-interval '28 days',target=15 where user_id=current_setting('titan.rpg_a')::uuid;
set local session_replication_role=replica;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
select current_setting('titan.rpg_a')::uuid,'walking','cardio',30,'min',0,now()-n*interval '1 day',now()-n*interval '1 day',
 '{"serverReward":true,"effort":{"minutes":30,"effort_minutes":30},"bio":{"rpe":5}}'::jsonb from generate_series(1,12)n;
insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details,status)
values(current_setting('titan.rpg_a')::uuid,'running','cardio',900,'min',0,now()-interval '1 day',now()-interval '1 day','{"serverReward":true,"effort":{"minutes":900,"effort_minutes":900}}','valid'),
(current_setting('titan.rpg_a')::uuid,'running','cardio',900,'min',0,now()-interval '2 days',now()-interval '2 days','{"serverReward":true,"historical":true,"effort":{"effort_minutes":900}}','valid'),
(current_setting('titan.rpg_a')::uuid,'running','cardio',900,'min',0,now()-interval '3 days',now()-interval '3 days','{"serverReward":true,"effort":{"effort_minutes":900}}','flagged'),
(current_setting('titan.rpg_b')::uuid,'running','cardio',900,'min',0,now()-interval '4 days',now()-interval '4 days','{"serverReward":true,"effort":{"effort_minutes":900}}','valid');
set local session_replication_role=origin;
set local role authenticated;
do $$declare s jsonb; again jsonb; n integer;begin
 s:=public.titan_adventure_rpg_action_v1('aube','sync');
 assert (s->>'effort')::numeric=420,'eligible only +90 daily cap'; assert (s->>'days')::integer=12;
 again:=public.titan_adventure_rpg_action_v1('aube','sync'); assert again=s,'sync retry stable';
 assert jsonb_array_length(s->'familyTitles')=1,'three distinct family days earns cosmetic';
 begin perform public.titan_adventure_rpg_action_v1('aube','claim',3); raise exception 'skipped milestone'; exception when raise_exception then assert sqlerrm='ENCOUNTER_INCOMPLETE'; end;
 s:=public.titan_adventure_rpg_action_v1('aube','claim',1);
 begin perform public.titan_adventure_rpg_action_v1('aube','claim',2,99); raise exception 'unvalidated choice'; exception when raise_exception then assert sqlerrm='INVALID_CHOICE'; end;
 for n in 1..18 loop
 s:=public.titan_adventure_rpg_action_v1('aube','claim',n,case when n%6=2 then 1 else null end);
 again:=public.titan_adventure_rpg_action_v1('aube','claim',n,case when n%6=2 then 0 else null end);
 assert s=again,'claim retry must neither change choice nor duplicate reward';
 end loop;
 assert jsonb_array_length(s->'rewards')=18;
 s:=public.titan_adventure_rpg_action_v1('marees','start');
 s:=public.titan_adventure_rpg_action_v1('marees','sync'); assert (s->>'effort')::numeric=0,'sources cannot be spent in two worlds';
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.rpg_b'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 s:=public.titan_adventure_rpg_snapshot_v1('aube'); assert not (s->>'active')::boolean;
 assert jsonb_array_length(s->'rewards')=0; assert (s->>'effort')::numeric=0;
 begin perform public.titan_adventure_rpg_action_v1('aube','claim',1); raise exception 'foreign claim'; exception when raise_exception then assert sqlerrm='JOURNEY_NOT_STARTED'; end;
end $$;
reset role;
do $$declare s jsonb;begin
 assert (select xp=100 and credits=10 from public.profiles where id=current_setting('titan.rpg_a')::uuid),'no economy modification';
 assert (select count(*)=13 from private.adventure_effort_ledger where user_id=current_setting('titan.rpg_a')::uuid),'no invalid or duplicate ledger rows';
 assert (private.titan_adventure_candidate_v2(30,5,5,null,false)->>'score')::numeric=30;
 assert (private.titan_adventure_candidate_v2(30,10,10,null,false)->>'score')::numeric=30;
 assert (private.titan_adventure_candidate_v2(900,5,5,null,false)->>'score')::numeric=90;
 assert (private.titan_adventure_candidate_v2(900,1,5,null,false)->>'score')::numeric=61.2,'candidate caps duration before intensity like JS';
 assert (private.titan_adventure_candidate_v2(30,5,5,0.5,true)->>'score')::numeric=30,'comparable reliable HR has no sensor advantage';
 assert (private.titan_adventure_candidate_v2(30,5,5,1,false)->>'score')::numeric=30,'unverified HR ignored';
 assert (select max(effort)<=90 from (select sum(effort) effort from private.adventure_effort_ledger where user_id=current_setting('titan.rpg_a')::uuid group by day) d);
 s:=private.titan_export_extras_v1(current_setting('titan.rpg_a')::uuid);
 assert s ? 'routes' and s ? 'adventureRpg','prior export sections preserved';
 assert jsonb_array_length(s->'adventureRpg'->'encounters')=18;
end $$;
rollback;

-- TITAN LIVE v1: settlement is idempotent, capped, verified against the stored session, cosmetic only, owner-scoped.
-- Synthetic fixtures, all rolled back.
begin;
do $$declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 e1 uuid:=gen_random_uuid(); e2 uuid:=gen_random_uuid(); e3 uuid:=gen_random_uuid(); e4 uuid:=gen_random_uuid();
 e5 uuid:=gen_random_uuid(); e6 uuid:=gen_random_uuid(); e7 uuid:=gen_random_uuid(); e8 uuid:=gen_random_uuid(); held uuid; l4 uuid;
 j jsonb:='{"v":1,"voie":"forge","intent":"depasser","activeMin":58,"beats":12,
   "missions":[{"id":"forge.plan"},{"id":"sentier.echo"},{"id":"forge.r_nope"},{"id":"forge.braise","declared":true},{"id":"forge.r_warmup_sets"},{"id":"forge.nettes"}]}';
begin
 perform set_config('titan.live_a',a::text,true); perform set_config('titan.live_b',b::text,true); perform set_config('titan.live_c',c::text,true);
 perform set_config('titan.live_e1',e1::text,true); perform set_config('titan.live_e2',e2::text,true); perform set_config('titan.live_e3',e3::text,true);
 perform set_config('titan.live_e4',e4::text,true); perform set_config('titan.live_e5',e5::text,true); perform set_config('titan.live_e6',e6::text,true);
 perform set_config('titan.live_e7',e7::text,true); perform set_config('titan.live_e8',e8::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}');
 set local session_replication_role=replica;
 insert into public.profiles(id,username,level,xp,credits,is_suspended) values(a,'qa_live_a',5,1000,100,false),(b,'qa_live_b',1,0,0,false),(c,'qa_live_c',1,0,0,true)
 on conflict(id) do update set level=excluded.level,xp=excluded.xp,credits=excluded.credits,is_suspended=excluded.is_suspended;
 -- e1: strength session, 60 effort-minutes, one valid report mission, one foreign mission, two declared missions.
 insert into public.training_logs(user_id,client_event_id,sport,category,val,unit,xp,date,created_at,details) values
 (a,e1,'muscu_gym','force',3000,'kg',600,now(),now(),jsonb_build_object('duration',60,'serverReward',true,'effort',jsonb_build_object('effort_minutes',60),
   'extras',jsonb_build_object('warmup_sets',3),'live',j)),
 -- e2: same day, 60 more effort-minutes: only 30 essence left under the daily cap of 90.
 (a,e2,'muscu_gym','force',3000,'kg',600,now(),now(),jsonb_build_object('duration',60,'serverReward',true,'effort',jsonb_build_object('effort_minutes',60),
   'extras',jsonb_build_object('warmup_sets',1),'live',j)),
 -- e3: inflated journal (500 active minutes for a 30-minute session): missions ignored, essence still from the server effort.
 (a,e3,'yoga','mobility',30,'min',300,now(),now(),jsonb_build_object('duration',30,'serverReward',true,'effort',jsonb_build_object('effort_minutes',30),
   'live','{"v":1,"voie":"sanctuaire","intent":"explorer","activeMin":500,"beats":5,"missions":[{"id":"sanctuaire.terrasses"}]}'::jsonb)),
 -- e8: two declared missions: only the first counts.
 (a,e8,'yoga','mobility',40,'min',400,now(),now(),jsonb_build_object('duration',40,'serverReward',true,'effort',jsonb_build_object('effort_minutes',40),
   'live','{"v":1,"voie":"sanctuaire","intent":"atteindre","activeMin":40,"beats":10,"missions":[{"id":"sanctuaire.souffle"},{"id":"sanctuaire.nouvelle"},{"id":"sanctuaire.terrasses"}]}'::jsonb)),
 -- e5: historical session (no server reward).
 (a,e5,'running','cardio',10,'km',0,now()-interval '40 days',now(),jsonb_build_object('duration',50,'historical',true,'serverReward',false,'live',j)),
 -- e6: suspicious session.
 (a,e6,'running','cardio',10,'km',500,now(),now(),jsonb_build_object('duration',50,'serverReward',true,'live','{"v":1,"voie":"sentier"}'::jsonb)),
 -- e7: a session of b.
 (b,e7,'tennis','racket',60,'min',600,now(),now(),jsonb_build_object('duration',60,'serverReward',true,'effort',jsonb_build_object('effort_minutes',60),
   'live','{"v":1,"voie":"joute","intent":"atteindre","activeMin":60,"beats":6,"missions":[]}'::jsonb));
 update public.training_logs set is_suspicious=true where client_event_id=e6;
 -- e4: held reward.
 insert into public.training_logs(user_id,client_event_id,sport,category,val,unit,xp,date,created_at,details) values
 (a,e4,'running','cardio',10,'km',500,now(),now(),jsonb_build_object('duration',50,'serverReward',true,'effort',jsonb_build_object('effort_minutes',50),
   'live','{"v":1,"voie":"sentier","intent":"atteindre","activeMin":50,"beats":8,"missions":[]}'::jsonb)) returning id into l4;
 insert into private.titan_reward_holds(log_id,user_id,xp,credits,release_at) values(l4,a,500,50,now()+interval '1 day');
 set local session_replication_role=origin;
 assert not exists(select 1 from private.titan_feature_flags where key='screens.live'), 'no flag seeded';
 insert into private.titan_feature_flags(key,enabled,rollout,description) values('screens.live',true,100,'QA');
 assert (select count(*)=260 from private.titan_live_sports), 'every sport is mapped';
 assert (select count(distinct voie)=20 from private.titan_live_sports), 'twenty Voies';
 assert private.titan_live_hash('')=2166136261 and private.titan_live_hash('a')=3826002220 and private.titan_live_hash('foobar')=3214735720, 'FNV-1a parity with the JS engine';
end $$;

-- Anonymous callers cannot settle, build or read.
set local role anon;
do $$begin
 begin perform public.titan_live_settle_v1(gen_random_uuid()); raise exception 'anon settle'; exception when insufficient_privilege then null; end;
 begin perform public.titan_live_world_v1(); raise exception 'anon world'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.live_a'),'role','authenticated')::text,true);
do $$declare r jsonb; r2 jsonb; w jsonb;begin
 -- Direct table access is closed.
 begin perform 1 from private.titan_live_wallets; raise exception 'direct read'; exception when insufficient_privilege then null; end;
 begin insert into private.titan_live_wallets(user_id,eclats) values(auth.uid(),999999); raise exception 'direct write'; exception when insufficient_privilege then null; end;

 r:=public.titan_live_settle_v1(current_setting('titan.live_e1')::uuid);
 assert r->>'status'='settled' and (r->>'replay')::boolean=false, r::text;
 assert r->>'essence'='acier' and (r->>'essenceAmount')::int=60, r::text;
 -- forge.plan + forge.braise (engine) + forge.r_warmup_sets (report verified); foreign, unknown and the 4th refused.
 assert r->'missions'='["forge.plan", "forge.braise", "forge.r_warmup_sets"]'::jsonb, r::text;
 -- 10 base + 3×5 missions + 10 accomplishment + 10 harmony (+3 if a duplicate find, impossible on the first one).
 assert (r->>'eclats')::int=45, r::text;

 -- Replaying returns the stored result and changes nothing.
 r2:=public.titan_live_settle_v1(current_setting('titan.live_e1')::uuid);
 assert (r2->>'replay')::boolean and r2->>'eclats'=r->>'eclats', r2::text;
 w:=public.titan_live_world_v1();
 assert (w->'wallet'->>'eclats')::int=45 and (w->'wallet'->'essences'->>'acier')::int=60, w::text;

 -- Daily cap shared by every sport, report mission failing its threshold, no harmony twice in the week.
 r:=public.titan_live_settle_v1(current_setting('titan.live_e2')::uuid);
 assert (r->>'essenceAmount')::int=30, r::text;
 assert r->'missions'='["forge.plan", "forge.braise", "forge.nettes"]'::jsonb, r::text;
 assert (r->>'eclats')::int in (35,38), r::text;

 -- Third session of the day: no base éclats; inflated journal: missions ignored; the daily essence cap is already spent.
 r:=public.titan_live_settle_v1(current_setting('titan.live_e3')::uuid);
 assert (r->>'missionsIgnored')::boolean and r->'missions'='[]'::jsonb and (r->>'essenceAmount')::int=0, r::text;
 assert (r->>'eclats')::int in (10,13), r::text;

 r:=public.titan_live_settle_v1(current_setting('titan.live_e8')::uuid);
 assert r->'missions'='["sanctuaire.souffle", "sanctuaire.terrasses"]'::jsonb, r::text;
 -- Held, historical and suspicious sessions are not settled.
 assert public.titan_live_settle_v1(current_setting('titan.live_e4')::uuid)->>'status'='held';
 assert public.titan_live_settle_v1(current_setting('titan.live_e5')::uuid)->>'status'='not_eligible';
 assert public.titan_live_settle_v1(current_setting('titan.live_e6')::uuid)->>'status'='not_eligible';
 -- Another player's session does not exist for this caller.
 begin perform public.titan_live_settle_v1(current_setting('titan.live_e7')::uuid); raise exception 'foreign session'; exception when no_data_found then null; end;

 -- Building: Halle d'acier level 1 costs 60, paid with acier first (90 available).
 w:=public.titan_live_build_v1('halle');
 assert (w->'buildings'->>'halle')::int=1 and (w->'wallet'->'essences'->>'acier')::int=30, w::text;
 -- Level 2 costs 120: 30 acier + 90 éclats.
 w:=public.titan_live_build_v1('halle');
 assert (w->'buildings'->>'halle')::int=2 and (w->'wallet'->'essences'->>'acier')::int=0, w::text;
 begin perform public.titan_live_build_v1('phare'); perform public.titan_live_build_v1('phare'); perform public.titan_live_build_v1('phare');
  raise exception 'phare without éclats'; exception when invalid_parameter_value then null; end;
 begin perform public.titan_live_build_v1('casino'); raise exception 'unknown building'; exception when invalid_parameter_value then null; end;
 assert (w->'voies'->'forge'->>'sessions')::int=2 and (w->>'days')::int=1 and (w->>'distinctVoies')::int=2, w::text;
 -- Nothing touched XP or credits.
 assert (select xp=1000 and credits=100 from public.profiles where id=auth.uid());
end $$;

-- A suspended account cannot settle.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.live_c'),'role','authenticated')::text,true);
do $$begin
 begin perform public.titan_live_settle_v1(gen_random_uuid()); raise exception 'suspended settle'; exception when insufficient_privilege then null; end;
end $$;

-- Flag off: nothing can be settled.
reset role;
update private.titan_feature_flags set enabled=false where key='screens.live';
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.live_b'),'role','authenticated')::text,true);
do $$begin
 begin perform public.titan_live_settle_v1(current_setting('titan.live_e7')::uuid); raise exception 'flag off'; exception when insufficient_privilege then null; end;
 assert (public.titan_live_world_v1()->>'enabled')::boolean=false;
end $$;
reset role;

-- The export carries the live world; deleting the account removes it.
do $$declare x jsonb;begin
 x:=private.titan_live_export_v1(current_setting('titan.live_a')::uuid);
 assert jsonb_array_length(x->'liveSettlements')=4 and jsonb_array_length(x->'liveBuildings')=1, x::text;
 delete from auth.users where id=current_setting('titan.live_a')::uuid;
 assert not exists(select 1 from private.titan_live_settlements where user_id=current_setting('titan.live_a')::uuid);
 assert not exists(select 1 from private.titan_live_wallets where user_id=current_setting('titan.live_a')::uuid);
end $$;
rollback;

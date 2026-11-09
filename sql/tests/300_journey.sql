-- Synthetic fixtures, all rolled back. RPCs run as restricted roles.
begin;
do $$declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); r record;begin
 perform set_config('titan.journey_a',a::text,true); perform set_config('titan.journey_b',b::text,true); perform set_config('titan.journey_c',c::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}');
 set local session_replication_role=replica;
 insert into public.profiles(id,username,level,xp,credits,is_suspended) values(a,'qa_journey_a',35,123,45,false),(b,'qa_journey_b',1,456,67,false),(c,'qa_journey_c',100,999,99,true)
 on conflict(id) do update set level=excluded.level,xp=excluded.xp,credits=excluded.credits,is_suspended=excluded.is_suspended;
 set local session_replication_role=origin;
 -- Rolled-back fixture only: simulate future sources and corrupted upstream data.
 for r in select conname,conrelid from pg_constraint where conrelid in('private.titan_daily_activity'::regclass,'private.titan_source_consents'::regclass) and contype='c'
 loop execute format('alter table %s drop constraint %I',r.conrelid::regclass,r.conname); end loop;
 update private.titan_journey_configs set allowed_sources=array['health_connect','garmin','native_local'] where active;
 insert into private.titan_source_consents(user_id,source) values(a,'health_connect'),(a,'garmin'),(a,'native_local');
 insert into private.titan_garmin_links(user_id,garmin_user_id) values(a,'qa-journey-a'),(b,'qa-journey-b');
 insert into private.titan_daily_activity(user_id,source,day,steps,updated_at) values
 (a,'health_connect',current_date,12000,now()),(a,'garmin',current_date,18000,now()),
 (a,'health_connect',current_date-1,14000,now()),(a,'garmin',current_date-1,10000,now()),
 (a,'health_connect',current_date-500,5000,now()-interval '400 days'),
 (a,'health_connect',current_date-2,-1,now()),(a,'health_connect',current_date-3,200001,now()),
 (a,'health_connect',current_date+1,200000,now()),(a,'health_connect','0001-01-01',200000,now()),(a,'health_connect','infinity',200000,now()),
 (a,'health_connect',current_date-4,200000,now()+interval '1 day'),(a,'health_connect',current_date-5,200000,'infinity'),
 (a,'native_local',current_date,200000,now()),(b,'health_connect',current_date,200000,now());
 assert (select count(*)=0 from private.titan_journey_acquisitions where user_id in(a,b));
 assert (select max(steps)=30000000 and count(*)=304 from private.titan_journey_discovery_config where config_version=1);
 assert (select array_agg(steps order by steps)=array[10000,30000,75000,150000,300000,500000,1000000,2000000,5000000,10000000,15000000,20000000,30000000]::bigint[] from private.titan_journey_discovery_config where config_version=1 and kind='milestone');
 assert (select max(gap)<=100000 from(select steps-lag(steps,1,0::bigint)over(order by steps) gap from private.titan_journey_discovery_config where config_version=1)d);
 assert (select count(distinct world)=4 from private.titan_journey_discovery_config where config_version=1);
 assert (select array_agg(level order by level)=array[5,10,20,35,50,75,100] from private.titan_journey_career_config where config_version=1);
end $$;
set local role service_role;
select public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date,18000);
select public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date-1,14000);
select public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date-399,5000);
do $$begin
 begin perform public.titan_journey_attest_day_v1('garmin','qa-journey-b',current_date,18000); raise exception 'unconsented attestation'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_attest_day_v1('garmin','absent',current_date,18000); raise exception 'unlinked attestation'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_attest_day_v1('health_connect','qa-journey-a',current_date,18000); raise exception 'unverified provider'; exception when invalid_parameter_value then null; end;
 begin perform public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date+1,18000); raise exception 'future attestation'; exception when invalid_parameter_value then null; end;
 begin perform public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date,200001); raise exception 'out-of-range attestation'; exception when invalid_parameter_value then null; end;
end $$;
set local role anon;
do $$begin
 begin perform public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date,18000); raise exception 'anon attestation'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_snapshot_v1(); raise exception 'anon snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_sync_v1(); raise exception 'anon sync'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$begin
 begin perform public.titan_journey_snapshot_v1(); raise exception 'ownerless snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_sync_v1(); raise exception 'ownerless sync'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_a'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 s:=public.titan_journey_snapshot_v1();
 assert s->>'owner'=auth.uid()::text and (s->>'version')::int=1 and (s->>'configVersion')::int=1;
 assert (s->>'goal')::bigint=30000000 and (s->>'totalSteps')::bigint=37000,'MAX per day, valid consented server history, never local native';
 assert (s->'today'->>'steps')::int=18000 and s->'today'->'sources'='["garmin"]'::jsonb;
 assert (s->>'observedSteps')::bigint=37000 and jsonb_array_length(s->'observedToday'->'sources')=2;
 assert (s->'observedToday'->>'updatedAt')::timestamptz=now();
 assert not exists(select 1 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null),'GET must not unlock';
 assert (s->'career'->>'level')::int=35;
 begin perform public.titan_import_daily_activity_v1('health_connect',current_date,-1); raise exception 'negative import'; exception when invalid_parameter_value then null; end;
 begin perform public.titan_import_daily_activity_v1('health_connect',current_date+2,1); raise exception 'future import'; exception when invalid_parameter_value then null; end;
 begin perform public.titan_import_daily_activity_v1('health_connect',current_date-401,1); raise exception 'ancient import'; exception when invalid_parameter_value then null; end;
 begin perform public.titan_import_daily_activity_v1('native_local',current_date,10000); raise exception 'native local import'; exception when invalid_parameter_value then null; end;
 begin perform * from private.titan_journey_acquisitions; raise exception 'direct journal read'; exception when insufficient_privilege then null; end;
 begin insert into private.titan_journey_acquisitions(user_id,track,id,config_version,payload) values(auth.uid(),'discovery','fake',1,'{}'); raise exception 'direct journal insert'; exception when insufficient_privilege then null; end;
 begin update private.titan_journey_acquisitions set earned_at=now(); raise exception 'direct journal update'; exception when insufficient_privilege then null; end;
 begin delete from private.titan_journey_acquisitions; raise exception 'direct journal delete'; exception when insufficient_privilege then null; end;
 begin update private.titan_journey_discovery_config set steps=0; raise exception 'direct config update'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_attest_day_v1('garmin','qa-journey-a',current_date,18000); raise exception 'client attestation'; exception when insufficient_privilege then null; end;
 begin insert into private.titan_journey_verified_days(user_id,source,day,steps) values(auth.uid(),'garmin',current_date,200000); raise exception 'direct proof insert'; exception when insufficient_privilege then null; end;
 begin perform private.titan_journey_days_v1(); raise exception 'raw helper exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$begin assert (select count(*)=0 from private.titan_journey_acquisitions where user_id=current_setting('titan.journey_a')::uuid),'snapshot made no writes'; end $$;
set local role authenticated;
do $$declare s jsonb; n int;begin
 s:=public.titan_journey_sync_v1(); for n in 1..10 loop assert public.titan_journey_sync_v1()=s,'ten retries preserve dates/content'; end loop;
 assert (select count(*)=2 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null);
 assert (select count(*)=4 from jsonb_array_elements(s->'career'->'milestones')m where m->>'earnedAt' is not null);
 assert (select bool_and((d->>'earnedAt')::timestamptz>=transaction_timestamp()) from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null),'no fabricated historical dates';
 perform set_config('titan.journey_first',s::text,true);
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_b'),'role','authenticated')::text,true);
do $$declare s jsonb;begin s:=public.titan_journey_sync_v1();
 assert (s->>'totalSteps')::int=0 and s->'today'='null'::jsonb;
 assert not exists(select 1 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null);
 begin perform public.titan_import_daily_activity_v1('health_connect',current_date,10000); raise exception 'unconsented import'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_c'),'role','authenticated')::text,true);
do $$begin
 begin perform public.titan_journey_snapshot_v1(); raise exception 'suspended snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.titan_journey_sync_v1(); raise exception 'suspended sync'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.titan_journey_verified_days set steps=0 where user_id=current_setting('titan.journey_a')::uuid;
update private.titan_journey_discovery_config set name='Changed catalogue name' where config_version=1 and steps=10000;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_a'),'role','authenticated')::text,true);
do $$declare s jsonb; original jsonb:=current_setting('titan.journey_first')::jsonb;begin s:=public.titan_journey_sync_v1();
 assert (s->>'totalSteps')::int=0 and (s->'today'->>'steps')::int=0,'real zero differs from no data';
 assert (select jsonb_agg(d order by d->>'id') from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null)=
 (select jsonb_agg(d order by d->>'id') from jsonb_array_elements(original->'discoveries')d where d->>'earnedAt' is not null),'correction/catalogue cannot rewrite acquisitions';
end $$;
reset role;
update private.titan_source_consents set revoked_at=now() where user_id=current_setting('titan.journey_a')::uuid;
set local role authenticated;
do $$declare s jsonb;begin s:=public.titan_journey_snapshot_v1(); assert (s->>'totalSteps')::int=0 and s->'today'='null'::jsonb;
 assert (select count(*)=2 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null); end $$;
reset role;
insert into private.titan_source_consents(user_id,source) values(current_setting('titan.journey_b')::uuid,'garmin');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_b'),'role','authenticated')::text,true);
do $$declare s jsonb;begin
 perform public.titan_set_source_consent_v1('health_connect',true);
 for n in 0..149 loop
   perform public.titan_import_daily_activity_v1('health_connect',current_date-n,200000);
 end loop;
 s:=public.titan_journey_sync_v1();
 assert (s->>'observedSteps')::bigint=30000000 and (s->>'totalSteps')::bigint=0,'authenticated imports remain observations';
 assert not exists(select 1 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null),'declared steps cannot unlock a souvenir';
end $$;
set local role service_role;
do $$begin
 for n in 0..149 loop
   perform public.titan_journey_attest_day_v1('garmin','qa-journey-b',current_date-n,200000);
 end loop;
 perform public.titan_journey_attest_day_v1('garmin','qa-journey-b',current_date,200000);
end $$;
reset role;
set local session_replication_role=replica; update public.profiles set level=100 where id=current_setting('titan.journey_b')::uuid; set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_b'),'role','authenticated')::text,true);
do $$declare s jsonb;begin s:=public.titan_journey_sync_v1(); assert (s->>'totalSteps')::bigint=30000000;
 assert (select count(*)=304 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null);
 assert (select count(*)=7 from jsonb_array_elements(s->'career'->'milestones')m where m->>'earnedAt' is not null); end $$;
reset role;
insert into private.titan_journey_configs(version,active,goal,daily_cap,allowed_sources) values(2,false,30000000,200000,array['health_connect']);
insert into private.titan_journey_discovery_config select 2,id,steps,world,name,story,kind from private.titan_journey_discovery_config where config_version=1 and steps<>10000;
insert into private.titan_journey_career_config select 2,id,level,title,description from private.titan_journey_career_config where config_version=1;
update private.titan_journey_configs set active=false where active; update private.titan_journey_configs set active=true where version=2;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.journey_a'),'role','authenticated')::text,true);
do $$declare s jsonb;begin s:=public.titan_journey_snapshot_v1(); assert (s->>'configVersion')::int=2;
 assert (select count(*)=2 from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is not null),'retired acquired discovery visible'; end $$;
reset role;
do $$declare s jsonb;begin
 assert (select count(*)=6 from private.titan_journey_acquisitions where user_id=current_setting('titan.journey_a')::uuid);
 assert (select xp=123 and credits=45 and level=35 from public.profiles where id=current_setting('titan.journey_a')::uuid);
 assert (select xp=456 and credits=67 from public.profiles where id=current_setting('titan.journey_b')::uuid);
 assert (select bool_and(relrowsecurity) from pg_class where oid in('private.titan_journey_configs'::regclass,'private.titan_journey_discovery_config'::regclass,'private.titan_journey_career_config'::regclass,'private.titan_journey_acquisitions'::regclass));
 s:=private.titan_export_extras_v1(current_setting('titan.journey_a')::uuid); assert s ? 'adventureRpg' and s ? 'journey'; assert jsonb_array_length(s->'journey')=6 and jsonb_array_length(s->'journeyVerifiedDailyActivity')=3;
end $$;
delete from auth.users where id=current_setting('titan.journey_b')::uuid;
do $$begin
 assert not exists(select 1 from private.titan_journey_acquisitions where user_id=current_setting('titan.journey_b')::uuid);
 assert not exists(select 1 from private.titan_journey_verified_days where user_id=current_setting('titan.journey_b')::uuid);
end $$;
rollback;

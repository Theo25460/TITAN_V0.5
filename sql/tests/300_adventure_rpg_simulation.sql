-- Four weeks played through the actual restricted RPCs, seven disciplines × low/high volume.
-- Every fixture is synthetic; no clock, external sensor, subscription or production connection is required.
begin;
do $$
declare sport text; volume integer; u uuid; n integer;
begin
 for sport in select unnest(array['walking','running','cycling','musculation','climbing','swimming','adaptive']) loop
 for volume in select unnest(array[15,180]) loop
  u:=gen_random_uuid();
  perform set_config('titan.sim_'||sport||'_'||volume,u::text,true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  set local session_replication_role=replica;
  insert into public.profiles(id,username,xp,credits,is_suspended) values(u,'qa_rpg_'||sport||volume,100,10,false) on conflict(id) do update set xp=100,credits=10;
  insert into public.adventure_progress(user_id,world_id,chapter,route,timezone,started_at) values(u,'aube',9,'rhythm','UTC',now()-interval '30 days');
  insert into private.adventure_journeys(user_id,world_id,timezone,target,baseline_rpe,profile,started_at)
  values(u,'aube','UTC',case when volume=15 then 15 else 45 end,5,jsonb_build_object('days',24,'windowDays',28),now()-interval '30 days');
  for n in 1..28 loop
   if n%7<>0 then
    -- Same relative duration/intensity regardless sport; adaptive/manual has no sensor.
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
    values(u,sport,'cardio',volume,'min',0,now()-n*interval '1 day',now()-n*interval '1 day',
     jsonb_build_object('serverReward',true,'bio',jsonb_build_object('rpe',5),'effort',jsonb_build_object('minutes',volume,'effort_minutes',volume)));
   end if;
  end loop;
  set local session_replication_role=origin;
 end loop;
 end loop;
end $$;
set local role authenticated;
do $$
declare sport text; volume integer; u uuid; s jsonb; repeated jsonb; n integer;
begin
 for sport in select unnest(array['walking','running','cycling','musculation','climbing','swimming','adaptive']) loop
 for volume in select unnest(array[15,180]) loop
  u:=current_setting('titan.sim_'||sport||'_'||volume)::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  s:=public.titan_adventure_rpg_action_v1('aube','sync');
  assert (s->>'effort')::numeric=24*least(volume,90),sport||' volume='||volume||' unequal effort';
  assert (s->>'days')::integer=24,'rest does not erase days';
  repeated:=public.titan_adventure_rpg_action_v1('aube','sync'); assert repeated=s,'same receipts imported twice';
  for n in 1..18 loop s:=public.titan_adventure_rpg_action_v1('aube','claim',n,case when n%6=2 then 0 else null end); end loop;
  assert jsonb_array_length(s->'rewards')=18,sport||' cannot complete equal effort path';
  repeated:=public.titan_adventure_rpg_action_v1('aube','claim',18); assert repeated=s,'repeated boss rewarded twice';
 end loop;
 end loop;
end $$;
reset role;
do $$begin
 assert not exists(select 1 from public.profiles where username like 'qa_rpg_%' and (xp<>100 or credits<>10)),'RPG changed economy';
end $$;
rollback;

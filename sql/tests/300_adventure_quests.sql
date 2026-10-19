-- Native RPC, synthetic owners, full rollback. No live account or provider.
begin;
set local plpgsql.check_asserts = on;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  perform set_config('titan.quest_owner',a::text,true);
  perform set_config('titan.quest_other',b::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.quest_owner'),'role','authenticated')::text,true);
do $$
declare s jsonb; q jsonb; denied boolean:=false;
begin
  s:=public.titan_adventure_snapshot();
  assert (s->>'version')::int>=3,'quests require snapshot version3 or later';
  assert not exists(select 1 from jsonb_array_elements(s->'campaigns') c where c->>'tier'<>'free'),'four regions free';
  s:=public.titan_adventure_action('start','forge','rhythm',null,0,null,'Europe/Paris');
  q:=public.titan_adventure_quests('forge');
  assert q#>>'{profile,daysTarget}'='1' and q#>>'{profile,effortTarget}'='15','gentle default';
  assert jsonb_array_length(q->'items')=3,'three optional quests';
  begin perform public.titan_adventure_action('claim','forge','rhythm',null,2,1,'Europe/Paris');
  exception when others then denied:=sqlerrm='QUEST_INCOMPLETE'; end;
  assert denied and jsonb_array_length(public.titan_adventure_snapshot()->'quest_rewards')=0,'failed claim grants nothing';
  assert not has_table_privilege('authenticated','public.adventure_quest_rewards','INSERT,UPDATE,DELETE'),'no direct reward writes';
  assert not has_function_privilege('anon','public.titan_adventure_quests(text)','EXECUTE'),'no anonymous personal quests';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Prior history covers15 distinct local days; volume capped90/day => target45.
insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
select current_setting('titan.quest_owner')::uuid,
  case when i%2=0 then 'swimming' else 'yoga' end,'training',120,'min',
  now()-make_interval(days=>i),'{"serverReward":true,"duration":120}',now()-make_interval(days=>i)
from generate_series(1,15) i;
-- Current proof: a native validated sport source, note quest is optional.
insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
values(current_setting('titan.quest_owner')::uuid,'swimming','training',30,'min',now(),
  '{"serverReward":true,"duration":30}',clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.quest_owner'),'role','authenticated')::text,true);
do $$
declare s jsonb; q jsonb; xp0 integer; coins0 integer; denied boolean:=false;
begin
  assert public.titan_adventure_quests('forge')#>>'{profile,daysTarget}'='1','history imported after departure does not move targets';
  select xp,credits into xp0,coins0 from public.profiles where id=auth.uid();
  s:=public.titan_adventure_action('claim','forge','rhythm',null,2,1,'Europe/Paris');
  assert jsonb_array_length(s->'quest_rewards')=2,'days and effort souvenirs confirmed, missing annotation never blocks';
  assert (select chapter=2 from public.adventure_progress where user_id=auth.uid() and world_id='forge'),'one chapter advanced';
  assert (s->>'xp')::int=xp0 and (s->>'credits')::int=coins0,'souvenirs mint no money or XP';
  q:=public.titan_adventure_quests('forge');
  assert q#>>'{profile,daysTarget}'='3' and q#>>'{profile,effortTarget}'='45','new chapter freezes bounded experienced profile';
  begin perform public.titan_adventure_action('claim','forge','rhythm',null,2,1,'Europe/Paris');
  exception when others then denied:=sqlerrm='ADVENTURE_CONFLICT'; end;
  assert denied and (select count(*)=2 from public.adventure_quest_rewards),'stale retry cannot duplicate souvenirs';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Moderation changes evidence but cannot rewrite already frozen targets or rewards.
update public.training_logs set archived_at=now() where user_id=current_setting('titan.quest_owner')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.quest_owner'),'role','authenticated')::text,true);
do $$ begin
  assert public.titan_adventure_quests('forge')#>>'{profile,daysTarget}'='3','frozen after history removal';
  assert jsonb_array_length(public.titan_adventure_snapshot()->'quest_rewards')=2,'confirmed souvenirs survive archive';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.quest_other'),'role','authenticated')::text,true);
  assert (select count(*)=0 from public.adventure_quest_rewards),'RLS hides other souvenirs';
  assert public.titan_adventure_quests('forge') is null,'other owner has no quests';
  assert jsonb_array_length(public.titan_adventure_snapshot()->'quest_rewards')=0,'snapshot owner isolated';
end $$;
reset role;
rollback;

-- Pure profile contract with canonical server fixtures: multisport parity, median, exclusions and timezone.
begin;
do $$
declare a uuid:=gen_random_uuid(); q jsonb; other jsonb; t timestamptz:=now();
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}');
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
  select a,'swimming','training',40,'min',t-make_interval(days=>i),
    '{"serverReward":true,"duration":40}',t-make_interval(days=>i) from generate_series(1,5) i;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  q:=private.titan_adventure_quest_profile(t,'UTC');
  assert q->>'days'='5' and q->>'daysTarget'='2' and q->>'effortTarget'='20','five days and median40 =>2days/20min';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.training_logs set sport='running' where user_id=a;
  -- A huge day cannot dominate the median or add more days.
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
  values(a,'yoga','training',120,'min',t-interval '1 day','{"serverReward":true,"duration":120}',t-interval '1 day');
  -- These rows must contribute neither days nor effort.
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at,archived_at,status,is_suspicious)
  values
    (a,'yoga','training',20,'min',t-interval '6 days','{"serverReward":false}',t-interval '6 days',null,'valid',false),
    (a,'yoga','training',20,'min',t-interval '7 days','{"serverReward":true,"historical":true}',t-interval '7 days',null,'valid',false),
    (a,'yoga','training',20,'min',t-interval '8 days','{"serverReward":true}',t-interval '8 days',t,'valid',false),
    (a,'yoga','training',20,'min',t-interval '9 days','{"serverReward":true}',t-interval '9 days',null,'flagged',true),
    (a,'yoga','training',20,'min',t-interval '10 days','{"serverReward":true}',t+interval '1 minute',null,'valid',false);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  other:=private.titan_adventure_quest_profile(t,'UTC');
  assert other=q,'sport-independent; duplicated volume and invalid/late sources cannot inflate targets';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  delete from public.training_logs where user_id=a;
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
  values(a,'yoga','training',20,'min',date_trunc('day',t)-interval '2 days'+interval '30 minutes','{"serverReward":true}',t-interval '1 day'),
    (a,'yoga','training',20,'min',date_trunc('day',t)-interval '2 days'+interval '23 hours 30 minutes','{"serverReward":true}',t-interval '1 day');
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert private.titan_adventure_quest_profile(t,'UTC')->>'days'='1','UTC daily grouping';
  assert private.titan_adventure_quest_profile(t,'America/Los_Angeles')->>'days'='2','campaign timezone daily grouping';
end $$;
rollback;

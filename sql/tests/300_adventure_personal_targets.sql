-- Synthetic owners and rollback only.
do $$ begin
  if current_database() not like 'titan_test_%' then raise exception 'REFUSED: disposable database required'; end if;
end $$;
begin;
set local plpgsql.check_asserts=on;
do $$
declare owner uuid:=gen_random_uuid(); s jsonb; c jsonb; frozen jsonb; rejected boolean:=false; xp0 integer; coins0 integer;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,raw_user_meta_data) values(owner,'{}');
  perform set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
  s:=public.titan_adventure_action('start','aube','rhythm',null,0,null,'UTC');
  assert s->>'version'='4','personal targets require snapshot4';
  -- Administrative time compression only; guards and claim remain native.
  update public.adventure_progress set chapter=9,started_at=now()-interval '4 days' where user_id=owner;
  s:=public.titan_adventure_snapshot();
  select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'='aube';
  assert c->>'target'='2' and c->>'effort_target'='30','newcomer guardian requires two returns and gentle effort';
  frozen:=c->'main_objective';
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
    values(owner,'swimming','training',120,'min',now()-interval '1 day','{"serverReward":true,"duration":120}',now());
  begin perform public.titan_adventure_action('claim','aube','rhythm',null,(s->>'revision')::int,9,'UTC');
  exception when others then rejected:=sqlerrm='QUEST_INCOMPLETE'; end;
  assert rejected and (select count(*)=0 from public.adventure_rewards where user_id=owner),'one huge day cannot win';
  update public.training_logs set val=15,details='{"serverReward":true,"duration":15}' where user_id=owner;
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
    values(owner,'yoga','training',14,'min',now(),'{"serverReward":true,"duration":14}',clock_timestamp());
  rejected:=false;
  begin perform public.titan_adventure_action('claim','aube','rhythm',null,(s->>'revision')::int,9,'UTC');
  exception when others then rejected:=sqlerrm='GUARDIAN_EFFORT_INCOMPLETE'; end;
  assert rejected,'two days still need the displayed30 minutes';
  update public.training_logs set val=15,details='{"serverReward":true,"duration":15}' where user_id=owner and sport='yoga';
  select xp,credits into xp0,coins0 from public.profiles where id=owner;
  execute 'set local role authenticated';
  s:=public.titan_adventure_action('claim','aube','rhythm',null,(s->>'revision')::int,9,'UTC');
  execute 'reset role';
  assert (select chapter=10 from public.adventure_progress where user_id=owner),'same displayed targets accepted';
  assert jsonb_array_length(s->'rewards')=1 and (s->>'xp')::int=xp0 and (s->>'credits')::int=coins0,'cosmetic reward only';
  -- A regular high-volume history is bounded; its removal cannot move the active target.
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
    select owner,'running','training',120,'min',now()-make_interval(days=>i),'{"serverReward":true,"duration":120}',now()-make_interval(days=>i)
    from generate_series(2,20) i;
  s:=public.titan_adventure_action('start','forge','rhythm',null,(s->>'revision')::int,null,'UTC');
  update public.adventure_progress set chapter=9 where user_id=owner and world_id='forge';
  s:=public.titan_adventure_snapshot();
  select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'='forge';
  assert c->>'target'='3' and c->>'effort_target'='135','high volume bounded3/135';
  frozen:=c->'main_objective';
  update public.training_logs set archived_at=now() where user_id=owner;
  s:=public.titan_adventure_snapshot();
  select value into c from jsonb_array_elements(s->'campaigns') where value->>'id'='forge';
  assert c->'main_objective'=frozen and c->>'target'='3' and c->>'effort_target'='135','history correction cannot move the goalposts';
  assert c#>>'{evidence,days}'='0' and jsonb_array_length(s->'rewards')=1,'evidence changes, acquired badge survives';
  raise notice 'Personal targets: newcomer2/30, regular3/135, frozen history, native refusal/claim and acquired badge verified.';
end $$;
rollback;

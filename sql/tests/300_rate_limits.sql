-- CHEAT16 / CHEAT17 / SEC10: rate limits on the sensitive write paths, enforced by BEFORE triggers.
-- Writes run with the JWT claims of a synthetic player (auth.uid() set); service-role writes are never throttled. Full rollback.
begin;
do $$
declare p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); targ uuid[]:=array[]::uuid[]; i int; ok boolean; st text;
  g uuid:=gen_random_uuid(); g2 uuid:=gen_random_uuid(); lg uuid;
begin
  insert into auth.users(id,raw_user_meta_data) select gen_random_uuid(),'{}' from generate_series(1,40);
  insert into auth.users(id,raw_user_meta_data) values(p,'{}'),(q,'{}');
  update public.profiles set username='qa_rl_p' where id=p;
  perform set_config('titan.rl_p',p::text,true); perform set_config('titan.rl_q',q::text,true);
  assert to_regclass('private.titan_rate_events') is not null,'the events table exists';
  assert not has_table_privilege('authenticated','private.titan_rate_events','select'),'events table closed to the API';
  assert not has_function_privilege('authenticated','private.titan_rate_limit(uuid,text,integer,interval)','execute'),'limiter closed to the API';

  -- service role (no uid) is never throttled, and the window slides: events older than one hour stop counting.
  select array_agg(id) into targ from (select id from auth.users where id not in (p,q) limit 40) t;
  perform set_config('request.jwt.claims',json_build_object('sub',q,'role','authenticated')::text,true);
  for i in 1..90 loop insert into public.shop_history(user_id,item_id,cost_credits) values (q,'qa_near_'||i,0); end loop;
  assert (select count(*) from public.titan_suspicious_actions where user_id=q and action_type='rate_limit.near' and reason='RATE_LIMIT_NEAR_PURCHASE' and severity='medium')=1,
    'one near-limit signal at 75 % (90th of 120), written by a request that still succeeded';
  insert into public.shop_history(user_id,item_id,cost_credits) values (q,'qa_near_91',0);
  assert (select count(*) from public.titan_suspicious_actions where user_id=q and action_type='rate_limit.near')=1,'the signal is not repeated';
  update private.titan_rate_events set at=now()-interval '2 hours' where user_id=q and bucket='purchase';
  for i in 1..120 loop insert into public.shop_history(user_id,item_id,cost_credits) values (q,'qa_slide_'||i,0); end loop;
  assert (select count(*) from private.titan_rate_events where user_id=q and bucket='purchase' and at>now()-interval '1 hour')=120,'a full new window after the old events aged out';

  -- guild membership: join/leave churn of the caller's own row is limited; disbanding a guild counts once per caller row.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.guilds(id,name,owner_id) values (g,'qa_rl_guild_a',targ[1]),(g2,'qa_rl_guild_b',targ[1]);
  for i in 1..12 loop insert into public.guild_members(guild_id,user_id,role) values (g,targ[i+3],'member'); end loop;
  perform set_config('request.jwt.claims',json_build_object('sub',targ[40-39+3],'role','authenticated')::text,true);
  delete from public.guild_members where guild_id=g;  -- deletes 12 rows, only one is the caller's own: not 12 events
  assert (select count(*) from private.titan_rate_events where user_id=targ[4] and bucket='guild_membership')=1,'a disbanding delete counts the caller own row once';
  perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
  for i in 1..5 loop
    insert into public.guild_members(guild_id,user_id,role) values (g2,p,'member');
    delete from public.guild_members where guild_id=g2 and user_id=p;
  end loop;
  ok:=false;
  begin insert into public.guild_members(guild_id,user_id,role) values (g2,p,'member');
  exception when others then ok:=(sqlerrm='RATE_LIMITED'); end;
  assert ok,'the 11th own join/leave action in an hour is refused';

  -- training edits: only real changes count, 60 per hour.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values (gen_random_uuid(),q,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}') returning id into lg;
  perform set_config('request.jwt.claims',json_build_object('sub',q,'role','authenticated')::text,true);
  delete from private.titan_rate_events where user_id=q;
  for i in 1..10 loop update public.training_logs set admin_note='same' where id=lg; end loop;  -- not a content change
  assert (select count(*) from private.titan_rate_events where user_id=q and bucket='training_change')=0,'an update that changes nothing counts nothing';
  for i in 1..60 loop update public.training_logs set val=5+i where id=lg; end loop;
  ok:=false;
  begin update public.training_logs set val=1 where id=lg; exception when others then ok:=(sqlerrm='RATE_LIMITED'); end;
  assert ok,'the 61st content change in an hour is refused';
  assert (select val from public.training_logs where id=lg)=65,'the refused edit changed nothing';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.training_logs set val=7 where id=lg;
  assert (select val from public.training_logs where id=lg)=7,'service writes are never throttled';

  -- purchases: ceiling 120.
  perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
  delete from private.titan_rate_events where user_id=p;
  for i in 1..120 loop insert into public.shop_history(user_id,item_id,cost_credits) values (p,'qa_item_'||i,0); end loop;
  ok:=false;
  begin insert into public.shop_history(user_id,item_id,cost_credits) values (p,'qa_item_x',0); exception when others then ok:=(sqlerrm='RATE_LIMITED'); end;
  assert ok,'the 121st purchase row in an hour is refused';

  -- an account deleting itself cascades its own memberships and rows: never throttled, and leaves no event behind.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for i in 1..12 loop
    insert into public.guild_members(guild_id,user_id,role) values (g2,targ[i+20],'member');
  end loop;
  perform set_config('request.jwt.claims',json_build_object('sub',targ[21],'role','authenticated')::text,true);
  delete from auth.users where id=targ[21];
  assert not exists(select 1 from auth.users where id=targ[21]) and not exists(select 1 from public.guild_members where user_id=targ[21]),'self-deletion cascaded';
  assert not exists(select 1 from private.titan_rate_events where user_id=targ[21]),'no event left for the deleted account';
end $$;
rollback;

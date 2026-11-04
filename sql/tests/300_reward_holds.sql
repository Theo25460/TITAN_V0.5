-- CHEAT15 / CHEAT14: rewards of high-risk sessions are held (bounded), released automatically, cancelled by an exclusion,
-- granted by a restoration. Never clawed back. Synthetic identities, real RPCs with API roles, full rollback.
begin;
set local plpgsql.check_asserts = on;
create function pg_temp.hold_status(l uuid) returns text language sql security definer as $f$ select status from private.titan_reward_holds where log_id = l $f$;
do $$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); i int;
begin
  assert to_regclass('private.titan_reward_holds') is not null,'hold table exists';
  assert to_regprocedure('private.titan_release_due_reward_holds()') is not null,'release job exists';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(p,'{}');
  update public.profiles set role='admin' where id=a;
  update public.profiles set xp=0,credits=100,level=1 where id=p;
  set local session_replication_role = replica;
  -- six steady 10 km/h hours: the player's own pace.
  for i in 1..6 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (p,'running','cardio',10,'km',10, now() - (10 + i) * interval '1 day','{"duration":60}');
  end loop;
  set local session_replication_role = origin;
  perform set_config('titan.rh_a',a::text,true); perform set_config('titan.rh_p',p::text,true);
end $$;

set local role authenticated;
do $$
declare r record; before_p record; after_p record; ev uuid:=gen_random_uuid(); stamp timestamptz:=now()-interval '2 hours';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.rh_p'),'role','authenticated')::text,true);
  select credits,xp,level into before_p from public.profiles where id=current_setting('titan.rh_p')::uuid;

  -- A session at the player's own pace is rewarded at once, as before.
  select * into r from public.titan_submit_training_session('running','cardio',10,'km',jsonb_build_object('duration',60,'client_event_id',gen_random_uuid()),now()-interval '3 hours');
  assert r.xp>0 and not coalesce(r.reward_held,false),'a normal session is rewarded immediately and not held';
  select credits,xp,level into after_p from public.profiles where id=current_setting('titan.rh_p')::uuid;
  assert (after_p.level,after_p.xp)>(before_p.level,before_p.xp),'profile credited immediately';
  perform set_config('titan.rh_normal_log',r.log_id,true);
  -- CHEAT04: a personal record (about 30 % above the usual pace, a short effort) is neither rejected nor held.
  select * into r from public.titan_submit_training_session('running','cardio',4.3,'km',jsonb_build_object('duration',20,'client_event_id',gen_random_uuid()),now()-interval '150 minutes');
  assert r.xp>0 and not coalesce(r.reward_held,false),'a session that approaches a personal record is accepted, rewarded and not held';
  select credits,xp,level into after_p from public.profiles where id=current_setting('titan.rh_p')::uuid;

  -- A speed jump (20 km/h against a 10 km/h median) scores 8: reward held, player informed, balance untouched.
  before_p:=after_p;
  select * into r from public.titan_submit_training_session('running','cardio',20,'km',jsonb_build_object('duration',60,'client_event_id',ev),stamp);
  assert r.reward_held,'high-risk session is held';
  assert r.xp=0 and r.credits=0 and r.held_xp>0 and r.release_at>now()+interval '23 hours' and r.release_at<=now()+interval '24 hours 1 minute','nothing granted now, held amounts and a bounded release time reported';
  select credits,xp,level into after_p from public.profiles where id=current_setting('titan.rh_p')::uuid;
  assert (after_p.credits,after_p.xp,after_p.level)=(before_p.credits,before_p.xp,before_p.level),'balance unchanged while held';
  perform set_config('titan.rh_log1',r.log_id,true);

  -- Replaying the same event (same content) returns the stored answer and creates no second hold.
  select * into r from public.titan_submit_training_session('running','cardio',20,'km',jsonb_build_object('duration',60,'client_event_id',ev),stamp);
  assert r.reward_held and r.log_id=current_setting('titan.rh_log1'),'replay returns the stored held answer';
end $$;
reset role;
do $$
begin
  assert (select count(*) from private.titan_reward_holds where status='held')=1,'one hold only';
  assert (select user_id from private.titan_reward_holds)=current_setting('titan.rh_p')::uuid,'owned by the player';
end $$;

-- API roles cannot touch the table or the job.
set local role authenticated;
do $$ declare ok boolean; begin
  ok:=false; begin perform 1 from private.titan_reward_holds; exception when insufficient_privilege then ok:=true; end; assert ok,'table closed';
  ok:=false; begin perform private.titan_release_due_reward_holds(); exception when insufficient_privilege then ok:=true; end; assert ok,'job closed';
end $$;

-- An administrator excludes the session: the hold is cancelled, nothing is granted.
do $$
declare before_p record; after_p record;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.rh_a'),'role','authenticated')::text,true);
  select credits,xp,level into before_p from public.profiles where id=current_setting('titan.rh_p')::uuid;
  perform public.titan_session_exclusion_v1(current_setting('titan.rh_log1')::uuid,true,'verification en cours');
  select credits,xp,level into after_p from public.profiles where id=current_setting('titan.rh_p')::uuid;
  assert (after_p.credits,after_p.xp,after_p.level)=(before_p.credits,before_p.xp,before_p.level),'exclusion grants and claws back nothing';
  assert pg_temp.hold_status(current_setting('titan.rh_log1')::uuid)='cancelled','hold cancelled by the exclusion';

  -- Restoring (a cleared session or an accepted appeal) grants the held reward once.
  perform public.titan_session_exclusion_v1(current_setting('titan.rh_log1')::uuid,false,'verification terminee');
  select credits,xp,level into after_p from public.profiles where id=current_setting('titan.rh_p')::uuid;
  assert (after_p.level,after_p.xp)>(before_p.level,before_p.xp) and after_p.credits>=before_p.credits,'restoration grants the held reward';
  assert pg_temp.hold_status(current_setting('titan.rh_log1')::uuid)='released','hold released';
  before_p:=after_p;
  perform public.titan_session_exclusion_v1(current_setting('titan.rh_log1')::uuid,true,'second look');
  perform public.titan_session_exclusion_v1(current_setting('titan.rh_log1')::uuid,false,'cleared again');
  select credits,xp,level into after_p from public.profiles where id=current_setting('titan.rh_p')::uuid;
  assert (after_p.credits,after_p.xp,after_p.level)=(before_p.credits,before_p.xp,before_p.level),'a released reward is never granted twice';
end $$;

-- Automatic release after the delay, once; never for an excluded session; never for a suspended account.
reset role;
do $$
declare p uuid:=current_setting('titan.rh_p')::uuid; r record; before_p record; after_p record; l2 text; l3 text;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
  set local role authenticated;
  select * into r from public.titan_submit_training_session('running','cardio',22,'km',jsonb_build_object('duration',60,'client_event_id',gen_random_uuid()),now()-interval '90 minutes');
  assert r.reward_held,'second high-risk session held'; l2:=r.log_id;
  select * into r from public.titan_submit_training_session('running','cardio',21,'km',jsonb_build_object('duration',60,'client_event_id',gen_random_uuid()),now()-interval '80 minutes');
  l3:=r.log_id;
  reset role;
  select credits,xp,level into before_p from public.profiles where id=p;
  assert private.titan_release_due_reward_holds()=0,'nothing is released before the delay';
  update private.titan_reward_holds set release_at=now()-interval '1 minute' where log_id in (l2::uuid,l3::uuid);
  -- A suspended account is not released by the job.
  set local session_replication_role = replica;
  update public.profiles set status='suspended' where id=p;
  set local session_replication_role = origin;
  assert private.titan_release_due_reward_holds()=0,'a suspended account keeps its holds';
  set local session_replication_role = replica;
  update public.profiles set status='active' where id=p;
  set local session_replication_role = origin;
  assert private.titan_release_due_reward_holds()>=1,'due holds are released';
  select credits,xp,level into after_p from public.profiles where id=p;
  assert (after_p.level,after_p.xp)>(before_p.level,before_p.xp),'the delayed reward is granted';
  assert not exists(select 1 from private.titan_reward_holds where status='held'),'no hold left';
  before_p:=after_p;
  assert private.titan_release_due_reward_holds()=0,'second run releases nothing';
  select credits,xp,level into after_p from public.profiles where id=p;
  assert (after_p.credits,after_p.xp,after_p.level)=(before_p.credits,before_p.xp,before_p.level),'no double grant';
end $$;
-- Review findings: a cancelled hold is never credited by the job path; a session that cannot be scored is held.
reset role;
do $$
declare p uuid:=current_setting('titan.rh_p')::uuid; a uuid:=current_setting('titan.rh_a')::uuid; l uuid:=gen_random_uuid(); before_p record; after_p record; r record; u uuid:=gen_random_uuid();
begin
  perform set_config('request.jwt.claims','',true);
  select credits,xp,level into before_p from public.profiles where id=p;
  set local session_replication_role = replica;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious)
    values (l,p,'running','cardio',10,'km',5,now()-interval '5 hours','{"duration":60}',true);
  insert into private.titan_reward_holds(log_id,user_id,xp,credits,release_at,status,settled_at)
    values (l,p,40,4,now()-interval '1 hour','cancelled',now());
  set local session_replication_role = origin;
  perform private.titan_reward_hold_settle(l,true,true);
  select credits,xp,level into after_p from public.profiles where id=p;
  assert (after_p.credits,after_p.xp,after_p.level)=(before_p.credits,before_p.xp,before_p.level),'the job path never credits a cancelled hold';
  assert (select status from private.titan_reward_holds where log_id=l)='cancelled','and leaves it cancelled';

  -- 101 newer sessions push a back-dated one out of the scored window: it is held out of caution.
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set xp=0,credits=0,level=1 where id=u;
  set local session_replication_role = replica;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
    select u,'yoga','mobility',30,'min',1, now()-interval '2 days'+g*interval '1 minute', now()-interval '3 days','{"duration":30}' from generate_series(1,101) g;
  set local session_replication_role = origin;
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  set local role authenticated;
  select * into r from public.titan_submit_training_session('yoga','mobility',30,'min',jsonb_build_object('duration',30,'client_event_id',gen_random_uuid()),now()-interval '20 days');
  assert r.reward_held,'a back-dated session outside the scored window is held';
  -- CHEAT11: a sport without any comparable record has no per-sport cap: a huge count is accepted by the real RPC and not held.
  select * into r from public.titan_submit_training_session('curling','precision',18500,'pts',jsonb_build_object('duration',40,'client_event_id',gen_random_uuid()),now()-interval '4 hours');
  assert r.log_id is not null and not coalesce(r.reward_held,false),'a sport with no reference record is accepted without an arbitrary cap';
  reset role;
end $$;
rollback;

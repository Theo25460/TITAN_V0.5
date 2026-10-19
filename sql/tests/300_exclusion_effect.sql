-- CHEAT13: an excluded session really leaves the competitive scoring (challenge effort days), and comes back when restored.
-- Synthetic identities, real exclusion RPC, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid();
  t0 timestamptz:=now()-interval '1 hour'; total numeric;
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(p,'{}');
  update public.profiles set role='admin' where id=a;
  set local session_replication_role = replica;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values
    (s1,p,'running','cardio',5,'km',10,t0,'{"duration":30,"effort":{"effort_minutes":30}}'),
    (s2,p,'cycling','cardio',20,'km',10,t0 - interval '2 hours','{"duration":45,"effort":{"effort_minutes":40}}');
  set local session_replication_role = origin;
  select coalesce(sum(minutes),0) into total from private.titan_effort_days(p, now()-interval '1 day', now()+interval '1 day', now()-interval '2 days', 90);
  assert total=70,'both sessions count before any exclusion, got '||total;

  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.titan_session_exclusion_v1(s2,true,'verification en cours');
  select coalesce(sum(minutes),0) into total from private.titan_effort_days(p, now()-interval '1 day', now()+interval '1 day', now()-interval '2 days', 90);
  assert total=30,'the excluded session no longer counts, got '||total;
  assert (select count(*) from public.training_logs where id=s2 and archived_at is null)=1,'but it is still there for its owner';

  perform public.titan_session_exclusion_v1(s2,false,'verification terminee');
  select coalesce(sum(minutes),0) into total from private.titan_effort_days(p, now()-interval '1 day', now()+interval '1 day', now()-interval '2 days', 90);
  assert total=70,'restored: it counts again, got '||total;
end $$;
rollback;

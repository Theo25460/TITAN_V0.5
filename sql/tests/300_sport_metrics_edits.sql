-- V11-09R: exercise the real authenticated edit RPC, not just local guest saves.
begin;
do $$
declare athlete uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); log_id uuid:=gen_random_uuid();
begin
 perform set_config('titan.metric_athlete',athlete::text,true);
 perform set_config('titan.metric_other',other_user::text,true);
 perform set_config('titan.metric_log',log_id::text,true);
 insert into auth.users(id,raw_user_meta_data) values(athlete,'{}'),(other_user,'{}');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.training_logs(id,user_id,sport,category,val,unit,date,xp,details)
 values(log_id,athlete,'muscu_builder','strength',800,'kg',now(),100,
  '{"val1":800,"duration":30,"extras":{"old_private_metric":"kept"},"serverReward":true}');
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.metric_athlete'),'role','authenticated')::text,true);
do $$
declare r jsonb; denied boolean:=false;
begin
 r:=public.titan_update_training_session(current_setting('titan.metric_log')::uuid,1,'{"extras":{"rest_seconds":90}}');
 assert (r#>>'{details,extras,rest_seconds}')::numeric=90, 'real account metric correction';
 assert r#>>'{details,extras,old_private_metric}'='kept', 'unknown historical value retained';
 assert (r->>'xp')::integer=100 and (r->>'revision')::integer=2, 'reward unchanged and revision incremented';
 begin perform public.titan_update_training_session(current_setting('titan.metric_log')::uuid,2,'{"extras":{"rest_seconds":-1}}');
 exception when others then denied:=sqlerrm='EXTRAS_INVALID'; end;
 assert denied, 'invalid numeric measure rejected'; denied:=false;
 begin perform public.titan_update_training_session(current_setting('titan.metric_log')::uuid,1,'{"extras":{"rest_seconds":60}}');
 exception when others then denied:=sqlerrm='SESSION_VERSION_CONFLICT'; end;
 assert denied, 'stale revision rejected'; denied:=false;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.metric_other'),'role','authenticated')::text,true);
 begin perform public.titan_update_training_session(current_setting('titan.metric_log')::uuid,2,'{"extras":{"rest_seconds":60}}');
 exception when others then denied:=sqlerrm='SESSION_NOT_FOUND'; end;
 assert denied, 'cross-account correction rejected';
end $$;
rollback;

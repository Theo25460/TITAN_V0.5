-- Durable quotas: synthetic API callers; no production data. Test on disposable migration bench only.
begin;
do $$
declare u uuid:=gen_random_uuid(); i integer; ev uuid:=gen_random_uuid(); stamp timestamptz:=now()-interval '1 hour';
 r record; replay record; first_response jsonb; before_state jsonb; after_state jsonb;
begin
 insert into auth.users(id,raw_user_meta_data) values(u,'{}');
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 for i in 1..12 loop
  execute 'set local role authenticated';
  select * into r from public.titan_submit_training_session('yoga','mobility',1,'min',
    jsonb_build_object('client_event_id',case when i=1 then ev else gen_random_uuid() end),stamp);
  execute 'reset role';
  if i=1 then first_response:=to_jsonb(r);end if;
  -- Emulate privileged cleanup; a user cannot erase the quota by removing the activity rows.
  delete from public.training_logs where user_id=u;
 end loop;
 select to_jsonb(p)||jsonb_build_object('receipts',(select count(*) from public.training_receipts where user_id=u),
   'usage',(select to_jsonb(w) from public.titan_weekly_reward_usage w where user_id=u)) into before_state from public.profiles p where id=u;
 execute 'set local role authenticated';
 begin
  perform public.titan_submit_training_session('yoga','mobility',1,'min',jsonb_build_object('client_event_id',gen_random_uuid()),stamp);
  raise exception 'ASSERT: thirteenth recreated session was accepted';
 exception when check_violation then assert sqlerrm='TRAINING_RATE_LIMIT',sqlerrm;end;
 select * into replay from public.titan_submit_training_session('yoga','mobility',1,'min',jsonb_build_object('client_event_id',ev),stamp);
 execute 'reset role';
 assert to_jsonb(replay)=first_response,'receipt retry must ignore exhausted quota and preserve response';
 select to_jsonb(p)||jsonb_build_object('receipts',(select count(*) from public.training_receipts where user_id=u),
   'usage',(select to_jsonb(w) from public.titan_weekly_reward_usage w where user_id=u)) into after_state from public.profiles p where id=u;
 assert before_state=after_state,'denial and replay must not change balances, receipt count or reward allowance';
 assert not exists(select 1 from public.training_logs where user_id=u),'refused request leaves no activity';
end $$;
rollback;

begin;
do $$
declare u uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); v_log_id uuid; i integer; r record; original jsonb;
 before_state jsonb; after_state jsonb;
begin
 insert into auth.users(id,raw_user_meta_data) values(u,'{}'),(b,'{}');
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select * into r from public.titan_submit_training_session('yoga','mobility',1,'min',jsonb_build_object('client_event_id',gen_random_uuid()),now());
 v_log_id:=r.log_id::uuid;
 for i in 1..120 loop perform public.titan_update_training_session(v_log_id,i,jsonb_build_object('note','edit '||i));end loop;
 execute 'reset role';
 select to_jsonb(l) into original from public.training_logs l where l.id=v_log_id;
 select jsonb_agg(to_jsonb(t) order by action) into before_state from private.titan_training_rate_state t where user_id=u;
 execute 'set local role authenticated';
 begin
  perform public.titan_update_training_session(v_log_id,121,'{"archived":true}');
  raise exception 'ASSERT: update budget not enforced';
 exception when check_violation then assert sqlerrm='TRAINING_RATE_LIMIT',sqlerrm;end;
 execute 'reset role';
 assert (select to_jsonb(l)=original from public.training_logs l where l.id=v_log_id),'edit/archival denial changes no activity or revision';
 assert (select count(*)=120 from public.training_revisions where user_id=u),'denied edit adds no revision snapshot';
 select jsonb_agg(to_jsonb(t) order by action) into after_state from private.titan_training_rate_state t where user_id=u;
 assert before_state=after_state,'denial cannot consume its own future allowance';
 assert exists(select 1 from public.titan_suspicious_actions where user_id=u and reason='TRAINING_MUTATION_BUDGET_REACHED'
  and payload='{"operation":"update","hour_count":120,"day_count":120,"hour_limit":120,"day_limit":600}'::jsonb),
  'persistent observation contains fixed counters only';
 -- Age the accepted calls, not the activities: editing an old/future date cannot reset a quota.
 update private.titan_training_rate_state set times=array_fill(clock_timestamp()-interval '25 hours',array[120]),
  updated_at=clock_timestamp()-interval '25 hours' where user_id=u and action='update';
 execute 'set local role authenticated';
 perform public.titan_update_training_session(v_log_id,121,'{"archived":true}');
 execute 'reset role';
 assert (select cardinality(times)=1 from private.titan_training_rate_state where user_id=u and action='update'),'expired timestamps pruned';
 -- Different owner unaffected by U's exhausted budget; closed state cannot be read/reset/called by API roles.
 perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.titan_submit_training_session('yoga','mobility',1,'min','{}',now());
 begin perform 1 from private.titan_training_rate_state;raise exception 'ASSERT: state exposed';exception when insufficient_privilege then null;end;
 begin delete from private.titan_training_rate_state;raise exception 'ASSERT: quota reset allowed';exception when insufficient_privilege then null;end;
 begin perform private.titan_purge_training_rate_state();raise exception 'ASSERT: purge exposed';exception when insufficient_privilege then null;end;
 execute 'reset role';
 assert not has_function_privilege('authenticated','private.titan_limit_training_mutation()','EXECUTE'),'trigger helper closed';
 assert not has_table_privilege('anon','private.titan_training_rate_state','SELECT'),'anonymous read closed';
 assert (select relrowsecurity from pg_class where oid='private.titan_training_rate_state'::regclass),'RLS defense in depth';
 -- Erasure is not charged as a mutation even with an exhausted edit budget.
 update private.titan_training_rate_state set times=array_fill(clock_timestamp(),array[600])
  where user_id=u and action='update';
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.delete_own_account();
 execute 'reset role';
 assert not exists(select 1 from auth.users where auth.users.id=u),'account erased';
 assert not exists(select 1 from private.titan_training_rate_state where user_id=u),'rate state erased by cascade';
end $$;
rollback;

-- Rolling day thresholds and category separation, without hundreds of synthetic API calls.
begin;
do $$
declare a text; u uuid; r record; hour_limit integer; day_limit integer; stamp timestamptz;
begin
 foreach a in array array['create','history','update'] loop
  u:=gen_random_uuid();insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  day_limit:=case a when 'create' then 40 when 'history' then 300 else 600 end;
  -- Privileged fixture seeds accepted server timestamps exactly at the daily allowance.
  insert into private.titan_training_rate_state(user_id,action,times)
   values(u,a,array_fill(clock_timestamp()-interval '2 hours',array[day_limit]));
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if a='update' then
   insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values(u,'yoga','mobility',1,'min',0,now(),'{}') returning id into r;
  end if;
  stamp:=case when a='history' then now()-interval '45 days' else now() end;
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
   if a='update' then perform public.titan_update_training_session(r.id,1,'{"note":"blocked"}');
   else perform public.titan_submit_training_session('yoga','mobility',1,'min','{}',stamp);end if;
   raise exception 'ASSERT: daily budget not enforced for %',a;
  exception when check_violation then assert sqlerrm='TRAINING_RATE_LIMIT',sqlerrm;end;
  execute 'reset role';
  assert (select cardinality(times)=day_limit from private.titan_training_rate_state where user_id=u and action=a),'daily refusal retains allowance';
  update private.titan_training_rate_state set times=array_fill(clock_timestamp()-interval '25 hours',array[day_limit]),
    updated_at=clock_timestamp()-interval '25 hours' where user_id=u;
  -- The service-only purge is executable; it cannot affect a live window or another recent state.
  execute 'set local role service_role';perform private.titan_purge_training_rate_state();execute 'reset role';
  assert not exists(select 1 from private.titan_training_rate_state where user_id=u),'idle state purged';
 end loop;
end $$;
rollback;

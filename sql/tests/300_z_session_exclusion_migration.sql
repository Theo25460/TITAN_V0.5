-- Replay the session-exclusion migration inside a caller transaction: no existing row changes, the training guard keeps
-- its single trigger, grants are right, a second run recreates nothing, and the caller's lock_timeout is untouched.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='37s';
create temporary table qa_se_transaction_marker(id integer);
insert into qa_se_transaction_marker values(1);
do $$
declare u uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set credits=410,xp=33,level=2 where id=u;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,is_suspicious) values (u,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}',true);
end $$;
create temporary table qa_se_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'log',to_jsonb(l) from public.training_logs l
  union all select 'audit',to_jsonb(a) from public.titan_admin_audit a;
\ir ../../supabase/migrations/20261019210000_session_exclusion.sql
\ir ../../supabase/migrations/20261019210000_session_exclusion.sql
do $$ begin
  assert current_setting('lock_timeout')='37s','caller lock timeout restored';
  assert (select count(*) from qa_se_transaction_marker)=1,'caller transaction preserved';
  assert not exists((select kind,row from qa_se_rows_before) except
    (select 'profile',to_jsonb(p) from public.profiles p union all select 'log',to_jsonb(l) from public.training_logs l
     union all select 'audit',to_jsonb(a) from public.titan_admin_audit a)),'no existing row changed';
  assert (select count(*) from pg_trigger where tgrelid='public.training_logs'::regclass and tgfoid='public.titan_guard_training_log()'::regprocedure)>=1,'the guard trigger is still attached';
  assert (select count(*) from pg_proc where proname in ('titan_session_exclusion_v1','titan_guard_training_log'))=2,'one of each function after two runs';
  assert not has_function_privilege('anon','public.titan_session_exclusion_v1(uuid,boolean,text)','execute'),'anon cannot execute';
  assert has_function_privilege('authenticated','public.titan_session_exclusion_v1(uuid,boolean,text)','execute'),'authenticated may call; the function checks the role';
end $$;
rollback;

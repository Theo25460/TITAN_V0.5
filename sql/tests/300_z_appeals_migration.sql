-- Replay the appeals migration inside a caller transaction: no existing row changes, correct grants,
-- idempotent on a second run, and the caller's lock_timeout is untouched.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='29s';
create temporary table qa_ap_transaction_marker(id integer);
insert into qa_ap_transaction_marker values(1);
do $$
declare u uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set credits=410,xp=33,level=2 where id=u;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values (u,'running','cardio',5,'km',10,now() - interval '1 day','{"duration":30}');
end $$;
create temporary table qa_ap_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'log',to_jsonb(l) from public.training_logs l;
\ir ../../supabase/migrations/20261019230000_appeals.sql
\ir ../../supabase/migrations/20261019230000_appeals.sql
do $$ begin
  assert current_setting('lock_timeout')='29s','caller lock timeout restored';
  assert (select count(*) from qa_ap_transaction_marker)=1,'caller transaction preserved';
  assert not exists((select kind,row from qa_ap_rows_before) except
    (select 'profile',to_jsonb(p) from public.profiles p union all select 'log',to_jsonb(l) from public.training_logs l)),'no existing row changed';
  assert (select count(*) from pg_proc where proname in ('titan_appeal_submit_v1','titan_my_appeals_v1','titan_my_review_state_v1','titan_appeal_list_v1','titan_appeal_decide_v1'))=5,'one of each function after two runs';
  assert not has_function_privilege('anon','public.titan_appeal_submit_v1(text,uuid,text)','execute') and not has_function_privilege('anon','public.titan_appeal_decide_v1(bigint,boolean,text)','execute'),'anon cannot execute';
  assert has_function_privilege('authenticated','public.titan_appeal_submit_v1(text,uuid,text)','execute'),'authenticated may call; each function checks the caller';
  assert not has_table_privilege('authenticated','private.titan_appeals','select'),'table closed to API roles';
end $$;
rollback;

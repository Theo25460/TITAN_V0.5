-- Replay the risk-analysis migration inside a caller transaction: no existing row changes, one function after two runs,
-- closed grants, the job scheduled once when pg_cron exists (and nothing scheduled when it does not), caller timeout untouched.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='41s';
create temporary table qa_ra_transaction_marker(id integer);
insert into qa_ra_transaction_marker values(1);
do $$
declare u uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set credits=410,xp=33,level=2 where id=u;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values (u,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}');
  perform public.titan_log_suspicious_action(u,'training_log.flagged','medium','QA_REPLAY','{}');
end $$;
create temporary table qa_ra_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'log',to_jsonb(l) from public.training_logs l
  union all select 'signal',to_jsonb(s) from public.titan_suspicious_actions s;
\ir ../../supabase/migrations/20261019220000_risk_analysis_job.sql
\ir ../../supabase/migrations/20261019220000_risk_analysis_job.sql
do $$ begin
  assert current_setting('lock_timeout')='41s','caller lock timeout restored';
  assert (select count(*) from qa_ra_transaction_marker)=1,'caller transaction preserved';
  assert not exists((select kind,row from qa_ra_rows_before) except
    (select 'profile',to_jsonb(p) from public.profiles p union all select 'log',to_jsonb(l) from public.training_logs l
     union all select 'signal',to_jsonb(s) from public.titan_suspicious_actions s)),'no existing row changed';
  assert (select count(*) from pg_proc where proname='titan_run_risk_analysis')=1,'one function after two runs';
  assert not has_function_privilege('authenticated','private.titan_run_risk_analysis(integer,integer)','execute'),'closed to the API';
  if exists (select 1 from pg_extension where extname='pg_cron') then
    assert (select count(*) from cron.job where jobname='titan_run_risk_analysis')=1,'scheduled exactly once';
  end if;
end $$;
rollback;

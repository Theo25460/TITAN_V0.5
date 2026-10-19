-- Replay the rate-limit migration inside a caller transaction: no existing row changes, one trigger of each kind after
-- two runs, closed grants, and the caller's lock_timeout is untouched.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='31s';
create temporary table qa_rl_transaction_marker(id integer);
insert into qa_rl_transaction_marker values(1);
do $$
declare u uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set credits=410,xp=33,level=2 where id=u;
  insert into public.shop_history(user_id,item_id,cost_credits) values (u,'qa_rl_replay',0);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values (u,'running','cardio',5,'km',10,now()-interval '1 day','{"duration":30}');
end $$;
create temporary table qa_rl_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'shop',to_jsonb(s) from public.shop_history s
  union all select 'log',to_jsonb(l) from public.training_logs l;
\ir ../../supabase/migrations/20261019200000_rate_limits.sql
\ir ../../supabase/migrations/20261019200000_rate_limits.sql
do $$ begin
  assert current_setting('lock_timeout')='31s','caller lock timeout restored';
  assert (select count(*) from qa_rl_transaction_marker)=1,'caller transaction preserved';
  assert not exists((select kind,row from qa_rl_rows_before) except
    (select 'profile',to_jsonb(p) from public.profiles p union all select 'shop',to_jsonb(s) from public.shop_history s
     union all select 'log',to_jsonb(l) from public.training_logs l)),'no existing row changed';
  assert (select count(*) from pg_trigger where tgname in ('titan_rate_limit_guild_members','titan_rate_limit_shop_history','titan_rate_limit_training_logs'))=3,'one trigger of each kind after two runs';
  assert (select count(*) from pg_proc where proname in ('titan_rate_limit','titan_rate_limit_trigger'))=2,'one of each function';
  assert not has_table_privilege('anon','private.titan_rate_events','select') and not has_table_privilege('authenticated','private.titan_rate_events','insert'),'events table closed';
  assert not has_function_privilege('authenticated','private.titan_rate_limit(uuid,text,integer,interval)','execute'),'limiter closed';
end $$;
rollback;

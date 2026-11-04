-- Reapplying the migration must preserve a live quota and the caller's transaction/settings.
begin;
set local lock_timeout='7s';
create temporary table qa_rate_before as select gen_random_uuid() as id;
insert into auth.users(id,raw_user_meta_data) select id,'{}'::jsonb from qa_rate_before;
insert into private.titan_training_rate_state(user_id,action,times)
 select id,'create',array[clock_timestamp()] from qa_rate_before;
create temporary table qa_rate_state_before as select to_jsonb(s) row from private.titan_training_rate_state s;
savepoint qa_rate_caller;
\ir ../../supabase/migrations/20261019122259_training_mutation_rate_limits.sql
do $$ begin
 assert current_setting('lock_timeout')='7s','caller lock timeout preserved';
 assert not exists((select row from qa_rate_state_before) except (select to_jsonb(s) from private.titan_training_rate_state s)),
  'migration reapplication preserves live quota';
 assert (select count(*)=1 from pg_trigger where tgrelid='public.training_logs'::regclass and tgname='titan_limit_training_mutation'),
  'exactly one trigger after reapplication';
end $$;
rollback to savepoint qa_rate_caller;
rollback;

-- The caller owns the transaction. A bundled migration must never commit it.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\', 'disposable database required';
end $$;
begin;
set local lock_timeout='2s';
create temporary table titan_qa_release_marker(id integer);
alter table public.profiles
  drop constraint profiles_credits_minimum_check,
  drop constraint profiles_xp_minimum_check,
  drop constraint profiles_level_minimum_check;
\ir ../../supabase/migrations/20261008113411_web_economy_bounds.sql
do $$ begin
  assert current_setting('lock_timeout')='2s', 'migration preserves caller lock timeout';
end $$;
rollback;
do $$ begin
  assert to_regclass('pg_temp.titan_qa_release_marker') is null, 'migration must not commit its caller transaction';
  assert (select count(*)=3 from pg_constraint where conrelid='public.profiles'::regclass
    and conname in('profiles_credits_minimum_check','profiles_xp_minimum_check','profiles_level_minimum_check')),
    'caller rollback restores the original constraints';
end $$;

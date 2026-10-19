-- Replay the economy audit migration inside a caller transaction: the prepared checks become valid,
-- no row changes, a second run changes nothing, and the caller's settings and transaction survive.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='19s';
create temporary table qa_audit_transaction_marker(id integer);
insert into qa_audit_transaction_marker values(1);
do $$
declare a uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}');
  update public.profiles set credits=321,xp=45,level=3 where id=a;
  insert into public.shop_history(user_id,item_id,cost_credits,reward_credits) values(a,'cos_frame_neon',100,0);
end $$;

-- Return to the state of a database that only has the prepared, unvalidated checks.
alter table public.shop_history drop constraint if exists shop_history_amounts_nonnegative_check;
alter table public.profiles drop constraint profiles_credits_minimum_check,
  add constraint profiles_credits_minimum_check check (credits >= 0) not valid;
alter table public.profiles drop constraint profiles_xp_minimum_check,
  add constraint profiles_xp_minimum_check check (xp >= 0) not valid;
alter table public.profiles drop constraint profiles_level_minimum_check,
  add constraint profiles_level_minimum_check check (level >= 1) not valid;
do $$ begin
  assert (select count(*)=3 from pg_constraint where not convalidated and conrelid='public.profiles'::regclass
    and conname in ('profiles_credits_minimum_check','profiles_xp_minimum_check','profiles_level_minimum_check')),
    'precondition: the three economy checks are prepared but not validated';
end $$;
create temporary table qa_audit_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'shop',to_jsonb(h) from public.shop_history h;
create temporary table qa_audit_acl_before as
  select oid,proacl from pg_proc where oid in ('public.titan_purchase_shop_item(text)'::regprocedure,
    'public.titan_submit_training_session(text,text,numeric,text,jsonb,timestamptz)'::regprocedure);

\ir ../../supabase/migrations/20261019090000_economy_audit_journal.sql
create temporary table qa_audit_objects_first as
  select oid from pg_constraint where conname in ('profiles_credits_minimum_check','profiles_xp_minimum_check',
    'profiles_level_minimum_check','shop_history_amounts_nonnegative_check')
  union all select oid from pg_trigger where tgname in ('titan_journal_profile_change','titan_economy_journal_row_guard','titan_economy_journal_truncate_guard');
\ir ../../supabase/migrations/20261019090000_economy_audit_journal.sql

do $$ begin
  assert current_setting('lock_timeout')='19s','caller lock timeout restored';
  assert (select count(*) from qa_audit_transaction_marker)=1,'caller transaction preserved';
  assert not exists(select 1 from pg_constraint where not convalidated),'every check is validated, none left unvalidated';
  assert (select count(*)=1 from pg_constraint where conname='shop_history_amounts_nonnegative_check' and convalidated),
    'negative purchase amounts are now refused';
  assert not exists(
    (select kind,row from qa_audit_rows_before)
    except (select 'profile',to_jsonb(p) from public.profiles p union all select 'shop',to_jsonb(h) from public.shop_history h)),
    'profiles and purchases are unchanged';
  assert not exists((select oid from qa_audit_objects_first) except
    (select oid from pg_constraint union all select oid from pg_trigger)),'a second application recreates nothing';
  assert not exists((select oid,proacl from qa_audit_acl_before) except
    (select oid,proacl from pg_proc)),'purchase and session RPC grants unchanged';
  assert (select count(*)=1 from pg_trigger where tgname='titan_journal_profile_change' and tgenabled='O')
    and (select count(*)=1 from pg_trigger where tgname='titan_economy_journal_row_guard' and tgenabled='O')
    and (select count(*)=1 from pg_trigger where tgname='titan_economy_journal_truncate_guard' and tgenabled='O'),
    'exactly one enabled trigger of each kind';
  assert has_function_privilege('authenticated','public.titan_economy_journal_v1(uuid,integer)','execute')
    and not has_function_privilege('anon','public.titan_economy_journal_v1(uuid,integer)','execute'),
    'the journal reader is for signed-in administrators only';
  assert not has_function_privilege('authenticated','private.titan_journal_profile_change()','execute')
    and not has_function_privilege('authenticated','private.titan_economy_journal_guard()','execute'),
    'trigger functions are not callable';
  begin insert into public.shop_history(user_id,item_id,cost_credits,reward_credits)
    select id,'cos_frame_neon',-1,0 from public.profiles limit 1;
    assert false,'a negative cost is refused';
  exception when check_violation then null; end;
end $$;
rollback;

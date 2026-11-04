-- Replay the purchase/moderation migration inside a caller transaction: no row changes, one index, the
-- guard keeps its trigger, grants and search_path, and a second run recreates nothing.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='21s';
create temporary table qa_purchase_transaction_marker(id integer);
insert into qa_purchase_transaction_marker values(1);
do $$
declare a uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}');
  update public.profiles set credits=640,xp=12,level=2 where id=a;
  insert into public.shop_history(user_id,item_id,cost_credits,reward_credits,economy_meta)
    values (a,'cos_frame_neon',50,0,'{}'),(a,'legacy_boost',10,0,'{}'),(a,'legacy_boost',10,0,'{}');
end $$;
drop index if exists public.shop_history_cosmetic_once_idx;
create temporary table qa_purchase_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'shop',to_jsonb(h) from public.shop_history h;
create temporary table qa_purchase_guard_before as
  select oid,proacl,prosecdef from pg_proc where oid='public.titan_guard_profile_progression()'::regprocedure
  union all select oid,proacl,prosecdef from pg_proc where oid='public.titan_admin_update_profile_v1(uuid,jsonb,text)'::regprocedure;

\ir ../../supabase/migrations/20261019120000_purchase_integrity_admin_moderation.sql
create temporary table qa_purchase_index_first as select indexrelid::oid from pg_index where indexrelid='public.shop_history_cosmetic_once_idx'::regclass;
\ir ../../supabase/migrations/20261019120000_purchase_integrity_admin_moderation.sql

do $$ begin
  assert current_setting('lock_timeout')='21s','caller lock timeout restored';
  assert (select count(*) from qa_purchase_transaction_marker)=1,'caller transaction preserved';
  assert not exists((select kind,row from qa_purchase_rows_before) except
    (select 'profile',to_jsonb(p) from public.profiles p union all select 'shop',to_jsonb(h) from public.shop_history h)),
    'profiles and purchases are unchanged, legacy duplicates included';
  assert (select count(*)=1 from pg_indexes where indexname='shop_history_cosmetic_once_idx'),'exactly one unique index';
  assert (select indexrelid from pg_index where indexrelid='public.shop_history_cosmetic_once_idx'::regclass)
    =(select indexrelid from qa_purchase_index_first),'a second application recreates nothing';
  assert not exists((select oid,proacl,prosecdef from qa_purchase_guard_before) except
    (select oid,proacl,prosecdef from pg_proc)),'guard and admin wrapper keep their grants and definer/invoker mode';
  assert (select proconfig from pg_proc where oid='public.titan_guard_profile_progression()'::regprocedure)=array['search_path=public, pg_temp'],
    'the guard pins its search_path';
  assert (select not prosecdef from pg_proc where oid='public.titan_admin_update_profile_v1(uuid,jsonb,text)'::regprocedure),
    'the public admin wrapper stays an invoker function';
  assert (select count(*)=1 from pg_trigger where tgrelid='public.profiles'::regclass
    and tgfoid='public.titan_guard_profile_progression()'::regprocedure and tgenabled='O'),'the guard is still one enabled trigger';
  assert pg_get_functiondef('public.titan_guard_profile_progression()'::regprocedure) like '%titan.admin_profile_write%'
    and pg_get_functiondef('public.titan_guard_profile_progression()'::regprocedure) like '%PROFILE_CREDITS_JUMP%',
    'the admin exemption is present and the progression checks remain';
end $$;
rollback;

-- Reapply the account deletion migration in a caller transaction: no row changes, same grants,
-- and a second application changes nothing.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='17s';
create temporary table qa_deletion_transaction_marker(id integer);
insert into qa_deletion_transaction_marker values(1);
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); g uuid;
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  insert into public.guilds(name,owner_id,code) values('QA migration guild',a,'QAMIG1') returning id into g;
  update public.profiles set guild_id=g where id in (a,b);
  insert into public.admin_messages(receiver_id,content) values(b,'QA migration message');
  insert into public.titan_admins(user_id,role,created_by) values(b,'moderator',a);
end $$;
create temporary table qa_deletion_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'guild',to_jsonb(g) from public.guilds g
  union all select 'admin_message',to_jsonb(m) from public.admin_messages m
  union all select 'admin',to_jsonb(t) from public.titan_admins t;
create temporary table qa_deletion_acl_before as
  select proacl,proconfig from pg_proc where oid='public.delete_own_account()'::regprocedure;
\ir ../../supabase/migrations/20261011061707_account_deletion_integrity.sql
create temporary table qa_deletion_objects_first as
  select oid from pg_constraint where conname in ('admin_messages_receiver_id_fkey','titan_admins_created_by_fkey','profiles_guild_id_fkey')
  union all select oid from pg_trigger where tgname='titan_guild_handover_before_account_delete';
\ir ../../supabase/migrations/20261011061707_account_deletion_integrity.sql
do $$ begin
  assert current_setting('lock_timeout')='17s','caller lock timeout restored';
  assert (select count(*) from qa_deletion_transaction_marker)=1,'caller transaction preserved';
  assert not exists(
    (select kind,row from qa_deletion_rows_before)
    except (select 'profile',to_jsonb(p) from public.profiles p
      union all select 'guild',to_jsonb(g) from public.guilds g
      union all select 'admin_message',to_jsonb(m) from public.admin_messages m
      union all select 'admin',to_jsonb(t) from public.titan_admins t)),
    'profiles, guilds, admin messages and admins are unchanged';
  assert not exists((select oid from qa_deletion_objects_first) except
    (select oid from pg_constraint where conname in ('admin_messages_receiver_id_fkey','titan_admins_created_by_fkey','profiles_guild_id_fkey')
     union all select oid from pg_trigger where tgname='titan_guild_handover_before_account_delete')),
    'a second application recreates nothing';
  assert (select (proacl,proconfig) from pg_proc where oid='public.delete_own_account()'::regprocedure)
    =(select (proacl,proconfig) from qa_deletion_acl_before),'deletion RPC and its grants unchanged';
  assert not has_function_privilege('authenticated','private.titan_guild_handover_before_account_delete()','execute')
    and not has_function_privilege('anon','private.titan_guild_handover_before_account_delete()','execute'),
    'the hand-over runs only as a trigger';
  assert (select count(*)=1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='titan_guild_handover_before_account_delete' and tgenabled='O'),'one enabled hand-over trigger';
  assert (select string_agg(conname||'='||confdeltype::text||convalidated::text,',' order by conname) from pg_constraint
    where conname in ('admin_messages_receiver_id_fkey','titan_admins_created_by_fkey','profiles_guild_id_fkey'))
    ='admin_messages_receiver_id_fkey=ctrue,profiles_guild_id_fkey=atrue,titan_admins_created_by_fkey=ntrue',
    'admin messages cascade, attribution is released, guild references keep their rule';
end $$;
rollback;

-- Replay the moderation migration inside a caller transaction: no existing row changes, decisions keep
-- their history, one trigger of each kind, correct grants, and a second run recreates nothing.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\','disposable database required';
end $$;
begin;
set local lock_timeout='23s';
create temporary table qa_mod_transaction_marker(id integer);
insert into qa_mod_transaction_marker values(1);
do $$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(u,'{}');
  update public.profiles set credits=410,xp=33,level=2 where id=u;
  perform public.titan_log_suspicious_action(u,'training_log.flagged','medium','QA_REPLAY','{}');
  insert into private.titan_moderation_decisions(user_id,admin_id,decision,reason) values (u,a,'watch','QA historique');
end $$;
create temporary table qa_mod_rows_before as
  select 'profile' kind,to_jsonb(p) row from public.profiles p
  union all select 'signal',to_jsonb(s) from public.titan_suspicious_actions s
  union all select 'decision',to_jsonb(d) from private.titan_moderation_decisions d;
\ir ../../supabase/migrations/20261019150000_moderation_queue.sql
create temporary table qa_mod_objects_first as
  select oid from pg_trigger where tgname in ('titan_moderation_decisions_row_guard','titan_moderation_decisions_truncate_guard')
  union all select oid from pg_proc where proname like 'titan_moderation_%';
\ir ../../supabase/migrations/20261019150000_moderation_queue.sql
do $$ declare f text; begin
  assert current_setting('lock_timeout')='23s','caller lock timeout restored';
  assert (select count(*) from qa_mod_transaction_marker)=1,'caller transaction preserved';
  assert not exists((select kind,row from qa_mod_rows_before) except
    (select 'profile',to_jsonb(p) from public.profiles p union all select 'signal',to_jsonb(s) from public.titan_suspicious_actions s
     union all select 'decision',to_jsonb(d) from private.titan_moderation_decisions d)),
    'profiles, signals and recorded decisions are unchanged';
  assert not exists((select oid from qa_mod_objects_first) except
    (select oid from pg_trigger union all select oid from pg_proc)),'a second application recreates nothing';
  assert (select count(*)=1 from pg_trigger where tgname='titan_moderation_decisions_row_guard' and tgenabled='O')
    and (select count(*)=1 from pg_trigger where tgname='titan_moderation_decisions_truncate_guard' and tgenabled='O'),
    'exactly one enabled guard of each kind';
  foreach f in array array['public.titan_moderation_queue_v1(integer)','public.titan_moderation_case_v1(uuid)',
    'public.titan_moderation_decide_v1(uuid,text,text)','public.titan_moderation_revert_v1(bigint,text)'] loop
    assert has_function_privilege('authenticated',f,'execute') and not has_function_privilege('anon',f,'execute'),
      'signed-in administrators only: '||f;
  end loop;
  foreach f in array array['private.titan_moderation_signals(uuid)','private.titan_moderation_level(integer)','private.titan_moderation_weight(text)',
    'private.titan_moderation_require_admin()','private.titan_moderation_decisions_guard()'] loop
    assert not has_function_privilege('authenticated',f,'execute') and not has_function_privilege('anon',f,'execute'),
      'internal helper not callable: '||f;
  end loop;
  assert (select count(*)=1 from pg_indexes where indexname='titan_suspicious_actions_open_user_idx'),'one open-signal index';
  assert not has_table_privilege('authenticated','private.titan_moderation_decisions','select,insert,update,delete'),
    'decisions are invisible to API roles';
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname like 'titan_moderation_%' and p.prosecdef
    and not (p.proconfig @> array['search_path=""'])),'every definer function pins an empty search_path';
end $$;
rollback;

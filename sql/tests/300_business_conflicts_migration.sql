-- Disposable test: exact bodies, OIDs and ACLs survive, including a second run.
begin;
create temp table business_conflict_before as
select p.oid,pg_get_functiondef(p.oid) definition,p.proacl,p.proowner,p.proconfig,p.prosecdef
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in
('titan_save_profile_state','titan_update_training_session','titan_transition_social_challenge','titan_adventure_action','titan_mutate_analysis_view');
do $$ declare f record; begin
  for f in select * from business_conflict_before loop
    execute replace(f.definition,'''PT409''','''40001''');
  end loop;
end $$;
\ir ../../supabase/migrations/20261104085851_business_conflicts_no_transaction_retry.sql
\ir ../../supabase/migrations/20261104085851_business_conflicts_no_transaction_retry.sql
do $$ begin
 assert not exists(select 1 from business_conflict_before b join pg_proc p on p.oid=b.oid
 where pg_get_functiondef(p.oid) is distinct from b.definition or p.proacl is distinct from b.proacl
 or p.proowner<>b.proowner or p.proconfig is distinct from b.proconfig or p.prosecdef<>b.prosecdef),
 'migration changed something other than the conflict code';
end $$;
rollback;

-- A release caller must retain ownership of its transaction, including migration 24.
do $$ begin
  assert current_database() like 'titan\_test\_%' escape '\', 'disposable database required';
end $$;
begin;
select set_config('titan.qa_entitlement_outer_transaction', 'caller-kept', true);
create temporary table titan_qa_entitlement_transaction_marker(id integer);
\ir ../../supabase/migrations/20261020020000_entitlement_sources.sql
do $$ begin
  assert current_setting('titan.qa_entitlement_outer_transaction', true) is not distinct from 'caller-kept',
    'entitlement migration must not commit the caller transaction';
end $$;
rollback;
do $$ begin
  assert to_regclass('pg_temp.titan_qa_entitlement_transaction_marker') is null,
    'caller rollback must discard the entitlement transaction marker';
end $$;

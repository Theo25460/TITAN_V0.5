begin;
do $$ declare unsafe text; begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into unsafe
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosrc ~ 'errcode\s*=\s*''40001''';
  assert unsafe is null, 'Retryable business conflicts remain: ' || unsafe;
end $$;
rollback;

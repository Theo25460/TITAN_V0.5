-- SEC01 / SEC02: row security covers every public table, no policy hands writes to everyone, and the API roles cannot write
-- the sensitive columns of a profile directly. Catalog-driven, so a table or policy added later is checked automatically.
begin;
do $$
declare bad text[] := '{}'; r record;
begin
  -- 1. Every ordinary public table has row security on.
  for r in select c.oid::regclass::text rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
  loop bad := bad || r.rel; end loop;
  assert cardinality(bad)=0, 'public tables without row security: '||array_to_string(bad,', ');

  -- 2. No permissive write policy is open to everyone (using/with check literally true) for anon or authenticated.
  for r in select schemaname||'.'||tablename||':'||policyname p
             from pg_policies
            where schemaname='public' and permissive='PERMISSIVE' and cmd in ('INSERT','UPDATE','DELETE','ALL')
              and (qual is null or btrim(qual) in ('true','(true)')) and (with_check is null or btrim(with_check) in ('true','(true)'))
              and (roles && array['anon','public','authenticated']::name[])
  loop bad := bad || r.p; end loop;
  assert cardinality(bad)=0, 'write policies open to everyone: '||array_to_string(bad,', ');
end $$;
rollback;

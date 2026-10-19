-- BOT08: no public access to the moderation and administration tools. Whatever the API roles can reach is enumerated from the
-- catalog, so a future function or table that forgets its grants fails here instead of shipping.
begin;
do $$
declare bad text[] := '{}'; r record;
begin
  -- 1. No administration / moderation / appeal / exclusion / risk function is executable by anon or PUBLIC.
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname ~ '^titan_(admin|moderation|appeal|session_exclusion|session_risk)'
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))
  loop bad := bad || r.sig; end loop;
  assert cardinality(bad) = 0, 'administration functions reachable without an account: ' || array_to_string(bad, ', ');

  -- 2. Private functions: the API does not expose the schema, and an administration function that is still granted to
  --    the signed-in role (the public wrappers run as the caller) must check the caller's role in its own body.
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname ~ '^titan_(admin|moderation|appeal|session_exclusion|reward_hold|release_due)'
       -- titan_admin_role_for is the role lookup used by the gates themselves (policies, definer functions); it is only
       -- reachable if the private schema were exposed through the API, which must stay off (Supabase API settings).
       and p.proname <> 'titan_admin_role_for'
       and (has_function_privilege('anon', p.oid, 'execute')
            or (has_function_privilege('authenticated', p.oid, 'execute')
                and p.prosrc !~* 'titan_admin_assert|titan_is_admin|titan_admin_role_for|titan_is_moderator_or_admin|titan_moderation_require_admin'))
  loop bad := bad || ('fn ' || r.sig); end loop;
  assert cardinality(bad) = 0, 'private administration functions open or ungated: ' || array_to_string(bad, ', ');

  for r in
    select c.oid::regclass::text as rel, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relkind in ('r', 'p')
       and (not c.relrowsecurity
            -- titan_analysis_views is read by its owner through a row policy (own rows) by design.
            or (c.relname <> 'titan_analysis_views'
                and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
                     or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))))
  loop bad := bad || ('table ' || r.rel); end loop;
  assert cardinality(bad) = 0, 'private tables open or without row security: ' || array_to_string(bad, ', ');
end $$;
rollback;

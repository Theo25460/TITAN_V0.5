begin;

-- TITAN OS - Hotfix for titan_public_release_rls_audit().
-- Fixes Supabase/Postgres error:
--   column reference "table_name" is ambiguous
-- Cause: RETURNS TABLE exposes table_name as a PL/pgSQL variable, so
-- information_schema.role_table_grants.table_name must be qualified.

create or replace function public.titan_public_release_rls_audit()
returns table (
  table_name text,
  table_exists boolean,
  rls_enabled boolean,
  rls_forced boolean,
  anon_privileges text[],
  authenticated_privileges text[],
  policies jsonb,
  recommendation text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'profiles',
    'training_logs',
    'activities',
    'messages',
    'friendships',
    'shop_history',
    'user_achievements',
    'inventory',
    'guilds',
    'guild_raid',
    'social_challenges',
    'titan_billing_events',
    'titan_cache_reconciliation_reports',
    'titan_suspicious_actions'
  ];
  v_table text;
begin
  foreach v_table in array v_tables loop
    return query
    with cls as (
      select c.oid, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind in ('r', 'p')
    ),
    grants as (
      select
        coalesce(array_agg(rtg.privilege_type::text order by rtg.privilege_type::text) filter (where rtg.grantee = 'anon'), array[]::text[]) as anon_privs,
        coalesce(array_agg(rtg.privilege_type::text order by rtg.privilege_type::text) filter (where rtg.grantee = 'authenticated'), array[]::text[]) as auth_privs
      from information_schema.role_table_grants rtg
      where rtg.table_schema = 'public'
        and rtg.table_name = v_table
    ),
    policy_rows as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'policy', pol.policyname,
        'command', pol.cmd,
        'roles', pol.roles,
        'using', pol.qual,
        'withCheck', pol.with_check
      ) order by pol.policyname), '[]'::jsonb) as policy_json
      from pg_policies pol
      where pol.schemaname = 'public'
        and pol.tablename = v_table
    )
    select
      v_table,
      exists(select 1 from cls),
      coalesce((select relrowsecurity from cls), false),
      coalesce((select relforcerowsecurity from cls), false),
      coalesce((select anon_privs from grants), array[]::text[]),
      coalesce((select auth_privs from grants), array[]::text[]),
      coalesce((select policy_json from policy_rows), '[]'::jsonb),
      case
        when not exists(select 1 from cls) then 'TABLE_MISSING_OR_UNUSED'
        when not coalesce((select relrowsecurity from cls), false) then 'ENABLE_RLS_BEFORE_PUBLIC_RELEASE'
        when array_length(coalesce((select anon_privs from grants), array[]::text[]), 1) is not null
             and (
               v_table <> 'messages'
               or coalesce((select anon_privs from grants), array[]::text[]) <> array['SELECT']::text[]
             ) then 'REVIEW_ANON_GRANTS'
        when coalesce((select policy_json from policy_rows), '[]'::jsonb) = '[]'::jsonb then 'NO_POLICIES_DEFINED'
        else 'OK_REVIEW_POLICIES'
      end;
  end loop;
end;
$$;

revoke all on function public.titan_public_release_rls_audit() from public;

commit;

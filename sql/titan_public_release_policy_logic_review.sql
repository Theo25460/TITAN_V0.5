-- TITAN OS - Policy logic review helper.
-- Read-only query. Run after grants are closed to inspect actual RLS policy logic.

with critical_tables(table_name) as (
  values
    ('profiles'),
    ('training_logs'),
    ('activities'),
    ('messages'),
    ('friendships'),
    ('shop_history'),
    ('user_achievements'),
    ('inventory'),
    ('guilds'),
    ('guild_raid'),
    ('social_challenges')
),
policies as (
  select
    ct.table_name,
    p.policyname,
    p.cmd,
    p.roles,
    coalesce(p.qual, '') as using_expression,
    coalesce(p.with_check, '') as with_check_expression
  from critical_tables ct
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = ct.table_name
)
select
  table_name,
  coalesce(policyname, 'NO_POLICY') as policyname,
  coalesce(cmd, 'NONE') as command,
  coalesce(roles, array[]::name[])::text[] as roles,
  using_expression,
  with_check_expression,
  case
    when policyname is null and table_name = 'activities' then 'unused_or_missing'
    when policyname is null then 'fix_required_no_policy'
    when roles && array['anon'::name, 'public'::name]
      and table_name <> 'messages' then 'review_public_role'
    when table_name = 'messages'
      and roles && array['anon'::name, 'public'::name]
      and cmd <> 'SELECT' then 'fix_required_anon_write'
    when cmd in ('INSERT', 'UPDATE', 'ALL')
      and with_check_expression = ''
      and table_name not in ('messages') then 'review_missing_with_check'
    when (using_expression = 'true' or with_check_expression = 'true')
      and table_name not in ('messages') then 'review_broad_true_policy'
    when table_name in ('profiles', 'training_logs', 'shop_history', 'user_achievements', 'inventory')
      and concat(using_expression, ' ', with_check_expression) not ilike '%auth.uid%'
      then 'review_missing_auth_uid'
    else 'ok_review'
  end as titan_policy_action
from policies
order by
  case
    when policyname is null and table_name <> 'activities' then 1
    when roles && array['anon'::name, 'public'::name] and table_name <> 'messages' then 2
    when table_name = 'messages' and roles && array['anon'::name, 'public'::name] and cmd <> 'SELECT' then 3
    when cmd in ('INSERT', 'UPDATE', 'ALL') and with_check_expression = '' and table_name not in ('messages') then 4
    when using_expression = 'true' or with_check_expression = 'true' then 5
    else 6
  end,
  table_name,
  policyname;

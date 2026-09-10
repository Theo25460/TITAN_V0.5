-- TITAN OS - RLS review helper after applying the public-release SQL set.
-- This script does not modify data. It only makes the audit easier to read.

select
  audit.table_name,
  audit.table_exists,
  audit.rls_enabled,
  audit.anon_privileges,
  audit.authenticated_privileges,
  jsonb_array_length(coalesce(audit.policies, '[]'::jsonb)) as policy_count,
  audit.recommendation,
  case
    when not audit.table_exists then 'unused_or_missing'
    when not audit.rls_enabled then 'fix_required_enable_rls'
    when array_length(audit.anon_privileges, 1) is not null
      and (
        audit.table_name <> 'messages'
        or audit.anon_privileges <> array['SELECT']::text[]
      ) then 'fix_required_anon_grant'
    when jsonb_array_length(coalesce(audit.policies, '[]'::jsonb)) = 0 then 'fix_required_no_policy'
    when audit.recommendation = 'OK_REVIEW_POLICIES' then 'manual_review_policy_logic'
    else 'review'
  end as titan_next_action
from public.titan_public_release_rls_audit() audit
where audit.table_name in (
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
  'social_challenges'
)
order by
  case
    when not audit.table_exists then 5
    when not audit.rls_enabled then 1
    when array_length(audit.anon_privileges, 1) is not null
      and (
        audit.table_name <> 'messages'
        or audit.anon_privileges <> array['SELECT']::text[]
      ) then 2
    when jsonb_array_length(coalesce(audit.policies, '[]'::jsonb)) = 0 then 3
    else 4
  end,
  audit.table_name;

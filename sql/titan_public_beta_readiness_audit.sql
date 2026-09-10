-- TITAN OS - Read-only beta readiness audit.
-- Run in Supabase SQL editor after taking a backup. This script does not mutate data.

with critical_tables(table_name, scope) as (
  values
    ('profiles', 'private_user'),
    ('training_logs', 'private_user'),
    ('activities', 'private_user_or_legacy'),
    ('messages', 'private_social'),
    ('friendships', 'private_social'),
    ('social_challenges', 'private_social'),
    ('guilds', 'private_social'),
    ('guild_raid', 'closed_until_review'),
    ('inventory', 'private_user'),
    ('shop_history', 'private_user'),
    ('user_achievements', 'private_user'),
    ('titan_suspicious_actions', 'admin_log'),
    ('titan_billing_events', 'server_log')
),
table_state as (
  select
    ct.table_name,
    ct.scope,
    c.oid,
    c.relrowsecurity,
    coalesce((
      select array_agg(distinct privilege_type::text order by privilege_type::text)
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = ct.table_name
        and g.grantee = 'anon'
    ), array[]::text[]) as anon_grants,
    coalesce((
      select count(*)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = ct.table_name
    ), 0) as policy_count
  from critical_tables ct
  left join pg_class c
    on c.relname = ct.table_name
   and c.relnamespace = 'public'::regnamespace
   and c.relkind in ('r', 'p')
)
select
  'table_security' as audit_area,
  table_name as object_name,
  case
    when oid is null and table_name = 'activities' then 'unused_or_missing'
    when oid is null then 'review_missing_table'
    when not relrowsecurity then 'fix_enable_rls'
    when array_length(anon_grants, 1) is not null then 'review_anon_grants'
    when policy_count = 0 then 'review_missing_policy'
    else 'ok_review'
  end as status,
  jsonb_build_object(
    'scope', scope,
    'rls_enabled', coalesce(relrowsecurity, false),
    'anon_grants', anon_grants,
    'policy_count', policy_count
  ) as details
from table_state

union all

select
  'server_authority' as audit_area,
  rpc_name as object_name,
  case when to_regprocedure(signature) is null then 'fix_missing_rpc' else 'ok_review' end as status,
  jsonb_build_object('signature', signature) as details
from (
  values
    ('titan_submit_training_session', 'public.titan_submit_training_session(text,text,numeric,text,jsonb,timestamp with time zone)'),
    ('titan_apply_progression_reward', 'public.titan_apply_progression_reward(uuid,integer,integer)'),
    ('titan_purchase_shop_item', 'public.titan_purchase_shop_item(text)'),
    ('titan_create_wager_challenge', 'public.titan_create_wager_challenge(uuid,text,integer)'),
    ('titan_submit_combat_victory', 'public.titan_submit_combat_victory(text,text,text,text,integer,numeric,integer,jsonb)'),
    ('titan_claim_achievement', 'public.titan_claim_achievement(text)'),
    ('titan_report_chat_message', 'public.titan_report_chat_message(text,text)'),
    ('titan_admin_hide_chat_message', 'public.titan_admin_hide_chat_message(text,text)'),
    ('export_own_data', 'public.export_own_data()'),
    ('delete_own_account', 'public.delete_own_account()')
) as rpc(rpc_name, signature)

union all

select
  'recommended_index' as audit_area,
  index_label as object_name,
  case
    when table_regclass is null then 'table_missing_or_unused'
    when exists (
      select 1
      from pg_indexes i
      where i.schemaname = 'public'
        and i.tablename = table_name
        and i.indexdef ilike index_pattern
    ) then 'ok_review'
    else 'review_missing_index'
  end as status,
  jsonb_build_object('table', table_name, 'pattern', index_pattern) as details
from (
  values
    ('training_logs_user_date', 'training_logs', to_regclass('public.training_logs'), '%(user_id, created_at%'),
    ('messages_created_at', 'messages', to_regclass('public.messages'), '%(created_at%'),
    ('messages_sender_id', 'messages', to_regclass('public.messages'), '%(sender_id%'),
    ('friendships_user_id', 'friendships', to_regclass('public.friendships'), '%(user_id%'),
    ('friendships_friend_id', 'friendships', to_regclass('public.friendships'), '%(friend_id%'),
    ('shop_history_user_date', 'shop_history', to_regclass('public.shop_history'), '%(user_id,%purchased_at%'),
    ('user_achievements_unique', 'user_achievements', to_regclass('public.user_achievements'), '%(user_id,%achievement_id%')
) as idx(index_label, table_name, table_regclass, index_pattern)

order by audit_area, status, object_name;

begin;

-- TITAN OS - Final public-release lockdown, applied on production 2026-05-18.
-- Goal:
-- 1. Every public table has RLS enabled.
-- 2. Anonymous access is read-only and limited to public catalogue/news data.
-- 3. Browser RPCs require an authenticated user.
-- 4. Internal trigger/helper RPCs are not callable directly from the API.

alter table if exists public.admin_messages enable row level security;
alter table if exists public.daily_quests enable row level security;
alter table if exists public.game_settings enable row level security;
alter table if exists public.sports_db enable row level security;
alter table if exists public.zones enable row level security;
alter table if exists public.titan_suspicious_actions enable row level security;

revoke all privileges on table public.admin_messages from anon, authenticated;
revoke all privileges on table public.daily_quests from anon, authenticated;
revoke all privileges on table public.game_settings from anon, authenticated;
revoke all privileges on table public.sports_db from anon, authenticated;
revoke all privileges on table public.zones from anon, authenticated;
revoke all privileges on table public.titan_suspicious_actions from anon, authenticated;
grant select on table public.titan_suspicious_actions to authenticated;

revoke all on table public.mobs from anon, authenticated;
revoke all on table public.bosses from anon, authenticated;
revoke all on table public.talents from anon, authenticated;
revoke all on table public.sports from anon, authenticated;
revoke all on table public.achievements_config from anon, authenticated;
revoke all on table public.global_config from anon, authenticated;
revoke all on table public.fun_stats from anon, authenticated;
revoke all on table public.shop_items from anon, authenticated;
revoke all on table public.news_updates from anon, authenticated;
revoke all on table public.weekly_quests from anon, authenticated;
revoke all on table public.items from anon, authenticated;
revoke all on table public.dynamic_quests from anon, authenticated;

grant select on table public.mobs to anon, authenticated;
grant select on table public.bosses to anon, authenticated;
grant select on table public.talents to anon, authenticated;
grant select on table public.sports to anon, authenticated;
grant select on table public.achievements_config to anon, authenticated;
grant select on table public.global_config to anon, authenticated;
grant select on table public.fun_stats to anon, authenticated;
grant select on table public.shop_items to anon, authenticated;
grant select on table public.news_updates to anon, authenticated;
grant select on table public.weekly_quests to anon, authenticated;
grant select on table public.items to anon, authenticated;
grant select on table public.dynamic_quests to anon, authenticated;

revoke all on table public.admin_logs from anon, authenticated;
revoke all on table public.admin_whitelist from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.campaign_state from anon, authenticated;
revoke all on table public.coupons from anon, authenticated;
revoke all on table public.friends from anon, authenticated;
revoke all on table public.reports from anon, authenticated;
revoke all on table public.system_news from anon, authenticated;
revoke all on table public.titan_admin_audit from anon, authenticated;
revoke all on table public.titan_admins from anon, authenticated;
revoke all on table public.titan_cache_reconciliation_reports from anon, authenticated;
revoke all on table public.titan_moderation_reports from anon, authenticated;
revoke all on table public.titan_user_blocks from anon, authenticated;
revoke all on table public.combat_logs from authenticated;
revoke all on table public.inventory from authenticated;
revoke all on table public.user_bestiary from authenticated;

grant select on table public.system_news to anon, authenticated;
grant select on table public.titan_admins to authenticated;
grant select on table public.titan_admin_audit to authenticated;
grant select on table public.titan_cache_reconciliation_reports to authenticated;
grant select, insert on table public.titan_moderation_reports to authenticated;
grant select on table public.combat_logs to authenticated;
grant select on table public.inventory to authenticated;
grant select on table public.user_bestiary to authenticated;

alter policy "Admin All" on public.achievements_config to authenticated;
alter policy "Admin All" on public.dynamic_quests to authenticated;
alter policy "Admin All" on public.fun_stats to authenticated;
alter policy "Admin All" on public.global_config to authenticated;
alter policy "Admin Manage Items" on public.items to authenticated;
alter policy "Admin Manage News" on public.system_news to authenticated;
alter policy "Admin Read Logs" on public.admin_logs to authenticated;
alter policy "news_updates_public_active" on public.news_updates to anon, authenticated using (active = true);

drop policy if exists "Insert Logs" on public.admin_logs;
drop policy if exists "System Insert Logs" on public.admin_logs;
drop policy if exists "Avatar Images are Public" on storage.objects;
drop policy if exists avatars_public_read on storage.objects;

revoke execute on function public.add_rewards(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.purchase_lootbox() from public, anon, authenticated;
revoke execute on function public.submit_activity(text, jsonb) from public, anon, authenticated;
revoke execute on function public.add_friend_by_code(text) from public, anon, authenticated;
revoke execute on function public.add_friend_by_id(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_friends_v2() from public, anon, authenticated;
revoke execute on function public.titan_apply_progression_reward(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.titan_log_suspicious_action(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.titan_social_rate_limit(uuid, text, interval, integer) from public, anon, authenticated;
revoke execute on function public.titan_generate_friend_code() from public, anon, authenticated;
revoke execute on function public.titan_export_rows(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.titan_delete_rows(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.titan_public_release_rls_audit() from public, anon, authenticated;
revoke execute on function public.titan_training_storage_health() from public, anon, authenticated;
revoke execute on function public.titan_table_has_column(text, text) from public, anon, authenticated;
revoke execute on function public.check_auth_user() from public, anon, authenticated;
revoke execute on function public.delete_inactive_users() from public, anon, authenticated;
revoke execute on function public.get_server_date() from public, anon, authenticated;
revoke execute on function public.handle_audit_log() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.titan_guard_friendship_delete() from public, anon, authenticated;
revoke execute on function public.titan_guard_friendship_insert() from public, anon, authenticated;
revoke execute on function public.titan_guard_message_insert() from public, anon, authenticated;
revoke execute on function public.titan_guard_profile_privileges() from public, anon, authenticated;
revoke execute on function public.titan_guard_profile_progression() from public, anon, authenticated;
revoke execute on function public.titan_guard_training_log() from public, anon, authenticated;
revoke execute on function public.titan_reject_suspended_user_action() from public, anon, authenticated;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
revoke execute on function public.export_own_data() from public, anon;
grant execute on function public.export_own_data() to authenticated;
revoke execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamp with time zone) from public, anon;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamp with time zone) to authenticated;
revoke execute on function public.titan_claim_achievement(text) from public, anon;
grant execute on function public.titan_claim_achievement(text) to authenticated;
revoke execute on function public.titan_purchase_shop_item(text) from public, anon;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;
revoke execute on function public.titan_create_wager_challenge(uuid, text, integer) from public, anon;
grant execute on function public.titan_create_wager_challenge(uuid, text, integer) to authenticated;
revoke execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) from public, anon;
grant execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) to authenticated;
revoke execute on function public.titan_find_profile_by_friend_code(text) from public, anon;
grant execute on function public.titan_find_profile_by_friend_code(text) to authenticated;
revoke execute on function public.titan_report_chat_message(text, text) from public, anon;
grant execute on function public.titan_report_chat_message(text, text) to authenticated;
revoke execute on function public.titan_block_user(uuid, text) from public, anon;
grant execute on function public.titan_block_user(uuid, text) to authenticated;
revoke execute on function public.titan_unblock_user(uuid) from public, anon;
grant execute on function public.titan_unblock_user(uuid) to authenticated;
revoke execute on function public.titan_list_my_friends() from public, anon;
grant execute on function public.titan_list_my_friends() to authenticated;
revoke execute on function public.titan_submit_cache_reconciliation(jsonb) from public, anon;
grant execute on function public.titan_submit_cache_reconciliation(jsonb) to authenticated;
revoke execute on function public.titan_assign_friend_code() from public, anon;
grant execute on function public.titan_assign_friend_code() to authenticated;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
revoke execute on function public.check_if_admin() from public, anon;
grant execute on function public.check_if_admin() to authenticated;
revoke execute on function public.titan_is_admin(uuid) from public, anon;
grant execute on function public.titan_is_admin(uuid) to authenticated;
revoke execute on function public.titan_admin_role(uuid) from public, anon;
grant execute on function public.titan_admin_role(uuid) to authenticated;

revoke execute on function public.titan_admin_allowed_content_tables() from public, anon;
grant execute on function public.titan_admin_allowed_content_tables() to authenticated;
revoke execute on function public.titan_admin_assert() from public, anon;
grant execute on function public.titan_admin_assert() to authenticated;
revoke execute on function public.titan_admin_audit_write(text, uuid, jsonb) from public, anon;
grant execute on function public.titan_admin_audit_write(text, uuid, jsonb) to authenticated;
revoke execute on function public.titan_admin_claim_first(text) from public, anon;
grant execute on function public.titan_admin_claim_first(text) to authenticated;
revoke execute on function public.titan_admin_content_catalog() from public, anon;
grant execute on function public.titan_admin_content_catalog() to authenticated;
revoke execute on function public.titan_admin_dashboard() from public, anon;
grant execute on function public.titan_admin_dashboard() to authenticated;
revoke execute on function public.titan_admin_delete_content(text, text) from public, anon;
grant execute on function public.titan_admin_delete_content(text, text) to authenticated;
revoke execute on function public.titan_admin_delete_message(text) from public, anon;
grant execute on function public.titan_admin_delete_message(text) to authenticated;
revoke execute on function public.titan_admin_hide_chat_message(text, text) from public, anon;
grant execute on function public.titan_admin_hide_chat_message(text, text) to authenticated;
revoke execute on function public.titan_admin_list_content(text, integer) from public, anon;
grant execute on function public.titan_admin_list_content(text, integer) to authenticated;
revoke execute on function public.titan_admin_list_messages(integer) from public, anon;
grant execute on function public.titan_admin_list_messages(integer) to authenticated;
revoke execute on function public.titan_admin_list_news(integer) from public, anon;
grant execute on function public.titan_admin_list_news(integer) to authenticated;
revoke execute on function public.titan_admin_list_profiles(text, integer, integer) from public, anon;
grant execute on function public.titan_admin_list_profiles(text, integer, integer) to authenticated;
revoke execute on function public.titan_admin_list_reports(text, integer) from public, anon;
grant execute on function public.titan_admin_list_reports(text, integer) to authenticated;
revoke execute on function public.titan_admin_publish_news(text, text, text, text, boolean) from public, anon;
grant execute on function public.titan_admin_publish_news(text, text, text, text, boolean) to authenticated;
revoke execute on function public.titan_admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.titan_admin_resolve_report(uuid, text, text) to authenticated;
revoke execute on function public.titan_admin_set_news_active(uuid, boolean) from public, anon;
grant execute on function public.titan_admin_set_news_active(uuid, boolean) to authenticated;
revoke execute on function public.titan_admin_update_profile(uuid, jsonb) from public, anon;
grant execute on function public.titan_admin_update_profile(uuid, jsonb) to authenticated;
revoke execute on function public.titan_admin_upsert_content(text, jsonb) from public, anon;
grant execute on function public.titan_admin_upsert_content(text, jsonb) to authenticated;

alter function public.add_friend_by_code(text) set search_path = public, pg_temp;
alter function public.add_friend_by_id(uuid) set search_path = public, pg_temp;
alter function public.add_rewards(uuid, integer, integer) set search_path = public, pg_temp;
alter function public.check_auth_user() set search_path = public, pg_temp;
alter function public.delete_inactive_users() set search_path = public, pg_temp;
alter function public.get_my_friends_v2() set search_path = public, pg_temp;
alter function public.get_server_date() set search_path = public, pg_temp;
alter function public.handle_audit_log() set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_super_admin() set search_path = public, pg_temp;
alter function public.purchase_lootbox() set search_path = public, pg_temp;
alter function public.titan_admin_json_value_sql(jsonb, text, text) set search_path = public, pg_temp;
alter function public.titan_cache_safe_int(text, integer) set search_path = public, pg_temp;
alter function public.titan_cache_safe_timestamptz(text) set search_path = public, pg_temp;
alter function public.titan_jsonb_array_length_safe(jsonb) set search_path = public, pg_temp;
alter function public.titan_jsonb_numeric(jsonb, text) set search_path = public, pg_temp;
alter function public.titan_jsonb_object_size_safe(jsonb) set search_path = public, pg_temp;
alter function public.titan_level_requirement(integer) set search_path = public, pg_temp;
alter function public.titan_numeric_from_json(jsonb, text) set search_path = public, pg_temp;

commit;

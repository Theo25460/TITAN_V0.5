begin;

-- TITAN OS v66 - Explicitly close economy/social RPC execution to anon.
-- Some older grants can survive a generic PUBLIC revoke, so keep anon explicit.

revoke execute on function public.titan_get_economy_status() from public, anon;
revoke execute on function public.titan_list_global_messages() from public, anon;
revoke execute on function public.titan_send_global_message(text) from public, anon;
revoke execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public, anon;
revoke execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) from public, anon;
revoke execute on function public.titan_create_guild(text, text) from public, anon;
revoke execute on function public.titan_list_guild_messages() from public, anon;
revoke execute on function public.titan_send_guild_message(text) from public, anon;
revoke execute on function public.titan_purchase_shop_item(text) from public, anon;
revoke execute on function public.titan_apply_weekly_reward_cap(uuid, integer, integer) from public, anon;
revoke execute on function public.titan_charge_credits(uuid, integer, text) from public, anon;
revoke execute on function public.titan_economy_limits(uuid) from public, anon;
revoke execute on function public.titan_purge_expired_social_messages() from public, anon;

grant execute on function public.titan_get_economy_status() to authenticated;
grant execute on function public.titan_list_global_messages() to authenticated;
grant execute on function public.titan_send_global_message(text) to authenticated;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;
grant execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) to authenticated;
grant execute on function public.titan_create_guild(text, text) to authenticated;
grant execute on function public.titan_list_guild_messages() to authenticated;
grant execute on function public.titan_send_guild_message(text) to authenticated;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- TITAN OS - Explicit RPC execute grants after Supabase advisor review.

alter function public.titan_clean_state_username(text) set search_path = public;

revoke execute on function public.titan_clean_state_username(text) from public, anon, authenticated;
revoke execute on function public.titan_save_profile_state(jsonb, text, text, jsonb, jsonb, integer, text, text) from public, anon;

revoke execute on function public.titan_clean_social_text(text, text, integer) from public, anon, authenticated;
revoke execute on function public.titan_generate_guild_code() from public, anon, authenticated;
revoke execute on function public.titan_normalize_guild_code(text) from public, anon, authenticated;
revoke execute on function public.titan_add_friend_by_code(text) from public, anon;
revoke execute on function public.titan_get_my_guild() from public, anon;
revoke execute on function public.titan_create_guild(text, text) from public, anon;
revoke execute on function public.titan_join_guild(text) from public, anon;
revoke execute on function public.titan_leave_guild() from public, anon;
revoke execute on function public.titan_set_guild_target(integer) from public, anon;
revoke execute on function public.titan_list_guild_messages() from public, anon;
revoke execute on function public.titan_send_guild_message(text) from public, anon;

grant execute on function public.titan_save_profile_state(jsonb, text, text, jsonb, jsonb, integer, text, text) to authenticated;
grant execute on function public.titan_add_friend_by_code(text) to authenticated;
grant execute on function public.titan_get_my_guild() to authenticated;
grant execute on function public.titan_create_guild(text, text) to authenticated;
grant execute on function public.titan_join_guild(text) to authenticated;
grant execute on function public.titan_leave_guild() to authenticated;
grant execute on function public.titan_set_guild_target(integer) to authenticated;
grant execute on function public.titan_list_guild_messages() to authenticated;
grant execute on function public.titan_send_guild_message(text) to authenticated;

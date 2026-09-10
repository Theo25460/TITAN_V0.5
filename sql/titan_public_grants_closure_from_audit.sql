begin;

-- TITAN OS - Public grants closure from RLS review CSV.
-- Purpose: remove broad anon/authenticated table privileges while keeping app flows working.
-- This script does not delete or update user data.

grant usage on schema public to anon, authenticated;

-- Profiles are private. Public/social discovery must go through RPC.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select, insert, update on table public.profiles to authenticated;

-- Friendships are private relations. Anonymous users must never read/write them.
revoke all on table public.friendships from anon;
revoke all on table public.friendships from authenticated;
grant select, insert, delete on table public.friendships to authenticated;

-- Global chat may remain public-read, but anonymous users must not insert/update/delete.
revoke all on table public.messages from anon;
revoke all on table public.messages from authenticated;
grant select on table public.messages to anon, authenticated;
grant insert on table public.messages to authenticated;

-- User-owned sport/progression tables: keep only app-required privileges.
revoke all on table public.training_logs from anon;
revoke all on table public.training_logs from authenticated;
grant select, insert on table public.training_logs to authenticated;

revoke all on table public.shop_history from anon;
revoke all on table public.shop_history from authenticated;
grant select, insert on table public.shop_history to authenticated;

revoke all on table public.user_achievements from anon;
revoke all on table public.user_achievements from authenticated;
grant select, insert on table public.user_achievements to authenticated;

revoke all on table public.inventory from anon;
revoke all on table public.inventory from authenticated;
grant select, insert, update, delete on table public.inventory to authenticated;

revoke all on table public.social_challenges from anon;
revoke all on table public.social_challenges from authenticated;
grant select, insert, update on table public.social_challenges to authenticated;

revoke all on table public.guilds from anon;
revoke all on table public.guilds from authenticated;
grant select, insert, update on table public.guilds to authenticated;

revoke all on table public.guild_raid from anon;
revoke all on table public.guild_raid from authenticated;
grant select, insert, update on table public.guild_raid to authenticated;

notify pgrst, 'reload schema';

commit;

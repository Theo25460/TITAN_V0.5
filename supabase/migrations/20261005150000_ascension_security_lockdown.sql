-- TITAN 300 Ascension — P0 security lockdown.
-- Compatible with the deployed v200 front: guild, challenge and achievement writes already go through RPCs,
-- the admin console keeps its authenticated + admin-RLS path, anonymous intake tables keep INSERT only.

-- 1. Guilds: writes only through the SECURITY DEFINER RPCs (create / join / leave / target / messages).
--    Before: an owner could rewrite xp, level, boss_hp, code or chat_history, anyone could create a guild
--    without paying, and join any guild with any role.
drop policy if exists guilds_owner_write on public.guilds;
drop policy if exists guild_members_insert_self on public.guild_members;
drop policy if exists guild_members_delete_self_or_owner on public.guild_members;
revoke insert, update, delete on public.guilds, public.guild_members, public.guild_raid from anon, authenticated;

-- 1b. Guild read policies referenced guild_members from inside guild_members' own policy: any direct
--     read raised "infinite recursion detected in policy". Membership now comes from a definer helper.
create or replace function private.titan_my_guild_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gm.guild_id from public.guild_members gm where gm.user_id = (select auth.uid()) limit 1;
$$;
drop policy if exists guild_members_select_same_guild on public.guild_members;
create policy guild_members_select_same_guild on public.guild_members for select to authenticated
  using (user_id = (select auth.uid()) or guild_id = (select private.titan_my_guild_id()));
drop policy if exists guilds_member_select on public.guilds;
create policy guilds_member_select on public.guilds for select to authenticated
  using (owner_id = (select auth.uid()) or id = (select private.titan_my_guild_id()));
drop policy if exists guild_messages_member_select on public.guild_messages;
create policy guild_messages_member_select on public.guild_messages for select to authenticated
  using (hidden is false and guild_id = (select private.titan_my_guild_id()));

-- 2. Legacy permissive policies that were only neutralised by missing grants.
drop policy if exists user_achievements_own_all on public.user_achievements;
drop policy if exists inventory_own_all on public.inventory;
drop policy if exists inventory_own_select on public.inventory;
create policy inventory_own_select on public.inventory for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists social_challenges_involved_all on public.social_challenges;
drop policy if exists social_challenges_update_involved on public.social_challenges;
drop policy if exists social_challenges_insert_own on public.social_challenges;
drop policy if exists "Users can add friends" on public.friends;
drop policy if exists "Users can update friendship status" on public.friends;
drop policy if exists "Users can see their own friends" on public.friends;
drop policy if exists friends_involved_select on public.friends;
create policy friends_involved_select on public.friends for select to authenticated
  using ((select auth.uid()) = user_id or (select auth.uid()) = friend_id);
revoke insert, update, delete on public.user_achievements, public.inventory, public.social_challenges, public.friends
  from anon, authenticated;

-- 3. Dead admin policies pinned to a user id that does not exist; admin access stays on private.titan_is_admin().
drop policy if exists "Super Admin Quests" on public.dynamic_quests;
drop policy if exists "Super Admin Config" on public.global_config;

-- 4. One read policy per catalog table (same semantics: readable by everyone).
do $$
declare t text; p record;
begin
  foreach t in array array['achievements_config','bosses','fun_stats','global_config','items','mobs','talents','system_news','dynamic_quests']
  loop
    for p in select policyname from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT'
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy catalog_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- 5. Least privilege. RLS does not apply to TRUNCATE; nobody but the owner needs it.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
-- Anonymous visitors never update or delete; they may only insert into the three intake tables.
revoke insert, update, delete on all tables in schema public from anon;
grant insert on public.analytics_events, public.bug_reports, public.contact_messages to anon;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- 6. Private schema: no implicit PUBLIC execute. Policy helpers stay callable; admin and product
--    functions stay limited to signed-in users (each admin function asserts the admin role itself).
revoke execute on all functions in schema private from public, anon;
alter default privileges for role postgres in schema private revoke execute on functions from public;
grant execute on function private.titan_is_admin(uuid), private.titan_is_moderator_or_admin(uuid), private.titan_admin_role_for(uuid)
  to anon, authenticated;
grant execute on function private.titan_my_guild_id() to authenticated;
grant execute on function
  private.titan_admin_assert(),
  private.titan_admin_dashboard_v1(),
  private.titan_admin_get_context_v1(),
  private.titan_admin_grant_premium_v1(uuid, text, text, timestamptz, boolean, text),
  private.titan_admin_list_profiles_v1(text, text, text, text, integer, integer),
  private.titan_admin_log_v1(text, text, text, jsonb, jsonb, text),
  private.titan_admin_revoke_premium_v1(uuid, text),
  private.titan_admin_run_contest_draw_v1(text, text),
  private.titan_admin_update_profile_v1(uuid, jsonb, text),
  private.titan_admin_upsert_row_v1(text, text, jsonb, text),
  private.titan_adventure_action(text, text, text, text, integer, integer, text),
  private.titan_coach_portal(text, jsonb),
  private.titan_progression_snapshot_v78(),
  private.titan_update_training_session(uuid, integer, jsonb)
  to authenticated;

-- 7. SECURITY DEFINER functions resolving through `public`: pin pg_temp last so a temporary
--    object can never shadow an unqualified name.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and 'search_path=public' = any(coalesce(p.proconfig, '{}'))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';

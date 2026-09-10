-- TITAN OS v79 - Supabase security cleanup with limited blast radius.
-- Scope: explicit closed RLS policies, safer public contact inserts,
-- and removal of legacy public admin helper execution.

-- 1) RLS-enabled tables that are intentionally closed now get explicit deny
-- policies, so the access model is clear and advisor-readable.
do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'admin_messages',
        'audit_logs',
        'daily_quests',
        'game_settings',
        'sports_db',
        'titan_billing_events',
        'titan_social_action_log',
        'titan_weekly_reward_usage',
        'zones'
    ] loop
        execute format('drop policy if exists %I on public.%I', v_table || '_closed_deny_v79', v_table);
        execute format(
            'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
            v_table || '_closed_deny_v79',
            v_table
        );
    end loop;
end;
$$;

-- 2) Public contact insert remains available, but not with CHECK true.
revoke all on table public.contact_messages from anon, authenticated;
grant insert on table public.contact_messages to anon;
grant select, insert, update, delete on table public.contact_messages to authenticated;

create index if not exists contact_messages_user_id_idx
on public.contact_messages(user_id);

drop policy if exists contact_messages_public_insert_v1 on public.contact_messages;
drop policy if exists contact_messages_public_insert_v79 on public.contact_messages;
create policy contact_messages_public_insert_v79
on public.contact_messages
for insert
to anon, authenticated
with check (
    (
        user_id is null
        or user_id = auth.uid()
    )
    and char_length(btrim(message)) between 10 and 3000
    and (
        name is null
        or char_length(btrim(name)) between 1 and 120
    )
    and (
        subject is null
        or char_length(btrim(subject)) <= 180
    )
    and (
        email is null
        or btrim(email) = ''
        or (
            char_length(btrim(email)) <= 180
            and btrim(email) ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
        )
    )
    and char_length(btrim(category)) between 2 and 40
    and status = 'new'
    and priority = 'normal'
    and admin_note is null
);

-- 3) Replace legacy public admin helpers in policies with private.titan_is_admin.
drop policy if exists "Admin All" on public.achievements_config;
drop policy if exists achievements_config_admin_all_v79 on public.achievements_config;
create policy achievements_config_admin_all_v79
on public.achievements_config
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "Admin Read Logs" on public.admin_logs;
drop policy if exists "Admin logs access" on public.admin_logs;

drop policy if exists "Admin All" on public.dynamic_quests;
drop policy if exists dynamic_quests_admin_all_v79 on public.dynamic_quests;
create policy dynamic_quests_admin_all_v79
on public.dynamic_quests
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "Admin All" on public.fun_stats;
drop policy if exists fun_stats_admin_all_v79 on public.fun_stats;
create policy fun_stats_admin_all_v79
on public.fun_stats
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "Admin All" on public.global_config;
drop policy if exists global_config_admin_all_v79 on public.global_config;
create policy global_config_admin_all_v79
on public.global_config
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "Admin Manage Items" on public.items;
drop policy if exists "Admin modif items" on public.items;
drop policy if exists items_admin_all_v79 on public.items;
create policy items_admin_all_v79
on public.items
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

drop policy if exists "Admin Manage News" on public.system_news;
drop policy if exists "Admin write news" on public.system_news;
drop policy if exists system_news_admin_all_v79 on public.system_news;
create policy system_news_admin_all_v79
on public.system_news
for all
to authenticated
using (private.titan_is_admin(auth.uid()))
with check (private.titan_is_admin(auth.uid()));

revoke all on function public.check_if_admin() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_super_admin() from public, anon, authenticated;

-- 4) The public partnership stats RPC still needs a later private-wrapper
-- migration. For now, at least remove mutable search path risk.
alter function public.titan_public_partnership_stats() set search_path = '';


begin;

-- TITAN OS - Legacy public policy cleanup from policy logic review CSV.
-- Purpose: remove old permissive `public` policies and broad authenticated policies.
-- This script does not delete or update user data.

create or replace function public.titan_try_drop_policy(p_table text, p_policy text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('drop policy if exists %I on public.%I', p_policy, p_table);
exception
  when undefined_table then
    raise notice 'Skipped missing table %.%', 'public', p_table;
end;
$$;

create or replace function public.titan_policy_has_column(p_table text, p_column text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

revoke all on function public.titan_try_drop_policy(text, text) from public;
revoke all on function public.titan_policy_has_column(text, text) from public;

-- Profiles: remove old public all-profile read/write policies. Keep authenticated own-profile policies.
select public.titan_try_drop_policy('profiles', 'Insert Own Profile');
select public.titan_try_drop_policy('profiles', 'Public Profiles');
select public.titan_try_drop_policy('profiles', 'Update Own Profile');

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Friendships: remove legacy public and duplicate broad policies. Keep involved-user policies.
select public.titan_try_drop_policy('friendships', 'Ajouter un ami');
select public.titan_try_drop_policy('friendships', 'Supprimer un ami');
select public.titan_try_drop_policy('friendships', 'Voir mes amis');
select public.titan_try_drop_policy('friendships', 'Je peux ajouter des amis');
select public.titan_try_drop_policy('friendships', 'Je peux supprimer mes amis');
select public.titan_try_drop_policy('friendships', 'Je peux voir mes propres amitiés');
select public.titan_try_drop_policy('friendships', 'Je peux voir mes propres amitiÃ©s');
select public.titan_try_drop_policy('friendships', 'allow_all_friendships');
select public.titan_try_drop_policy('friendships', 'fix_delete_friendships');
select public.titan_try_drop_policy('friendships', 'friendships_involved_all');
select public.titan_try_drop_policy('friendships', 'production_delete_friendship');

drop policy if exists "friendships_select_involved" on public.friendships;
drop policy if exists "friendships_insert_own" on public.friendships;
drop policy if exists "friendships_delete_involved" on public.friendships;

create policy "friendships_select_involved"
on public.friendships
for select
to authenticated
using (user_id_1 = auth.uid() or user_id_2 = auth.uid());

create policy "friendships_insert_own"
on public.friendships
for insert
to authenticated
with check (user_id_1 = auth.uid() and user_id_2 <> auth.uid());

create policy "friendships_delete_involved"
on public.friendships
for delete
to authenticated
using (user_id_1 = auth.uid() or user_id_2 = auth.uid());

-- Private user-owned tables: remove old public policies, keep authenticated own-row policies.
select public.titan_try_drop_policy('inventory', 'Ajouter/Modifier son inventaire');
select public.titan_try_drop_policy('inventory', 'Self Inventory Insert');
select public.titan_try_drop_policy('inventory', 'Self Inventory Read');
select public.titan_try_drop_policy('inventory', 'Voir son propre inventaire');

select public.titan_try_drop_policy('shop_history', 'Acheter');
select public.titan_try_drop_policy('shop_history', 'Voir ses achats');

select public.titan_try_drop_policy('training_logs', 'Ajouter un log');
select public.titan_try_drop_policy('training_logs', 'Gerer ses logs');
select public.titan_try_drop_policy('training_logs', 'Voir ses logs');

select public.titan_try_drop_policy('user_achievements', 'Débloquer succès');
select public.titan_try_drop_policy('user_achievements', 'DÃ©bloquer succÃ¨s');
select public.titan_try_drop_policy('user_achievements', 'Voir ses succès');
select public.titan_try_drop_policy('user_achievements', 'Voir ses succÃ¨s');

select public.titan_try_drop_policy('social_challenges', 'Créer Défi');
select public.titan_try_drop_policy('social_challenges', 'CrÃ©er DÃ©fi');
select public.titan_try_drop_policy('social_challenges', 'MAJ Défi');
select public.titan_try_drop_policy('social_challenges', 'MAJ DÃ©fi');
select public.titan_try_drop_policy('social_challenges', 'Voir Défis');
select public.titan_try_drop_policy('social_challenges', 'Voir DÃ©fis');

-- Guild prototype policies: remove public/broad policies and recreate owner/user-scoped variants when columns exist.
select public.titan_try_drop_policy('guilds', 'Accès total Guildes pour les connectés');
select public.titan_try_drop_policy('guilds', 'AccÃ¨s total Guildes pour les connectÃ©s');

drop policy if exists "guilds_owner_write" on public.guilds;
drop policy if exists "guilds_leader_write" on public.guilds;

do $$
begin
  if public.titan_policy_has_column('guilds', 'owner_id') then
    create policy "guilds_owner_write"
    on public.guilds
    for all
    to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());
  end if;

  if public.titan_policy_has_column('guilds', 'leader_id') then
    create policy "guilds_leader_write"
    on public.guilds
    for all
    to authenticated
    using (leader_id = auth.uid())
    with check (leader_id = auth.uid());
  end if;
end;
$$;

select public.titan_try_drop_policy('guild_raid', 'Tout le monde peut frapper le boss');
select public.titan_try_drop_policy('guild_raid', 'Tout le monde peut voir le boss');

drop policy if exists "guild_raid_owner_write" on public.guild_raid;
drop policy if exists "guild_raid_user_write" on public.guild_raid;

do $$
begin
  if public.titan_policy_has_column('guild_raid', 'owner_id') then
    create policy "guild_raid_owner_write"
    on public.guild_raid
    for all
    to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());
  end if;

  if public.titan_policy_has_column('guild_raid', 'user_id') then
    create policy "guild_raid_user_write"
    on public.guild_raid
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end;
$$;

-- Messages: keep public read only through messages_public_read; authenticated insert must be sender-owned.
select public.titan_try_drop_policy('messages', 'Envoyer message');
select public.titan_try_drop_policy('messages', 'Tout le monde peut lire');
select public.titan_try_drop_policy('messages', 'Voir ses messages');
select public.titan_try_drop_policy('messages', 'messages_select_auth');
select public.titan_try_drop_policy('messages', 'messages_insert_auth');

drop policy if exists "messages_public_read" on public.messages;
drop policy if exists "messages_insert_authenticated" on public.messages;

create policy "messages_public_read"
on public.messages
for select
to anon, authenticated
using (true);

create policy "messages_insert_authenticated"
on public.messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop function if exists public.titan_try_drop_policy(text, text);
drop function if exists public.titan_policy_has_column(text, text);

notify pgrst, 'reload schema';

commit;

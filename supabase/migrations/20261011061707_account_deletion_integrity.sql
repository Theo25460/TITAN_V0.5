-- LEG10: "Supprimer mon compte" must succeed for every account without breaking anybody else's data.
-- Deleting auth.users (delete_own_account() or a support deletion) failed for an account that had
-- received an admin message, appointed an admin, or owned a guild with other members.
--   * admin_messages.receiver_id: closed legacy inbox; messages addressed to the account are its data: CASCADE.
--   * titan_admins.created_by: attribution only: SET NULL, the appointed admin keeps its role.
--   * guilds owned by the account: before any cascade, ownership passes to the oldest other member, as
--     titan_leave_guild() does (members without a guild_members row are found through profiles.guild_id).
--     A guild nobody else belongs to is still removed by the existing owner_id cascade.
-- Constraints that already have the right rule are left untouched, so reapplying takes no lock. A first
-- application briefly locks auth.users (foreign keys onto it) under the 5s lock_timeout set below.
-- No row is rewritten; delete_own_account() and its grants are unchanged.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: docs/CDC_WEB_ACCOUNT_DELETION_HANDOFF_2026-10-11.md.
create or replace function private.titan_guild_handover_before_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_guild uuid;
  v_next uuid;
begin
  for v_guild in select g.id from public.guilds g where g.owner_id = old.id loop
    select coalesce(
      (select gm.user_id from public.guild_members gm
        where gm.guild_id = v_guild and gm.user_id <> old.id order by gm.joined_at asc limit 1),
      (select p.id from public.profiles p
        where p.guild_id = v_guild and p.id <> old.id order by p.created_at asc limit 1))
    into v_next;
    if v_next is not null then
      -- A successor known only through profiles.guild_id gets the membership row it lacks.
      insert into public.guild_members(guild_id, user_id, role) values (v_guild, v_next, 'owner')
        on conflict (user_id) do update set guild_id = excluded.guild_id, role = 'owner';
      update public.guilds set owner_id = v_next, updated_at = pg_catalog.now() where id = v_guild;
    end if;
  end loop;
  return old;
end;
$function$;
revoke all on function private.titan_guild_handover_before_account_delete() from public, anon, authenticated;

do $$
declare previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if to_regclass('public.admin_messages') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.admin_messages'::regclass
      and conname = 'admin_messages_receiver_id_fkey' and confdeltype = 'c' and convalidated) then
    alter table public.admin_messages
      drop constraint if exists admin_messages_receiver_id_fkey,
      add constraint admin_messages_receiver_id_fkey foreign key (receiver_id)
        references auth.users(id) on delete cascade;
  end if;
  if to_regclass('public.titan_admins') is not null and not exists (
    select 1 from pg_constraint where conrelid = 'public.titan_admins'::regclass
      and conname = 'titan_admins_created_by_fkey' and confdeltype = 'n' and convalidated) then
    alter table public.titan_admins
      drop constraint if exists titan_admins_created_by_fkey,
      add constraint titan_admins_created_by_fkey foreign key (created_by)
        references auth.users(id) on delete set null;
  end if;
  if to_regclass('public.guilds') is not null and not exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'titan_guild_handover_before_account_delete') then
    create trigger titan_guild_handover_before_account_delete
      before delete on auth.users
      for each row execute function private.titan_guild_handover_before_account_delete();
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

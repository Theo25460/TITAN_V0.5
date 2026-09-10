begin;

-- TITAN OS - guild_raid no-owner policy hotfix.
-- Purpose: close guild_raid safely when the prototype table has no owner/user column.
-- This script does not delete data. It blocks direct client access until a proper server-backed guild raid schema exists.

alter table if exists public.guild_raid enable row level security;

revoke all on table public.guild_raid from anon;
revoke all on table public.guild_raid from authenticated;

grant select, insert, update on table public.guild_raid to authenticated;

drop policy if exists "guild_raid_closed_until_schema_owner" on public.guild_raid;
drop policy if exists "guild_raid_owner_write" on public.guild_raid;
drop policy if exists "guild_raid_user_write" on public.guild_raid;

create policy "guild_raid_closed_until_schema_owner"
on public.guild_raid
for all
to authenticated
using (false)
with check (false);

notify pgrst, 'reload schema';

commit;

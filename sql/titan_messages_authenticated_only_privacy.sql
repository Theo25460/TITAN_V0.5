begin;

-- TITAN OS - Messages authenticated-only privacy closure.
-- Purpose: avoid exposing sender_id/message rows to anonymous Supabase clients.
-- Run only if the global chat should be available to connected users, not public visitors.

alter table if exists public.messages enable row level security;

revoke all on table public.messages from anon;
revoke all on table public.messages from authenticated;

grant select, insert on table public.messages to authenticated;

drop policy if exists "messages_public_read" on public.messages;
drop policy if exists "messages_select_authenticated" on public.messages;
drop policy if exists "messages_insert_authenticated" on public.messages;

create policy "messages_select_authenticated"
on public.messages
for select
to authenticated
using (true);

create policy "messages_insert_authenticated"
on public.messages
for insert
to authenticated
with check (sender_id = auth.uid());

notify pgrst, 'reload schema';

commit;

-- TITAN OS - Guild chat FK performance hotfix
-- Applied 2026-05-19.
-- Keeps guild message lookups/deletes by sender efficient and clears the FK index advisor.

create index if not exists guild_messages_sender_id_idx
on public.guild_messages (sender_id);

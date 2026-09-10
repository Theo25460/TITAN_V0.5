begin;

-- TITAN OS - Chat moderation/rate-limit hardening
-- Run in Supabase SQL editor before opening the global chat publicly.

create extension if not exists pgcrypto;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null default 'Agent',
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.titan_moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists messages_created_idx on public.messages(created_at desc);
create index if not exists messages_sender_created_idx on public.messages(sender_id, created_at desc);
create index if not exists titan_reports_status_idx on public.titan_moderation_reports(status, created_at desc);

alter table public.messages enable row level security;
alter table public.titan_moderation_reports enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.messages to anon, authenticated;
grant insert on public.messages to authenticated;
grant select, insert on public.titan_moderation_reports to authenticated;

drop policy if exists "messages_public_read" on public.messages;
drop policy if exists "messages_insert_authenticated" on public.messages;
drop policy if exists "titan_reports_insert_authenticated" on public.titan_moderation_reports;
drop policy if exists "titan_reports_select_own" on public.titan_moderation_reports;

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

create policy "titan_reports_insert_authenticated"
on public.titan_moderation_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

create policy "titan_reports_select_own"
on public.titan_moderation_reports
for select
to authenticated
using (reporter_id = auth.uid());

create or replace function public.titan_guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if to_regclass('public.profiles') is not null and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_suspended is true
  ) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  new.sender_id := auth.uid();
  new.sender_name := left(regexp_replace(trim(coalesce(new.sender_name, 'Agent')), '[[:cntrl:]]', '', 'g'), 32);
  if new.sender_name = '' then
    new.sender_name := 'Agent';
  end if;

  new.content := left(regexp_replace(trim(coalesce(new.content, '')), '[[:cntrl:]]', '', 'g'), 500);
  if new.content = '' then
    raise exception 'MESSAGE_EMPTY' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent_count
  from public.messages
  where sender_id = auth.uid()
    and created_at > now() - interval '1 minute';

  if v_recent_count >= 5 then
    raise exception 'CHAT_RATE_LIMIT' using errcode = '42900';
  end if;

  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists titan_guard_message_insert on public.messages;
create trigger titan_guard_message_insert
before insert on public.messages
for each row
execute function public.titan_guard_message_insert();

notify pgrst, 'reload schema';

commit;

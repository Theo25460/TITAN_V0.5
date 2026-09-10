begin;

-- TITAN OS - Final chat message moderation closure.
-- Purpose: report a precise chat message, allow admins to hide abusive rows,
-- and keep hidden messages out of the authenticated chat feed.
-- Safe to rerun. This does not delete existing messages.

create extension if not exists pgcrypto;

alter table public.messages add column if not exists hidden_at timestamptz;
alter table public.messages add column if not exists hidden_by uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists hidden_reason text;

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

alter table public.titan_moderation_reports
drop constraint if exists titan_moderation_reports_message_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'titan_moderation_reports'
      and column_name = 'message_id'
      and data_type <> 'text'
  ) then
    alter table public.titan_moderation_reports
    alter column message_id type text using message_id::text;
  end if;
end $$;

-- Existing projects may have messages.id as bigint or uuid. Store the message
-- reference as text so this script works with both schemas.
alter table public.titan_moderation_reports add column if not exists message_id text;

create index if not exists messages_visible_created_idx on public.messages(hidden_at, created_at desc);
create index if not exists messages_sender_created_idx on public.messages(sender_id, created_at desc);
create index if not exists titan_reports_message_idx on public.titan_moderation_reports(message_id, created_at desc);
create index if not exists titan_reports_status_idx on public.titan_moderation_reports(status, created_at desc);

alter table public.messages enable row level security;
alter table public.titan_moderation_reports enable row level security;

grant usage on schema public to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert on table public.titan_moderation_reports to authenticated;

create or replace function public.titan_is_admin(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_active boolean;
  v_has_revoked boolean;
  v_result boolean := false;
begin
  if p_user_id is null or to_regclass('public.titan_admins') is null then
    return false;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'titan_admins'
      and column_name = 'active'
  ) into v_has_active;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'titan_admins'
      and column_name = 'revoked_at'
  ) into v_has_revoked;

  if v_has_active and v_has_revoked then
    execute 'select exists(select 1 from public.titan_admins where user_id = $1 and coalesce(active, true) is true and revoked_at is null)'
    using p_user_id into v_result;
  elsif v_has_active then
    execute 'select exists(select 1 from public.titan_admins where user_id = $1 and coalesce(active, true) is true)'
    using p_user_id into v_result;
  elsif v_has_revoked then
    execute 'select exists(select 1 from public.titan_admins where user_id = $1 and revoked_at is null)'
    using p_user_id into v_result;
  else
    execute 'select exists(select 1 from public.titan_admins where user_id = $1)'
    using p_user_id into v_result;
  end if;

  return coalesce(v_result, false);
end;
$$;

drop policy if exists "messages_public_read" on public.messages;
drop policy if exists "messages_select_authenticated" on public.messages;
drop policy if exists "messages_select_authenticated_visible" on public.messages;

create policy "messages_select_authenticated_visible"
on public.messages
for select
to authenticated
using (
  hidden_at is null
  or sender_id = auth.uid()
  or public.titan_is_admin(auth.uid())
);

drop policy if exists "messages_insert_authenticated" on public.messages;
create policy "messages_insert_authenticated"
on public.messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "titan_reports_insert_authenticated" on public.titan_moderation_reports;
create policy "titan_reports_insert_authenticated"
on public.titan_moderation_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "titan_reports_select_own" on public.titan_moderation_reports;
drop policy if exists "titan_reports_select_admin_or_own" on public.titan_moderation_reports;
create policy "titan_reports_select_admin_or_own"
on public.titan_moderation_reports
for select
to authenticated
using (reporter_id = auth.uid() or public.titan_is_admin(auth.uid()));

drop function if exists public.titan_report_chat_message(uuid, text);
drop function if exists public.titan_admin_hide_chat_message(uuid, text);

create or replace function public.titan_report_chat_message(
  p_message_id text,
  p_reason text default 'chat_abuse'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg record;
  v_report_id uuid;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select id::text as id, sender_id, sender_name, content, hidden_at
  into v_msg
  from public.messages
  where id::text = p_message_id;

  if not found then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = '22023';
  end if;

  if v_msg.sender_id = auth.uid() then
    raise exception 'CANNOT_REPORT_SELF' using errcode = '22023';
  end if;

  v_reason := left(regexp_replace(trim(coalesce(p_reason, 'chat_abuse')), '[^a-zA-Z0-9_.:-]', '_', 'g'), 60);
  if v_reason = '' then
    v_reason := 'chat_abuse';
  end if;

  insert into public.titan_moderation_reports(
    reporter_id,
    target_user_id,
    message_id,
    reason,
    details
  )
  values (
    auth.uid(),
    v_msg.sender_id,
    v_msg.id,
    v_reason,
    left(
      concat(
        'Message chat signale. Agent: ',
        coalesce(v_msg.sender_name, 'Agent'),
        '. Extrait: ',
        coalesce(v_msg.content, '')
      ),
      700
    )
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

create or replace function public.titan_admin_hide_chat_message(
  p_message_id text,
  p_reason text default 'moderation'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.titan_is_admin(auth.uid()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.messages
  set
    hidden_at = coalesce(hidden_at, now()),
    hidden_by = auth.uid(),
    hidden_reason = left(regexp_replace(trim(coalesce(p_reason, 'moderation')), '[[:cntrl:]]', '', 'g'), 180)
  where id::text = p_message_id;

  if not found then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = '22023';
  end if;

  if to_regclass('public.titan_admin_audit') is not null then
    insert into public.titan_admin_audit(admin_id, action, target_user_id, payload)
    values (auth.uid(), 'chat.message.hide', null, jsonb_build_object('message_id', p_message_id, 'reason', p_reason));
  end if;

  notify pgrst, 'reload schema';
  return true;
end;
$$;

revoke all on function public.titan_report_chat_message(text, text) from public;
revoke all on function public.titan_admin_hide_chat_message(text, text) from public;
grant execute on function public.titan_report_chat_message(text, text) to authenticated;
grant execute on function public.titan_admin_hide_chat_message(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;

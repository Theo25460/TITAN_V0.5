-- TITAN OS - Cloud social/guild foundation.
-- Purpose:
-- - make friend-code add flow server-authoritative;
-- - move guild membership and guild chat out of localStorage;
-- - keep all exposed public tables guarded by RLS + explicit grants.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists guild_id uuid;

alter table if exists public.guilds
  alter column id set default gen_random_uuid();

alter table if exists public.guilds
  add column if not exists code text,
  add column if not exists motto text,
  add column if not exists weekly_target integer not null default 5,
  add column if not exists updated_at timestamptz not null default now();

update public.guilds
set code = 'G-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where code is null;

create unique index if not exists guilds_code_unique_idx
on public.guilds(code)
where code is not null;

create index if not exists guilds_owner_idx
on public.guilds(owner_id);

create table if not exists public.guild_members (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'officer', 'member')),
  joined_at timestamptz not null default now(),
  contribution_week integer not null default 0,
  unique(guild_id, user_id),
  unique(user_id)
);

create index if not exists guild_members_guild_idx
on public.guild_members(guild_id);

create index if not exists guild_members_user_idx
on public.guild_members(user_id);

create table if not exists public.guild_messages (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null default 'Agent',
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create index if not exists guild_messages_guild_created_idx
on public.guild_messages(guild_id, created_at desc);

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_messages enable row level security;

revoke all on table public.guilds from anon;
revoke all on table public.guild_members from anon;
revoke all on table public.guild_messages from anon;

grant select on table public.guilds to authenticated;
grant select on table public.guild_members to authenticated;
grant select on table public.guild_messages to authenticated;

drop policy if exists "guilds_member_select" on public.guilds;
create policy "guilds_member_select"
on public.guilds
for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.guild_members gm
    where gm.guild_id = guilds.id
      and gm.user_id = auth.uid()
  )
);

drop policy if exists "guild_members_select_same_guild" on public.guild_members;
create policy "guild_members_select_same_guild"
on public.guild_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.guild_members mine
    where mine.guild_id = guild_members.guild_id
      and mine.user_id = auth.uid()
  )
);

drop policy if exists "guild_members_insert_self" on public.guild_members;
create policy "guild_members_insert_self"
on public.guild_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "guild_members_delete_self_or_owner" on public.guild_members;
create policy "guild_members_delete_self_or_owner"
on public.guild_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.guilds g
    where g.id = guild_members.guild_id
      and g.owner_id = auth.uid()
  )
);

drop policy if exists "guild_messages_member_select" on public.guild_messages;
create policy "guild_messages_member_select"
on public.guild_messages
for select
to authenticated
using (
  hidden is false
  and exists (
    select 1
    from public.guild_members gm
    where gm.guild_id = guild_messages.guild_id
      and gm.user_id = auth.uid()
  )
);

drop policy if exists "guild_messages_member_insert" on public.guild_messages;
create policy "guild_messages_member_insert"
on public.guild_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.guild_members gm
    where gm.guild_id = guild_messages.guild_id
      and gm.user_id = auth.uid()
  )
);

create or replace function public.titan_clean_social_text(p_value text, p_fallback text, p_max integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text;
begin
  v_value := left(regexp_replace(trim(coalesce(p_value, '')), '[[:cntrl:]<>]', '', 'g'), greatest(1, p_max));
  v_value := regexp_replace(v_value, '\s+', ' ', 'g');
  if v_value = '' then
    return left(p_fallback, greatest(1, p_max));
  end if;
  return v_value;
end;
$$;

create or replace function public.titan_generate_guild_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  loop
    v_code := 'G-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.guilds where code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.titan_normalize_guild_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') like 'G%' then
      'G-' || substr(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), 2, 10)
    else ''
  end;
$$;

create or replace function public.titan_add_friend_by_code(p_friend_code text)
returns table(
  id uuid,
  username text,
  friend_code text,
  level integer,
  avatar text,
  is_elite boolean,
  is_suspended boolean,
  total_sessions integer,
  fav_sport text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_friend_code, '')));
  v_friend public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_code !~ '^TN-[A-Z2-9]{4,8}$' then
    raise exception 'INVALID_FRIEND_CODE' using errcode = '22023';
  end if;

  select * into v_friend
  from public.profiles p
  where p.friend_code = v_code
  limit 1;

  if v_friend.id is null then
    raise exception 'FRIEND_CODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_friend.id = v_uid then
    raise exception 'CANNOT_ADD_SELF' using errcode = '22023';
  end if;

  if coalesce(v_friend.is_suspended, false) is true then
    raise exception 'TARGET_SUSPENDED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.titan_user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = v_friend.id)
       or (b.blocker_id = v_friend.id and b.blocked_id = v_uid)
  ) then
    raise exception 'USER_BLOCKED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.friendships f
    where (f.user_id_1 = v_uid and f.user_id_2 = v_friend.id)
       or (f.user_id_1 = v_friend.id and f.user_id_2 = v_uid)
  ) then
    -- Already linked; return current public friend projection.
    return query
    select f.*
    from public.titan_list_my_friends() f
    where f.id = v_friend.id;
    return;
  end if;

  insert into public.friendships(user_id_1, user_id_2, status)
  values (v_uid, v_friend.id, 'accepted')
  on conflict do nothing;

  return query
  select f.*
  from public.titan_list_my_friends() f
  where f.id = v_friend.id;
end;
$$;

create or replace function public.titan_get_my_guild()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guild public.guilds%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_week_sessions integer := 0;
  v_progress integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select g.* into v_guild
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  where gm.user_id = v_uid
  order by gm.joined_at asc
  limit 1;

  if v_guild.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gm.user_id,
    'name', coalesce(p.username, 'Agent'),
    'role', gm.role,
    'level', coalesce(p.level, 1),
    'avatar', p.avatar,
    'joined_at', gm.joined_at
  ) order by case gm.role when 'owner' then 0 when 'officer' then 1 else 2 end, gm.joined_at), '[]'::jsonb)
  into v_members
  from public.guild_members gm
  left join public.profiles p on p.id = gm.user_id
  where gm.guild_id = v_guild.id;

  select count(*)::integer into v_week_sessions
  from public.training_logs tl
  where tl.user_id in (
    select gm.user_id from public.guild_members gm where gm.guild_id = v_guild.id
  )
  and tl.date >= date_trunc('week', now());

  v_progress := least(100, round((v_week_sessions::numeric / greatest(1, coalesce(v_guild.weekly_target, 5))) * 100)::integer);

  select coalesce(jsonb_agg(row_to_json(msg)::jsonb order by msg.created_at asc), '[]'::jsonb)
  into v_messages
  from (
    select id, guild_id, sender_id, sender_name, content, 'guild'::text as channel, created_at
    from public.guild_messages
    where guild_id = v_guild.id
      and hidden is false
    order by created_at desc
    limit 80
  ) msg;

  return jsonb_build_object(
    'id', v_guild.id,
    'code', v_guild.code,
    'name', v_guild.name,
    'motto', coalesce(v_guild.motto, ''),
    'owner_id', v_guild.owner_id,
    'level', coalesce(v_guild.level, 1),
    'xp', coalesce(v_guild.xp, 0),
    'weeklyTarget', coalesce(v_guild.weekly_target, 5),
    'weekSessions', v_week_sessions,
    'progress', v_progress,
    'members', v_members,
    'messages', v_messages,
    'logs', coalesce(v_guild.chat_history, '[]'::jsonb)
  );
end;
$$;

create or replace function public.titan_create_guild(p_name text, p_motto text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_motto text;
  v_code text;
  v_guild_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if exists (select 1 from public.guild_members gm where gm.user_id = v_uid) then
    return public.titan_get_my_guild();
  end if;

  v_name := public.titan_clean_social_text(p_name, 'Escouade Titan', 28);
  v_motto := public.titan_clean_social_text(p_motto, 'Tenir la ligne.', 64);
  v_code := public.titan_generate_guild_code();

  insert into public.guilds(name, owner_id, code, motto, weekly_target, level, xp, boss_hp, boss_max_hp, boss_level, active_quests, chat_history, created_at, updated_at)
  values (
    v_name,
    v_uid,
    v_code,
    v_motto,
    5,
    1,
    0,
    1000,
    1000,
    1,
    '[]'::jsonb,
    jsonb_build_array(public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24) || ' a fonde ' || v_name || '.'),
    now(),
    now()
  )
  returning id into v_guild_id;

  insert into public.guild_members(guild_id, user_id, role)
  values (v_guild_id, v_uid, 'owner')
  on conflict (user_id) do update set guild_id = excluded.guild_id, role = 'owner', joined_at = now();

  update public.profiles
  set guild_id = v_guild_id, updated_at = now()
  where id = v_uid;

  return public.titan_get_my_guild();
end;
$$;

create or replace function public.titan_join_guild(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.titan_normalize_guild_code(p_code);
  v_guild public.guilds%rowtype;
  v_member_name text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_code !~ '^G-[A-Z0-9]{4,10}$' then
    raise exception 'INVALID_GUILD_CODE' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  select * into v_guild
  from public.guilds
  where code = v_code
  limit 1;

  if v_guild.id is null then
    raise exception 'GUILD_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.guild_members
  where user_id = v_uid
    and guild_id <> v_guild.id;

  insert into public.guild_members(guild_id, user_id, role)
  values (v_guild.id, v_uid, 'member')
  on conflict (user_id) do update set guild_id = excluded.guild_id, role = 'member', joined_at = now();

  update public.profiles
  set guild_id = v_guild.id, updated_at = now()
  where id = v_uid;

  v_member_name := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  update public.guilds
  set chat_history = jsonb_build_array(v_member_name || ' a rejoint la guilde.') || coalesce(chat_history, '[]'::jsonb),
      updated_at = now()
  where id = v_guild.id;

  return public.titan_get_my_guild();
end;
$$;

create or replace function public.titan_leave_guild()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_owner_id uuid;
  v_next_owner uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    return true;
  end if;

  select owner_id into v_owner_id from public.guilds where id = v_guild_id;

  delete from public.guild_members where guild_id = v_guild_id and user_id = v_uid;
  update public.profiles set guild_id = null, updated_at = now() where id = v_uid;

  if v_owner_id = v_uid then
    select user_id into v_next_owner
    from public.guild_members
    where guild_id = v_guild_id
    order by joined_at asc
    limit 1;

    if v_next_owner is null then
      delete from public.guilds where id = v_guild_id;
    else
      update public.guild_members set role = 'owner' where guild_id = v_guild_id and user_id = v_next_owner;
      update public.guilds set owner_id = v_next_owner, updated_at = now() where id = v_guild_id;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.titan_set_guild_target(p_target integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_target integer := least(30, greatest(1, coalesce(p_target, 5)));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select g.id into v_guild_id
  from public.guilds g
  where g.owner_id = v_uid
  limit 1;

  if v_guild_id is null then
    raise exception 'GUILD_OWNER_REQUIRED' using errcode = '42501';
  end if;

  update public.guilds
  set weekly_target = v_target,
      chat_history = jsonb_build_array('Objectif hebdo ajuste a ' || v_target || ' seances.') || coalesce(chat_history, '[]'::jsonb),
      updated_at = now()
  where id = v_guild_id;

  return public.titan_get_my_guild();
end;
$$;

create or replace function public.titan_list_guild_messages()
returns table(
  id uuid,
  guild_id uuid,
  sender_id uuid,
  sender_name text,
  content text,
  channel text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    return;
  end if;

  return query
  select m.id, m.guild_id, m.sender_id, m.sender_name, m.content, 'guild'::text as channel, m.created_at
  from public.guild_messages m
  where m.guild_id = v_guild_id
    and m.hidden is false
  order by m.created_at asc
  limit 80;
end;
$$;

create or replace function public.titan_send_guild_message(p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_content text;
  v_sender text;
  v_message public.guild_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '42501';
  end if;

  v_content := public.titan_clean_social_text(p_content, '', 500);
  if v_content = '' then
    raise exception 'EMPTY_MESSAGE' using errcode = '22023';
  end if;

  v_sender := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  insert into public.guild_messages(guild_id, sender_id, sender_name, content)
  values (v_guild_id, v_uid, v_sender, v_content)
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id,
    'guild_id', v_message.guild_id,
    'sender_id', v_message.sender_id,
    'sender_name', v_message.sender_name,
    'content', v_message.content,
    'channel', 'guild',
    'created_at', v_message.created_at
  );
end;
$$;

revoke all on function public.titan_clean_social_text(text, text, integer) from public;
revoke all on function public.titan_generate_guild_code() from public;
revoke all on function public.titan_normalize_guild_code(text) from public;
revoke all on function public.titan_add_friend_by_code(text) from public;
revoke all on function public.titan_get_my_guild() from public;
revoke all on function public.titan_create_guild(text, text) from public;
revoke all on function public.titan_join_guild(text) from public;
revoke all on function public.titan_leave_guild() from public;
revoke all on function public.titan_set_guild_target(integer) from public;
revoke all on function public.titan_list_guild_messages() from public;
revoke all on function public.titan_send_guild_message(text) from public;

grant execute on function public.titan_add_friend_by_code(text) to authenticated;
grant execute on function public.titan_get_my_guild() to authenticated;
grant execute on function public.titan_create_guild(text, text) to authenticated;
grant execute on function public.titan_join_guild(text) to authenticated;
grant execute on function public.titan_leave_guild() to authenticated;
grant execute on function public.titan_set_guild_target(integer) to authenticated;
grant execute on function public.titan_list_guild_messages() to authenticated;
grant execute on function public.titan_send_guild_message(text) to authenticated;

begin;

-- TITAN OS - Profile privacy/social RPC hardening.
-- Goal: avoid broad authenticated SELECT on profiles while keeping friend-code workflows.

create extension if not exists pgcrypto;

create table if not exists public.friendships (
  user_id_1 uuid not null references auth.users(id) on delete cascade,
  user_id_2 uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_1, user_id_2),
  check (user_id_1 <> user_id_2)
);

create index if not exists friendships_user_1_idx on public.friendships(user_id_1);
create index if not exists friendships_user_2_idx on public.friendships(user_id_2);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.friendships to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
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

create or replace function public.titan_find_profile_by_friend_code(p_friend_code text)
returns table (
  id uuid,
  username text,
  friend_code text,
  level integer,
  avatar text,
  is_elite boolean,
  is_suspended boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended
  from public.profiles p
  where p.friend_code = upper(trim(p_friend_code))
  limit 1;
end;
$$;

revoke all on function public.titan_find_profile_by_friend_code(text) from public;
grant execute on function public.titan_find_profile_by_friend_code(text) to authenticated;

create or replace function public.titan_list_my_friends()
returns table (
  id uuid,
  username text,
  friend_code text,
  level integer,
  avatar text,
  is_elite boolean,
  is_suspended boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  with friend_ids as (
    select case when f.user_id_1 = auth.uid() then f.user_id_2 else f.user_id_1 end as friend_id
    from public.friendships f
    where f.user_id_1 = auth.uid() or f.user_id_2 = auth.uid()
  )
  select p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended
  from friend_ids f
  join public.profiles p on p.id = f.friend_id
  where coalesce(p.is_suspended, false) is false
  order by p.level desc nulls last, p.username asc nulls last;
end;
$$;

revoke all on function public.titan_list_my_friends() from public;
grant execute on function public.titan_list_my_friends() to authenticated;

notify pgrst, 'reload schema';

commit;

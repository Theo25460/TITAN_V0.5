begin;

-- TITAN OS - Social privacy, user blocking and friend action rate limits.
-- Purpose: complete public-release social hardening without exposing private sport data.
-- Safe to rerun. This script does not delete existing user data.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists privacy jsonb not null default
  '{"publicProfile": true, "showStats": true, "socialPresence": true, "friendRankings": false}'::jsonb;

create table if not exists public.titan_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.titan_social_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('friend_add', 'friend_remove', 'block_user', 'unblock_user')),
  target_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists titan_user_blocks_blocker_idx on public.titan_user_blocks(blocker_id, created_at desc);
create index if not exists titan_user_blocks_blocked_idx on public.titan_user_blocks(blocked_id, created_at desc);
create index if not exists titan_social_action_actor_idx on public.titan_social_action_log(actor_id, action, created_at desc);

alter table public.titan_user_blocks enable row level security;
alter table public.titan_social_action_log enable row level security;

grant select, insert, delete on public.titan_user_blocks to authenticated;
revoke all on public.titan_social_action_log from anon, authenticated;

drop policy if exists "titan_blocks_select_own" on public.titan_user_blocks;
drop policy if exists "titan_blocks_insert_own" on public.titan_user_blocks;
drop policy if exists "titan_blocks_delete_own" on public.titan_user_blocks;

create policy "titan_blocks_select_own"
on public.titan_user_blocks
for select
to authenticated
using (blocker_id = auth.uid() or blocked_id = auth.uid());

create policy "titan_blocks_insert_own"
on public.titan_user_blocks
for insert
to authenticated
with check (blocker_id = auth.uid());

create policy "titan_blocks_delete_own"
on public.titan_user_blocks
for delete
to authenticated
using (blocker_id = auth.uid());

create or replace function public.titan_social_rate_limit(p_actor_id uuid, p_action text, p_window interval, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.titan_social_action_log
  where actor_id = p_actor_id
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'SOCIAL_RATE_LIMIT' using errcode = '42900';
  end if;
end;
$$;

create or replace function public.titan_guard_friendship_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if new.user_id_1 <> auth.uid() then
    raise exception 'FRIENDSHIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.titan_user_blocks b
    where (b.blocker_id = new.user_id_1 and b.blocked_id = new.user_id_2)
       or (b.blocker_id = new.user_id_2 and b.blocked_id = new.user_id_1)
  ) then
    raise exception 'USER_BLOCKED' using errcode = '42501';
  end if;

  if to_regclass('public.profiles') is not null and exists (
    select 1 from public.profiles p
    where p.id = new.user_id_2
      and (
        coalesce(p.is_suspended, false) is true
        or coalesce((p.privacy->>'socialPresence')::boolean, true) is false
        or coalesce((p.privacy->>'publicProfile')::boolean, true) is false
      )
  ) then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = '42501';
  end if;

  perform public.titan_social_rate_limit(auth.uid(), 'friend_add', interval '1 day', 25);

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'friend_add', new.user_id_2);

  return new;
end;
$$;

drop trigger if exists titan_guard_friendship_insert on public.friendships;
create trigger titan_guard_friendship_insert
before insert on public.friendships
for each row
execute function public.titan_guard_friendship_insert();

create or replace function public.titan_guard_friendship_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.titan_social_rate_limit(auth.uid(), 'friend_remove', interval '1 hour', 30);

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'friend_remove', case when old.user_id_1 = auth.uid() then old.user_id_2 else old.user_id_1 end);

  return old;
end;
$$;

drop trigger if exists titan_guard_friendship_delete on public.friendships;
create trigger titan_guard_friendship_delete
before delete on public.friendships
for each row
execute function public.titan_guard_friendship_delete();

create or replace function public.titan_block_user(p_blocked_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_blocked_id = auth.uid() then
    raise exception 'CANNOT_BLOCK_SELF' using errcode = '22023';
  end if;

  perform public.titan_social_rate_limit(auth.uid(), 'block_user', interval '1 day', 50);

  insert into public.titan_user_blocks(blocker_id, blocked_id, reason)
  values (auth.uid(), p_blocked_id, left(trim(coalesce(p_reason, '')), 180))
  on conflict (blocker_id, blocked_id) do update set
    reason = excluded.reason,
    created_at = now();

  delete from public.friendships
  where (user_id_1 = auth.uid() and user_id_2 = p_blocked_id)
     or (user_id_1 = p_blocked_id and user_id_2 = auth.uid());

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'block_user', p_blocked_id);

  return true;
end;
$$;

create or replace function public.titan_unblock_user(p_blocked_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  delete from public.titan_user_blocks
  where blocker_id = auth.uid()
    and blocked_id = p_blocked_id;

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'unblock_user', p_blocked_id);

  return true;
end;
$$;

drop function if exists public.titan_list_my_friends();

create function public.titan_list_my_friends()
returns table (
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
  ),
  sport_counts as (
    select tl.user_id, tl.sport, count(*) as n
    from public.training_logs tl
    join friend_ids fi on fi.friend_id = tl.user_id
    group by tl.user_id, tl.sport
  ),
  fav as (
    select distinct on (user_id) user_id, sport
    from sport_counts
    order by user_id, n desc, sport asc
  )
  select
    p.id,
    case when coalesce((p.privacy->>'publicProfile')::boolean, true) then p.username else 'Agent prive' end as username,
    case when coalesce((p.privacy->>'publicProfile')::boolean, true) then p.friend_code else null end as friend_code,
    case when coalesce((p.privacy->>'showStats')::boolean, true) then p.level else 1 end as level,
    case when coalesce((p.privacy->>'publicProfile')::boolean, true) then p.avatar else null end as avatar,
    p.is_elite,
    p.is_suspended,
    case when coalesce((p.privacy->>'showStats')::boolean, true) then count(tl.id)::integer else 0 end as total_sessions,
    case when coalesce((p.privacy->>'showStats')::boolean, true) then fav.sport else null end as fav_sport
  from friend_ids f
  join public.profiles p on p.id = f.friend_id
  left join public.training_logs tl on tl.user_id = p.id
  left join fav on fav.user_id = p.id
  where coalesce(p.is_suspended, false) is false
    and not exists (
      select 1 from public.titan_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and coalesce((p.privacy->>'socialPresence')::boolean, true) is true
  group by p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended, p.privacy, fav.sport
  order by p.level desc nulls last, p.username asc nulls last;
end;
$$;

revoke all on function public.titan_social_rate_limit(uuid, text, interval, integer) from public;
revoke all on function public.titan_block_user(uuid, text) from public;
revoke all on function public.titan_unblock_user(uuid) from public;
revoke all on function public.titan_list_my_friends() from public;
grant execute on function public.titan_block_user(uuid, text) to authenticated;
grant execute on function public.titan_unblock_user(uuid) to authenticated;
grant execute on function public.titan_list_my_friends() to authenticated;

notify pgrst, 'reload schema';

commit;

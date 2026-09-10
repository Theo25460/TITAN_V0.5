begin;

-- TITAN OS v43 broad unblock.
-- Goal: get the live app back to a pre-v43 compatible state without deleting users,
-- profiles, history, shop purchases, or social data.
--
-- Run this once in Supabase SQL Editor if the site still fails after the small repair.

create extension if not exists pgcrypto;

-- 1) Remove any v43 constraints that can reject browser writes.
do $$
begin
  if to_regclass('public.training_logs') is not null then
    alter table public.training_logs drop constraint if exists training_logs_xp_reasonable_v43;
    alter table public.training_logs drop constraint if exists training_logs_details_size_v43;
  end if;
end $$;

-- 2) Put sports config back into a conservative shape.
-- This disables the v43 dynamic extras/rules while keeping the columns available.
do $$
begin
  if to_regclass('public.sports') is not null then
    alter table public.sports add column if not exists extra_fields jsonb default '[]'::jsonb;
    alter table public.sports add column if not exists xp_rules jsonb default '{}'::jsonb;
    alter table public.sports add column if not exists validation_rules jsonb default '{}'::jsonb;
    alter table public.sports add column if not exists balance_profile text default 'generic';

    update public.sports
    set
      extra_fields = '[]'::jsonb,
      xp_rules = '{}'::jsonb,
      validation_rules = '{}'::jsonb,
      balance_profile = 'generic'
    where true;
  end if;
end $$;

-- 3) Re-apply the core RLS policies expected by the current front.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  game_state jsonb default '{}'::jsonb,
  level integer default 1,
  credits integer default 200,
  avatar text,
  inventory jsonb default '{}'::jsonb,
  is_elite boolean default false,
  is_tester boolean default false,
  friend_code text unique,
  streak_count integer default 0,
  last_week_id text,
  last_seen_news_version text,
  unlocked_talents jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text not null,
  category text default 'training',
  val numeric not null default 0,
  unit text,
  xp integer default 0,
  details jsonb default '{}'::jsonb,
  date timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.training_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.training_logs to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

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

drop policy if exists "training_logs_select_own" on public.training_logs;
drop policy if exists "training_logs_insert_own" on public.training_logs;
drop policy if exists "training_logs_update_own" on public.training_logs;
drop policy if exists "training_logs_delete_own" on public.training_logs;

create policy "training_logs_select_own"
on public.training_logs
for select
to authenticated
using (user_id = auth.uid());

create policy "training_logs_insert_own"
on public.training_logs
for insert
to authenticated
with check (user_id = auth.uid());

create policy "training_logs_update_own"
on public.training_logs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "training_logs_delete_own"
on public.training_logs
for delete
to authenticated
using (user_id = auth.uid());

-- 4) Restore public read access for static config tables when they exist.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sports',
    'mobs',
    'bosses',
    'talents',
    'achievements_config',
    'global_config',
    'fun_stats',
    'shop_items',
    'news_updates'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select on public.%I to anon, authenticated', table_name);
    end if;
  end loop;
end $$;

-- 5) Disable v43 generated functions so they cannot be reused accidentally.
drop function if exists public.titan_v43_sport_profile(text, text, text, text);
drop function if exists public.titan_v43_extra_fields(text);
drop function if exists public.titan_v43_xp_rules(text);

-- 6) Ask PostgREST/Supabase API to refresh its schema cache.
notify pgrst, 'reload schema';

commit;

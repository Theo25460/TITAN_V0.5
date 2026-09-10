begin;

create extension if not exists pgcrypto;

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

alter table public.training_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.training_logs add column if not exists sport text;
alter table public.training_logs add column if not exists category text default 'training';
alter table public.training_logs add column if not exists val numeric default 0;
alter table public.training_logs add column if not exists unit text;
alter table public.training_logs add column if not exists xp integer default 0;
alter table public.training_logs add column if not exists details jsonb default '{}'::jsonb;
alter table public.training_logs add column if not exists date timestamptz default now();

create index if not exists training_logs_user_date_idx
on public.training_logs(user_id, date desc);

alter table public.training_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.training_logs to authenticated;

drop policy if exists "training_logs_own_all" on public.training_logs;
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

-- Policies utiles aux prochains ecrans qui ecrivent avec auth.uid().
alter table if exists public.profiles enable row level security;
grant select, insert, update, delete on public.profiles to authenticated;

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

commit;

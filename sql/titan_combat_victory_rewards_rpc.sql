begin;

-- TITAN OS - Server-side combat victory rewards.
-- Purpose: connected users get bounded XP/credits from Supabase, plus combat logs and bestiary.
-- Safe to rerun.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists credits integer not null default 0;

alter table if exists public.profiles
  add column if not exists xp integer not null default 0;

create table if not exists public.user_bestiary (
  user_id uuid not null references auth.users(id) on delete cascade,
  enemy_key text not null,
  enemy_type text not null check (enemy_type in ('MOB','BOSS')),
  enemy_id text,
  name text,
  defeats integer not null default 0 check (defeats >= 0),
  weakness text,
  rarity jsonb default '{}'::jsonb,
  first_seen_at timestamptz default now(),
  last_defeated_at timestamptz,
  primary key (user_id, enemy_key)
);

alter table if exists public.user_bestiary add column if not exists enemy_id text;
alter table if exists public.user_bestiary add column if not exists name text;
alter table if exists public.user_bestiary add column if not exists weakness text;
alter table if exists public.user_bestiary add column if not exists rarity jsonb default '{}'::jsonb;
alter table if exists public.user_bestiary add column if not exists first_seen_at timestamptz default now();
alter table if exists public.user_bestiary add column if not exists last_defeated_at timestamptz;

create table if not exists public.combat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  enemy_key text not null,
  enemy_type text not null check (enemy_type in ('MOB','BOSS')),
  enemy_id text,
  name text,
  result text not null default 'victory' check (result in ('victory','defeat','escape')),
  damage integer not null default 0 check (damage >= 0),
  reward_xp integer not null default 0 check (reward_xp >= 0 and reward_xp <= 10000),
  reward_credits integer not null default 0 check (reward_credits >= 0 and reward_credits <= 10000),
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table if exists public.combat_logs add column if not exists enemy_id text;
alter table if exists public.combat_logs add column if not exists name text;
alter table if exists public.combat_logs add column if not exists details jsonb default '{}'::jsonb;
alter table if exists public.combat_logs add column if not exists created_at timestamptz default now();

create index if not exists combat_logs_user_date_idx
on public.combat_logs(user_id, created_at desc);

alter table public.user_bestiary enable row level security;
alter table public.combat_logs enable row level security;

revoke all on public.user_bestiary from anon;
revoke all on public.combat_logs from anon;
grant select on public.user_bestiary to authenticated;
grant select on public.combat_logs to authenticated;

drop policy if exists "user_bestiary_select_own" on public.user_bestiary;
drop policy if exists "user_bestiary_insert_own" on public.user_bestiary;
drop policy if exists "user_bestiary_update_own" on public.user_bestiary;
drop policy if exists "combat_logs_select_own" on public.combat_logs;
drop policy if exists "combat_logs_insert_own" on public.combat_logs;

create policy "user_bestiary_select_own"
on public.user_bestiary
for select
to authenticated
using (user_id = auth.uid());

create policy "combat_logs_select_own"
on public.combat_logs
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.titan_submit_combat_victory(
  p_enemy_key text,
  p_enemy_type text,
  p_enemy_id text default null,
  p_name text default null,
  p_level integer default 1,
  p_reward_mult numeric default 1,
  p_damage integer default 0,
  p_details jsonb default '{}'::jsonb
)
returns table (
  combat_log_id uuid,
  reward_xp integer,
  reward_credits integer,
  credits_after integer,
  xp_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_enemy_key text := left(regexp_replace(trim(coalesce(p_enemy_key, '')), '[[:cntrl:]]', '', 'g'), 120);
  v_enemy_type text := upper(left(trim(coalesce(p_enemy_type, 'MOB')), 12));
  v_enemy_id text := nullif(left(regexp_replace(trim(coalesce(p_enemy_id, '')), '[[:cntrl:]]', '', 'g'), 80), '');
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_name, '')), '[[:cntrl:]]', '', 'g'), 120), '');
  v_level integer := least(500, greatest(1, coalesce(p_level, 1)));
  v_reward_mult numeric := least(10, greatest(0.1, coalesce(p_reward_mult, 1)));
  v_damage integer := least(10000000, greatest(0, coalesce(p_damage, 0)));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_recent_count integer;
  v_base_credits integer;
  v_credits integer;
  v_xp integer;
  v_log_id uuid;
  v_credits_after integer;
  v_xp_after integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_enemy_key = '' then
    raise exception 'ENEMY_KEY_REQUIRED' using errcode = '22023';
  end if;

  if v_enemy_type not in ('MOB', 'BOSS') then
    raise exception 'ENEMY_TYPE_INVALID' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent_count
  from public.combat_logs
  where user_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent_count >= 40 then
    raise exception 'COMBAT_RATE_LIMIT' using errcode = '23514';
  end if;

  v_base_credits := floor((case when v_enemy_type = 'BOSS' then 500 * v_level else 50 end) * v_reward_mult)::integer;
  v_credits := case
    when v_enemy_type = 'BOSS' then least(10000, greatest(1, v_base_credits))
    else least(500, greatest(1, v_base_credits))
  end;
  v_xp := case
    when v_enemy_type = 'BOSS' then least(900, greatest(25, floor(v_credits * 0.22)::integer))
    else 18
  end;

  update public.profiles as p
  set credits = coalesce(p.credits, 0) + v_credits,
      xp = coalesce(p.xp, 0) + v_xp,
      updated_at = now()
  where p.id = v_uid
  returning p.credits::integer, p.xp::integer into v_credits_after, v_xp_after;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  insert into public.combat_logs(
    user_id,
    enemy_key,
    enemy_type,
    enemy_id,
    name,
    result,
    damage,
    reward_xp,
    reward_credits,
    details
  )
  values (
    v_uid,
    v_enemy_key,
    v_enemy_type,
    v_enemy_id,
    v_name,
    'victory',
    v_damage,
    v_xp,
    v_credits,
    v_details || jsonb_build_object(
      'serverReward',
      true,
      'serverVersion',
      'combat-public-release-v1',
      'rewardMult',
      v_reward_mult,
      'level',
      v_level
    )
  )
  returning id into v_log_id;

  insert into public.user_bestiary(
    user_id,
    enemy_key,
    enemy_type,
    enemy_id,
    name,
    defeats,
    last_defeated_at
  )
  values (
    v_uid,
    v_enemy_key,
    v_enemy_type,
    v_enemy_id,
    v_name,
    1,
    now()
  )
  on conflict (user_id, enemy_key) do update
  set defeats = public.user_bestiary.defeats + 1,
      enemy_type = excluded.enemy_type,
      enemy_id = coalesce(excluded.enemy_id, public.user_bestiary.enemy_id),
      name = coalesce(excluded.name, public.user_bestiary.name),
      last_defeated_at = now();

  return query
  select v_log_id, v_xp, v_credits, v_credits_after, v_xp_after;
end;
$$;

revoke all on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) from public;
grant execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

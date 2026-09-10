begin;

-- TITAN OS - Server-authoritative progression.
-- Purpose: XP, level-up and level credit bonuses are decided by Supabase, not by the browser.
-- Safe to rerun. Drops/recreates reward RPCs because their return type is extended.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  game_state jsonb default '{}'::jsonb,
  credits integer default 0,
  level integer default 1,
  xp integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists game_state jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists credits integer not null default 0;
alter table public.profiles add column if not exists level integer not null default 1;
alter table public.profiles add column if not exists xp integer not null default 0;
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles as p
set
  xp = greatest(
    coalesce(p.xp, 0),
    case
      when coalesce(p.game_state #>> '{user,xp}', '') ~ '^[0-9]+$'
      then (p.game_state #>> '{user,xp}')::integer
      else 0
    end
  ),
  level = greatest(
    coalesce(p.level, 1),
    case
      when coalesce(p.game_state #>> '{user,level}', '') ~ '^[0-9]+$'
      then (p.game_state #>> '{user,level}')::integer
      else 1
    end
  ),
  credits = greatest(
    coalesce(p.credits, 0),
    case
      when coalesce(p.game_state #>> '{user,credits}', '') ~ '^[0-9]+$'
      then (p.game_state #>> '{user,credits}')::integer
      else 0
    end
  )
where p.game_state is not null;

create or replace function public.titan_level_requirement(p_level integer)
returns integer
language sql
immutable
as $$
  select greatest(1, floor(2200 * power(greatest(1, coalesce(p_level, 1))::numeric, 1.18))::integer);
$$;

revoke all on function public.titan_level_requirement(integer) from public;
grant execute on function public.titan_level_requirement(integer) to authenticated;

create or replace function public.titan_apply_progression_reward(
  p_user_id uuid,
  p_reward_xp integer,
  p_reward_credits integer
)
returns table (
  credits_after integer,
  xp_after integer,
  level_after integer,
  level_bonus integer,
  leveled_up integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := p_user_id;
  v_reward_xp integer := greatest(0, least(coalesce(p_reward_xp, 0), 25000));
  v_reward_credits integer := greatest(0, least(coalesce(p_reward_credits, 0), 25000));
  v_xp integer;
  v_level integer;
  v_credits integer;
  v_req integer;
  v_level_bonus integer := 0;
  v_leveled_up integer := 0;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles(id, username, game_state, credits, level, xp, updated_at)
  values (v_uid, 'Agent', '{}'::jsonb, 0, 1, 0, now())
  on conflict (id) do nothing;

  select
    greatest(0, coalesce(p.xp, 0)),
    greatest(1, coalesce(p.level, 1)),
    greatest(0, coalesce(p.credits, 0)),
    coalesce(p.game_state, '{}'::jsonb)
  into v_xp, v_level, v_credits, v_state
  from public.profiles as p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  v_xp := v_xp + v_reward_xp;
  v_credits := v_credits + v_reward_credits;

  while v_leveled_up < 20 loop
    v_req := public.titan_level_requirement(v_level);
    exit when v_xp < v_req;

    v_xp := v_xp - v_req;
    v_level := v_level + 1;
    v_level_bonus := v_level_bonus + greatest(150, floor(180 + (v_level * 35))::integer);
    v_leveled_up := v_leveled_up + 1;
  end loop;

  v_credits := v_credits + v_level_bonus;

  v_state := coalesce(v_state, '{}'::jsonb);
  v_state := jsonb_set(
    v_state,
    '{user}',
    case when jsonb_typeof(v_state -> 'user') = 'object' then v_state -> 'user' else '{}'::jsonb end,
    true
  );
  v_state := jsonb_set(
    v_state,
    '{meta}',
    case when jsonb_typeof(v_state -> 'meta') = 'object' then v_state -> 'meta' else '{}'::jsonb end,
    true
  );
  v_state := jsonb_set(v_state, '{user,xp}', to_jsonb(v_xp), true);
  v_state := jsonb_set(v_state, '{user,level}', to_jsonb(v_level), true);
  v_state := jsonb_set(v_state, '{user,credits}', to_jsonb(v_credits), true);
  v_state := jsonb_set(v_state, '{meta,updatedAt}', to_jsonb(now()), true);

  update public.profiles as p
  set xp = v_xp,
      level = v_level,
      credits = v_credits,
      game_state = v_state,
      updated_at = now()
  where p.id = v_uid;

  credits_after := v_credits;
  xp_after := v_xp;
  level_after := v_level;
  level_bonus := v_level_bonus;
  leveled_up := v_leveled_up;
  return next;
end;
$$;

revoke all on function public.titan_apply_progression_reward(uuid, integer, integer) from public;

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
grant usage on schema public to authenticated;
revoke all on table public.training_logs from anon;
grant select, insert on table public.training_logs to authenticated;

drop policy if exists "training_logs_select_own" on public.training_logs;
create policy "training_logs_select_own"
on public.training_logs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "training_logs_insert_own" on public.training_logs;
create policy "training_logs_insert_own"
on public.training_logs
for insert
to authenticated
with check (user_id = auth.uid());

create or replace function public.titan_numeric_from_json(p_payload jsonb, p_key text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_text text;
begin
  v_text := nullif(p_payload ->> p_key, '');
  if v_text is null then return null; end if;
  return v_text::numeric;
exception when others then
  return null;
end;
$$;

revoke all on function public.titan_numeric_from_json(jsonb, text) from public;

drop function if exists public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz);

create function public.titan_submit_training_session(
  p_sport text,
  p_category text,
  p_val numeric,
  p_unit text default '',
  p_details jsonb default '{}'::jsonb,
  p_date timestamptz default now()
)
returns table (
  log_id text,
  xp integer,
  credits integer,
  credits_after integer,
  xp_after integer,
  level_after integer,
  level_bonus integer,
  leveled_up integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_sport text := left(regexp_replace(trim(coalesce(p_sport, 'unknown')), '[[:cntrl:]]', '', 'g'), 80);
  v_category text := left(regexp_replace(trim(coalesce(p_category, 'training')), '[[:cntrl:]]', '', 'g'), 80);
  v_unit text := left(regexp_replace(trim(coalesce(p_unit, '')), '[[:cntrl:]]', '', 'g'), 24);
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_val numeric := coalesce(p_val, 0);
  v_duration numeric;
  v_elevation numeric;
  v_base numeric;
  v_xp integer;
  v_credits integer;
  v_log_id text;
  v_progress record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_val <= 0 or v_val > 300000 then
    raise exception 'TRAINING_VALUE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  if p_date > now() + interval '10 minutes' or p_date < now() - interval '30 days' then
    raise exception 'TRAINING_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  v_duration := coalesce(
    nullif(public.titan_numeric_from_json(v_details, 'val2'), 0),
    nullif(public.titan_numeric_from_json(v_details, 'duration'), 0),
    0
  );
  v_elevation := coalesce(public.titan_numeric_from_json(v_details, 'elevation'), 0);

  if v_duration < 0 or v_duration > 1440 then
    raise exception 'TRAINING_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  v_base := case
    when v_unit = 'kg' then v_val * 0.045
    when v_unit = 'km' then v_val * 55
    when v_category ilike '%cardio%' then v_val * 18
    when v_category ilike '%muscu%' or v_category ilike '%force%' then v_val * 0.05
    else v_val * 10
  end;

  v_base := v_base + least(v_duration * 2, 240) + least(greatest(v_elevation, 0) * 0.18, 220);
  v_xp := least(1200, greatest(1, floor(v_base)::integer));
  v_credits := greatest(1, floor(v_xp / 2)::integer);

  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details)
  values (
    v_user_id,
    v_sport,
    v_category,
    v_val,
    v_unit,
    v_xp,
    coalesce(p_date, now()),
    v_details || jsonb_build_object('serverReward', true, 'serverVersion', 'progression-authority-v1')
  )
  returning id::text into v_log_id;

  select *
  into v_progress
  from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);

  return query
  select
    v_log_id,
    v_xp,
    v_credits,
    v_progress.credits_after::integer,
    v_progress.xp_after::integer,
    v_progress.level_after::integer,
    v_progress.level_bonus::integer,
    v_progress.leveled_up::integer;
end;
$$;

revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;

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
drop policy if exists "combat_logs_select_own" on public.combat_logs;

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

drop function if exists public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb);

create function public.titan_submit_combat_victory(
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
  xp_after integer,
  level_after integer,
  level_bonus integer,
  leveled_up integer
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
  v_progress record;
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

  select *
  into v_progress
  from public.titan_apply_progression_reward(v_uid, v_xp, v_credits);

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
      'progression-authority-v1',
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
  select
    v_log_id,
    v_xp,
    v_credits,
    v_progress.credits_after::integer,
    v_progress.xp_after::integer,
    v_progress.level_after::integer,
    v_progress.level_bonus::integer,
    v_progress.leveled_up::integer;
end;
$$;

revoke all on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) from public;
grant execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

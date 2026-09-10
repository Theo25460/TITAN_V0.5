begin;

-- TITAN OS - First server-side training reward RPC.
-- Goal: start moving critical rewards away from browser-only calculation.
-- Safe to rerun. Front can keep legacy insert until this RPC is wired.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  game_state jsonb default '{}'::jsonb,
  credits integer default 0,
  level integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists game_state jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists credits integer default 0;
alter table public.profiles add column if not exists level integer default 1;
alter table public.profiles add column if not exists updated_at timestamptz default now();

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
grant select, insert on public.training_logs to authenticated;

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

create or replace function public.titan_submit_training_session(
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
  credits integer
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
    v_details || jsonb_build_object('serverReward', true, 'serverVersion', 'public-release-v1')
  )
  returning id::text into v_log_id;

  update public.profiles as p
  set credits = coalesce(p.credits, 0) + v_credits,
      updated_at = now()
  where p.id = v_user_id;

  if not found then
    insert into public.profiles(id, username, game_state, credits, level, updated_at)
    values (v_user_id, 'Agent', '{}'::jsonb, v_credits, 1, now())
    on conflict (id) do update
    set credits = coalesce(public.profiles.credits, 0) + excluded.credits,
        updated_at = now();
  end if;

  log_id := v_log_id;
  xp := v_xp;
  credits := v_credits;
  return next;
end;
$$;

revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;

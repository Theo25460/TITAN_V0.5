begin;

-- TITAN OS - Public economy and clarity foundation
-- Applied after the v64 cloud/social foundation.
-- Goals:
-- - Social actions cost credits server-side.
-- - Chat content has server-side length limits with Elite extension.
-- - Global/private-style messages expire after 48h; guild messages after 72h.
-- - Weekly XP/credit rewards are capped so progression cannot finish too fast.

create extension if not exists pgcrypto;

create table if not exists public.titan_weekly_reward_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  credits_awarded integer not null default 0 check (credits_awarded >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.titan_weekly_reward_usage enable row level security;
revoke all on table public.titan_weekly_reward_usage from anon, authenticated;

alter table if exists public.messages add column if not exists expires_at timestamptz;
alter table if exists public.messages add column if not exists cost_credits integer not null default 0;
alter table if exists public.messages add column if not exists hidden_at timestamptz;
alter table if exists public.guild_messages add column if not exists expires_at timestamptz;
alter table if exists public.guild_messages add column if not exists cost_credits integer not null default 0;

update public.messages
set expires_at = coalesce(expires_at, created_at + interval '48 hours')
where expires_at is null;

update public.guild_messages
set expires_at = coalesce(expires_at, created_at + interval '72 hours'),
    content = left(content, 700)
where expires_at is null
   or char_length(content) > 700;

do $$
begin
  alter table public.guild_messages drop constraint if exists guild_messages_content_check;
  alter table public.guild_messages drop constraint if exists guild_messages_content_len_check;
  alter table public.guild_messages
    add constraint guild_messages_content_len_check
    check (char_length(content) between 1 and 700);
exception when duplicate_object then
  null;
end $$;

create index if not exists titan_weekly_reward_usage_user_week_idx
on public.titan_weekly_reward_usage(user_id, week_start);

create index if not exists messages_expires_at_idx
on public.messages(expires_at);

create index if not exists guild_messages_expires_at_idx
on public.guild_messages(expires_at);

create or replace function public.titan_week_start(p_at timestamptz default now())
returns date
language sql
stable
as $$
  select date_trunc('week', coalesce(p_at, now()))::date;
$$;

create or replace function public.titan_economy_limits(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_elite boolean := false;
begin
  if p_user_id is not null then
    select coalesce(is_elite, false)
    into v_is_elite
    from public.profiles
    where id = p_user_id;
  end if;

  return jsonb_build_object(
    'isElite', coalesce(v_is_elite, false),
    'chatGlobalCost', 2,
    'chatGuildCost', 3,
    'guildCreateCost', 3000,
    'messageMaxLength', case when coalesce(v_is_elite, false) then 700 else 280 end,
    'freeMessageMaxLength', 280,
    'eliteMessageMaxLength', 700,
    'globalRetentionHours', 48,
    'guildRetentionHours', 72,
    'weeklyXpCap', case when coalesce(v_is_elite, false) then 11520 else 9600 end,
    'weeklyCreditCap', case when coalesce(v_is_elite, false) then 5760 else 4800 end,
    'eliteCapMultiplier', 1.2
  );
end;
$$;

create or replace function public.titan_clean_economy_message(
  p_content text,
  p_max_length integer
)
returns text
language sql
immutable
as $$
  select left(
    regexp_replace(
      btrim(coalesce(p_content, '')),
      '[[:cntrl:]<>`{}]',
      '',
      'g'
    ),
    greatest(1, coalesce(p_max_length, 280))
  );
$$;

create or replace function public.titan_charge_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text default 'economy'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer := greatest(0, coalesce(p_amount, 0));
  v_credits_after integer;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles(id, username, game_state, credits, level, xp, updated_at)
  values (p_user_id, 'Agent', '{}'::jsonb, 0, 1, 0, now())
  on conflict (id) do nothing;

  if v_amount = 0 then
    select greatest(0, coalesce(credits, 0))
    into v_credits_after
    from public.profiles
    where id = p_user_id;
    return coalesce(v_credits_after, 0);
  end if;

  update public.profiles
  set credits = greatest(0, coalesce(credits, 0)) - v_amount,
      updated_at = now()
  where id = p_user_id
    and greatest(0, coalesce(credits, 0)) >= v_amount
  returning credits::integer into v_credits_after;

  if v_credits_after is null then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = '23514';
  end if;

  return v_credits_after;
end;
$$;

create or replace function public.titan_apply_weekly_reward_cap(
  p_user_id uuid,
  p_requested_xp integer,
  p_requested_credits integer
)
returns table (
  xp_awarded integer,
  credits_awarded integer,
  xp_cap integer,
  credit_cap integer,
  xp_used integer,
  credits_used integer,
  is_capped boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := public.titan_week_start(now());
  v_limits jsonb := public.titan_economy_limits(p_user_id);
  v_xp_requested integer := greatest(0, coalesce(p_requested_xp, 0));
  v_credits_requested integer := greatest(0, coalesce(p_requested_credits, 0));
  v_usage public.titan_weekly_reward_usage%rowtype;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  xp_cap := greatest(0, coalesce((v_limits ->> 'weeklyXpCap')::integer, 9600));
  credit_cap := greatest(0, coalesce((v_limits ->> 'weeklyCreditCap')::integer, 4800));

  insert into public.titan_weekly_reward_usage(user_id, week_start, xp_awarded, credits_awarded, updated_at)
  values (p_user_id, v_week, 0, 0, now())
  on conflict (user_id, week_start) do nothing;

  select *
  into v_usage
  from public.titan_weekly_reward_usage
  where user_id = p_user_id
    and week_start = v_week
  for update;

  xp_awarded := least(v_xp_requested, greatest(0, xp_cap - coalesce(v_usage.xp_awarded, 0)));
  credits_awarded := least(v_credits_requested, greatest(0, credit_cap - coalesce(v_usage.credits_awarded, 0)));

  update public.titan_weekly_reward_usage as usage_row
  set xp_awarded = usage_row.xp_awarded + titan_apply_weekly_reward_cap.xp_awarded,
      credits_awarded = usage_row.credits_awarded + titan_apply_weekly_reward_cap.credits_awarded,
      updated_at = now()
  where usage_row.user_id = p_user_id
    and usage_row.week_start = v_week;

  xp_used := coalesce(v_usage.xp_awarded, 0) + xp_awarded;
  credits_used := coalesce(v_usage.credits_awarded, 0) + credits_awarded;
  is_capped := xp_awarded < v_xp_requested or credits_awarded < v_credits_requested;
  return next;
end;
$$;

create or replace function public.titan_get_economy_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := public.titan_week_start(now());
  v_limits jsonb;
  v_usage public.titan_weekly_reward_usage%rowtype;
  v_credits integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles(id, username, game_state, credits, level, xp, updated_at)
  values (v_uid, 'Agent', '{}'::jsonb, 0, 1, 0, now())
  on conflict (id) do nothing;

  insert into public.titan_weekly_reward_usage(user_id, week_start, xp_awarded, credits_awarded, updated_at)
  values (v_uid, v_week, 0, 0, now())
  on conflict (user_id, week_start) do nothing;

  select greatest(0, coalesce(credits, 0))
  into v_credits
  from public.profiles
  where id = v_uid;

  select *
  into v_usage
  from public.titan_weekly_reward_usage
  where user_id = v_uid
    and week_start = v_week;

  v_limits := public.titan_economy_limits(v_uid);

  return v_limits || jsonb_build_object(
    'credits', coalesce(v_credits, 0),
    'weekStart', v_week,
    'weeklyXpUsed', coalesce(v_usage.xp_awarded, 0),
    'weeklyCreditsUsed', coalesce(v_usage.credits_awarded, 0),
    'weeklyXpRemaining', greatest(0, coalesce((v_limits ->> 'weeklyXpCap')::integer, 9600) - coalesce(v_usage.xp_awarded, 0)),
    'weeklyCreditsRemaining', greatest(0, coalesce((v_limits ->> 'weeklyCreditCap')::integer, 4800) - coalesce(v_usage.credits_awarded, 0))
  );
end;
$$;

create or replace function public.titan_purge_expired_social_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_step integer := 0;
begin
  delete from public.messages
  where coalesce(expires_at, created_at + interval '48 hours') < now();
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + coalesce(v_step, 0);

  delete from public.guild_messages
  where coalesce(expires_at, created_at + interval '72 hours') < now();
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + coalesce(v_step, 0);

  return v_deleted;
end;
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    begin
      execute 'select cron.unschedule(''titan_purge_expired_social_messages'')';
    exception when others then
      null;
    end;

    begin
      execute 'select cron.schedule(
        ''titan_purge_expired_social_messages'',
        ''15 * * * *'',
        ''select public.titan_purge_expired_social_messages();''
      )';
    exception when others then
      raise notice 'cron schedule skipped, purge remains RPC-triggered: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron schema unavailable, purge remains RPC-triggered.';
  end if;
end $$;

drop function if exists public.titan_list_global_messages();
create function public.titan_list_global_messages()
returns table(
  id text,
  sender_id uuid,
  sender_name text,
  content text,
  channel text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  return query
  select m.id::text, m.sender_id, m.sender_name, m.content, 'global'::text, m.created_at
  from public.messages m
  where coalesce(m.expires_at, m.created_at + interval '48 hours') > now()
    and m.hidden_at is null
  order by m.created_at asc
  limit 90;
end;
$$;

drop function if exists public.titan_send_global_message(text);
create function public.titan_send_global_message(p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limits jsonb;
  v_max integer;
  v_cost integer;
  v_content text;
  v_sender text;
  v_message public.messages%rowtype;
  v_recent integer := 0;
  v_credits_after integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  v_limits := public.titan_economy_limits(v_uid);
  v_max := coalesce((v_limits ->> 'messageMaxLength')::integer, 280);
  v_cost := coalesce((v_limits ->> 'chatGlobalCost')::integer, 2);
  v_content := public.titan_clean_economy_message(p_content, v_max);

  if v_content = '' then
    raise exception 'MESSAGE_EMPTY' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent
  from public.messages
  where sender_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent >= 5 then
    raise exception 'CHAT_RATE_LIMIT' using errcode = '42900';
  end if;

  v_credits_after := public.titan_charge_credits(v_uid, v_cost, 'chat_global');
  v_sender := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  insert into public.messages(sender_id, sender_name, content, expires_at, cost_credits)
  values (v_uid, v_sender, v_content, now() + interval '48 hours', v_cost)
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id,
    'sender_id', v_message.sender_id,
    'sender_name', v_message.sender_name,
    'content', v_message.content,
    'channel', 'global',
    'created_at', v_message.created_at,
    'cost', v_cost,
    'maxLength', v_max,
    'credits_after', v_credits_after
  );
end;
$$;

create or replace function public.titan_guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
  v_max integer := 280;
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

  v_max := case
    when exists(select 1 from public.profiles where id = auth.uid() and coalesce(is_elite, false) is true)
    then 700
    else 280
  end;

  new.sender_id := auth.uid();
  new.sender_name := public.titan_clean_social_text(new.sender_name, 'Agent', 24);
  new.content := public.titan_clean_economy_message(new.content, v_max);
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
  new.expires_at := coalesce(new.expires_at, now() + interval '48 hours');
  new.cost_credits := coalesce(new.cost_credits, 0);
  return new;
end;
$$;

drop policy if exists "messages_insert_authenticated" on public.messages;
drop policy if exists "messages_select_authenticated" on public.messages;
drop policy if exists "messages_select_authenticated_visible" on public.messages;
drop policy if exists "guild_messages_member_insert" on public.guild_messages;

create policy "messages_select_authenticated_visible"
on public.messages
for select
to authenticated
using (
  coalesce(expires_at, created_at + interval '48 hours') > now()
  and (
    hidden_at is null
    or sender_id = auth.uid()
    or public.titan_is_admin(auth.uid())
  )
);

revoke insert on table public.messages from anon, authenticated;
grant select on table public.messages to authenticated;
revoke insert, update, delete on table public.guild_messages from anon, authenticated;
grant select on table public.guild_messages to authenticated;

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
  v_requested_xp integer;
  v_requested_credits integer;
  v_log_id text;
  v_progress record;
  v_cap record;
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
  v_requested_xp := least(1200, greatest(1, floor(v_base)::integer));
  v_requested_credits := greatest(1, floor(v_requested_xp / 2)::integer);

  select *
  into v_cap
  from public.titan_apply_weekly_reward_cap(v_user_id, v_requested_xp, v_requested_credits);

  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details)
  values (
    v_user_id,
    v_sport,
    v_category,
    v_val,
    v_unit,
    v_xp,
    coalesce(p_date, now()),
    v_details || jsonb_build_object(
      'serverReward',
      true,
      'serverVersion',
      'economy-caps-v1',
      'requestedXp',
      v_requested_xp,
      'requestedCredits',
      v_requested_credits,
      'weeklyXpCap',
      v_cap.xp_cap,
      'weeklyCreditCap',
      v_cap.credit_cap,
      'weeklyCapped',
      coalesce(v_cap.is_capped, false)
    )
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
  v_requested_credits integer;
  v_requested_xp integer;
  v_credits integer;
  v_xp integer;
  v_log_id uuid;
  v_progress record;
  v_cap record;
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
  v_requested_credits := case
    when v_enemy_type = 'BOSS' then least(10000, greatest(1, v_base_credits))
    else least(500, greatest(1, v_base_credits))
  end;
  v_requested_xp := case
    when v_enemy_type = 'BOSS' then least(900, greatest(25, floor(v_requested_credits * 0.22)::integer))
    else 18
  end;

  select *
  into v_cap
  from public.titan_apply_weekly_reward_cap(v_uid, v_requested_xp, v_requested_credits);

  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

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
      'economy-caps-v1',
      'requestedXp',
      v_requested_xp,
      'requestedCredits',
      v_requested_credits,
      'weeklyXpCap',
      v_cap.xp_cap,
      'weeklyCreditCap',
      v_cap.credit_cap,
      'weeklyCapped',
      coalesce(v_cap.is_capped, false),
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

create or replace function public.titan_create_guild(p_name text, p_motto text default '')
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
  v_cost integer;
  v_credits_after integer;
  v_result jsonb;
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

  v_cost := coalesce((public.titan_economy_limits(v_uid) ->> 'guildCreateCost')::integer, 3000);
  v_credits_after := public.titan_charge_credits(v_uid, v_cost, 'guild_create');
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

  v_result := public.titan_get_my_guild();
  return v_result || jsonb_build_object('economy', jsonb_build_object('cost', v_cost, 'credits_after', v_credits_after));
end;
$$;

drop function if exists public.titan_list_guild_messages();
create function public.titan_list_guild_messages()
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

  perform public.titan_purge_expired_social_messages();

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
    and coalesce(m.expires_at, m.created_at + interval '72 hours') > now()
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
  v_limits jsonb;
  v_max integer;
  v_cost integer;
  v_content text;
  v_sender text;
  v_message public.guild_messages%rowtype;
  v_recent integer := 0;
  v_credits_after integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '42501';
  end if;

  v_limits := public.titan_economy_limits(v_uid);
  v_max := coalesce((v_limits ->> 'messageMaxLength')::integer, 280);
  v_cost := coalesce((v_limits ->> 'chatGuildCost')::integer, 3);
  v_content := public.titan_clean_economy_message(p_content, v_max);

  if v_content = '' then
    raise exception 'EMPTY_MESSAGE' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent
  from public.guild_messages
  where sender_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent >= 5 then
    raise exception 'CHAT_RATE_LIMIT' using errcode = '42900';
  end if;

  v_credits_after := public.titan_charge_credits(v_uid, v_cost, 'chat_guild');
  v_sender := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  insert into public.guild_messages(guild_id, sender_id, sender_name, content, expires_at, cost_credits)
  values (v_guild_id, v_uid, v_sender, v_content, now() + interval '72 hours', v_cost)
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id,
    'guild_id', v_message.guild_id,
    'sender_id', v_message.sender_id,
    'sender_name', v_message.sender_name,
    'content', v_message.content,
    'channel', 'guild',
    'created_at', v_message.created_at,
    'cost', v_cost,
    'maxLength', v_max,
    'credits_after', v_credits_after
  );
end;
$$;

revoke all on function public.titan_week_start(timestamptz) from public;
revoke all on function public.titan_economy_limits(uuid) from public;
revoke all on function public.titan_clean_economy_message(text, integer) from public;
revoke all on function public.titan_charge_credits(uuid, integer, text) from public;
revoke all on function public.titan_apply_weekly_reward_cap(uuid, integer, integer) from public;
revoke all on function public.titan_get_economy_status() from public;
revoke all on function public.titan_purge_expired_social_messages() from public;
revoke all on function public.titan_list_global_messages() from public;
revoke all on function public.titan_send_global_message(text) from public;
revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public;
revoke all on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) from public;
revoke all on function public.titan_create_guild(text, text) from public;
revoke all on function public.titan_list_guild_messages() from public;
revoke all on function public.titan_send_guild_message(text) from public;

grant execute on function public.titan_get_economy_status() to authenticated;
grant execute on function public.titan_list_global_messages() to authenticated;
grant execute on function public.titan_send_global_message(text) to authenticated;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;
grant execute on function public.titan_submit_combat_victory(text, text, text, text, integer, numeric, integer, jsonb) to authenticated;
grant execute on function public.titan_create_guild(text, text) to authenticated;
grant execute on function public.titan_list_guild_messages() to authenticated;
grant execute on function public.titan_send_guild_message(text) to authenticated;

notify pgrst, 'reload schema';

commit;

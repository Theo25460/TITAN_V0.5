begin;

-- TITAN OS v66 - Boutique and global economy balance.
-- Purpose:
-- - Mirror the front economy rules server-side.
-- - Keep purchases authoritative for connected users.
-- - Make shop sinks coherent with weekly pacing and Elite non pay-to-win rules.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists credits integer not null default 0;

alter table if exists public.profiles
  add column if not exists inventory jsonb not null default '{}'::jsonb;

alter table if exists public.shop_items
  add column if not exists requires_elite boolean not null default false;

alter table if exists public.shop_items
  add column if not exists economy_tier text;

alter table if exists public.shop_items
  add column if not exists cosmetic_id text;

do $$
begin
  if to_regclass('public.shop_items') is not null then
    update public.shop_items as si
    set
      price = case
        when coalesce(si.type, '') = 'charge' then greatest(coalesce(si.price, 0), greatest(450, greatest(coalesce(si.effect_val, 1), 1) * 90))
        when coalesce(si.type, '') = 'upgrade' then greatest(coalesce(si.price, 0), 1400 + (greatest(coalesce(si.effect_val, 1), 1) - 1) * 1150)
        when coalesce(si.type, '') = 'ad' then 0
        when coalesce(si.type, '') = 'cosmetic' then 0
        else coalesce(si.price, 0)
      end,
      cooldown_type = case
        when coalesce(si.type, '') = 'charge' then 'weekly'
        when coalesce(si.type, '') = 'ad' then 'daily'
        when coalesce(si.type, '') in ('upgrade', 'cosmetic') then 'once'
        else coalesce(nullif(si.cooldown_type, ''), 'none')
      end,
      cooldown_max = case
        when coalesce(si.type, '') = 'charge' then 2
        when coalesce(si.type, '') = 'ad' then 1
        when coalesce(si.type, '') in ('upgrade', 'cosmetic') then 1
        else greatest(coalesce(si.cooldown_max, 1), 1)
      end,
      effect_val = case
        when coalesce(si.type, '') = 'ad' then least(greatest(coalesce(si.effect_val, 0), 0), 120)
        else coalesce(si.effect_val, 0)
      end,
      requires_elite = case
        when coalesce(si.type, '') = 'cosmetic' then true
        else coalesce(si.requires_elite, false)
      end,
      economy_tier = case
        when nullif(si.economy_tier, '') is not null then si.economy_tier
        when coalesce(si.type, '') = 'charge' then 'limited_combat_sink'
        when coalesce(si.type, '') = 'upgrade' then 'long_term_sink'
        when coalesce(si.type, '') = 'ad' then 'voluntary_reward_cap'
        when coalesce(si.type, '') = 'cosmetic' then 'elite_visual_only'
        else null
      end
    where coalesce(si.type, '') in ('charge', 'upgrade', 'ad', 'cosmetic');
  end if;
end $$;

create table if not exists public.shop_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  purchased_at timestamptz not null default now()
);

alter table public.shop_history
  add column if not exists cost_credits integer not null default 0;

alter table public.shop_history
  add column if not exists reward_credits integer not null default 0;

alter table public.shop_history
  add column if not exists economy_meta jsonb not null default '{}'::jsonb;

create index if not exists shop_history_user_item_date_idx
on public.shop_history(user_id, item_id, purchased_at desc);

create index if not exists shop_history_user_type_date_idx
on public.shop_history(user_id, ((economy_meta->>'type')), purchased_at desc);

alter table public.shop_history enable row level security;
revoke all on public.shop_history from anon;
grant select on public.shop_history to authenticated;

drop policy if exists "shop_history_select_own" on public.shop_history;
drop policy if exists "shop_history_insert_own" on public.shop_history;

create policy "shop_history_select_own"
on public.shop_history
for select
to authenticated
using (user_id = auth.uid());

create policy "shop_history_insert_own"
on public.shop_history
for insert
to authenticated
with check (user_id = auth.uid());

create or replace function public.titan_purchase_shop_item(p_item_id text)
returns table (
  item_id text,
  cost integer,
  reward_credits integer,
  credits_after integer,
  purchased_at timestamptz,
  mode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item_id text := left(trim(coalesce(p_item_id, '')), 80);
  v_price integer;
  v_type text;
  v_effect_val integer;
  v_cooldown_type text;
  v_cooldown_max integer;
  v_requires_elite boolean;
  v_cost integer := 0;
  v_reward integer := 0;
  v_credits integer;
  v_is_elite boolean := false;
  v_count integer := 0;
  v_global_count integer := 0;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_item_id = '' then
    raise exception 'ITEM_REQUIRED' using errcode = '22023';
  end if;

  if to_regclass('public.shop_items') is null then
    raise exception 'SHOP_ITEMS_TABLE_MISSING' using errcode = '42P01';
  end if;

  select
    greatest(coalesce(si.price, 0), 0)::integer,
    left(coalesce(si.type, 'item'), 32),
    greatest(coalesce(si.effect_val, 0), 0)::integer,
    left(coalesce(si.cooldown_type, ''), 24),
    greatest(coalesce(si.cooldown_max, 1), 1)::integer,
    coalesce(si.requires_elite, false)
  into v_price, v_type, v_effect_val, v_cooldown_type, v_cooldown_max, v_requires_elite
  from public.shop_items si
  where si.id::text = v_item_id
    and coalesce(si.is_active, true) is true
  limit 1;

  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  if v_type = 'charge' then
    v_cost := greatest(v_price, greatest(450, greatest(v_effect_val, 1) * 90));
    v_reward := 0;
    v_cooldown_type := 'weekly';
    v_cooldown_max := 2;
  elsif v_type = 'upgrade' then
    v_cost := greatest(v_price, 1400 + (greatest(v_effect_val, 1) - 1) * 1150);
    v_reward := 0;
    v_cooldown_type := 'once';
    v_cooldown_max := 1;
  elsif v_type = 'ad' then
    v_cost := 0;
    v_reward := least(greatest(v_effect_val, 0), 120);
    v_cooldown_type := 'daily';
    v_cooldown_max := 1;
  elsif v_type = 'cosmetic' then
    v_cost := 0;
    v_reward := 0;
    v_requires_elite := true;
    v_cooldown_type := 'once';
    v_cooldown_max := 1;
  else
    v_cost := v_price;
    v_reward := 0;
  end if;

  select coalesce(p.credits, 0)::integer, coalesce(p.is_elite, false)
  into v_credits, v_is_elite
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  if v_requires_elite is true and v_is_elite is not true then
    raise exception 'ELITE_REQUIRED' using errcode = '42501';
  end if;

  if v_cooldown_type = 'once' then
    select count(*)::integer
    into v_count
    from public.shop_history h
    where h.user_id = v_uid
      and h.item_id = v_item_id;

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_ONCE' using errcode = '23514';
    end if;
  elsif v_cooldown_type = 'daily' then
    select count(*)::integer
    into v_count
    from public.shop_history h
    where h.user_id = v_uid
      and h.item_id = v_item_id
      and h.purchased_at > v_now - interval '24 hours';

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_DAILY' using errcode = '23514';
    end if;
  elsif v_cooldown_type = 'weekly' then
    select count(*)::integer
    into v_count
    from public.shop_history h
    where h.user_id = v_uid
      and h.item_id = v_item_id
      and h.purchased_at > v_now - interval '7 days';

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_WEEKLY' using errcode = '23514';
    end if;
  end if;

  if v_type = 'charge' then
    select count(*)::integer
    into v_global_count
    from public.shop_history h
    left join public.shop_items si on si.id::text = h.item_id
    where h.user_id = v_uid
      and h.purchased_at > v_now - interval '7 days'
      and (coalesce(h.economy_meta->>'type', '') = 'charge' or coalesce(si.type, '') = 'charge');

    if v_global_count >= 2 then
      raise exception 'PURCHASE_LIMIT_WEEKLY' using errcode = '23514';
    end if;
  elsif v_type = 'ad' then
    select count(*)::integer
    into v_global_count
    from public.shop_history h
    left join public.shop_items si on si.id::text = h.item_id
    where h.user_id = v_uid
      and h.purchased_at > v_now - interval '7 days'
      and (coalesce(h.economy_meta->>'type', '') = 'ad' or coalesce(si.type, '') = 'ad');

    if v_global_count >= 3 then
      raise exception 'PURCHASE_LIMIT_WEEKLY' using errcode = '23514';
    end if;
  end if;

  if v_credits < v_cost then
    raise exception 'NO_FUNDS' using errcode = '23514';
  end if;

  update public.profiles as p
  set credits = v_credits - v_cost + v_reward
  where p.id = v_uid
  returning p.credits::integer into v_credits;

  insert into public.shop_history(user_id, item_id, purchased_at, cost_credits, reward_credits, economy_meta)
  values (
    v_uid,
    v_item_id,
    v_now,
    v_cost,
    v_reward,
    jsonb_build_object(
      'type', v_type,
      'cooldownType', v_cooldown_type,
      'cooldownMax', v_cooldown_max,
      'requiresElite', v_requires_elite
    )
  );

  return query
  select v_item_id, v_cost, v_reward, v_credits, v_now, 'server_v66'::text;
end;
$$;

revoke all on function public.titan_purchase_shop_item(text) from public, anon;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;

notify pgrst, 'reload schema';

commit;

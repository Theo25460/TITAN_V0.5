begin;

-- TITAN OS - Server-side shop purchase RPC.
-- Purpose: keep credits/cooldowns authoritative for connected users.
-- The front still applies visual/local item effects, but the economy ledger is validated here.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists credits integer not null default 0;

alter table if exists public.profiles
  add column if not exists inventory jsonb not null default '{}'::jsonb;

create table if not exists public.shop_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  purchased_at timestamptz not null default now()
);

create index if not exists shop_history_user_item_date_idx
on public.shop_history(user_id, item_id, purchased_at desc);

alter table public.shop_history enable row level security;
revoke all on public.shop_history from anon;
grant select, insert on public.shop_history to authenticated;

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
  v_cost integer;
  v_reward integer;
  v_credits integer;
  v_count integer;
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
    greatest(coalesce(si.cooldown_max, 1), 1)::integer
  into v_price, v_type, v_effect_val, v_cooldown_type, v_cooldown_max
  from public.shop_items si
  where si.id::text = v_item_id
    and coalesce(si.is_active, true) is true
  limit 1;

  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  v_cost := case when v_type = 'ad' then 0 else v_price end;
  v_reward := case when v_type = 'ad' then least(v_effect_val, 500) else 0 end;

  select coalesce(p.credits, 0)::integer
  into v_credits
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  if v_cooldown_type = 'once' then
    select count(*)::integer
    into v_count
    from public.shop_history
    where user_id = v_uid
      and item_id = v_item_id;

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_ONCE' using errcode = '23514';
    end if;
  elsif v_cooldown_type = 'daily' then
    select count(*)::integer
    into v_count
    from public.shop_history
    where user_id = v_uid
      and item_id = v_item_id
      and purchased_at > v_now - interval '24 hours';

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_DAILY' using errcode = '23514';
    end if;
  elsif v_cooldown_type = 'weekly' then
    select count(*)::integer
    into v_count
    from public.shop_history
    where user_id = v_uid
      and item_id = v_item_id
      and purchased_at > v_now - interval '7 days';

    if v_count >= v_cooldown_max then
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

  insert into public.shop_history(user_id, item_id, purchased_at)
  values (v_uid, v_item_id, v_now);

  return query
  select v_item_id, v_cost, v_reward, v_credits, v_now, 'server'::text;
end;
$$;

revoke all on function public.titan_purchase_shop_item(text) from public;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- PREM13, PREM14, ADR-004: one access record per paying source, so Paddle and Google Play can coexist.
-- Until now profiles held a single "last event wins" entitlement: a cancellation from one source would revoke
-- access paid through another. Each (source, external_id) is now a row; profiles.is_elite is true when at
-- least one source is active. The Paddle webhook keeps calling titan_apply_paddle_entitlement_v87 unchanged.
-- Transaction boundaries belong to the release caller.

create table if not exists private.titan_entitlements (
  source text not null check (source in ('paddle', 'google_play', 'manual')),
  external_id text not null check (char_length(external_id) between 1 and 512),
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null,
  status text,
  event_name text,
  order_id text,
  product_id text,
  variant_id text,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  refunded_at timestamptz,
  last_event_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (source, external_id)
);
create index if not exists titan_entitlements_user_idx on private.titan_entitlements (user_id, last_event_at desc);
alter table private.titan_entitlements enable row level security;
revoke all on private.titan_entitlements from public, anon, authenticated;

-- Existing access becomes rows, so nothing changes for current subscribers. A grant with no subscription or
-- order id (an administrator's gift) becomes a 'manual' row that no payment event can overwrite by id.
insert into private.titan_entitlements (source, external_id, user_id, is_active, status, event_name, order_id, product_id,
  variant_id, renews_at, ends_at, trial_ends_at, refunded_at, last_event_at)
select case when coalesce(nullif(p.elite_subscription_id, ''), nullif(p.elite_order_id, '')) is null then 'manual' else 'paddle' end,
       coalesce(nullif(p.elite_subscription_id, ''), nullif(p.elite_order_id, ''), 'legacy:' || p.id::text),
       p.id, coalesce(p.is_elite, false), p.elite_status, p.elite_last_event_name, p.elite_order_id, p.elite_product_id,
       p.elite_variant_id, p.elite_renews_at, p.elite_ends_at, p.elite_trial_ends_at, p.elite_refunded_at,
       coalesce(p.elite_last_event_at, p.elite_updated_at, p.updated_at, now())
from public.profiles p
where p.is_elite is true
   or coalesce(nullif(p.elite_subscription_id, ''), nullif(p.elite_order_id, '')) is not null
on conflict (source, external_id) do nothing;

create or replace function public.titan_apply_entitlement_v1(
  p_user_id uuid,
  p_source text,
  p_external_id text,
  p_is_active boolean,
  p_status text,
  p_event_name text,
  p_event_at timestamptz,
  p_order_id text default null,
  p_product_id text default null,
  p_variant_id text default null,
  p_renews_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_trial_ends_at timestamptz default null,
  p_refunded_at timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_applied boolean := false;
  v_active boolean;
  v_latest private.titan_entitlements%rowtype;
begin
  if p_event_at is null then raise exception 'ENTITLEMENT_EVENT_TIME_REQUIRED' using errcode = '22023'; end if;
  if p_source not in ('paddle', 'google_play', 'manual') then raise exception 'ENTITLEMENT_SOURCE_INVALID' using errcode = '22023'; end if;
  if coalesce(p_external_id, '') = '' then raise exception 'ENTITLEMENT_ID_REQUIRED' using errcode = '22023'; end if;
  if p_is_active is null then raise exception 'ENTITLEMENT_STATE_REQUIRED' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('titan_entitlement:' || p_user_id::text, 0));
  -- A purchase token or subscription id serves one account only.
  select user_id into v_owner from private.titan_entitlements where source = p_source and external_id = p_external_id for update;
  if found and v_owner <> p_user_id then raise exception 'ENTITLEMENT_OWNED_BY_OTHER' using errcode = '42501'; end if;

  insert into private.titan_entitlements as e (source, external_id, user_id, is_active, status, event_name, order_id, product_id,
    variant_id, renews_at, ends_at, trial_ends_at, refunded_at, last_event_at)
  values (p_source, p_external_id, p_user_id, p_is_active, nullif(p_status, ''), nullif(p_event_name, ''), p_order_id, p_product_id,
    p_variant_id, p_renews_at, p_ends_at, p_trial_ends_at, p_refunded_at, p_event_at)
  on conflict (source, external_id) do update
    set is_active = excluded.is_active, status = excluded.status, event_name = excluded.event_name, order_id = excluded.order_id,
        product_id = excluded.product_id, variant_id = excluded.variant_id, renews_at = excluded.renews_at, ends_at = excluded.ends_at,
        trial_ends_at = excluded.trial_ends_at, refunded_at = excluded.refunded_at, last_event_at = excluded.last_event_at,
        updated_at = now()
    where e.last_event_at <= excluded.last_event_at
  returning true into v_applied;

  select coalesce(bool_or(is_active), false) into v_active from private.titan_entitlements where user_id = p_user_id;
  select * into v_latest from private.titan_entitlements where user_id = p_user_id order by last_event_at desc, source limit 1;
  update public.profiles
  set is_elite = v_active,
      elite_status = v_latest.status,
      -- A Google purchase token is never copied to a profile row the player can read.
      elite_subscription_id = case when v_latest.source = 'google_play' then null else v_latest.external_id end,
      elite_order_id = v_latest.order_id,
      elite_product_id = v_latest.product_id,
      elite_variant_id = v_latest.variant_id,
      elite_renews_at = v_latest.renews_at,
      elite_ends_at = v_latest.ends_at,
      elite_trial_ends_at = v_latest.trial_ends_at,
      elite_refunded_at = v_latest.refunded_at,
      elite_last_event_name = v_latest.event_name,
      elite_last_event_at = v_latest.last_event_at,
      elite_updated_at = now(),
      updated_at = now()
  where id = p_user_id;
  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.titan_apply_entitlement_v1(uuid, text, text, boolean, text, text, timestamptz, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.titan_apply_entitlement_v1(uuid, text, text, boolean, text, text, timestamptz, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- Server notifications from Google name only a purchase token: this finds the account it was linked to.
create or replace function public.titan_entitlement_owner_v1(p_source text, p_external_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from private.titan_entitlements where source = p_source and external_id = p_external_id;
$$;
revoke all on function public.titan_entitlement_owner_v1(text, text) from public, anon, authenticated;
grant execute on function public.titan_entitlement_owner_v1(text, text) to service_role;

-- The Paddle webhook keeps its function and signature; it now records a Paddle source row.
create or replace function public.titan_apply_paddle_entitlement_v87(
  p_user_id uuid,
  p_is_elite boolean,
  p_status text,
  p_event_name text,
  p_event_at timestamptz,
  p_subscription_id text default null,
  p_order_id text default null,
  p_product_id text default null,
  p_variant_id text default null,
  p_renews_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_trial_ends_at timestamptz default null,
  p_refunded_at timestamptz default null
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event_at is null then raise exception 'Paddle event timestamp is required'; end if;
  return public.titan_apply_entitlement_v1(
    p_user_id, 'paddle',
    coalesce(nullif(p_subscription_id, ''), nullif(p_order_id, ''), 'unknown:' || p_user_id::text),
    p_is_elite, p_status, p_event_name, p_event_at, p_order_id, p_product_id, p_variant_id,
    p_renews_at, p_ends_at, p_trial_ends_at, p_refunded_at);
end;
$$;

revoke all on function public.titan_apply_paddle_entitlement_v87(uuid, boolean, text, text, timestamptz, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.titan_apply_paddle_entitlement_v87(uuid, boolean, text, text, timestamptz, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';

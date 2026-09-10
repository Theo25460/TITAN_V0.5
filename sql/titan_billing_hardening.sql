begin;

-- TITAN OS - Billing hardening for Lemon Squeezy webhooks.
-- Run in Supabase SQL editor before enabling public Elite purchases.

create extension if not exists pgcrypto;

create table if not exists public.titan_billing_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  product_id text,
  variant_id text,
  subscription_id text,
  order_id text,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists titan_billing_events_user_idx
on public.titan_billing_events(user_id, processed_at desc);

create index if not exists titan_billing_events_subscription_idx
on public.titan_billing_events(subscription_id, processed_at desc);

alter table public.profiles add column if not exists elite_subscription_id text;
alter table public.profiles add column if not exists elite_order_id text;
alter table public.profiles add column if not exists elite_status text;
alter table public.profiles add column if not exists elite_product_id text;
alter table public.profiles add column if not exists elite_variant_id text;
alter table public.profiles add column if not exists elite_updated_at timestamptz;

alter table public.titan_billing_events enable row level security;

-- No browser access by default. Service-role webhooks bypass RLS.
revoke all on public.titan_billing_events from anon, authenticated;

notify pgrst, 'reload schema';

commit;

begin;

-- TITAN OS - Billing lifecycle extension.
-- Completes minimal Elite subscription storage for expiration/cancel/refund handling.
-- Safe to rerun. Service-role webhook updates these columns; browsers keep RLS restrictions.

alter table public.profiles add column if not exists elite_renews_at timestamptz;
alter table public.profiles add column if not exists elite_ends_at timestamptz;
alter table public.profiles add column if not exists elite_trial_ends_at timestamptz;
alter table public.profiles add column if not exists elite_refunded_at timestamptz;
alter table public.profiles add column if not exists elite_last_event_name text;

alter table public.titan_billing_events add column if not exists status text;
alter table public.titan_billing_events add column if not exists renews_at timestamptz;
alter table public.titan_billing_events add column if not exists ends_at timestamptz;
alter table public.titan_billing_events add column if not exists trial_ends_at timestamptz;
alter table public.titan_billing_events add column if not exists refunded_at timestamptz;

create index if not exists profiles_elite_subscription_idx
on public.profiles(elite_subscription_id)
where elite_subscription_id is not null;

create index if not exists profiles_elite_status_idx
on public.profiles(elite_status, elite_ends_at)
where elite_status is not null;

create index if not exists titan_billing_events_status_idx
on public.titan_billing_events(status, processed_at desc);

notify pgrst, 'reload schema';

commit;

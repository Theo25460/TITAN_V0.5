begin;

-- TITAN OS v87 - Ordered, idempotent Paddle entitlement updates.
-- Paddle webhooks may be retried or delivered out of order. The last event
-- timestamp is therefore persisted and checked atomically before changing Elite.

alter table public.profiles
    add column if not exists elite_last_event_at timestamptz;

alter table public.titan_billing_events
    add column if not exists occurred_at timestamptz;

update public.titan_billing_events
set occurred_at = processed_at
where occurred_at is null;

create index if not exists titan_billing_events_occurred_at_idx
on public.titan_billing_events(user_id, occurred_at desc)
where user_id is not null;

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
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_applied boolean := false;
begin
    if p_event_at is null then
        raise exception 'Paddle event timestamp is required';
    end if;

    update public.profiles
    set is_elite = p_is_elite,
        elite_status = nullif(p_status, ''),
        elite_subscription_id = p_subscription_id,
        elite_order_id = p_order_id,
        elite_product_id = p_product_id,
        elite_variant_id = p_variant_id,
        elite_renews_at = p_renews_at,
        elite_ends_at = p_ends_at,
        elite_trial_ends_at = p_trial_ends_at,
        elite_refunded_at = p_refunded_at,
        elite_last_event_name = nullif(p_event_name, ''),
        elite_last_event_at = p_event_at,
        elite_updated_at = now(),
        updated_at = now()
    where id = p_user_id
      and (
          elite_last_event_at is null
          or elite_last_event_at <= p_event_at
      )
    returning true into v_applied;

    return coalesce(v_applied, false);
end;
$$;

revoke all on function public.titan_apply_paddle_entitlement_v87(
    uuid, boolean, text, text, timestamptz, text, text, text, text,
    timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.titan_apply_paddle_entitlement_v87(
    uuid, boolean, text, text, timestamptz, text, text, text, text,
    timestamptz, timestamptz, timestamptz, timestamptz
) to service_role;

notify pgrst, 'reload schema';

commit;

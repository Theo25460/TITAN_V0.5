-- Use the same eligible source for the TITAN+ flag and the profile's subscription details.
-- Prefer personal access to a coach seat; keep the last personal event for display when no source grants access.
-- The release caller owns the transaction.
create or replace function private.titan_entitlement_refresh_profile(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_latest record;
  v_billing_write text := current_setting('titan.billing_write', true);
begin
  select e.*, (e.is_active and e.refunded_at is null and (e.ends_at is null or e.ends_at > now())) as eligible
    into v_latest
    from private.titan_entitlements e
    where e.user_id = p_uid
    order by eligible desc, (e.source = 'coach'), e.last_event_at desc, e.source, e.external_id
    limit 1;
  if not found then return; end if;
  perform set_config('titan.billing_write', 'coach_seat', true);
  update public.profiles
  set is_elite = v_latest.eligible,
      elite_status = v_latest.status,
      elite_subscription_id = case when v_latest.source in ('google_play', 'coach') then null else v_latest.external_id end,
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
  where id = p_uid;
  perform set_config('titan.billing_write', coalesce(v_billing_write, ''), true);
end;
$function$;

revoke all on function private.titan_entitlement_refresh_profile(uuid) from public, anon, authenticated;

-- Billing events and coach seats now refresh the same profile summary under the existing per-user lock.
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
    where e.user_id = excluded.user_id and e.last_event_at <= excluded.last_event_at
  returning true into v_applied;

  -- A concurrent insert may win after the initial owner read saw no row.
  -- The conflicting row remains locked by the UPSERT, including when its WHERE
  -- clause refuses the update; recheck ownership before touching any profile.
  if not coalesce(v_applied, false) then
    select user_id into v_owner from private.titan_entitlements
      where source = p_source and external_id = p_external_id;
    if v_owner is distinct from p_user_id then
      raise exception 'ENTITLEMENT_OWNED_BY_OTHER' using errcode = '42501';
    end if;
  end if;

  perform private.titan_entitlement_refresh_profile(p_user_id);
  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.titan_apply_entitlement_v1(uuid, text, text, boolean, text, text, timestamptz, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.titan_apply_entitlement_v1(uuid, text, text, boolean, text, text, timestamptz, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- Repair profiles that could have been summarized from a non-eligible source. Leave profiles without ledger rows alone.
do $migration$
declare
  v_uid uuid;
  v_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  for v_uid in
    select e.user_id
    from private.titan_entitlements e
    group by e.user_id
    having bool_or(e.is_active)
      and bool_or(not e.is_active or e.refunded_at is not null or e.ends_at <= now())
    order by e.user_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('titan_entitlement:' || v_uid::text, 0));
    perform private.titan_entitlement_refresh_profile(v_uid);
  end loop;
  perform set_config('lock_timeout', v_lock_timeout, true);
end;
$migration$;

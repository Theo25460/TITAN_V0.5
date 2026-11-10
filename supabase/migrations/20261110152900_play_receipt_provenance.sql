-- Google Play lifecycle writes use one transaction for the receipt and its replaced token.
-- NULL on older rows means the provider did not classify this receipt in the ledger.
alter table private.titan_entitlements add column if not exists provider_is_test boolean;
alter table private.titan_entitlements add column if not exists provider_needs_ack boolean not null default false;

create or replace function public.titan_apply_play_entitlement_v1(
  p_user_id uuid,
  p_external_id text,
  p_is_active boolean,
  p_status text,
  p_event_name text,
  p_event_at timestamptz,
  p_is_test boolean,
  p_linked_token text default null,
  p_order_id text default null,
  p_product_id text default null,
  p_renews_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_needs_ack boolean default false
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  previous private.titan_entitlements%rowtype;
begin
  if not exists (select 1 from auth.users where id = p_user_id and is_anonymous is false and deleted_at is null) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_is_active and p_is_test is null then
    raise exception 'PLAY_PROVENANCE_REQUIRED' using errcode = '22023';
  end if;
  if p_linked_token is not null and (p_is_active is not true or p_linked_token = p_external_id) then
    raise exception 'PLAY_REPLACEMENT_INVALID' using errcode = '22023';
  end if;

  -- Same per-owner serialization and token ownership checks as the shared entitlement writer.
  perform pg_advisory_xact_lock(hashtextextended('titan_entitlement:' || p_user_id::text, 0));
  if not public.titan_apply_entitlement_v1(p_user_id, 'google_play', p_external_id,
    p_is_active, p_status, p_event_name, p_event_at, p_order_id, p_product_id, null, p_renews_at, p_ends_at) then
    return false;
  end if;

  update private.titan_entitlements
    set provider_is_test = coalesce(p_is_test, provider_is_test),
        provider_needs_ack = p_is_active and coalesce(p_needs_ack, false)
    where source = 'google_play' and external_id = p_external_id and user_id = p_user_id
      and ((p_is_test is not null and provider_is_test is distinct from p_is_test)
        or provider_needs_ack is distinct from (p_is_active and coalesce(p_needs_ack, false)));
  if p_linked_token is not null then
    select * into previous from private.titan_entitlements where source = 'google_play' and external_id = p_linked_token for update;
    if found and previous.user_id <> p_user_id then
      raise exception 'ENTITLEMENT_OWNED_BY_OTHER' using errcode = '42501';
    end if;
    if found and previous.provider_is_test is distinct from p_is_test
      and (previous.provider_is_test is not null or p_is_test) then
      raise exception 'PLAY_REPLACEMENT_INVALID' using errcode = '22023';
    end if;
    -- An exception rolls back both writes. A stale event never leaves two eligible plans.
    if not public.titan_apply_entitlement_v1(p_user_id, 'google_play', p_linked_token, false,
      'replaced', 'replaced', p_event_at, previous.order_id, previous.product_id, previous.variant_id, null, p_event_at) then
      raise exception 'PLAY_REPLACEMENT_STALE' using errcode = 'PT409';
    end if;
    update private.titan_entitlements
      set provider_is_test = case when previous.user_id is null then p_is_test else provider_is_test end,
          provider_needs_ack = false
      where source = 'google_play' and external_id = p_linked_token and user_id = p_user_id
        and (previous.user_id is null or provider_needs_ack);
  end if;
  return true;
end;
$function$;

revoke all on function public.titan_apply_play_entitlement_v1(uuid, text, boolean, text, text, timestamptz, boolean,
  text, text, text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.titan_apply_play_entitlement_v1(uuid, text, boolean, text, text, timestamptz, boolean,
  text, text, text, timestamptz, timestamptz, boolean) to service_role;

-- Prevent checkout if this release's backend contract has not been applied.
create or replace function public.titan_play_checkout_ready_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_user_id and u.is_anonymous is false and u.deleted_at is null
  );
$function$;
revoke all on function public.titan_play_checkout_ready_v1(uuid) from public, anon, authenticated;
grant execute on function public.titan_play_checkout_ready_v1(uuid) to service_role;

-- An unacknowledged purchase is retried on the next hourly sweep, before Google's refund deadline.
create or replace function public.titan_play_entitlements_due_v1(p_limit integer default 50)
returns table (user_id uuid, external_id text)
language sql stable security definer set search_path = ''
as $function$
  select e.user_id, e.external_id
  from private.titan_entitlements e
  where e.source = 'google_play' and e.is_active and (e.provider_needs_ack
    or coalesce(e.ends_at, e.last_event_at) < now() + interval '1 day'
    or e.last_event_at < now() - interval '3 days')
  order by e.provider_needs_ack desc, e.last_event_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$function$;
revoke all on function public.titan_play_entitlements_due_v1(integer) from public, anon, authenticated;
grant execute on function public.titan_play_entitlements_due_v1(integer) to service_role;

notify pgrst, 'reload schema';

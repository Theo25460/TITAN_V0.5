-- Monetisation, lot B (20261121090000): the access summary follows the ledger without any event, pending/held purchases are re-read,
-- an upgrade replaces the old purchase in one write, a replayed event grants nothing twice, a refund withdraws access. Full rollback.
begin;
do $test$
declare
  a uuid := '52000000-0000-4000-8000-0000000000a1';
  b uuid := '52000000-0000-4000-8000-0000000000b1';
  gift uuid := '52000000-0000-4000-8000-0000000000c1';
  later timestamptz := now() + interval '1 month';
  refused boolean;
  n integer;
begin
  insert into auth.users (id, is_anonymous) values (a, false), (b, false), (gift, false);
  insert into public.profiles (id, username) values (a, 'Monétisation A'), (b, 'Monétisation B'), (gift, 'Monétisation offert')
    on conflict (id) do nothing;

  -- The three products of the specification are mapped on any database built from the repository.
  assert (select jsonb_object_agg(product_id, plan) from private.titan_plan_products where product_id in ('titan01','titan02','titan03'))
    = '{"titan01":"titan_plus","titan02":"coach","titan03":"coach_pro"}'::jsonb, 'titan01/02/03 map to the three plans';

  -- Billing writers are security definer; their grants (service role only) are checked in 300_play_receipt_provenance.sql.
  -- 1. TITAN+ bought, then the subscription ends while every event is lost: the hourly sweep withdraws the flag.
  assert public.titan_apply_play_entitlement_v1(a, 'life-plus-0123456789', true, 'active', 'verify', now() - interval '2 minutes', false,
    p_product_id => 'titan01', p_renews_at => later, p_ends_at => later);
  assert (select is_elite from public.profiles where id = a), 'access opened';

  update private.titan_entitlements set ends_at = now() - interval '1 minute', renews_at = null where external_id = 'life-plus-0123456789';
  assert (select is_elite from public.profiles where id = a), 'stale summary before the sweep (no event reached the account)';
  -- An offered access without end date is never touched by the sweep.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert public.titan_apply_entitlement_v1(gift, 'manual', 'gift:monetisation', true, 'granted', 'admin', now());
  assert public.titan_entitlements_expiry_sweep_v1() >= 1, 'the sweep recomputed at least the ended account';
  assert not (select is_elite from public.profiles where id = a), 'ended subscription: no access any more';
  assert (select is_elite from public.profiles where id = gift), 'offered access kept';
  assert public.titan_entitlements_expiry_sweep_v1() = 0, 'a second run finds nothing left to correct';
  assert not has_function_privilege('authenticated', 'public.titan_entitlements_expiry_sweep_v1()', 'execute')
    and not has_function_privilege('anon', 'public.titan_entitlements_expiry_sweep_v1()', 'execute'), 'players cannot run the sweep';

  -- 2. A pending purchase (and a held or paused one) is re-read by the Google sweep, an expired one is not.
  -- Billing writers are security definer; their grants (service role only) are checked in 300_play_receipt_provenance.sql.
  assert public.titan_apply_play_entitlement_v1(b, 'life-pending-old-0123', false, 'pending', 'verify', now() - interval '7 hours', false, p_product_id => 'titan01');
  assert public.titan_apply_play_entitlement_v1(b, 'life-pending-new-0123', false, 'pending', 'verify', now() - interval '1 hour', false, p_product_id => 'titan01');
  assert public.titan_apply_play_entitlement_v1(b, 'life-hold-0123456789', false, 'on_hold', 'rtdn:5', now() - interval '8 hours', false, p_product_id => 'titan01');
  assert public.titan_apply_play_entitlement_v1(b, 'life-ended-0123456789', false, 'expired', 'rtdn:13', now() - interval '8 hours', false, p_product_id => 'titan01');
  select count(*) into n from public.titan_play_entitlements_due_v1(200) where external_id like 'life-%';
  assert exists (select 1 from public.titan_play_entitlements_due_v1(200) where external_id = 'life-pending-old-0123'), 'a pending payment older than six hours is re-read';
  assert exists (select 1 from public.titan_play_entitlements_due_v1(200) where external_id = 'life-hold-0123456789'), 'an account hold is re-read';
  assert not exists (select 1 from public.titan_play_entitlements_due_v1(200) where external_id in ('life-pending-new-0123', 'life-ended-0123456789')),
    'a fresh pending read and an ended purchase are not re-read';

  -- 3. Google confirms the pending payment: access opens; the same answer received twice grants nothing more.
  assert public.titan_apply_play_entitlement_v1(b, 'life-pending-old-0123', true, 'active', 'reconcile', now() - interval '3 minutes', false,
    p_product_id => 'titan01', p_renews_at => later, p_ends_at => later, p_needs_ack => true);
  assert public.titan_apply_play_entitlement_v1(b, 'life-pending-old-0123', true, 'active', 'rtdn:4', now() - interval '3 minutes', false,
    p_product_id => 'titan01', p_renews_at => later, p_ends_at => later, p_needs_ack => true), 'same read replayed: accepted, nothing doubled';
  assert (select count(*) from private.titan_entitlements where external_id = 'life-pending-old-0123') = 1, 'one row per purchase token';
  assert not public.titan_apply_play_entitlement_v1(b, 'life-pending-old-0123', false, 'expired', 'rtdn:13', now() - interval '4 minutes', false,
    p_product_id => 'titan01'), 'an older read arriving late never undoes a newer one';
  assert (select is_elite from public.profiles where id = b), 'access confirmed';

  -- 4. Upgrade TITAN+ → Coach (Google issues a new token linked to the old one): one write retires the old purchase and opens the plan.
  assert public.titan_apply_play_entitlement_v1(b, 'life-coach-0123456789', true, 'active', 'verify', now() - interval '2 minutes', false,
    'life-pending-old-0123', p_product_id => 'titan02', p_renews_at => later, p_ends_at => later);
  assert (select count(*) from private.titan_entitlements where user_id = b and source = 'google_play' and is_active) = 1, 'a single paid source after the upgrade';
  assert (select status from private.titan_entitlements where external_id = 'life-pending-old-0123') = 'replaced', 'the old purchase is marked replaced';
  assert (select plan from private.titan_coach_plan(b)) = 'coach' and private.titan_coach_capacity(b) = 5, 'Coach: five places';
  -- Upgrade Coach → Coach Ultra.
  assert public.titan_apply_play_entitlement_v1(b, 'life-ultra-0123456789', true, 'active', 'verify', now() - interval '1 minute', false,
    'life-coach-0123456789', p_product_id => 'titan03', p_renews_at => later, p_ends_at => later);
  assert (select plan from private.titan_coach_plan(b)) = 'coach_pro' and private.titan_coach_capacity(b) = 15, 'Coach Ultra: fifteen places';

  -- 5. Another TITAN account can never present the same purchase.
  refused := false;
  begin
    perform public.titan_apply_play_entitlement_v1(a, 'life-ultra-0123456789', true, 'active', 'verify', now(), false,
      p_product_id => 'titan03', p_ends_at => later);
  exception when insufficient_privilege then refused := sqlerrm = 'ENTITLEMENT_OWNED_BY_OTHER'; end;
  assert refused, 'a purchase token serves one account only';

  -- 6. Refund with revocation: Google answers "expired" now; access and plan end at once.
  assert public.titan_apply_play_entitlement_v1(b, 'life-ultra-0123456789', false, 'expired', 'rtdn:voided', now(), false,
    p_product_id => 'titan03', p_ends_at => now());
  assert not (select is_elite from public.profiles where id = b), 'refunded: no access';
  assert (select plan from private.titan_coach_plan(b)) is null, 'refunded: no plan';

end;
$test$;
rollback;

begin;

do $test$
declare
  account_a uuid := '51000000-0000-4000-8000-000000000131';
  account_b uuid := '51000000-0000-4000-8000-000000000132';
  anonymous_account uuid := '51000000-0000-4000-8000-000000000133';
  issued_at timestamptz := now();
  renews_at timestamptz := now() + interval '1 month';
  target regprocedure := to_regprocedure('public.titan_apply_play_entitlement_v1(uuid,text,boolean,text,text,timestamptz,boolean,text,text,text,timestamptz,timestamptz,boolean)');
  refused boolean;
begin
  assert target is not null, 'Play has a service-only atomic writer';
  assert has_function_privilege('service_role', target, 'EXECUTE')
    and not has_function_privilege('authenticated', target, 'EXECUTE')
    and not has_function_privilege('anon', target, 'EXECUTE'), 'only the service role can apply provider receipts';

  insert into auth.users (id, is_anonymous) values (account_a, false), (account_b, false), (anonymous_account, true);
  insert into public.profiles (id, username) values (account_a, 'Test Play A'), (account_b, 'Test Play B'), (anonymous_account, 'Visiteur Play')
    on conflict (id) do nothing;

  set local role service_role;
  assert public.titan_play_checkout_ready_v1(account_a) and not public.titan_play_checkout_ready_v1(anonymous_account), 'readiness requires a permanent profile';
  assert public.titan_apply_play_entitlement_v1(account_a, 'contract-old', true, 'active', 'verify', issued_at, false,
    p_product_id => 'titan01', p_ends_at => renews_at, p_needs_ack => true);
  assert exists (select 1 from public.titan_play_entitlements_due_v1() where external_id = 'contract-old'), 'acknowledgement is retried before the purchase expires';
  assert public.titan_apply_play_entitlement_v1(account_a, 'contract-new', false, 'pending', 'verify', issued_at, false,
    p_product_id => 'titan02');
  assert public.titan_apply_play_entitlement_v1(account_b, 'contract-licence', true, 'active', 'rtdn:4', issued_at, true,
    'contract-unseen', p_product_id => 'titan03', p_ends_at => renews_at);
  assert public.titan_apply_play_entitlement_v1(account_b, 'contract-licence', true, 'active', 'verify', issued_at, true,
    'contract-unseen', p_product_id => 'titan03', p_ends_at => renews_at), 'a test replacement can be replayed safely';
  refused := false;
  begin
    perform public.titan_apply_play_entitlement_v1(account_b, 'contract-foreign', true, 'active', 'rtdn:4', issued_at, true,
      'contract-old', p_product_id => 'titan03', p_ends_at => renews_at);
  exception when insufficient_privilege then refused := sqlerrm = 'ENTITLEMENT_OWNED_BY_OTHER'; end;
  assert refused, 'a replacement cannot retire another account’s purchase';
  refused := false;
  begin
    perform public.titan_apply_play_entitlement_v1(anonymous_account, 'contract-guest', true, 'active', 'rtdn:4', issued_at, false,
      p_product_id => 'titan01', p_ends_at => renews_at);
  exception when no_data_found then refused := sqlerrm = 'PROFILE_NOT_FOUND'; end;
  assert refused, 'an RTDN cannot create an entitlement for a guest account';
  reset role;

  assert (select is_active from private.titan_entitlements where external_id = 'contract-old'), 'a pending replacement preserves the previous plan';
  assert not exists (select 1 from private.titan_entitlements where external_id = 'contract-foreign'), 'a refused replacement rolls back the new row';
  assert (select provider_is_test from private.titan_entitlements where external_id = 'contract-licence') is true, 'license provenance is durable';
  assert (select provider_is_test and not is_active from private.titan_entitlements where external_id = 'contract-unseen'), 'the new retired placeholder inherits test provenance';
  assert (select provider_is_test from private.titan_entitlements where external_id = 'contract-old') is false, 'Google classified the receipt as non-test';

  set local role service_role;
  refused := false;
  begin
    perform public.titan_apply_play_entitlement_v1(account_a, 'contract-stale', true, 'active', 'rtdn:4', issued_at - interval '1 second', false,
      'contract-old', p_product_id => 'titan02', p_ends_at => renews_at);
  exception when sqlstate 'PT409' then refused := sqlerrm = 'PLAY_REPLACEMENT_STALE'; end;
  assert refused, 'a newer predecessor event wins';
  assert public.titan_apply_play_entitlement_v1(account_a, 'contract-new', true, 'active', 'rtdn:4', issued_at + interval '1 second', false,
    'contract-old', p_product_id => 'titan02', p_ends_at => renews_at);
  assert not public.titan_apply_play_entitlement_v1(account_a, 'contract-old', true, 'active', 'verify', issued_at, false,
    p_product_id => 'titan01', p_ends_at => renews_at), 'a delayed verification does not re-enable the retired plan';
  assert public.titan_apply_play_entitlement_v1(account_b, 'contract-licence', false, 'gone', 'reconcile', issued_at + interval '1 second', null,
    p_ends_at => issued_at);
  reset role;

  assert not exists (select 1 from private.titan_entitlements where external_id = 'contract-stale'), 'a stale replacement leaves no partial grant';
  assert (select count(*) from private.titan_entitlements where user_id = account_a and is_active) = 1, 'one plan remains after replacement';
  assert not (select provider_needs_ack from private.titan_entitlements where external_id = 'contract-old'), 'the retired token does not trigger an ack retry';
  assert (select elite_product_id from public.profiles where id = account_a) = 'titan02', 'the replacement is reflected in the profile';
  assert (select provider_is_test and not is_active from private.titan_entitlements where external_id = 'contract-licence'), 'refund and expiry keep test provenance';
end;
$test$;

rollback;

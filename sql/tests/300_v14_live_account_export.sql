-- The account export contains the player's own TITAN LIVE world, nobody else's, and keeps every V1.3.1 section.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  insert into private.titan_live_wallets(user_id, eclats, souffle) values (a, 42, 7);
  insert into private.titan_live_buildings(user_id, building, level) values (a, 'observatoire', 2);
  perform set_config('titan.v14_live_a', a::text, true);
  perform set_config('titan.v14_live_b', b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v14_live_a'), 'role', 'authenticated')::text, true);
do $$
declare e jsonb := public.export_own_data();
begin
  assert e ? 'liveSettlements' and e ? 'liveWallet' and e ? 'liveBuildings' and e ? 'liveCollection', 'the four live keys are exported';
  assert (e #>> '{liveWallet,eclats}')::int = 42 and (e #>> '{liveWallet,souffle}')::int = 7, 'the wallet is the player''s own';
  assert not (e -> 'liveWallet') ? 'user_id', 'no internal identifier in the wallet';
  assert jsonb_array_length(e -> 'liveBuildings') = 1 and e #>> '{liveBuildings,0,building}' = 'observatoire', 'buildings exported';
  -- The earlier sections are still there: the V1.3.1 additions, the journey layer and the base export.
  assert e ? 'coachLinks' and e ? 'entitlements' and e ? 'journey' and e ? 'trainingLogs' and e ? 'profile', 'earlier sections kept';
end $$;

-- Another account gets the same keys, empty: nothing of A leaks.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v14_live_b'), 'role', 'authenticated')::text, true);
do $$
declare e jsonb := public.export_own_data();
begin
  assert e -> 'liveWallet' = 'null'::jsonb, 'no wallet for an account that never used TITAN LIVE';
  assert e -> 'liveBuildings' = '[]'::jsonb and e -> 'liveSettlements' = '[]'::jsonb and e -> 'liveCollection' = '[]'::jsonb, 'empty lists, never another account''s rows';
  assert position(current_setting('titan.v14_live_a') in e::text) = 0, 'the other account''s identifier appears nowhere';
end $$;
reset role;

do $$
begin
  assert not has_function_privilege('anon', 'public.export_own_data()', 'EXECUTE'), 'still closed to anonymous callers';
  assert has_function_privilege('authenticated', 'public.export_own_data()', 'EXECUTE'), 'still open to players';
  -- Erasure: the live world goes with the account.
  delete from auth.users where id = current_setting('titan.v14_live_a')::uuid;
  assert not exists(select 1 from private.titan_live_wallets where user_id = current_setting('titan.v14_live_a')::uuid)
     and not exists(select 1 from private.titan_live_buildings where user_id = current_setting('titan.v14_live_a')::uuid), 'live rows are erased with the account';
end $$;
rollback;

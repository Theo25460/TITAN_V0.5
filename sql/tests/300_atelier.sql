-- TITAN 300 — Atelier checks. Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  perform set_config('titan.qa_a', a::text, true);
  perform set_config('titan.qa_b', b::text, true);
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  insert into public.profiles(id, username, credits, level, xp, is_elite) values
    (a, 'qa_atelier', 1000, 7, 0, false),
    (b, 'qa_plus', 0, 1, 0, true)
  on conflict (id) do update set credits = excluded.credits, level = excluded.level, is_elite = excluded.is_elite;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_a'), 'role', 'authenticated')::text, true);
do $$
declare r record; j jsonb; owned int;
begin
  -- Direct inserts into the purchase history are closed: ownership cannot be forged.
  begin
    insert into public.shop_history(user_id, item_id) values (current_setting('titan.qa_a')::uuid, 'cos_frame_summit');
    assert false, 'direct shop_history insert must be refused';
  exception when insufficient_privilege then null;
  end;

  select * into r from public.titan_purchase_shop_item('cos_frame_neon');
  assert r.cost = 450 and r.credits_after = 550, 'credits debited once: ' || r.credits_after;
  begin
    perform public.titan_purchase_shop_item('cos_frame_neon');
    assert false, 'second purchase refused';
  exception when others then assert sqlerrm = 'PURCHASE_LIMIT_ONCE', sqlerrm; end;
  begin
    perform public.titan_purchase_shop_item('cos_frame_aegis');
    assert false, 'formerly TITAN+ piece needs 1400 credits';
  exception when check_violation then assert sqlerrm = 'NO_FUNDS', sqlerrm; end;
  begin
    perform public.titan_purchase_shop_item('cos_frame_sentinel');
    assert false, 'rank piece is not for sale';
  exception when others then assert sqlerrm = 'NOT_FOR_SALE', sqlerrm; end;
  begin
    perform public.titan_purchase_shop_item('cos_frame_summit');
    assert false, 'not enough credits';
  exception when others then assert sqlerrm = 'NO_FUNDS', sqlerrm; end;
  begin
    perform public.titan_purchase_shop_item('cos_grenade_glitch');
    assert false, 'retired combat pieces are gone from the shelves';
  exception when others then assert sqlerrm = 'SHOP_ITEM_NOT_FOUND', sqlerrm; end;

  -- Equip: bought piece, rank piece earned at level 6; not the level-10 piece nor TITAN+.
  j := public.titan_set_appearance('frame', 'cos_frame_neon');
  assert j ->> 'frame' = 'frame-neon', 'bought frame equipped';
  j := public.titan_set_appearance('frame', 'cos_frame_sentinel');
  assert j ->> 'frame' = 'frame-sentinel', 'rank frame equipped at level 7';
  begin
    perform public.titan_set_appearance('frame', 'cos_frame_guardian');
    assert false, 'level 10 frame refused';
  exception when others then assert sqlerrm = 'NOT_OWNED', sqlerrm; end;
  begin
    perform public.titan_set_appearance('map', 'cos_map_aurora');
    assert false, 'TITAN+ ambiance refused without TITAN+';
  exception when others then assert sqlerrm = 'NOT_OWNED', sqlerrm; end;
  begin
    perform public.titan_set_appearance('card', 'cos_frame_neon');
    assert false, 'slot mismatch refused';
  exception when others then assert sqlerrm = 'SHOP_ITEM_NOT_FOUND', sqlerrm; end;

  -- Profiles cannot be updated directly by their owner: the look only moves through the RPC.
  update public.profiles set appearance = '{"frame":"frame-legend"}' where id = current_setting('titan.qa_a')::uuid;
  j := public.titan_atelier();
  assert j -> 'appearance' ->> 'frame' = 'frame-sentinel', 'direct update has no effect: ' || (j -> 'appearance')::text;
  select count(*) into owned from jsonb_array_elements(j -> 'items') i where (i ->> 'owned')::boolean;
  assert owned = 5, 'defaults (3) + bought + sentinel = 5 owned, got ' || owned;
  assert (j ->> 'credits')::int = 550 and (j -> 'plus' ->> 'active')::boolean = false, 'wallet and status';
  j := public.titan_set_appearance('frame', null);
  assert j ->> 'frame' is null, 'reset to default';
end $$;

-- TITAN+ member: plus pieces owned while active, and fall back to default once it ends.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_b'), 'role', 'authenticated')::text, true);
do $$
declare j jsonb;
begin
  j := public.titan_set_appearance('map', 'cos_map_aurora');
  assert j ->> 'map' = 'map-aurora', 'TITAN+ ambiance equipped';
end $$;
-- The billing webhook (service role) ends the subscription.
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
update public.profiles set is_elite = false where id = current_setting('titan.qa_b')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.qa_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare j jsonb;
begin
  j := public.titan_atelier();
  assert j -> 'appearance' ->> 'map' is null, 'ended TITAN+ falls back to the default look';
end $$;
rollback;

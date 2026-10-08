-- Free users can permanently earn every currently active cosmetic. Synthetic identities only.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
begin
  perform set_config('titan.fair_free', a::text, true);
  perform set_config('titan.fair_plus', b::text, true);
  perform set_config('titan.fair_new', c::text, true);
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}'), (c, '{}');
  insert into public.profiles(id, username, credits, level, xp, is_elite) values
    (a, 'qa_fair_free', 5000, 1, 0, false),
    (b, 'qa_fair_plus', 2000, 1, 0, true),
    (c, 'qa_fair_new', 0, 1, 0, false)
  on conflict (id) do update set credits = excluded.credits, level = excluded.level, xp = 0, is_elite = excluded.is_elite;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_free'), 'role', 'authenticated')::text, true);
do $$
declare j jsonb; i jsonb; r record; n int := 0;
begin
  j := public.titan_atelier();
  -- A catalog-wide assertion catches a new paid-only piece as well as these four.
  assert not exists (select 1 from jsonb_array_elements(j -> 'items') x
    where x ->> 'unlock' not in ('default', 'rank', 'credits')), 'every active piece needs a free acquisition path';
  for i in select x from jsonb_array_elements(j -> 'items') x
    where x ->> 'id' in ('cos_frame_aegis', 'cos_frame_frost', 'cos_map_aurora', 'cos_card_obsidian')
  loop
    n := n + 1;
    assert not (i ->> 'owned')::boolean, 'free user must earn ' || (i ->> 'id');
    assert (i ->> 'price')::int > 0 and (i ->> 'plus_access')::boolean, 'permanent price and existing subscriber access';
    select * into r from public.titan_purchase_shop_item(i ->> 'id');
    assert r.cost = (i ->> 'price')::int and r.reward_credits = 0, 'server price; no economic reward';
    j := public.titan_set_appearance(i ->> 'slot', i ->> 'id');
    assert j ->> (i ->> 'slot') = i ->> 'cosmetic', 'free-earned piece can be equipped';
    begin
      perform public.titan_purchase_shop_item(i ->> 'id');
      assert false, 'repeat purchase must fail';
    exception when check_violation then assert sqlerrm = 'PURCHASE_LIMIT_ONCE', sqlerrm; end;
  end loop;
  assert n = 4, 'all four formerly exclusive pieces covered';
  j := public.titan_atelier();
  assert (j ->> 'credits')::int = 400, '4600 credits paid once; no real money';
  assert (j ->> 'level')::int = 1, 'cosmetics confer no level';
  assert (select xp from public.profiles where id = current_setting('titan.fair_free')::uuid) = 0, 'no XP advantage';
  assert (select count(*) from public.shop_history where user_id = current_setting('titan.fair_free')::uuid) = 4, 'four logged acquisitions';
  assert not exists (select 1 from jsonb_array_elements(j -> 'items') x
    where x ->> 'id' in ('cos_frame_aegis', 'cos_frame_frost', 'cos_map_aurora', 'cos_card_obsidian')
      and (not (x ->> 'owned')::boolean or not (x ->> 'permanent')::boolean)), 'purchases belong permanently to Free';
end $$;

-- An existing subscriber can wear borrowed pieces, and buy them to keep them after expiration.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_plus'), 'role', 'authenticated')::text, true);
do $$
declare j jsonb; i jsonb;
begin
  j := public.titan_atelier();
  select x into i from jsonb_array_elements(j -> 'items') x where x ->> 'id' = 'cos_frame_aegis';
  assert (i ->> 'owned')::boolean and not (i ->> 'permanent')::boolean, 'existing subscriber access is temporary';
  perform public.titan_set_appearance('frame', 'cos_frame_aegis');
  perform public.titan_set_appearance('map', 'cos_map_aurora');
  perform public.titan_purchase_shop_item('cos_map_aurora');
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set is_elite = false where id = current_setting('titan.fair_plus')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_plus'), 'role', 'authenticated')::text, true);
do $$
declare j jsonb;
begin
  j := public.titan_atelier();
  assert j -> 'appearance' ->> 'map' = 'map-aurora', 'earned appearance survives subscription expiration';
  assert j -> 'appearance' ->> 'frame' is null, 'unearned borrowed appearance falls back';
  assert (j ->> 'credits')::int = 1000, 'subscriber paid the same free-earned price';
end $$;

-- A different user cannot forge ownership, entitlement or currency from their browser.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_new'), 'role', 'authenticated', 'is_elite', true)::text, true);
do $$
declare j jsonb;
begin
  update public.profiles set is_elite = true, credits = 5000, appearance = '{"frame":"frame-aegis"}'
    where id = current_setting('titan.fair_new')::uuid;
  begin
    perform public.titan_set_appearance('frame', 'cos_frame_aegis');
    assert false, 'unearned piece rejected despite forged JWT and profile';
  exception when insufficient_privilege then assert sqlerrm = 'NOT_OWNED', sqlerrm; end;
  begin
    perform public.titan_purchase_shop_item('cos_frame_aegis');
    assert false, 'zero credits cannot buy';
  exception when check_violation then assert sqlerrm = 'NO_FUNDS', sqlerrm; end;
  j := public.titan_atelier();
  assert (j ->> 'credits')::int = 0 and not (j -> 'plus' ->> 'active')::boolean, 'server entitlement and balance are authoritative';
  assert (select count(*) from public.shop_history where user_id = current_setting('titan.fair_new')::uuid) = 0, 'no forged receipt';
end $$;
rollback;

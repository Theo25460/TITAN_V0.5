-- Effective subscription expiry/refund must not depend on the webhook clearing is_elite.
begin;
do $$
declare a uuid := gen_random_uuid();
begin
  perform set_config('titan.fair_expiry', a::text, true);
  insert into auth.users(id, raw_user_meta_data) values (a, '{}');
  insert into public.profiles(id, username, credits, level, xp, is_elite, elite_ends_at) values
    (a, 'qa_fair_expiry', 2000, 1, 0, true, now() + interval '1 day')
  on conflict(id) do update set credits = 2000, level = 1, is_elite = true, elite_ends_at = excluded.elite_ends_at;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_expiry'), 'role', 'authenticated')::text, true);
select public.titan_purchase_shop_item('cos_map_aurora');
select public.titan_set_appearance('map', 'cos_map_aurora');
select public.titan_set_appearance('frame', 'cos_frame_aegis');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set elite_ends_at = now() - interval '1 second' where id = current_setting('titan.fair_expiry')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_expiry'), 'role', 'authenticated')::text, true);
do $$
declare j jsonb;
begin
  j := public.titan_atelier();
  assert not (j -> 'plus' ->> 'active')::boolean, 'past end date closes temporary access even while flag stays true';
  assert j -> 'appearance' ->> 'map' = 'map-aurora', 'permanent acquisition survives date expiry';
  assert j -> 'appearance' ->> 'frame' is null, 'borrowed frame disappears at expiry';
  begin
    perform public.titan_set_appearance('frame', 'cos_frame_aegis');
    assert false, 'expired borrowed piece cannot be equipped';
  exception when insufficient_privilege then assert sqlerrm = 'NOT_OWNED', sqlerrm; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set elite_ends_at = now() + interval '1 day', elite_refunded_at = now()
  where id = current_setting('titan.fair_expiry')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_expiry'), 'role', 'authenticated')::text, true);
do $$
declare j jsonb;
begin
  j := public.titan_atelier();
  assert not (j -> 'plus' ->> 'active')::boolean, 'refund closes access even with future date and true flag';
  assert j -> 'appearance' ->> 'map' = 'map-aurora', 'earned piece survives refund';
  begin
    perform public.titan_set_appearance('frame', 'cos_frame_aegis');
    assert false, 'refunded borrowed piece cannot be equipped';
  exception when insufficient_privilege then assert sqlerrm = 'NOT_OWNED', sqlerrm; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set elite_refunded_at = null where id = current_setting('titan.fair_expiry')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.fair_expiry'), 'role', 'authenticated')::text, true);
do $$ begin
  assert (public.titan_atelier() -> 'plus' ->> 'active')::boolean, 'genuinely active subscription still opens borrowed access';
  perform public.titan_set_appearance('frame', 'cos_frame_aegis');
end $$;
rollback;

-- An inactive event must never hide an independent TITAN+ subscription or coach seat.
begin;
do $$
declare
  player uuid := gen_random_uuid();
  coach uuid := gen_random_uuid();
  tester uuid := gen_random_uuid();
  started timestamptz := now() - interval '3 days';
  ended timestamptz := now() - interval '1 day';
  expires timestamptz := now() + interval '15 days';
  token text;
  atelier jsonb;
  plan jsonb;
begin
  insert into auth.users(id, raw_user_meta_data) values (player, '{}'), (coach, '{}'), (tester, '{}');
  insert into private.titan_plan_products(product_id, plan) values ('play.profile_consistency_coach', 'coach');

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set is_tester = true where id = tester;
  set local role service_role;
  perform public.titan_apply_paddle_entitlement_v87(player, true, 'active', 'subscription.activated', started,
    'sub_profile_consistency', null, 'paddle.plus', null, null, expires, null, null);
  perform public.titan_apply_entitlement_v1(player, 'google_play', 'profile-consistency-token', false, 'expired', 'SUBSCRIPTION_EXPIRED', ended,
    p_ends_at => ended, p_refunded_at => ended);
  perform public.titan_apply_entitlement_v1(coach, 'google_play', 'profile-consistency-coach', true, 'active', 'SUBSCRIPTION_PURCHASED', started,
    p_product_id => 'play.profile_consistency_coach', p_ends_at => expires + interval '1 day');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', tester, 'role', 'authenticated')::text, true);
  assert public.titan_atelier()#>>'{plus,active}' = 'false', 'tester access is not a paid entitlement';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', player, 'role', 'authenticated')::text, true);
  atelier := public.titan_atelier();
  plan := public.titan_my_plan_v1();
  assert plan->>'own' = 'true' and plan->>'titanPlus' = 'true', 'Paddle still grants personal TITAN+';
  assert atelier#>>'{plus,active}' = 'true' and atelier#>>'{plus,status}' = 'active', 'Atelier must use the eligible Paddle source';
  assert (atelier#>>'{plus,ends_at}')::timestamptz = expires and atelier#>>'{plus,refunded_at}' is null, 'Atelier shows the eligible subscription dates';
  assert exists (select 1 from jsonb_array_elements(atelier->'items') item
    where item->>'id' = 'cos_frame_aegis' and item->>'owned' = 'true' and item->>'permanent' = 'false'), 'included cosmetic remains usable';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', coach, 'role', 'authenticated')::text, true);
  token := public.titan_coach_portal('invite')->>'token';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', player, 'role', 'authenticated')::text, true);
  perform public.titan_coach_portal('accept', jsonb_build_object('token', token, 'since_date', current_date, 'consent', true));
  assert public.titan_atelier()#>>'{plus,status}' = 'active', 'an eligible personal subscription takes precedence over a coach seat';
  reset role;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  perform public.titan_apply_paddle_entitlement_v87(player, false, 'refunded', 'transaction.refunded', now(),
    'sub_profile_consistency', null, 'paddle.plus', null, null, now(), null, now());
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', player, 'role', 'authenticated')::text, true);
  atelier := public.titan_atelier();
  plan := public.titan_my_plan_v1();
  assert plan->>'own' = 'false' and plan->>'viaCoach' = 'true' and plan->>'titanPlus' = 'true', 'the coach seat survives the personal refund';
  assert atelier#>>'{plus,active}' = 'true' and atelier#>>'{plus,status}' = 'seat', 'Atelier must use the eligible seat';
  assert (select elite_subscription_id from public.profiles where id = player) is null, 'the coach seat identifier stays private';
  reset role;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  perform public.titan_apply_entitlement_v1(coach, 'google_play', 'profile-consistency-coach', false, 'canceled', 'SUBSCRIPTION_CANCELED', now());
  perform public.titan_apply_entitlement_v1(player, 'google_play', 'profile-consistency-token', true, 'active', 'SUBSCRIPTION_RENEWED', now() + interval '1 second',
    p_ends_at => ended);
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', player, 'role', 'authenticated')::text, true);
  atelier := public.titan_atelier();
  plan := public.titan_my_plan_v1();
  assert plan->>'own' = 'false' and plan->>'viaCoach' = 'false' and plan->>'titanPlus' = 'false', 'an expired source cannot grant access even when still marked active';
  assert atelier#>>'{plus,active}' = 'false', 'Atelier denies access when the last eligible source ends';
  reset role;
end $$;
rollback;

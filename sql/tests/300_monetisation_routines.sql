-- Monetisation, lot C (20261121120000): the routine library limit (5, or 20 with an eligible TITAN+) is the server's. A larger library left
-- by an ended TITAN+ is kept, never cut; it may shrink or be edited, not grow again. Other preferences of the same save go through. Full rollback.
begin;
create function public.zz_rt_save(p_user uuid, p_count integer, p_goal integer default null) returns integer language plpgsql as $$
declare v_routines jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select coalesce(jsonb_agg(jsonb_build_object('id', 'r' || i, 'label', 'Routine ' || i, 'exercises', '[]'::jsonb)), '[]'::jsonb) into v_routines from generate_series(1, p_count) i;
  perform public.titan_save_profile_state(jsonb_build_object('user', jsonb_strip_nulls(jsonb_build_object('gymRoutines', v_routines, 'weeklyGoalSessions', p_goal))));
  return (select coalesce(jsonb_array_length(game_state #> '{user,gymRoutines}'), 0) from public.profiles where id = p_user);
end $$;
do $$
declare u uuid := '54000000-0000-4000-8000-0000000000e1';
begin
  insert into auth.users (id, is_anonymous) values (u, false);
  insert into public.profiles (id, username) values (u, 'Routines') on conflict (id) do nothing;
  assert public.zz_rt_save(u, 5) = 5, 'Classique: five routines';
  assert public.zz_rt_save(u, 6, 4) = 5, 'Classique: a sixth is refused by the server';
  assert (select (game_state #>> '{user,weeklyGoalSessions}')::int from public.profiles where id = u) = 4, 'the rest of the save went through';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(u, 'google_play', 'routine-plus-0123456789', true, 'active', 'verify', now() - interval '1 minute', null, 'titan01', null, now() + interval '1 month', now() + interval '1 month');
  assert public.zz_rt_save(u, 20) = 20, 'TITAN+: twenty routines';
  assert public.zz_rt_save(u, 21) = 20, 'TITAN+: not twenty-one';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(u, 'google_play', 'routine-plus-0123456789', false, 'expired', 'rtdn:13', now(), null, 'titan01', null, null, now());
  assert public.zz_rt_save(u, 20) = 20, 'TITAN+ ended: the twenty routines are kept and editable';
  assert public.zz_rt_save(u, 18) = 18, 'and can be removed';
  assert public.zz_rt_save(u, 19) = 18, 'but the library does not grow again above the Classique cap';
end $$;
rollback;

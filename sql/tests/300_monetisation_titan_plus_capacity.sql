-- Owner decision (20261121140000): a personal TITAN+ gives no coaching places; only Coach (5) and Coach Ultra (15) do. Full rollback.
begin;
do $$
declare u uuid := '56000000-0000-4000-8000-0000000000f1';
begin
  insert into auth.users (id, is_anonymous) values (u, false);
  insert into public.profiles (id, username) values (u, 'Capacité TITAN+') on conflict (id) do nothing;
  assert private.titan_coach_capacity(u) = 3, 'Classique: 3';
  perform public.titan_apply_play_entitlement_v1(u, 'cap-plus-0123456789ab', true, 'active', 'verify', now() - interval '2 minutes', false,
    p_product_id => 'titan01', p_ends_at => now() + interval '1 month');
  assert (select is_elite from public.profiles where id = u) and private.titan_coach_capacity(u) = 3, 'TITAN+ alone: still 3';
  perform public.titan_apply_play_entitlement_v1(u, 'cap-coach-0123456789a', true, 'active', 'verify', now() - interval '1 minute', false,
    'cap-plus-0123456789ab', p_product_id => 'titan02', p_ends_at => now() + interval '1 month');
  assert private.titan_coach_capacity(u) = 5, 'Coach: 5';
  perform public.titan_apply_play_entitlement_v1(u, 'cap-ultra-0123456789a', true, 'active', 'verify', now(), false,
    'cap-coach-0123456789a', p_product_id => 'titan03', p_ends_at => now() + interval '1 month');
  assert private.titan_coach_capacity(u) = 15, 'Coach Ultra: 15';
end $$;
rollback;

-- Monetisation, lot C (20261121100000): the places of the coach's current offer apply to every coach action. Links beyond the places are
-- paused (never deleted), resume by themselves, and the seats (TITAN+ included) follow the same order. Full rollback.
begin;
do $$
declare c uuid := '53000000-0000-4000-8000-0000000000c0'; u uuid[] := array[]::uuid[]; i integer;
begin
  for i in 1..8 loop u := u || ('53000000-0000-4000-8000-00000000000' || i)::uuid; end loop;
  insert into auth.users(id, raw_user_meta_data, is_anonymous) select x, '{}', false from unnest(u || c) x;
  update public.profiles set username = 'Coach Capacité' where id = c;
  perform set_config('titan.cc_c', c::text, true); perform set_config('titan.cc_u', array_to_string(u, ','), true);
end $$;

create function public.zz_cc_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_cc_link(p_coach uuid, p_athlete uuid) returns uuid language plpgsql as $$
declare inv jsonb; acc jsonb;
begin
  perform public.zz_cc_as(p_coach); inv := public.titan_coach_portal('invite');
  perform public.zz_cc_as(p_athlete);
  acc := public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date, 'consent', true));
  return (acc->>'id')::uuid;
end $$;
-- Returns the error code of a coach action, or 'ok'.
create function public.zz_cc_try(p_user uuid, p_action text, p_data jsonb) returns text language plpgsql as $$
begin
  perform public.zz_cc_as(p_user);
  if p_action = 'message' then perform public.titan_coach_message_send_v1((p_data->>'link_id')::uuid, 'Bonjour');
  elsif p_action = 'messages' then perform public.titan_coach_messages_v1((p_data->>'link_id')::uuid);
  else perform public.titan_coach_portal(p_action, p_data); end if;
  return 'ok';
exception when others then return sqlerrm;
end $$;
create function public.zz_cc_pay(p_user uuid, p_ext text, p_product text, p_active boolean, p_linked text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_play_entitlement_v1(p_user, p_ext, p_active, case when p_active then 'active' else 'expired' end, 'test', clock_timestamp(), false,
    p_linked, null, p_product, now() + interval '30 days', case when p_active then now() + interval '30 days' else now() end);
end $$;
create function public.zz_cc_elite(p_user uuid) returns boolean language sql as $$ select coalesce(is_elite, false) from public.profiles where id = p_user $$;

do $$
declare
  c uuid := current_setting('titan.cc_c')::uuid; u uuid[] := string_to_array(current_setting('titan.cc_u'), ',')::uuid[];
  l uuid[] := array[]::uuid[]; i integer; snap jsonb; sessions jsonb := jsonb_build_object('to_date', current_date);
begin
  -- Coach Ultra (titan03, seeded mapping): seven athletes, all active, all with TITAN+.
  perform public.zz_cc_pay(c, 'cc-ultra-0123456789ab', 'titan03', true);
  -- One test transaction has a single now(): each acceptance gets its own time, as separate requests would.
  for i in 1..7 loop
    l := l || public.zz_cc_link(c, u[i]);
    update public.coach_links set accepted_at = now() - make_interval(mins => 10 - i) where id = l[i];
  end loop;
  for i in 1..7 loop
    assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[i])) = 'ok', 'Ultra: link '||i||' usable';
    assert public.zz_cc_elite(u[i]), 'Ultra: athlete '||i||' has TITAN+';
  end loop;

  -- Downgrade Coach Ultra → Coach (Google replaces the token): five places. Links 6 and 7, the most recent, are paused on both sides.
  perform public.zz_cc_pay(c, 'cc-coach-0123456789ab', 'titan02', true, 'cc-ultra-0123456789ab');
  for i in 1..5 loop assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[i])) = 'ok', 'Coach: link '||i||' still active'; end loop;
  assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[6])) = 'COACH_CAPACITY_PAUSED', 'Coach: the sixth link is paused';
  assert public.zz_cc_try(c, 'assign', jsonb_build_object('link_id', l[7], 'title', 'Footing', 'sport', 'running', 'planned_date', current_date)) = 'COACH_CAPACITY_PAUSED', 'no proposal through a paused link';
  assert public.zz_cc_try(c, 'message', jsonb_build_object('link_id', l[7])) = 'SHARING_UNAVAILABLE', 'no message from the coach through a paused link';
  assert public.zz_cc_try(u[7], 'message', jsonb_build_object('link_id', l[7])) = 'SHARING_UNAVAILABLE', 'no message from the athlete either';
  assert public.zz_cc_try(c, 'message', jsonb_build_object('link_id', l[1])) = 'ok', 'an active link keeps its messages';
  assert not public.zz_cc_elite(u[6]) and not public.zz_cc_elite(u[7]) and public.zz_cc_elite(u[5]), 'seats follow the same order';
  perform public.zz_cc_as(c); snap := public.titan_coach_portal('snapshot');
  assert (snap->>'capacity')::int = 5 and (snap->>'seatsUsed')::int = 7, 'capacity 5, seven links kept: '||snap::text;
  assert (select count(*) from jsonb_array_elements(snap->'links') x where (x->>'paused')::boolean) = 2, 'two links shown as paused';
  perform public.zz_cc_as(u[7]); snap := public.titan_coach_portal('snapshot');
  assert (snap->'links'->0->>'paused')::boolean, 'the athlete sees the pause too';
  assert (select count(*) from public.coach_links where coach_id = c and revoked_at is null) = 7, 'nothing revoked';
  assert public.zz_cc_try(c, 'invite', '{}') = 'COACH_CAPACITY', 'no new invitation above the places';

  -- A place is freed (athlete 2 leaves): the oldest paused link resumes by itself, with its seat.
  assert public.zz_cc_try(u[2], 'revoke', jsonb_build_object('link_id', l[2], 'revision', (select revision from public.coach_links where id = l[2]))) = 'ok';
  assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[6])) = 'ok', 'link 6 resumes when a place is free';
  assert public.zz_cc_elite(u[6]) and not public.zz_cc_elite(u[7]), 'its seat comes back, link 7 still waits';
  -- A paused athlete can still change the scope or leave.
  assert public.zz_cc_try(u[7], 'scope', jsonb_build_object('link_id', l[7], 'revision', (select revision from public.coach_links where id = l[7]), 'since_date', current_date)) = 'ok', 'scope stays editable';

  -- The offer ends: back to the Classique capacity (3). Only the three oldest remaining links are usable; nobody keeps TITAN+ from the coach.
  perform public.zz_cc_pay(c, 'cc-coach-0123456789ab', 'titan02', false);
  assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[1])) = 'ok'
     and public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[4])) = 'ok', 'three oldest stay';
  assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[5])) = 'COACH_CAPACITY_PAUSED', 'the fourth is paused after expiry';
  assert (select count(*) from public.profiles where id = any(u) and is_elite) = 0, 'no seat without an offer';
  -- Renewal (restore): everything resumes without any action of the athletes.
  perform public.zz_cc_pay(c, 'cc-ultra2-0123456789a', 'titan03', true);
  for i in 3..7 loop assert public.zz_cc_try(c, 'sessions', sessions || jsonb_build_object('link_id', l[i])) = 'ok', 'resumed: link '||i; end loop;
  assert public.zz_cc_elite(u[7]), 'seats back with the offer';
end $$;
rollback;

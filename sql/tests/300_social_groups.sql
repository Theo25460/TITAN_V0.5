-- Social excellence, lot B (migration 20261120100000). Synthetic accounts only, full rollback.
-- Covered: a session whose reward is held or cancelled, or that the server never stamped, counts for no collective goal (Duo, challenge,
-- guild week) and a released one counts again; a finished challenge names only oneself, friends and link partners; a Duo that reaches its
-- end keeps its result for both, with the partner named only while still friends; a Duo stopped early keeps none; a club's weekly goal is
-- set by an administrator only and read by members as a total without any name, only from 3 members (null totals below); non-members
-- read nothing; no XP and no credit. A session past the daily cap is still risk-scored: an implausible one is held (zero amounts) and is
-- not a confirmed session until released.
begin;
do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','x'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_g_' || k, privacy = '{"publicProfile":true}', created_at = now() - interval '5 days' where id = v;
    perform set_config('titan.g_' || k, v::text, true);
  end loop;
  -- a and b are friends, a and c are friends; b and c are not; x joins a's open challenge by link.
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.g_a'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.g_a')::uuid, current_setting('titan.g_b')::uuid, 'accepted'),
    (current_setting('titan.g_a')::uuid, current_setting('titan.g_c')::uuid, 'accepted');
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- 1. Confirmed sessions only.
do $$
declare a uuid := current_setting('titan.g_a')::uuid; l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); l3 uuid := gen_random_uuid(); l4 uuid := gen_random_uuid();
  total numeric;
begin
  set local session_replication_role = replica;
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at) values
    (l1, a, 'running', 5, 'km', 10, now() - interval '1 hour', '{"serverReward":true,"effort":{"effort_minutes":30}}', now()),
    (l2, a, 'yoga', 1, 'session', 10, now() - interval '2 hours', '{"serverReward":true,"effort":{"effort_minutes":20}}', now()),
    (l3, a, 'cycling', 10, 'km', 10, now() - interval '3 hours', '{"serverReward":true,"effort":{"effort_minutes":25}}', now()),
    (l4, a, 'walking', 3, 'km', 10, now() - interval '4 hours', '{"effort":{"effort_minutes":15}}', now());
  insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at) values (l2, a, 10, 1, now() + interval '1 day');
  insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at, status, settled_at) values (l3, a, 10, 1, now(), 'cancelled', now());
  set local session_replication_role = origin;
  select coalesce(sum(minutes), 0) into total from private.titan_effort_days(a, now() - interval '1 day', now() + interval '1 day', now() - interval '1 day', 90);
  assert total = 30, 'only the confirmed, unheld session counts (held, cancelled and unstamped ones do not), got ' || total;
  update private.titan_reward_holds set status = 'released', settled_at = now() where log_id = l2;
  select coalesce(sum(minutes), 0) into total from private.titan_effort_days(a, now() - interval '1 day', now() + interval '1 day', now() - interval '1 day', 90);
  assert total = 50, 'a released session counts again, got ' || total;
  perform set_config('titan.g_l1', l1::text, true);
end $$;

-- 2. A finished challenge names only those one may see.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.g_a')::uuid; b uuid := current_setting('titan.g_b')::uuid; c uuid := current_setting('titan.g_c')::uuid;
  x uuid := current_setting('titan.g_x')::uuid; r jsonb; ch uuid; tok text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ch := (public.titan_challenge_create('Semaine QA', 'effort_minutes', null, 30, 7, array[b, c])->>'id')::uuid;
  tok := public.titan_challenge_link_create_v1(ch)->>'token';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(ch, 'join');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(ch, 'join');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_link_accept_v1(tok);
  perform set_config('titan.g_ch', ch::text, true);
end $$;
reset role;
update public.titan_challenges set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute' where id = current_setting('titan.g_ch')::uuid;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.g_a')::uuid; b uuid := current_setting('titan.g_b')::uuid; x uuid := current_setting('titan.g_x')::uuid;
  ch uuid := current_setting('titan.g_ch')::uuid; r jsonb; names text[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.titan_challenge_result_v1(ch);
  select array_agg(e->>'name' order by e->>'name') into names from jsonb_array_elements(r->'results') e;
  assert names = array['Participant', 'Participant', 'qa_g_a', 'qa_g_b'], 'b sees itself and its friend a; c and x stay nameless: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  r := public.titan_challenge_result_v1(ch);
  select array_agg(e->>'name' order by e->>'name') into names from jsonb_array_elements(r->'results') e;
  assert names = array['Participant', 'Participant', 'qa_g_a', 'qa_g_x'], 'x sees itself and a (the link they shared), nobody else: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.titan_challenge_result_v1(ch);
  assert (select count(*) from jsonb_array_elements(r->'results') e where e->>'name' = 'Participant') = 0, 'the creator sees friends and its link partner';
  assert (select (e->>'progress')::numeric from jsonb_array_elements(r->'results') e where (e->>'me')::boolean) = 50, 'a: confirmed minutes only (30 + 20 released)';
end $$;

-- 3. TITAN Duo keeps its outcome.
do $$
declare a uuid := current_setting('titan.g_a')::uuid; b uuid := current_setting('titan.g_b')::uuid; id1 uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  id1 := (public.titan_buddy_invite_v1(b)->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_buddy_respond_v1(id1, true);
  perform set_config('titan.g_duo', id1::text, true);
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.g_a')::uuid; b uuid := current_setting('titan.g_b')::uuid; id1 uuid := current_setting('titan.g_duo')::uuid; d integer;
begin
  perform set_config('request.jwt.claims', '{}', true);
  update private.titan_buddies set starts_on = current_date - 15, ends_on = current_date - 2, accepted_at = now() - interval '16 days' where id = id1;
  set local session_replication_role = replica;
  for d in 3..14 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (case when d % 2 = 0 then a else b end, case when d % 2 = 0 then 'running' else 'swimming' end, 1, 'km', 10,
            now() - make_interval(days => d), '{"serverReward":true,"effort":{"effort_minutes":30}}', now() - make_interval(days => d));
  end loop;
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.g_a')::uuid; b uuid := current_setting('titan.g_b')::uuid; c uuid := current_setting('titan.g_c')::uuid; r jsonb; ok boolean := false; id2 uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.titan_buddy_v1();
  assert r->>'status' = 'none' and (r->'last'->>'reached')::boolean and (r->'last'->>'together')::int = 12 and (r->'last'->>'myDays')::int = 6
     and r->'last'->'partner'->>'name' = 'qa_g_b', 'a finished Duo keeps its result: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.titan_buddy_v1();
  assert (r->'last'->>'myDays')::int = 6 and r->'last'->'partner'->>'name' = 'qa_g_a', 'the partner sees the same result from its side: ' || r::text;
  -- Once they are no longer friends, the result stays but the partner is no longer named.
  perform public.titan_social_remove(a);
  r := public.titan_buddy_v1();
  assert (r->'last'->>'together')::int = 12 and r->'last'->'partner' = 'null'::jsonb, 'no name once the friendship ended: ' || r::text;
  -- A Duo stopped early keeps no result.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  id2 := (public.titan_buddy_invite_v1(c)->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_buddy_respond_v1(id2, true);
  assert public.titan_buddy_end_v1(id2), 'stopped early';
  assert (public.titan_buddy_v1()->'last') = 'null'::jsonb, 'nothing frozen for an early stop';
end $$;

-- 4. A club's common goal.
do $$
declare a uuid := current_setting('titan.g_a')::uuid; b uuid := current_setting('titan.g_b')::uuid; c uuid := current_setting('titan.g_c')::uuid;
  club uuid; code text; r jsonb; ok boolean := false; xp0 integer; cr0 integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  club := public.titan_club_create_v1('Club QA', 'Tous sports', false);
  code := public.titan_club_my_v1()->0->>'code';
  r := public.titan_club_goal_set_v1(club, 300);
  assert (r->>'goal')::int = 300 and (r->>'canSet')::boolean, 'the administrator sets the goal: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin perform public.titan_club_week_v1(club); exception when others then ok := sqlerrm = 'CLUB_NOT_FOUND'; end;
  assert ok, 'a non-member reads nothing';
  perform public.titan_club_join_v1(code, null);
  r := public.titan_club_week_v1(club);
  assert (r->>'members')::int = 2 and (r->>'goal')::int = 300 and not (r->>'canSet')::boolean and r::text not like '%qa_g_%', 'a member reads a total without names: ' || r::text;
  -- Two members: the total minus one's own minutes would be the other member's week, so no total and no active count.
  assert r ? 'minutes' and r ? 'active' and r->'minutes' = 'null'::jsonb and r->'active' = 'null'::jsonb, 'a club of two reads the goal with null totals: ' || r::text;
  -- From three members the totals are given.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_club_join_v1(code, null);
  r := public.titan_club_week_v1(club);
  assert (r->>'members')::int = 3 and jsonb_typeof(r->'minutes') = 'number' and jsonb_typeof(r->'active') = 'number', 'three members read the totals: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.titan_club_goal_set_v1(club, 600); exception when others then ok := sqlerrm = 'CLUB_ADMIN_REQUIRED'; end;
  assert ok, 'a member cannot set the goal';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.titan_club_goal_set_v1(club, 10); exception when others then ok := sqlerrm = 'CLUB_GOAL_INVALID'; end;
  assert ok, 'a goal of at least 60 minutes';
  assert (public.titan_club_goal_set_v1(club, null)->>'goal') is null, 'the goal can be removed';
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
end $$;

-- 5. A session recorded past the daily XP cap is still risk-scored: an implausible one (100 km run in 60 minutes) is held with zero
--    amounts and stays out of the confirmed sessions until released; a plausible capped one is not held and counts.
reset role;
do $$
declare v uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', '{}', true);
  insert into auth.users(id, raw_user_meta_data) values (v, '{}');
  -- The day's allowance of 1 800 XP is already used.
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, category, val, unit, xp, date, details)
  values (v, 'cycling', 'cardio', 40, 'km', 1800, now() - interval '5 hours', '{"duration":120,"serverReward":true}');
  set local session_replication_role = origin;
  perform set_config('titan.g_cap', v::text, true);
end $$;
set local role authenticated;
do $$
declare v uuid := current_setting('titan.g_cap')::uuid; r record; fine record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  select * into fine from public.titan_submit_training_session('running', 'cardio', 10, 'km', jsonb_build_object('duration', 60, 'client_event_id', gen_random_uuid()), now() - interval '3 hours');
  assert fine.xp = 0 and not fine.reward_held, 'a plausible session past the cap: 0 XP, not held: ' || row_to_json(fine)::text;
  select * into r from public.titan_submit_training_session('running', 'cardio', 100, 'km', jsonb_build_object('duration', 60, 'client_event_id', gen_random_uuid()), now() - interval '1 hour');
  assert r.xp = 0 and r.credits = 0 and r.reward_held and r.held_xp = 0 and r.held_credits = 0, 'capped and implausible: held with zero amounts: ' || row_to_json(r)::text;
  perform set_config('titan.g_cap_held', r.log_id, true);
  perform set_config('titan.g_cap_fine', fine.log_id, true);
end $$;
reset role;
do $$
declare v uuid := current_setting('titan.g_cap')::uuid; h uuid := current_setting('titan.g_cap_held')::uuid; f uuid := current_setting('titan.g_cap_fine')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  assert (select status = 'held' and xp = 0 and credits = 0 from private.titan_reward_holds where log_id = h), 'a zero-amount hold is recorded';
  assert not exists (select 1 from private.titan_reward_holds where log_id = f), 'no hold for the plausible session';
  assert not exists (select 1 from private.titan_confirmed_sessions(v, now() - interval '1 day', now() + interval '1 day', '-infinity') s where s.log_id = h),
    'the held session is absent from the confirmed sessions';
  assert exists (select 1 from private.titan_confirmed_sessions(v, now() - interval '1 day', now() + interval '1 day', '-infinity') s where s.log_id = f),
    'the plausible capped session counts';
  -- Released like any hold after 24 hours: nothing to credit, and it counts again.
  update private.titan_reward_holds set release_at = now() - interval '1 minute' where log_id = h;
  perform private.titan_release_due_reward_holds();
  assert (select status from private.titan_reward_holds where log_id = h) = 'released', 'a zero-amount hold is released';
  assert exists (select 1 from private.titan_confirmed_sessions(v, now() - interval '1 day', now() + interval '1 day', '-infinity') s where s.log_id = h),
    'released: it counts again';
end $$;
rollback;

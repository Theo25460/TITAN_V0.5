-- V1.8.1 — Relais de cordée (migration 20261130104100). Synthetic accounts only, full rollback.
-- A climber (a) opens the passage of « Le relais de la Sentinelle » with a confirmed climbing session; a runner friend (b) confirms the
-- relay with a confirmed run on another day; a third member (c) sees what is open and how to contribute; a stranger who joined by link
-- (e) sees the game action without anyone it may not see. Covered: closed flag, pilot route only, invitee and non-member refused,
-- no session / held session / suspicious session open nothing, transmission once (a second member and a repeated call), the opener
-- cannot confirm their own relay, the same day is refused, a repeated confirmation changes nothing, a third member cannot confirm
-- again, the relay adds no longueur, XP or credit, a block stops the confirmation, an ended cordée refuses, the export lists one's
-- relay actions, an erased member leaves the game state with no person, the measure counts the pilot.
begin;
do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','d','e'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_rl_' || k, privacy = '{"publicProfile":true}' where id = v;
    perform set_config('titan.rl_' || k, v::text, true);
  end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.cordee', true, 100, 'QA')
    on conflict (key) do update set enabled = true, rollout = 100;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.cordee_relay', false, 100, 'QA')
    on conflict (key) do update set enabled = false, rollout = 100;
  -- a is friends with b, c and d; b and c are friends; e is nobody's friend (joins by link).
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.rl_a'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.rl_a')::uuid, current_setting('titan.rl_b')::uuid, 'accepted'),
    (current_setting('titan.rl_a')::uuid, current_setting('titan.rl_c')::uuid, 'accepted'),
    (current_setting('titan.rl_a')::uuid, current_setting('titan.rl_d')::uuid, 'accepted');
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.rl_b'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values (current_setting('titan.rl_b')::uuid, current_setting('titan.rl_c')::uuid, 'accepted');
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- The cordée: a forms « Les crêtes de l’Aube » with b and c invited, and a second cordée on another route; e joins by link.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.rl_a')::uuid; b uuid := current_setting('titan.rl_b')::uuid; c uuid := current_setting('titan.rl_c')::uuid;
  e uuid := current_setting('titan.rl_e')::uuid; id1 uuid; id2 uuid; tok text; r jsonb; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  id1 := (public.titan_cordee_create_v1('aube', 'reguliere', 14, array[b, c])->>'id')::uuid;
  id2 := (public.titan_cordee_create_v1('forge', 'douce', 7, array[b])->>'id')::uuid;
  tok := public.titan_challenge_link_create_v1(id1)->>'token';
  r := (select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r ? 'relay' and r->'relay' = 'null'::jsonb, 'closed flag: the pilot route shows no relay step yet: ' || r::text;
  begin perform public.titan_cordee_relay_v1(id1, 'transmit'); exception when others then ok := sqlerrm = 'FEATURE_DISABLED'; end;
  assert ok, 'closed flag: the server refuses the relay';
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_link_accept_v1(tok);
  perform set_config('titan.rl_id1', id1::text, true);
  perform set_config('titan.rl_id2', id2::text, true);
end $$;

-- Sessions. a: a confirmed climbing session 3 days ago (technique). b: a running session whose reward is held and a suspicious one.
reset role;
do $$
declare a uuid := current_setting('titan.rl_a')::uuid; b uuid := current_setting('titan.rl_b')::uuid;
  id1 uuid := current_setting('titan.rl_id1')::uuid; id2 uuid := current_setting('titan.rl_id2')::uuid; held uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', '{}', true);
  update public.titan_challenges set starts_at = now() - interval '5 days' where id in (id1, id2);
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee_relay';
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (a, 'climbing', 1, 'session', 10, now() - interval '3 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '3 days');
  insert into public.training_logs(id, user_id, sport, val, unit, xp, date, details, created_at)
  values (held, b, 'running', 8, 'km', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":45}}', now() - interval '2 days');
  insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at) values (held, b, 10, 1, now() + interval '1 day');
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at, is_suspicious)
  values (b, 'running', 30, 'km', 10, now() - interval '4 days', '{"serverReward":true,"effort":{"effort_minutes":90}}', now() - interval '4 days', true);
  set local session_replication_role = origin;
end $$;

set local role authenticated;
do $$
declare a uuid := current_setting('titan.rl_a')::uuid; b uuid := current_setting('titan.rl_b')::uuid; c uuid := current_setting('titan.rl_c')::uuid;
  d uuid := current_setting('titan.rl_d')::uuid; id1 uuid := current_setting('titan.rl_id1')::uuid; id2 uuid := current_setting('titan.rl_id2')::uuid;
  r jsonb; ok boolean := false; t0 timestamptz;
begin
  -- An invited member who has not joined, and a friend who is not a member, reach nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->>'status' = 'waiting' and r->>'hint' = 'join' and r->'can' = 'null'::jsonb, 'the invitee is asked to join first: ' || r::text;
  begin perform public.titan_cordee_relay_v1(id1, 'transmit'); exception when others then ok := sqlerrm = 'CHALLENGE_NOT_FOUND'; end;
  assert ok, 'an invitee who has not joined cannot transmit';
  ok := false;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_relay_v1(id1, 'transmit'); exception when others then ok := sqlerrm = 'CHALLENGE_NOT_FOUND'; end;
  assert ok, 'a friend outside the cordée cannot transmit';
  ok := false;
  -- b and c join.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(id1, 'join');
  perform public.titan_challenge_respond(id2, 'join');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(id1, 'join');
  -- c has no session: nothing to transmit, and the hint says how to get there.
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->>'hint' = 'session' and r->'can' = 'null'::jsonb, 'c needs a confirmed day first: ' || r::text;
  begin perform public.titan_cordee_relay_v1(id1, 'transmit'); exception when others then ok := sqlerrm = 'RELAY_NO_SESSION'; end;
  assert ok, 'no session, no passage';
  ok := false;
  -- b: only a held session and a suspicious one, both refused.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_relay_v1(id1, 'transmit'); exception when others then ok := sqlerrm = 'RELAY_NO_SESSION'; end;
  assert ok, 'a held or suspicious session opens nothing';
  ok := false;
  -- The other route has no relay step.
  r := (select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id2::text);
  assert r->'relay' = 'null'::jsonb, 'only the pilot route has a relay: ' || r::text;
  begin perform public.titan_cordee_relay_v1(id2, 'transmit'); exception when others then ok := sqlerrm = 'RELAY_NOT_ON_ROUTE'; end;
  assert ok, 'the server refuses a relay on another route';
  ok := false;
  -- a can transmit; a confirmation before any opening is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_relay_v1(id1, 'confirm'); exception when others then ok := sqlerrm = 'RELAY_NOT_OPEN'; end;
  assert ok, 'nothing to confirm before the passage opens';
  ok := false;
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->>'can' = 'transmit' and r->>'hint' = 'transmit', 'the climber can open the passage: ' || r::text;
  r := public.titan_cordee_relay_v1(id1, 'transmit');
  assert r->>'status' = 'opened' and (r->>'changed')::boolean and r->'opener'->>'name' = 'qa_rl_a' and (r->'opener'->>'me')::boolean
     and r->'opener'->>'family' = 'technique' and r->>'hint' = 'own' and r->'can' = 'null'::jsonb, 'the passage is open, carried by climbing: ' || r::text;
  -- Transmitting again changes nothing.
  r := public.titan_cordee_relay_v1(id1, 'transmit');
  assert not (r->>'changed')::boolean and r->>'status' = 'opened', 'a repeated transmission changes nothing: ' || r::text;
  -- The same member through the normal flow: no confirm offered, and the server refuses it.
  begin perform public.titan_cordee_relay_v1(id1, 'confirm'); exception when others then ok := sqlerrm = 'RELAY_OWN'; end;
  assert ok, 'the first member alone cannot pass and receive the same relay';
  ok := false;
  -- A second member cannot open the passage again.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_relay_v1(id1, 'transmit'); exception when others then ok := sqlerrm = 'RELAY_ALREADY_OPEN'; end;
  assert ok, 'the passage opens once';
  ok := false;
  -- b's only sessions are refused ones: nothing to confirm with.
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->>'hint' = 'other_day' and r->'can' = 'null'::jsonb and r->'opener'->>'name' = 'qa_rl_a' and not (r->'opener'->>'me')::boolean, 'b sees the open passage: ' || r::text;
  begin perform public.titan_cordee_relay_v1(id1, 'confirm'); exception when others then ok := sqlerrm = 'RELAY_NO_SESSION'; end;
  assert ok, 'a refused session confirms nothing';
  ok := false;
end $$;
reset role;
do $$
begin
  assert (select count(*) from private.titan_cordee_relays where challenge_id = current_setting('titan.rl_id1')::uuid) = 1
     and (select opened_by from private.titan_cordee_relays where challenge_id = current_setting('titan.rl_id1')::uuid) = current_setting('titan.rl_a')::uuid
     and (select confirmed_at from private.titan_cordee_relays where challenge_id = current_setting('titan.rl_id1')::uuid) is null,
    'one opening (a), nothing confirmed';
end $$;

-- b runs on the same day as the opening session (recorded after the opening): refused. Then a run today: accepted.
reset role;
do $$
declare b uuid := current_setting('titan.rl_b')::uuid; id1 uuid := current_setting('titan.rl_id1')::uuid; v_day date;
begin
  perform set_config('request.jwt.claims', '{}', true);
  select l.date into strict v_day from private.titan_cordee_relays r join public.training_logs l on l.id = r.opened_log where r.challenge_id = id1;
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  select b, 'running', 6, 'km', 10, l.date, '{"serverReward":true,"effort":{"effort_minutes":35}}', clock_timestamp()
    from private.titan_cordee_relays r join public.training_logs l on l.id = r.opened_log where r.challenge_id = id1;
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare b uuid := current_setting('titan.rl_b')::uuid; id1 uuid := current_setting('titan.rl_id1')::uuid; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin perform public.titan_cordee_relay_v1(id1, 'confirm'); exception when others then ok := sqlerrm = 'RELAY_OTHER_DAY'; end;
  assert ok, 'the relay is confirmed on another day than the opening';
end $$;
reset role;
do $$
declare b uuid := current_setting('titan.rl_b')::uuid;
begin
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (b, 'running', 5, 'km', 10, now() - interval '1 hour', '{"serverReward":true,"effort":{"effort_minutes":30}}', clock_timestamp());
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.rl_a')::uuid; b uuid := current_setting('titan.rl_b')::uuid; c uuid := current_setting('titan.rl_c')::uuid;
  e uuid := current_setting('titan.rl_e')::uuid; id1 uuid := current_setting('titan.rl_id1')::uuid;
  r jsonb; before jsonb; after jsonb; t1 timestamptz; ok boolean := false; xp0 integer; cr0 integer; xpb integer; crb integer;
begin
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  select xp, credits into xpb, crb from public.profiles where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  before := (select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert before->'relay'->>'can' = 'confirm', 'b can confirm with today''s run: ' || before::text;
  r := public.titan_cordee_relay_v1(id1, 'confirm');
  assert r->>'status' = 'confirmed' and (r->>'changed')::boolean and r->'receiver'->>'name' = 'qa_rl_b' and (r->'receiver'->>'me')::boolean
     and r->'receiver'->>'family' = 'endurance' and r->'opener'->>'family' = 'technique' and r->>'hint' = 'done', 'two members, two sports: ' || r::text;
  -- Confirming again: same state, nothing more unlocked.
  r := public.titan_cordee_relay_v1(id1, 'confirm');
  assert not (r->>'changed')::boolean and r->>'status' = 'confirmed', 'a repeated confirmation changes nothing: ' || r::text;
  after := (select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert (after - 'relay') = (before - 'relay'), 'the relay adds no longueur and changes no count of the cordée: ' || before::text || ' / ' || after::text;
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0
     and (select xp from public.profiles where id = b) is not distinct from xpb and (select credits from public.profiles where id = b) is not distinct from crb, 'no XP, no credit';
  -- The third member sees what is open and that the step is done; cannot confirm again.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->>'status' = 'confirmed' and r->'opener'->>'name' = 'qa_rl_a' and r->'receiver'->>'name' = 'qa_rl_b' and r->>'hint' = 'done' and r->'can' = 'null'::jsonb,
    'the third member sees the relay passed from a to b: ' || r::text;
  begin perform public.titan_cordee_relay_v1(id1, 'confirm'); exception when others then ok := sqlerrm = 'RELAY_ALREADY_CONFIRMED'; end;
  assert ok, 'one confirmation per relay';
  ok := false;
  -- The stranger who joined by a's link sees a (link partner) and not b; the relay never carries session data.
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->'opener'->>'name' = 'qa_rl_a' and r->'receiver'->>'name' = 'Membre de la cordée' and r->'receiver'->'family' = 'null'::jsonb,
    'names follow the Cordée rule: ' || r::text;
  assert r::text !~ '(log|day|sport|minutes|km|date|_at)', 'no session detail in the relay: ' || r::text;
  -- The export lists one's own relay actions.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.export_own_data();
  assert jsonb_array_length(r->'cordeeRelays') = 1 and r->'cordeeRelays'->0->>'action' = 'transmit' and r ? 'cordeeTitles', 'a''s export: ' || coalesce(r->'cordeeRelays', 'null'::jsonb)::text;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.export_own_data();
  assert jsonb_array_length(r->'cordeeRelays') = 1 and r->'cordeeRelays'->0->>'action' = 'confirm', 'b''s export: ' || coalesce(r->'cordeeRelays', 'null'::jsonb)::text;
end $$;

-- A block stops a confirmation; an ended cordée refuses; the closed flag keeps a played relay readable.
reset role;
do $$
declare a uuid := current_setting('titan.rl_a')::uuid; b uuid := current_setting('titan.rl_b')::uuid; c uuid := current_setting('titan.rl_c')::uuid;
  id3 uuid; ok boolean := false; r jsonb;
begin
  -- c opens the passage of a new pilot cordée of a's; b blocks c, then tries to confirm.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  id3 := (public.titan_cordee_create_v1('aube', 'soutenue', 28, array[b, c])->>'id')::uuid;
  perform set_config('request.jwt.claims', '{}', true);
  update public.titan_challenges set starts_at = now() - interval '5 days', ends_at = now() + interval '20 days' where id = id3;
  update public.titan_challenge_members set status = 'joined', joined_at = now() - interval '5 days' where challenge_id = id3;
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (c, 'yoga', 1, 'session', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":20}}', now() - interval '2 days');
  set local session_replication_role = origin;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  r := public.titan_cordee_relay_v1(id3, 'transmit');
  assert r->'opener'->>'family' = 'mobilite', 'yoga opens the passage too: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_block_user(c, null);
  begin perform public.titan_cordee_relay_v1(id3, 'confirm'); exception when others then ok := sqlerrm in ('RELAY_UNAVAILABLE', 'CHALLENGE_NOT_FOUND'); end;
  assert ok, 'a block between the two members stops the confirmation';
  assert (select confirmed_at from private.titan_cordee_relays where challenge_id = id3) is null, 'nothing confirmed across a block';
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id3::text);
  assert r is null or r->'opener'->>'name' = 'Membre de la cordée', 'b no longer sees the member it blocked: ' || coalesce(r::text, 'gone');
  -- An ended cordée: nothing more can be confirmed, and the state says it is closed.
  perform set_config('request.jwt.claims', '{}', true);
  update public.titan_challenges set ends_at = now() - interval '1 minute' where id = id3;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false;
  begin perform public.titan_cordee_relay_v1(id3, 'confirm'); exception when others then ok := sqlerrm = 'CHALLENGE_ENDED'; end;
  assert ok, 'an ended cordée refuses the confirmation';
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id3::text);
  assert r->>'status' = 'opened' and r->>'hint' = 'closed' and not (r->>'active')::boolean, 'an ended cordée shows a closed relay: ' || r::text;
  -- Closing the flag: the played relay of id1 stays readable, an unplayed one disappears, actions are refused.
  perform set_config('request.jwt.claims', '{}', true);
  update private.titan_feature_flags set enabled = false where key = 'screens.cordee_relay';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = current_setting('titan.rl_id1'));
  assert r->>'status' = 'confirmed', 'a played relay stays readable when the flag closes: ' || coalesce(r::text, 'null');
  perform set_config('request.jwt.claims', '{}', true);
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee_relay';
end $$;

-- The measure (service side) and the erasure of a member.
do $$
declare b uuid := current_setting('titan.rl_b')::uuid; c uuid := current_setting('titan.rl_c')::uuid; id1 uuid := current_setting('titan.rl_id1')::uuid; m jsonb; r jsonb;
begin
  perform set_config('request.jwt.claims', '{}', true);
  m := private.titan_cordee_relay_measure(now() - interval '30 days');
  assert (m->>'cordees')::int >= 2 and (m->>'started')::int >= 2 and (m->>'opened')::int >= 2 and (m->>'confirmed')::int >= 1, 'the pilot is measured: ' || m::text;
  delete from auth.users where id = b;
  assert (select confirmed_by is null and confirmed_log is null and confirmed_at is not null from private.titan_cordee_relays where challenge_id = id1), 'the erased receiver leaves no person';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  r := (select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = id1::text);
  assert r->>'status' = 'confirmed' and r->'receiver'->>'name' = 'Membre de la cordée', 'the step stays passed, nameless: ' || r::text;
end $$;
rollback;

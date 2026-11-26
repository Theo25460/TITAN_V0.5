-- V1.8.2 — Reprise et relais facultatifs (migration 20261130104200). Synthetic accounts only, full rollback.
-- Cordée 1 (the scenario): a opens the passage; b takes the relay, needs a pause and hands it to c, who accepts and confirms with her
-- own session. Covered: closed flag, optional hold, RELAY_HELD for everyone else, handover targets that are refused (unseen member,
-- opener), a pending handover seen without its target by a third member, withdraw (also with the flag closed), acceptance, repeated
-- calls, no free advance (counts identical before the hold and after the acceptance, no XP, no credit), export, erasure.
-- Cordée 2 (the hazards): an offer never accepted expires and frees the relay; an open handover is taken by the first member who
-- accepts (the second is refused RELAY_HANDOVER_TAKEN); the holder leaves; a block voids a named offer and hides the blocked member;
-- departures keep the longueurs brought before leaving (and not after), their part of the target closes at what was brought, the
-- departed member loses access; a block of the creator cuts the member out; a suspended holder loses the hold.
-- Cordée 3 (too small): the turn limit, an open handover refused when nobody else can take it, the opener left alone, the summit rule.
begin;
create function pg_temp.relay(p_id uuid) returns jsonb language sql as
  $$ select x->'relay' from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = p_id::text $$;
create function pg_temp.cordee(p_id uuid) returns jsonb language sql as
  $$ select x from jsonb_array_elements(public.titan_cordees_v1()->'cordees') x where x->>'id' = p_id::text $$;
create function pg_temp.as_user(k text) returns void language sql as
  $$ select set_config('request.jwt.claims', case when k is null then '{}' else json_build_object('sub', current_setting('titan.rp_' || k), 'role', 'authenticated')::text end, true) $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'no error'; exception when others then return sqlerrm; end $$;
grant execute on all functions in schema pg_temp to authenticated;

do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','d','e','f'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_rp_' || k, privacy = '{"publicProfile":true}' where id = v;
    perform set_config('titan.rp_' || k, v::text, true);
  end loop;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values
    ('screens.cordee', true, 100, 'QA'), ('screens.cordee_relay', true, 100, 'QA'), ('screens.cordee_reprise', false, 100, 'QA')
    on conflict (key) do update set enabled = excluded.enabled, rollout = 100;
  -- a is friends with b, c, d and f; b and c are friends; c and d are friends. e is nobody's friend (joins by link). b and d are not friends.
  perform pg_temp.as_user('a');
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.rp_a')::uuid, current_setting('titan.rp_b')::uuid, 'accepted'),
    (current_setting('titan.rp_a')::uuid, current_setting('titan.rp_c')::uuid, 'accepted'),
    (current_setting('titan.rp_a')::uuid, current_setting('titan.rp_d')::uuid, 'accepted'),
    (current_setting('titan.rp_a')::uuid, current_setting('titan.rp_f')::uuid, 'accepted');
  perform pg_temp.as_user('b');
  insert into public.friendships(user_id_1, user_id_2, status) values (current_setting('titan.rp_b')::uuid, current_setting('titan.rp_c')::uuid, 'accepted');
  perform pg_temp.as_user('c');
  insert into public.friendships(user_id_1, user_id_2, status) values (current_setting('titan.rp_c')::uuid, current_setting('titan.rp_d')::uuid, 'accepted');
  perform pg_temp.as_user(null);
end $$;

-- Three pilot cordées formed by a; e joins the first two by link, f is invited to the third.
set local role authenticated;
do $$
declare b uuid := current_setting('titan.rp_b')::uuid; c uuid := current_setting('titan.rp_c')::uuid; d uuid := current_setting('titan.rp_d')::uuid;
  f uuid := current_setting('titan.rp_f')::uuid; id1 uuid; id2 uuid; id3 uuid; t1 text; t2 text;
begin
  perform pg_temp.as_user('a');
  id1 := (public.titan_cordee_create_v1('aube', 'reguliere', 14, array[b, c, d])->>'id')::uuid;
  id2 := (public.titan_cordee_create_v1('aube', 'reguliere', 14, array[b, c, d])->>'id')::uuid;
  id3 := (public.titan_cordee_create_v1('aube', 'reguliere', 14, array[f])->>'id')::uuid;
  t1 := public.titan_challenge_link_create_v1(id1)->>'token';
  t2 := public.titan_challenge_link_create_v1(id2)->>'token';
  perform pg_temp.as_user('e');
  perform public.titan_challenge_link_accept_v1(t1);
  perform public.titan_challenge_link_accept_v1(t2);
  perform set_config('titan.rp_id1', id1::text, true);
  perform set_config('titan.rp_id2', id2::text, true);
  perform set_config('titan.rp_id3', id3::text, true);
end $$;

-- Everyone joins; the cordées started 5 days ago. Sessions (all confirmed): a climbs 40 min 3 days ago (2 longueurs, opens the passage);
-- c runs 30 min an hour ago and b runs 30 min today (another day than the opening, recorded after it); d runs 40 min 2 days ago (2);
-- f does 20 min of yoga 2 days ago (1).
reset role;
do $$
declare a uuid := current_setting('titan.rp_a')::uuid; b uuid := current_setting('titan.rp_b')::uuid; c uuid := current_setting('titan.rp_c')::uuid;
  d uuid := current_setting('titan.rp_d')::uuid; f uuid := current_setting('titan.rp_f')::uuid;
begin
  perform pg_temp.as_user(null);
  update public.titan_challenges set starts_at = now() - interval '5 days', ends_at = now() + interval '9 days'
   where id in (current_setting('titan.rp_id1')::uuid, current_setting('titan.rp_id2')::uuid, current_setting('titan.rp_id3')::uuid);
  update public.titan_challenge_members set status = 'joined', joined_at = now() - interval '5 days'
   where challenge_id in (current_setting('titan.rp_id1')::uuid, current_setting('titan.rp_id2')::uuid, current_setting('titan.rp_id3')::uuid);
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (a, 'climbing', 1, 'session', 10, now() - interval '3 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '3 days'),
    (c, 'running', 5, 'km', 10, now() - interval '1 hour', '{"serverReward":true,"effort":{"effort_minutes":30}}', clock_timestamp()),
    (b, 'running', 5, 'km', 10, now() - interval '30 minutes', '{"serverReward":true,"effort":{"effort_minutes":30}}', clock_timestamp()),
    (d, 'running', 8, 'km', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":40}}', now() - interval '2 days'),
    (f, 'yoga', 1, 'session', 10, now() - interval '2 days', '{"serverReward":true,"effort":{"effort_minutes":20}}', now() - interval '2 days');
  set local session_replication_role = origin;
end $$;

-- =========================================================================================== Cordée 1: the scenario.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.rp_a')::uuid; b uuid := current_setting('titan.rp_b')::uuid; c uuid := current_setting('titan.rp_c')::uuid;
  d uuid := current_setting('titan.rp_d')::uuid; id1 uuid := current_setting('titan.rp_id1')::uuid;
  r jsonb; s0 jsonb; s1 jsonb; xp0 integer[]; cr0 integer[];
begin
  perform pg_temp.as_user('a');
  r := public.titan_cordee_relay_v1(id1, 'transmit');
  assert r->>'status' = 'opened' and r->>'hint' = 'own' and r->'turn' = '[]'::jsonb, 'a opened the passage: ' || r::text;
  -- Closed flag: no turn action is offered and the server refuses it; the V1.8.1 relay works as before.
  perform pg_temp.as_user('b');
  r := pg_temp.relay(id1);
  assert r->'turn' = '[]'::jsonb and r->'holder' = 'null'::jsonb and r->>'can' = 'confirm', 'closed flag: no hold offered, the relay is free: ' || r::text;
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id1, 'take')) = 'FEATURE_DISABLED', 'closed flag: take refused';
  perform pg_temp.as_user(null);
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee_reprise';
  set local role authenticated;
  -- Counts of the cordée before any hold, and everyone's XP and credits: nothing below may change them.
  perform pg_temp.as_user('a');
  s0 := pg_temp.cordee(id1) - 'relay';
  select array_agg(xp order by id), array_agg(credits order by id) into xp0, cr0 from public.profiles where id in (a, b, c, d);

  -- b takes the relay (optional): from now on only b confirms.
  perform pg_temp.as_user('b');
  r := pg_temp.relay(id1);
  assert r->'turn' = '["take"]'::jsonb, 'b may take the free relay: ' || r::text;
  r := public.titan_cordee_relay_turn_v1(id1, 'take');
  assert (r->>'changed')::boolean and (r->'holder'->>'me')::boolean and r->>'hint' = 'holder' and r->>'can' = 'confirm'
     and r->'turn' = '["handover"]'::jsonb and r->'holdUntil' <> 'null'::jsonb, 'b holds the relay: ' || r::text;
  assert r->'choices' = jsonb_build_array(jsonb_build_object('id', c, 'name', 'qa_rp_c')),
    'b can hand over to c only (a opened it, d and e are not people b can see): ' || r::text;
  r := public.titan_cordee_relay_turn_v1(id1, 'take');
  assert not (r->>'changed')::boolean, 'taking again changes nothing';
  -- Everyone else: the relay is held. c can neither take nor confirm; a, the opener, cannot take it.
  perform pg_temp.as_user('c');
  r := pg_temp.relay(id1);
  assert r->>'hint' = 'held' and r->>'can' is null and r->'turn' = '[]'::jsonb and r->'holder'->>'name' = 'qa_rp_b', 'c sees b holding the relay: ' || r::text;
  assert pg_temp.err(format('select public.titan_cordee_relay_v1(%L, %L)', id1, 'confirm')) = 'RELAY_HELD', 'only the holder confirms a held relay';
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id1, 'take')) = 'RELAY_HELD', 'one holder at a time';
  perform pg_temp.as_user('a');
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id1, 'take')) = 'RELAY_OWN', 'the opener cannot hold their own relay';
  perform pg_temp.as_user('e');
  r := pg_temp.relay(id1);
  assert r->'holder'->>'name' = 'Membre de la cordée' and r->>'hint' = 'held', 'e (joined by a''s link) does not see who holds it: ' || r::text;

  -- b needs a pause. Refused targets first: a member b cannot see (d), the opener (a), b itself. Why is never said.
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L, %L)', id1, 'handover', d)) = 'RELAY_HANDOVER_TARGET', 'not to a member b cannot see';
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L, %L)', id1, 'handover', a)) = 'RELAY_HANDOVER_TARGET', 'not to the opener';
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L, %L)', id1, 'handover', b)) = 'RELAY_HANDOVER_TARGET', 'not to oneself';
  r := public.titan_cordee_relay_turn_v1(id1, 'handover', c);
  assert (r->>'changed')::boolean and r->>'hint' = 'paused' and r->'turn' = '["withdraw"]'::jsonb and (r->'handover'->>'mine')::boolean
     and r->'handover'->'to'->>'name' = 'qa_rp_c' and not (r->'handover'->>'open')::boolean, 'b offers the relay to c: ' || r::text;
  r := public.titan_cordee_relay_turn_v1(id1, 'handover', c);
  assert not (r->>'changed')::boolean, 'the same offer again changes nothing';
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id1, 'handover')) = 'RELAY_HANDOVER_PENDING', 'one pending handover at a time';
  -- d, a third member, sees that a handover is pending, not to whom, and no reason; d cannot accept.
  perform pg_temp.as_user('d');
  r := pg_temp.relay(id1);
  assert r->>'hint' = 'held' and (r->'handover'->>'pending')::boolean and r->'handover'->'to' = 'null'::jsonb and r->'handover'->'open' = 'null'::jsonb
     and not (r->'handover'->>'forMe')::boolean and r->'turn' = '[]'::jsonb and r->'choices' = 'null'::jsonb, 'd sees a pending handover only: ' || r::text;
  assert r::text !~ '(reason|motif|qa_rp_c|log|sport|minutes|km)', 'no reason, no recipient, no session detail for d: ' || r::text;
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id1, 'accept')) = 'RELAY_NO_HANDOVER', 'd cannot accept an offer made to c';
  -- c is offered the relay.
  perform pg_temp.as_user('c');
  r := pg_temp.relay(id1);
  assert r->>'hint' = 'offered' and r->'turn' = '["accept"]'::jsonb and (r->'handover'->>'forMe')::boolean and not (r->'handover'->>'open')::boolean
     and r->'handover'->'to' = 'null'::jsonb and r->>'can' is null, 'c may accept: ' || r::text;
  -- b comes back and withdraws, with the flag closed (withdrawing is always possible); then offers again.
  perform pg_temp.as_user(null);
  reset role;
  update private.titan_feature_flags set enabled = false where key = 'screens.cordee_reprise';
  set local role authenticated;
  perform pg_temp.as_user('b');
  r := public.titan_cordee_relay_turn_v1(id1, 'withdraw');
  assert (r->>'changed')::boolean and r->>'hint' = 'holder' and r->'handover' = 'null'::jsonb and r->'turn' = '[]'::jsonb, 'b withdrew, closed flag: ' || r::text;
  perform pg_temp.as_user(null);
  reset role;
  update private.titan_feature_flags set enabled = true where key = 'screens.cordee_reprise';
  set local role authenticated;
  perform pg_temp.as_user('b');
  perform public.titan_cordee_relay_turn_v1(id1, 'handover', c);
  -- c accepts: one holder, the relay is still to be confirmed (no free advance), b can no longer confirm.
  perform pg_temp.as_user('c');
  r := public.titan_cordee_relay_turn_v1(id1, 'accept');
  assert (r->>'changed')::boolean and (r->'holder'->>'me')::boolean and r->>'status' = 'opened' and r->>'hint' = 'holder' and r->>'can' = 'confirm'
     and r->'handover' = 'null'::jsonb, 'c holds the relay: ' || r::text;
  r := public.titan_cordee_relay_turn_v1(id1, 'accept');
  assert not (r->>'changed')::boolean, 'accepting again changes nothing: ' || r::text;
  perform pg_temp.as_user('b');
  r := pg_temp.relay(id1);
  assert r->>'hint' = 'held' and r->'holder'->>'name' = 'qa_rp_c' and r->>'can' is null, 'b sees c holding it: ' || r::text;
  assert pg_temp.err(format('select public.titan_cordee_relay_v1(%L, %L)', id1, 'confirm')) = 'RELAY_HELD', 'b''s own run no longer confirms it';
  perform pg_temp.as_user('a');
  s1 := pg_temp.cordee(id1) - 'relay';
  assert s1 = s0, 'a hold and a handover change no count of the cordée: ' || s0::text || ' / ' || s1::text;
  -- c confirms with her own run (another day than the opening): the group resumed after the handover.
  perform pg_temp.as_user('c');
  r := public.titan_cordee_relay_v1(id1, 'confirm');
  assert r->>'status' = 'confirmed' and r->'receiver'->>'name' = 'qa_rp_c' and r->'turn' = '[]'::jsonb, 'c received the relay: ' || r::text;
  perform pg_temp.as_user('a');
  assert (pg_temp.cordee(id1) - 'relay') = s0, 'the confirmation adds no longueur either';
  assert (select array_agg(xp order by id) from public.profiles where id in (a, b, c, d)) is not distinct from xp0
     and (select array_agg(credits order by id) from public.profiles where id in (a, b, c, d)) is not distinct from cr0, 'no XP, no credit';
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id1, 'take')) = 'RELAY_ALREADY_CONFIRMED', 'nothing to hold once received';
end $$;
reset role;
do $$
declare id1 uuid := current_setting('titan.rp_id1')::uuid;
begin
  assert (select count(*) from private.titan_cordee_relay_turns where challenge_id = id1) = 3
     and (select count(*) from private.titan_cordee_relay_turns where challenge_id = id1 and kind = 'take' and status = 'held') = 1
     and (select count(*) from private.titan_cordee_relay_turns where challenge_id = id1 and status = 'withdrawn') = 1
     and (select count(*) from private.titan_cordee_relay_turns where challenge_id = id1 and status = 'accepted' and accepted_by = current_setting('titan.rp_c')::uuid) = 1,
    'history: b took, offered and withdrew, offered again and c accepted';
  assert not exists (select 1 from information_schema.columns where table_schema = 'private' and table_name in ('titan_cordee_relay_turns', 'titan_cordee_relays')
                       and column_name ~ '(reason|motif|note|message)'), 'no reason is stored anywhere';
end $$;
set local role authenticated;
do $$
declare b uuid := current_setting('titan.rp_b')::uuid; c uuid := current_setting('titan.rp_c')::uuid; r jsonb;
begin
  perform pg_temp.as_user('b');
  r := public.export_own_data()->'cordeeRelayTurns';
  assert jsonb_array_length(r) = 3 and r->0->>'role' = 'took' and r->1->>'role' = 'offered' and r->2->>'status' = 'accepted', 'b''s export: ' || r::text;
  assert r::text !~ c::text, 'b''s export names nobody else: ' || r::text;
  perform pg_temp.as_user('c');
  r := public.export_own_data()->'cordeeRelayTurns';
  assert jsonb_array_length(r) = 2 and r->0->>'role' = 'offered_to_me' and r->1->>'role' = 'accepted', 'c''s export: ' || r::text;
  assert r::text !~ b::text, 'c''s export names nobody else';
end $$;

-- =========================================================================================== Cordée 2: the hazards.
do $$
declare a uuid := current_setting('titan.rp_a')::uuid; b uuid := current_setting('titan.rp_b')::uuid; c uuid := current_setting('titan.rp_c')::uuid;
  d uuid := current_setting('titan.rp_d')::uuid; e uuid := current_setting('titan.rp_e')::uuid; id2 uuid := current_setting('titan.rp_id2')::uuid; r jsonb;
begin
  perform pg_temp.as_user('a');
  perform public.titan_cordee_relay_v1(id2, 'transmit');
  -- b takes and hands over to the whole cordée: c, d and e may each accept.
  perform pg_temp.as_user('b');
  perform public.titan_cordee_relay_turn_v1(id2, 'take');
  r := public.titan_cordee_relay_turn_v1(id2, 'handover');
  assert (r->'handover'->>'open')::boolean and r->'handover'->'to' = 'null'::jsonb, 'b offers the relay to the cordée: ' || r::text;
  perform pg_temp.as_user('e');
  r := pg_temp.relay(id2);
  assert r->>'hint' = 'offered' and (r->'handover'->>'open')::boolean and r->'turn' = '["accept"]'::jsonb, 'e may accept the open handover: ' || r::text;
end $$;
-- Nobody accepts within 48 hours.
reset role;
update private.titan_cordee_relay_turns set expires_at = now() - interval '1 minute' where challenge_id = current_setting('titan.rp_id2')::uuid and status = 'pending';
set local role authenticated;
do $$
declare a uuid := current_setting('titan.rp_a')::uuid; b uuid := current_setting('titan.rp_b')::uuid; c uuid := current_setting('titan.rp_c')::uuid;
  d uuid := current_setting('titan.rp_d')::uuid; e uuid := current_setting('titan.rp_e')::uuid; id2 uuid := current_setting('titan.rp_id2')::uuid; r jsonb;
begin
  perform pg_temp.as_user('d');
  r := pg_temp.relay(id2);
  assert r->'holder' = 'null'::jsonb and r->'handover' = 'null'::jsonb and r->'turn' = '["take"]'::jsonb and r->>'status' = 'opened'
     and r->'opener'->>'name' = 'qa_rp_a', 'never accepted: the offer expired, b''s hold with it, the passage is free and still open: ' || r::text;
  perform pg_temp.as_user('b');
  r := pg_temp.relay(id2);
  assert r->>'hint' = 'confirm' and r->>'can' = 'confirm' and r->'turn' = '["take"]'::jsonb, 'b is an ordinary member again: ' || r::text;
  -- An open handover goes to the first member who accepts (the two-connection race is tools/db/test-cordee-reprise-concurrency.sh).
  perform pg_temp.as_user('d');
  perform public.titan_cordee_relay_turn_v1(id2, 'take');
  perform public.titan_cordee_relay_turn_v1(id2, 'handover');
  perform pg_temp.as_user('e');
  r := public.titan_cordee_relay_turn_v1(id2, 'accept');
  assert (r->'holder'->>'me')::boolean, 'e accepted first: ' || r::text;
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id2, 'accept')) = 'RELAY_HANDOVER_TAKEN', 'the second acceptance is refused';
  -- The holder leaves: the hold is void at once, anyone eligible can take or confirm.
  perform pg_temp.as_user('e');
  perform public.titan_challenge_respond(id2, 'leave');
  assert pg_temp.cordee(id2) is null, 'e no longer reads the cordée it left';
  perform pg_temp.as_user('c');
  r := pg_temp.relay(id2);
  assert r->'holder' = 'null'::jsonb and r->'turn' = '["take"]'::jsonb and r->>'can' = 'confirm', 'the holder left: the relay is free again: ' || r::text;
  -- d holds and offers it to c; c then blocks d (in a's cordée both stay): the offer is void, each is nameless to the other.
  perform pg_temp.as_user('d');
  perform public.titan_cordee_relay_turn_v1(id2, 'take');
  r := public.titan_cordee_relay_turn_v1(id2, 'handover', c);
  assert r->'handover'->'to'->>'name' = 'qa_rp_c', 'd offers the relay to c: ' || r::text;
  perform pg_temp.as_user('c');
  perform public.titan_block_user(d, null);
  r := pg_temp.relay(id2);
  assert r->>'hint' = 'held' and r->'handover' = 'null'::jsonb and r->'holder'->>'name' = 'Membre de la cordée' and r->'turn' = '[]'::jsonb,
    'after the block c is offered nothing and no longer sees who holds the relay: ' || r::text;
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id2, 'accept')) = 'RELAY_NO_HANDOVER', 'a blocked recipient cannot accept';
  perform pg_temp.as_user('d');
  r := pg_temp.relay(id2);
  assert r->>'hint' = 'holder_session' and r->'handover' = 'null'::jsonb and r->'turn' = '["handover"]'::jsonb and r->'choices' = '[]'::jsonb,
    'd keeps the hold, the offer to c is gone and c is no longer a choice: ' || r::text;
end $$;
reset role;
do $$
begin
  assert (select status from private.titan_cordee_relay_turns where challenge_id = current_setting('titan.rp_id2')::uuid order by created_at limit 1 offset 1) = 'expired',
    'the unanswered offer is recorded as expired';
  assert (select count(*) from private.titan_cordee_relay_turns where challenge_id = current_setting('titan.rp_id2')::uuid and status = 'cancelled') = 1,
    'the offer voided by the block is recorded as cancelled';
end $$;

-- Departures: d (2 longueurs) leaves. What d brought stays, d's part of the target closes at 2, d is gone from every view.
set local role authenticated;
do $$
declare d uuid := current_setting('titan.rp_d')::uuid; id2 uuid := current_setting('titan.rp_id2')::uuid; s0 jsonb; s1 jsonb; r jsonb;
begin
  perform pg_temp.as_user('a');
  s0 := pg_temp.cordee(id2);
  perform pg_temp.as_user('d');
  perform public.titan_challenge_respond(id2, 'leave');
  assert pg_temp.cordee(id2) is null, 'd no longer reads the cordée';
  perform pg_temp.as_user('a');
  s1 := pg_temp.cordee(id2);
  assert (s1->>'longueurs')::int = (s0->>'longueurs')::int and (s1->>'kept')::int = 2 and (s1->>'contributors')::int = (s0->>'contributors')::int
     and (s1->>'target')::int = (s0->>'target')::int - (s0->>'share')::int + 2 and (s1->>'joined')::int = (s0->>'joined')::int - 1,
    'd''s two longueurs stay, d''s part of the target closes at 2: ' || s0::text || ' / ' || s1::text;
  assert (s1->'families') @> '["endurance"]'::jsonb, 'd''s sport family stays acquired';
  assert s1::text !~ 'qa_rp_d' and s1->'relay'->'holder' = 'null'::jsonb, 'd is named nowhere, d''s hold is void: ' || s1::text;
  perform set_config('titan.rp_s1', s1::text, true);
end $$;
-- A session d records after leaving changes nothing.
reset role;
do $$
begin
  set local session_replication_role = replica;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (current_setting('titan.rp_d')::uuid, 'running', 12, 'km', 10, now() - interval '20 minutes', '{"serverReward":true,"effort":{"effort_minutes":70}}', clock_timestamp());
  set local session_replication_role = origin;
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.rp_a')::uuid; c uuid := current_setting('titan.rp_c')::uuid; id2 uuid := current_setting('titan.rp_id2')::uuid; r jsonb; s jsonb;
begin
  perform pg_temp.as_user('a');
  s := pg_temp.cordee(id2);
  assert (s - 'relay') = (current_setting('titan.rp_s1')::jsonb - 'relay'), 'nothing d does after leaving counts: ' || s::text;
  -- c takes the relay, then blocks a, the creator: c leaves a's cordée. c's longueur stays acquired, the hold is void, c is named nowhere.
  perform pg_temp.as_user('c');
  perform public.titan_cordee_relay_turn_v1(id2, 'take');
  perform public.titan_block_user(a, null);
  assert pg_temp.cordee(id2) is null, 'the block cuts c out of a''s cordée';
  perform pg_temp.as_user('a');
  s := pg_temp.cordee(id2);
  assert (s->>'kept')::int = 3 and s->'relay'->'holder' = 'null'::jsonb and s::text !~ 'qa_rp_c', 'c''s longueur is kept, nothing of c is shown: ' || s::text;
  -- A suspended holder loses the hold and can do nothing.
  perform pg_temp.as_user('b');
  perform public.titan_cordee_relay_turn_v1(id2, 'take');
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set is_suspended = true where id = current_setting('titan.rp_b')::uuid;
  perform set_config('request.jwt.claims', '{}', true);
end $$;
set local role authenticated;
do $$
declare id2 uuid := current_setting('titan.rp_id2')::uuid; r jsonb;
begin
  perform pg_temp.as_user('a');
  r := pg_temp.relay(id2);
  assert r->'holder' = 'null'::jsonb and r->>'hint' = 'own', 'a suspended holder holds nothing: ' || r::text;
  perform pg_temp.as_user('b');
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id2, 'take')) = 'ACCOUNT_SUSPENDED', 'a suspended account cannot take the relay';
  assert pg_temp.err(format('select public.titan_cordee_relay_v1(%L, %L)', id2, 'confirm')) = 'ACCOUNT_SUSPENDED', 'nor confirm it';
end $$;
reset role;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.profiles set is_suspended = false where id = current_setting('titan.rp_b')::uuid;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- =========================================================================================== Cordée 3: too small.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.rp_a')::uuid; f uuid := current_setting('titan.rp_f')::uuid; id3 uuid := current_setting('titan.rp_id3')::uuid; r jsonb; s jsonb;
begin
  perform pg_temp.as_user('a');
  perform public.titan_cordee_relay_v1(id3, 'transmit');
  r := pg_temp.relay(id3);
  assert r->>'hint' = 'own', 'with f roped in, a waits for f: ' || r::text;
  perform pg_temp.as_user('f');
  perform public.titan_cordee_relay_turn_v1(id3, 'take');
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id3, 'handover')) = 'RELAY_GROUP_TOO_SMALL', 'nobody else can take an open handover';
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L, %L)', id3, 'handover', a)) = 'RELAY_HANDOVER_TARGET', 'not to the opener either';
  -- f leaves with one longueur: the opener is alone, the passage stays open, the summit still needs two contributors (f counted).
  perform public.titan_challenge_respond(id3, 'leave');
  perform pg_temp.as_user('a');
  s := pg_temp.cordee(id3);
  assert s->'relay'->>'hint' = 'alone' and s->'relay'->>'status' = 'opened' and s->'relay'->'turn' = '[]'::jsonb, 'a is alone with an open passage: ' || s::text;
  assert (s->>'joined')::int = 1 and (s->>'kept')::int = 1 and (s->>'needs')::int = 2 and (s->>'contributors')::int = 2
     and (s->>'target')::int = (s->>'share')::int + 1, 'the collective rule stands: two contributors, f''s part closed at 1: ' || s::text;
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id3, 'take')) = 'RELAY_OWN', 'a cannot take its own relay';
end $$;
-- The turn limit (8 holds and offers per cordée).
reset role;
do $$
declare id3 uuid := current_setting('titan.rp_id3')::uuid; f uuid := current_setting('titan.rp_f')::uuid;
begin
  insert into private.titan_cordee_relay_turns (challenge_id, kind, to_user, status, accepted_by, resolved_at)
  select id3, 'take', f, 'held', f, now() from generate_series(1, 7);
  update public.titan_challenge_members set status = 'joined' where challenge_id = id3 and user_id = f;
  assert (select left_at from public.titan_challenge_members where challenge_id = id3 and user_id = f) is null, 'rejoining clears the departure';
end $$;
set local role authenticated;
do $$
declare id3 uuid := current_setting('titan.rp_id3')::uuid;
begin
  perform pg_temp.as_user('f');
  assert pg_temp.err(format('select public.titan_cordee_relay_turn_v1(%L, %L)', id3, 'take')) = 'RELAY_TURN_LIMIT', 'at most 8 holds and offers per cordée';
end $$;

-- The measure, then the erasure of b: the history stays, with no person.
reset role;
do $$
declare m jsonb; id1 uuid := current_setting('titan.rp_id1')::uuid;
begin
  perform pg_temp.as_user(null);
  m := private.titan_cordee_reprise_measure(now() - interval '30 days');
  assert (m->>'offers')::int >= 5 and (m->>'accepted')::int >= 2 and (m->>'expired')::int >= 1 and (m->>'resumed')::int >= 1
     and (m->>'departures')::int >= 3 and (m->>'departuresKept')::int >= 2, 'the pilot is measured: ' || m::text;
  assert m::text !~ '[0-9a-f]{8}-[0-9a-f]{4}', 'counts only: ' || m::text;
  delete from auth.users where id = current_setting('titan.rp_b')::uuid;
  assert (select count(*) from private.titan_cordee_relay_turns where challenge_id = id1) = 3
     and not exists (select 1 from private.titan_cordee_relay_turns where challenge_id = id1 and current_setting('titan.rp_b')::uuid in (from_user, to_user, accepted_by)),
    'the erased member leaves the history with no person';
end $$;
rollback;

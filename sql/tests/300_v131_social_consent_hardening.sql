-- V1.3.1 social consent hardening (migration 20261114160000). Synthetic accounts only, full rollback.
-- Covered: an account with more than 30 friends can be erased and a deletion without a signed-in player is not refused; blocking a friend
-- never hits the unfriending limit, which still applies to ordinary unfriending; the legacy duel is for friends only and gives one refusal
-- for an unknown account, a stranger, a pending request and a block; challenge members are named to themselves and their friends only; an
-- invitation link is refused on a block with any member; a block ends what the two share in each other's challenges; friendships.status is
-- pending or accepted and a row written straight through the API can only be pending; role lookups do not answer about someone else.
-- The crossing of two simultaneous requests needs two connections: it is not covered here.
begin;
do $$
declare
  ids uuid[] := array[]::uuid[];
  k text;
  i integer;
  v uuid;
begin
  -- a creates, b and c are a's friends (not each other's), d is a stranger, e is a friend of a and b, z is an administrator,
  -- h has 35 friends (g1..g35), n is deleted without a signed-in player.
  foreach k in array array['a','b','c','d','e','z','h','n'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    update public.profiles set username = 'qa_h_' || k, privacy = '{"publicProfile":true,"socialPresence":false,"showStats":false}' where id = v;
    perform set_config('titan.h_' || k, v::text, true);
  end loop;
  update public.profiles set friend_code = 'TN-QHB234' where id = current_setting('titan.h_b')::uuid;
  update public.profiles set friend_code = 'TN-QHD234' where id = current_setting('titan.h_d')::uuid;
  update public.profiles set friend_code = 'TN-QHE234', privacy = '{"publicProfile":false}' where id = current_setting('titan.h_e')::uuid;
  update public.profiles set role = 'admin' where id = current_setting('titan.h_z')::uuid;
  for i in 1..35 loop
    v := gen_random_uuid();
    ids := ids || v;
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    -- Each friend is the author of its own row, so the fixture stays under the 25 requests a day of a single account.
    perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
    insert into public.friendships(user_id_1, user_id_2, status) values (v, current_setting('titan.h_h')::uuid, 'accepted');
  end loop;
  perform set_config('titan.h_g', array_to_string(ids, ','), true);
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.h_a'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.h_a')::uuid, current_setting('titan.h_b')::uuid, 'accepted'),
    (current_setting('titan.h_a')::uuid, current_setting('titan.h_c')::uuid, 'accepted'),
    (current_setting('titan.h_a')::uuid, current_setting('titan.h_n')::uuid, 'accepted');
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('titan.h_e'), 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values
    (current_setting('titan.h_e')::uuid, current_setting('titan.h_a')::uuid, 'accepted'),
    (current_setting('titan.h_e')::uuid, current_setting('titan.h_b')::uuid, 'accepted');
  perform set_config('request.jwt.claims', '{}', true);

  -- Structure: the column, its check and its default.
  assert (select attnotnull from pg_attribute where attrelid = 'public.friendships'::regclass and attname = 'status'), 'status is NOT NULL';
  assert (select convalidated from pg_constraint where conrelid = 'public.friendships'::regclass and conname = 'friendships_status_check'), 'status check is validated';
  assert (select pg_get_expr(adbin, adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where d.adrelid = 'public.friendships'::regclass and a.attname = 'status') = '''pending''::text', 'status is pending by default';
  assert not has_table_privilege('authenticated', 'public.friendships', 'INSERT') and not has_table_privilege('authenticated', 'public.friendships', 'UPDATE'),
    'the API role still cannot write friendships';
end $$;

-- 1. A deletion without a signed-in player (dashboard, service role, cascade) is not refused by the friendship guard.
do $$
declare n uuid := current_setting('titan.h_n')::uuid;
begin
  delete from auth.users where id = n;
  assert not exists (select 1 from public.friendships where n in (user_id_1, user_id_2)), 'the friendship went with the account';
end $$;

-- A value outside the two states, or none, is refused whoever writes it.
do $$
declare ok boolean; a uuid := current_setting('titan.h_a')::uuid; d uuid := current_setting('titan.h_d')::uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false; begin insert into public.friendships(user_id_1, user_id_2, status) values (a, d, 'blocked'); exception when check_violation then ok := true; end;
  assert ok, 'an unknown status is refused';
  ok := false; begin insert into public.friendships(user_id_1, user_id_2, status) values (a, d, null); exception when check_violation or not_null_violation then ok := true; end;
  assert ok, 'a missing status is refused';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

set local role authenticated;

-- 2. Unfriending keeps its limit; a block and the erasure of the account are not unfriending.
do $$
declare
  h uuid := current_setting('titan.h_h')::uuid;
  g uuid[] := string_to_array(current_setting('titan.h_g'), ',')::uuid[];
  ok boolean; i integer; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated')::text, true);
  for i in 1..30 loop perform public.titan_social_remove(g[i]); end loop;
  ok := false; begin perform public.titan_social_remove(g[31]); exception when others then ok := sqlerrm = 'SOCIAL_RATE_LIMIT'; end;
  assert ok, 'ordinary unfriending is still limited to 30 an hour';
  assert public.titan_block_user(g[31], 'qa'), 'blocking a friend is never refused by the unfriending limit';
  assert not exists (select 1 from public.friendships where g[31] in (user_id_1, user_id_2)), 'the block removed the friendship';
  assert (select count(*) from public.friendships where h in (user_id_1, user_id_2)) = 4, 'four friendships left before the erasure';
  r := public.delete_own_account();
  assert (r -> 'deleted' ->> 'friendships')::integer = 4 and (r -> 'deleted' ->> 'auth_users')::integer = 1, 'the account is erased past the limit: ' || r::text;
end $$;

-- 3. Legacy duel: friends only, one refusal for everything else.
do $$
declare
  a uuid := current_setting('titan.h_a')::uuid; b uuid := current_setting('titan.h_b')::uuid; c uuid := current_setting('titan.h_c')::uuid;
  d uuid := current_setting('titan.h_d')::uuid;
  target uuid; state text; msg text; n integer := 0;
begin
  -- d: a stranger, then a pending request, then someone who blocked a; a random identifier: no account at all.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  foreach target in array array[d, gen_random_uuid()] loop
    begin perform public.titan_create_social_challenge(target, 'running', 10); raise exception 'duel accepted for a non-friend';
    exception when others then get stacked diagnostics state = returned_sqlstate, msg = message_text; end;
    assert state = '22023' and msg = 'OPPONENT_UNAVAILABLE', 'stranger and unknown account answer alike: ' || msg; n := n + 1;
  end loop;
  assert public.titan_social_request('TN-QHD234') ->> 'status' = 'pending', 'a asks d';
  begin perform public.titan_create_social_challenge(d, 'running', 10); raise exception 'duel accepted on a pending request';
  exception when others then get stacked diagnostics state = returned_sqlstate, msg = message_text; end;
  assert state = '22023' and msg = 'OPPONENT_UNAVAILABLE', 'a pending request is not a friendship: ' || msg;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  assert public.titan_social_respond(a, true) ->> 'status' = 'friends', 'd accepts';
  assert public.titan_block_user(a, 'qa'), 'then d blocks a';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.titan_create_social_challenge(d, 'running', 10); raise exception 'duel accepted across a block';
  exception when others then get stacked diagnostics state = returned_sqlstate, msg = message_text; end;
  assert state = '22023' and msg = 'OPPONENT_UNAVAILABLE', 'a block answers like an unknown account: ' || msg;
  assert not exists (select 1 from public.social_challenges where challenger_id = a), 'no duel row was written';
  assert public.titan_create_social_challenge(c, 'running', 10) ->> 'status' = 'pending', 'a friend can still be challenged';
  -- d lifts the block for the link scenario below (a and d stay strangers: the block removed the friendship).
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  perform public.titan_unblock_user(a);
end $$;

-- 4. Asking: sequential behaviour of the rewritten request (pending, asking back accepts, already friends, private profile).
do $$
declare
  b uuid := current_setting('titan.h_b')::uuid; d uuid := current_setting('titan.h_d')::uuid; e uuid := current_setting('titan.h_e')::uuid;
  ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  assert public.titan_social_request('TN-QHB234') ->> 'status' = 'pending', 'd asks b';
  assert public.titan_social_request('TN-QHB234') ->> 'status' = 'pending', 'asking twice stays pending';
  assert (select status from public.friendships where user_id_1 = d and user_id_2 = b) = 'pending', 'the requester cannot accept alone';
  ok := false; begin perform public.titan_social_request('TN-QHE234'); exception when others then ok := sqlerrm = 'FRIEND_CODE_NOT_FOUND'; end;
  assert ok, 'a private profile is not findable';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert public.titan_social_request('TN-QHD234') ->> 'status' = 'friends', 'asking back is accepting';
  assert public.titan_social_request('TN-QHD234') ->> 'status' = 'friends', 'already friends';
  assert public.titan_social_remove(d) ->> 'status' = 'removed', 'b and d are strangers again for the scenarios below';
end $$;

-- 5. Challenges: a creates one with b and c, e creates one with a and b, b creates one with a.
do $$
declare
  a uuid := current_setting('titan.h_a')::uuid; b uuid := current_setting('titan.h_b')::uuid; c uuid := current_setting('titan.h_c')::uuid;
  e uuid := current_setting('titan.h_e')::uuid;
  ch uuid; ch_e uuid; ch_b uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ch := (public.titan_challenge_create('QA hardening', 'active_days', null, 3, 7, array[b, c]) ->> 'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  ch_e := (public.titan_challenge_create('QA third party', 'active_days', null, 3, 7, array[a, b]) ->> 'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  ch_b := (public.titan_challenge_create('QA by b', 'active_days', null, 3, 7, array[a]) ->> 'id')::uuid;
  perform public.titan_challenge_respond(ch, 'join');
  perform public.titan_challenge_respond(ch_e, 'join');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.titan_challenge_respond(ch_e, 'join');
  perform public.titan_challenge_respond(ch_b, 'join');
  perform set_config('titan.h_ch', ch::text, true); perform set_config('titan.h_ch_e', ch_e::text, true); perform set_config('titan.h_ch_b', ch_b::text, true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
reset role;
insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
select current_setting('titan.h_b')::uuid, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":40}}', clock_timestamp();
set local role authenticated;

do $$
declare
  a uuid := current_setting('titan.h_a')::uuid; b uuid := current_setting('titan.h_b')::uuid; c uuid := current_setting('titan.h_c')::uuid;
  d uuid := current_setting('titan.h_d')::uuid; e uuid := current_setting('titan.h_e')::uuid;
  ch uuid := current_setting('titan.h_ch')::uuid; ch_e uuid := current_setting('titan.h_ch_e')::uuid; ch_b uuid := current_setting('titan.h_ch_b')::uuid;
  x jsonb; token text; ok boolean;
begin
  -- The creator, friend of both, reads both.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch::text;
  assert (select (m ->> 'progress')::numeric from jsonb_array_elements(x -> 'members') m where m ->> 'id' = b::text) = 1, 'a friend''s progress is still read: ' || x::text;
  assert (select count(*) from jsonb_array_elements(x -> 'members') m where m ->> 'id' is not null) = 3, 'the creator sees its three friends by name';

  -- c is only invited and is not b's friend: b is a nameless participant, same keys, no id, no progress.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch::text;
  assert jsonb_array_length(x -> 'members') = 3, 'the number of members is unchanged';
  assert position(b::text in x::text) = 0 and position('qa_h_b' in x::text) = 0, 'neither the id nor the name of a non-friend leaves the server: ' || x::text;
  assert (select count(*) from jsonb_array_elements(x -> 'members') m
           where m = jsonb_build_object('id', null, 'name', 'Participant', 'status', 'joined', 'progress', null)) = 1, 'the non-friend keeps the four keys, emptied';
  assert (select count(*) from jsonb_array_elements(x -> 'members') m where m ->> 'id' in (a::text, c::text) and m ->> 'name' in ('qa_h_a', 'qa_h_c')) = 2, 'oneself and one''s friend stay named';

  -- Invitation link: refused while a block exists with ANY member, in either direction; the link is not spent by a refusal.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  token := public.titan_challenge_link_create_v1(ch) ->> 'token';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_block_user(d, 'qa');
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.titan_challenge_link_accept_v1(token); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'an invited member blocked the bearer: the link answers invalid';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_unblock_user(d);
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  perform public.titan_block_user(b, 'qa');
  ok := false; begin perform public.titan_challenge_link_accept_v1(token); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'the bearer blocked a joined member: the link answers invalid';
  perform public.titan_unblock_user(b);
  assert public.titan_challenge_link_accept_v1(token) ->> 'challenge' = ch::text, 'without a block the link still works, once';
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch::text;
  -- The bearer of a link and the member who created it agreed to this duel: they are named to each other. The other members, who are
  -- not the bearer's friends, stay nameless participants.
  assert (select count(*) from jsonb_array_elements(x -> 'members') m where m ->> 'id' is not null) = 2
     and x -> 'members' @> jsonb_build_array(jsonb_build_object('id', d)) and x -> 'members' @> jsonb_build_array(jsonb_build_object('id', a, 'name', 'qa_h_a')),
    'who joined by link reads its own line and the creator of the link, nobody else: ' || x::text;
  assert position(b::text in x::text) = 0 and position(c::text in x::text) = 0, 'no other identifier reaches the bearer of a link';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch::text;
  assert x -> 'members' @> jsonb_build_array(jsonb_build_object('id', d, 'name', 'qa_h_d')), 'the creator of the link reads who used it: ' || x::text;
  -- A third member who is nobody's link partner still does not read the bearer.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch::text;
  assert position(d::text in x::text) = 0, 'a member who neither created nor used the link does not read its bearer: ' || x::text;

  -- b blocks a: each leaves the challenge the other created; in e's challenge both stay, nameless to each other.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert public.titan_block_user(a, 'qa'), 'b blocks a';
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch_e::text;
  assert position(a::text in x::text) = 0 and jsonb_array_length(x -> 'members') = 3, 'b no longer reads a in a third party''s challenge: ' || x::text;
  assert not exists (select 1 from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch::text), 'b left the challenge a created';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  x := public.titan_social_overview();
  assert position(b::text in x::text) = 0 and position('qa_h_b' in x::text) = 0, 'a reads nothing of b any more: ' || (x -> 'challenges')::text;
  assert not exists (select 1 from jsonb_array_elements(x -> 'challenges') y where y ->> 'id' = ch_b::text), 'a left the challenge b created';
  assert exists (select 1 from jsonb_array_elements(x -> 'challenges') y where y ->> 'id' = ch_e::text), 'a keeps the third party''s challenge';
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  select y into x from jsonb_array_elements(public.titan_social_overview() -> 'challenges') y where y ->> 'id' = ch_e::text;
  assert (select count(*) from jsonb_array_elements(x -> 'members') m where m ->> 'id' in (a::text, b::text, e::text)) = 3, 'their common friend still reads both';
  perform set_config('request.jwt.claims', '{}', true);
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.h_a')::uuid; b uuid := current_setting('titan.h_b')::uuid;
begin
  assert (select status from public.titan_challenge_members where challenge_id = current_setting('titan.h_ch')::uuid and user_id = b) = 'left', 'membership of the blocker in the blocked account''s challenge';
  assert (select status from public.titan_challenge_members where challenge_id = current_setting('titan.h_ch_b')::uuid and user_id = a) = 'left', 'membership of the blocked account in the blocker''s challenge';
  assert (select count(*) from public.titan_challenge_members where challenge_id = current_setting('titan.h_ch_e')::uuid and user_id in (a, b) and status = 'joined') = 2, 'a third party''s challenge is not touched';
end $$;

-- 6. Defence in depth: even if a grant and a policy came back, a row written straight through the API is pending and stays so.
grant insert, update on public.friendships to authenticated;
create policy qa_h_insert on public.friendships for insert to authenticated with check (user_id_1 = (select auth.uid()));
create policy qa_h_update on public.friendships for update to authenticated using (user_id_1 = (select auth.uid())) with check (true);
set local role authenticated;
do $$
declare c uuid := current_setting('titan.h_c')::uuid; d uuid := current_setting('titan.h_d')::uuid; ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status) values (c, d, 'accepted');
  assert (select status from public.friendships where user_id_1 = c and user_id_2 = d) = 'pending', 'a forged accepted row is stored pending';
  ok := false; begin update public.friendships set status = 'accepted' where user_id_1 = c and user_id_2 = d; exception when insufficient_privilege then ok := sqlerrm = 'FRIENDSHIP_READ_ONLY'; end;
  assert ok, 'the API role cannot promote its own request';
  assert not exists (select 1 from jsonb_array_elements(public.titan_social_overview() -> 'friends') f where f ->> 'id' = d::text), 'no friendship came out of it';
  -- The recipient's consent still works on that row.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  assert public.titan_social_respond(c, true) ->> 'status' = 'friends', 'only the recipient accepts';
end $$;

-- 7. Role lookups.
do $$
declare a uuid := current_setting('titan.h_a')::uuid; z uuid := current_setting('titan.h_z')::uuid; ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert public.titan_admin_role() = 'user' and public.titan_admin_role(a) = 'user' and not public.titan_is_admin(), 'one''s own role is still answered';
  ok := false; begin perform public.titan_admin_role(z); exception when insufficient_privilege then ok := sqlerrm = 'ADMIN_REQUIRED'; end;
  assert ok, 'a player cannot look up someone else''s role';
  assert not public.titan_is_admin(z), 'nor learn who is an administrator';
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated')::text, true);
  assert public.titan_admin_role() = 'admin' and public.titan_is_admin() and public.titan_admin_role(a) = 'user' and not public.titan_is_admin(a), 'an administrator still looks up anyone';
  perform set_config('request.jwt.claims', '{}', true);
end $$;
reset role;
do $$
begin
  -- Server code (definer functions, service role) keeps the full lookup.
  assert public.titan_admin_role(current_setting('titan.h_z')::uuid) = 'admin' and public.titan_is_admin(current_setting('titan.h_z')::uuid), 'server-side lookup unchanged';
  assert not has_function_privilege('anon', 'public.titan_social_request(text)', 'execute')
     and not has_function_privilege('anon', 'public.titan_block_user(uuid,text)', 'execute')
     and not has_function_privilege('anon', 'public.titan_create_social_challenge(uuid,text,numeric)', 'execute')
     and not has_function_privilege('anon', 'public.titan_social_overview()', 'execute')
     and not has_function_privilege('anon', 'public.titan_challenge_link_accept_v1(text)', 'execute')
     and not has_function_privilege('anon', 'public.delete_own_account()', 'execute')
     and not has_function_privilege('anon', 'public.titan_admin_role(uuid)', 'execute'), 'nothing was opened to anonymous callers';
  assert has_function_privilege('authenticated', 'public.titan_social_request(text)', 'execute')
     and has_function_privilege('authenticated', 'public.titan_block_user(uuid,text)', 'execute')
     and has_function_privilege('authenticated', 'public.titan_create_social_challenge(uuid,text,numeric)', 'execute')
     and has_function_privilege('authenticated', 'public.titan_social_overview()', 'execute')
     and has_function_privilege('authenticated', 'public.titan_challenge_link_accept_v1(text)', 'execute')
     and has_function_privilege('authenticated', 'public.delete_own_account()', 'execute'), 'signed-in players keep their functions';
end $$;
rollback;

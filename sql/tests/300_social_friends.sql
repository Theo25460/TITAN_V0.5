-- Social excellence, lot A (migration 20261120090000). Synthetic accounts only, full rollback.
-- Covered: a personal invitation link lets two private accounts become friends without being findable; the preview names the inviter
-- to a signed-in account only; a link is one-use, revocable, refused on a block, a suspension, its own creator, expiry; five live links at
-- most; a link never creates a friendship with somebody who did not accept it; tokens are never stored nor exported; the six social limits
-- that were dead now apply; friend requests expire after 30 days (hidden, not acceptable, replaced when asked again); the blocks list
-- shows one's own blocks only; a block ends a friendship made through a link; no XP and no credit.
begin;
do $$
declare k text; v uuid;
begin
  foreach k in array array['a','b','c','d','s'] loop
    v := gen_random_uuid();
    insert into auth.users(id, raw_user_meta_data) values (v, '{}');
    -- Everybody is private (not findable): the default of a new account.
    update public.profiles set username = 'qa_fl_' || k, privacy = '{"publicProfile":false}' where id = v;
    perform set_config('titan.fl_' || k, v::text, true);
  end loop;
  update public.profiles set is_suspended = true where id = current_setting('titan.fl_s')::uuid;
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.friendlinks', false, 100, 'QA')
    on conflict (key) do update set enabled = false, rollout = 100;
  assert not has_table_privilege('authenticated', 'private.titan_friend_invites', 'select'), 'no API grant on the invitation table';
  assert not has_function_privilege('anon', 'public.titan_friend_link_accept_v1(text)', 'execute')
     and not has_function_privilege('anon', 'public.titan_friend_link_create_v1()', 'execute')
     and has_function_privilege('anon', 'public.titan_friend_link_preview_v1(text)', 'execute'), 'anonymous visitors only preview';
end $$;

set local role authenticated;
do $$
declare
  a uuid := current_setting('titan.fl_a')::uuid; b uuid := current_setting('titan.fl_b')::uuid;
  c uuid := current_setting('titan.fl_c')::uuid; d uuid := current_setting('titan.fl_d')::uuid; s uuid := current_setting('titan.fl_s')::uuid;
  r jsonb; t1 text; t2 text; t3 text; id2 uuid; ok boolean; i integer; xp0 integer; cr0 integer;
begin
  -- With the flag closed, nobody creates a link.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.titan_friend_link_create_v1(); exception when others then ok := sqlerrm = 'FEATURE_DISABLED'; end;
  assert ok, 'closed flag: no link';
  perform set_config('titan.fl_flag', 'open', true);
end $$;
reset role;
update private.titan_feature_flags set enabled = true where key = 'screens.friendlinks';
set local role authenticated;
do $$
declare
  a uuid := current_setting('titan.fl_a')::uuid; b uuid := current_setting('titan.fl_b')::uuid;
  c uuid := current_setting('titan.fl_c')::uuid; d uuid := current_setting('titan.fl_d')::uuid; s uuid := current_setting('titan.fl_s')::uuid;
  r jsonb; t1 text; t2 text; t3 text; id2 uuid; ok boolean; i integer; xp0 integer; cr0 integer;
begin
  -- a creates a link.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  r := public.titan_friend_link_create_v1();
  t1 := r->>'token';
  assert t1 ~ '^[0-9a-f]{64}$' and (r->>'expiresAt')::timestamptz <= now() + interval '7 days', 'a 64-hex token valid 7 days: ' || r::text;
  assert not exists (select 1 from jsonb_each_text(public.titan_friend_links_v1()->0) e where e.value = t1), 'the token is never listed';
  assert public.titan_friend_links_v1()->0->>'state' = 'live', 'listed as live';
  ok := false; begin perform public.titan_friend_link_accept_v1(t1); exception when others then ok := sqlerrm = 'LINK_OWN'; end;
  assert ok, 'the creator cannot use their own link';
  assert (public.titan_friend_link_preview_v1(t1)->>'own')::boolean, 'the creator sees it is their own';

  -- Anonymous preview: valid, but nobody is named.
  perform set_config('request.jwt.claims', '{}', true);
  r := public.titan_friend_link_preview_v1(t1);
  assert (r->>'valid')::boolean and not (r ? 'inviter'), 'anonymous preview names nobody: ' || r::text;
  assert (public.titan_friend_link_preview_v1(repeat('0', 64))->>'valid')::boolean is false, 'unknown token is invalid';
  assert (public.titan_friend_link_preview_v1('nope')->>'valid')::boolean is false, 'malformed token is invalid';

  -- b (private, not findable) signs in: sees a's name, accepts, both are friends; the link is spent.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.titan_friend_link_preview_v1(t1);
  assert r->'inviter'->>'name' = 'qa_fl_a' and (r->>'friends')::boolean is false, 'signed-in preview names the inviter: ' || r::text;
  assert jsonb_array_length(public.titan_social_overview()->'friends') = 0, 'no friendship before accepting';
  r := public.titan_friend_link_accept_v1(t1);
  assert r->>'status' = 'friends' and (r->>'spent')::boolean and r->>'name' = 'qa_fl_a', 'accepted: ' || r::text;
  assert jsonb_array_length(public.titan_social_overview()->'friends') = 1, 'b now has a as friend';
  ok := false; begin perform public.titan_friend_link_accept_v1(t1); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'a spent link cannot be used twice';

  -- c cannot reuse it either; a third account never becomes a friend through a spent link.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  assert (public.titan_friend_link_preview_v1(t1)->>'valid')::boolean is false, 'spent link previews as invalid';
  ok := false; begin perform public.titan_friend_link_accept_v1(t1); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'spent link refused for a third account';

  -- a sees who used it; the friendship is mutual.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.titan_friend_links_v1();
  assert jsonb_array_length(r) = 1 and r->0->>'state' = 'used' and r->0->>'usedBy' = 'qa_fl_b', 'a sees who joined: ' || r::text;
  assert jsonb_array_length(public.titan_social_overview()->'friends') = 1, 'a has b as friend';

  -- Revocation, block, suspension.
  r := public.titan_friend_link_create_v1();
  t2 := r->>'token'; id2 := (r->>'id')::uuid;
  assert public.titan_friend_link_revoke_v1(id2) is true and public.titan_friend_link_revoke_v1(id2) is false, 'revoked once';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.titan_friend_link_accept_v1(t2); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'a revoked link is invalid';
  assert public.titan_friend_link_revoke_v1(id2) is false, 'nobody revokes someone else''s link';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  t3 := public.titan_friend_link_create_v1()->>'token';
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  perform public.titan_block_user(a, null);
  assert (public.titan_friend_link_preview_v1(t3)->>'valid')::boolean is false, 'a block hides the link';
  ok := false; begin perform public.titan_friend_link_accept_v1(t3); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'a block refuses the link';
  r := public.titan_blocks_v1();
  assert jsonb_array_length(r) = 1 and r->0->>'id' = a::text and r->0->>'name' = 'Compte bloqué',
    'd sees their own block, without the name of a private account it never was in contact with: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.titan_blocks_v1()) = 0, 'a does not see that d blocked them';

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.titan_friend_link_accept_v1(t3); exception when others then ok := sqlerrm = 'ACCOUNT_SUSPENDED'; end;
  assert ok, 'a suspended account cannot accept';
  ok := false; begin perform public.titan_friend_link_create_v1(); exception when others then ok := sqlerrm = 'ACCOUNT_SUSPENDED'; end;
  assert ok, 'a suspended account cannot create';

  -- Five live links at most.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  for i in 1..5 loop perform public.titan_friend_link_create_v1(); end loop;
  ok := false; begin perform public.titan_friend_link_create_v1(); exception when others then ok := sqlerrm = 'LINK_LIMIT_5'; end;
  assert ok, 'five live links at most';

  -- A block ends a friendship made through a link, at once.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.titan_block_user(a, null);
  assert jsonb_array_length(public.titan_social_overview()->'friends') = 0, 'blocked: no longer friends';
  assert public.titan_blocks_v1()->0->>'name' = 'qa_fl_a', 'a former friend is named in one''s own blocks';
  perform public.titan_unblock_user(a);
  assert jsonb_array_length(public.titan_social_overview()->'friends') = 0 and jsonb_array_length(public.titan_blocks_v1()) = 0,
    'unblocking does not restore the friendship';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';
  r := public.export_own_data();
  assert jsonb_array_length(r->'friendInvites') = 3 and position(t1 in r::text) = 0 and position(t2 in r::text) = 0, 'links exported without any token';
end $$;

-- An expired link (moved 8 days back by the test; the check allows only 7 days of validity, so both dates move).
reset role;
do $$
declare a uuid := current_setting('titan.fl_a')::uuid; t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into private.titan_friend_invites(created_by, token_hash, created_at, expires_at)
  values (a, encode(sha256(convert_to(t, 'UTF8')), 'hex'), now() - interval '8 days', now() - interval '1 day');
  perform set_config('titan.fl_old', t, true);
end $$;
set local role authenticated;
do $$
declare c uuid := current_setting('titan.fl_c')::uuid; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  assert (public.titan_friend_link_preview_v1(current_setting('titan.fl_old'))->>'valid')::boolean is false, 'expired link invalid';
  begin perform public.titan_friend_link_accept_v1(current_setting('titan.fl_old')); exception when others then ok := sqlerrm = 'LINK_INVALID'; end;
  assert ok, 'expired link refused';
end $$;

-- Friend requests expire after 30 days.
reset role;
do $$
declare a uuid := current_setting('titan.fl_a')::uuid; c uuid := current_setting('titan.fl_c')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set privacy = '{"publicProfile":true}', friend_code = 'TN-QFLC23' where id = c;
  update public.profiles set privacy = '{"publicProfile":true}', friend_code = 'TN-QFLA23' where id = a;
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.fl_a')::uuid; c uuid := current_setting('titan.fl_c')::uuid; ok boolean := false; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert public.titan_social_request('TN-QFLC23')->>'status' = 'pending', 'a asks c';
  r := public.titan_social_overview()->'requests_out'->0;
  assert (r->>'expires_at')::timestamptz > now() + interval '29 days', 'the request says when it expires: ' || r::text;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.friendships set created_at = now() - interval '31 days'
 where user_id_1 = current_setting('titan.fl_a')::uuid and user_id_2 = current_setting('titan.fl_c')::uuid;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.fl_a')::uuid; c uuid := current_setting('titan.fl_c')::uuid; ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.titan_social_overview()->'requests_in') = 0, 'an expired request is no longer listed';
  begin perform public.titan_social_respond(a, true); exception when others then ok := sqlerrm = 'REQUEST_NOT_FOUND'; end;
  assert ok, 'an expired request cannot be accepted';
  assert jsonb_array_length(public.titan_social_overview()->'friends') = 0, 'no friendship from an expired request';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.titan_social_overview()->'requests_out') = 0, 'nor listed for the sender';
  assert public.titan_social_request('TN-QFLC23')->>'status' = 'pending', 'asking again makes a fresh request';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.titan_social_overview()->'requests_in') = 1, 'the fresh request is listed';
  assert public.titan_social_respond(a, true)->>'status' = 'friends', 'and can be accepted';
end $$;

-- An expired request of the other side is not an agreement: asking back only creates one's own request.
reset role;
do $$
declare a uuid := current_setting('titan.fl_a')::uuid; d uuid := current_setting('titan.fl_d')::uuid;
begin
  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set privacy = '{"publicProfile":true}', friend_code = 'TN-QFLD23' where id = d;
  delete from public.titan_user_blocks where blocker_id = d;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  insert into public.friendships(user_id_1, user_id_2, status, created_at) values (d, a, 'pending', now() - interval '40 days');
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('titan.fl_a')::uuid; d uuid := current_setting('titan.fl_d')::uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert public.titan_social_request('TN-QFLD23')->>'status' = 'pending', 'an expired request of the other side is not accepted by asking back';
  assert not exists (select 1 from public.friendships where status = 'accepted' and d in (user_id_1, user_id_2)), 'no friendship with d';
end $$;

-- The limits that were dead now apply (buddy invitations: 10 a day; invitation links: 20 a day).
reset role;
do $$
declare c uuid := current_setting('titan.fl_c')::uuid; ok boolean := false;
begin
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.titan_social_action_log(actor_id, action) select c, 'challenge_link' from generate_series(1, 20);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.titan_social_rate_limit(c, 'intent_set', interval '1 day', 30);
  assert (select count(*) from public.titan_social_action_log where actor_id = c and action = 'intent_set') = 1, 'a passing self-logged action is counted';
  begin perform public.titan_social_rate_limit(c, 'challenge_link', interval '1 day', 20); exception when others then ok := sqlerrm = 'SOCIAL_RATE_LIMIT'; end;
  assert ok, 'the challenge link limit applies';
  perform public.titan_social_rate_limit(c, 'moment_share', interval '1 day', 12);
  assert (select count(*) from public.titan_social_action_log where actor_id = c and action = 'moment_share') = 0, 'self-logging callers are not counted twice';
  -- friend_link: 20 created a day (revoked ones included)
  assert (select count(*) from public.titan_social_action_log where actor_id = c and action = 'friend_link') = 5, 'five links created by c were counted';
end $$;
rollback;

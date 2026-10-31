-- V11-66 (COM-C1, COM-E2): the invitation link of a friends' challenge and its frozen result. One-use, long random token of which only the hash is
-- stored, rules-only public preview, the same answer for every invalid link, expiry, revocation, a new account may accept after signing up,
-- joining makes a participant and not a friend, blocked players and the creator cannot use it, the finished result is frozen once and read by
-- participants only, nothing granted. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); n uuid := gen_random_uuid(); s uuid := gen_random_uuid(); k uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(n,'{}'),(s,'{}'),(k,'{}');
  update public.profiles set privacy = coalesce(privacy, '{}'::jsonb) || '{"publicProfile": true}'::jsonb where id = b;
  update public.profiles set username = 'Alba' where id = a; update public.profiles set username = 'Clara' where id = c; update public.profiles set username = 'Basile' where id = b;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into public.friendships(user_id_1,user_id_2,status) values (a,b,'accepted');
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('titan.dl_a',a::text,true); perform set_config('titan.dl_b',b::text,true); perform set_config('titan.dl_c',c::text,true);
  perform set_config('titan.dl_n',n::text,true); perform set_config('titan.dl_s',s::text,true); perform set_config('titan.dl_k',k::text,true);
  assert not has_table_privilege('authenticated','private.titan_challenge_invites','select') and not has_table_privilege('authenticated','private.titan_challenge_results','select'), 'no API grant on the tables';
  assert not has_function_privilege('anon','public.titan_challenge_link_accept_v1(text)','execute') and has_function_privilege('anon','public.titan_challenge_link_preview_v1(text)','execute'), 'only the preview is public';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; ch uuid; inv uuid; tok text; tok2 text; xp0 integer;
  a uuid := current_setting('titan.dl_a')::uuid; b uuid := current_setting('titan.dl_b')::uuid; c uuid := current_setting('titan.dl_c')::uuid;
  n uuid := current_setting('titan.dl_n')::uuid; s uuid := current_setting('titan.dl_s')::uuid; k uuid := current_setting('titan.dl_k')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ch := (public.titan_challenge_create('Duel du week-end','effort_minutes',null,60,7,array[b])->>'id')::uuid;
  ok:=false; begin perform public.titan_challenge_link_create_v1(gen_random_uuid()); exception when others then ok:=sqlerrm='CHALLENGE_NOT_FOUND'; end; assert ok,'unknown challenge';
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_link_create_v1(ch); exception when others then ok:=sqlerrm='CHALLENGE_NOT_FOUND'; end; assert ok,'only the creator makes a link';

  -- The creator makes a link: a long token, shown once; nothing but its hash is stored.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_challenge_link_create_v1(ch);
  tok := r->>'token'; inv := (r->>'id')::uuid;
  assert tok ~ '^[0-9a-f]{64}$' and (r->>'expiresAt')::timestamptz <= now() + interval '7 days 1 minute', 'a 64-hex token valid at most seven days: '||r::text;
  assert not (public.titan_challenge_links_v1()::text like '%'||tok||'%'), 'the token is not readable again';
  r := public.titan_challenge_links_v1();
  assert jsonb_array_length(r->'mine')=1 and jsonb_array_length(r->'mine'->0->'links')=1, 'the creator lists its live links';

  -- Public preview: rules only, no name; every invalid link answers the same.
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  r := public.titan_challenge_link_preview_v1(tok);
  assert (r->>'valid')::boolean and r->>'title'='Duel du week-end' and (r->>'participants')::int=1 and not (r::text ilike '%alba%') and not (r ? 'creator'), 'rules only, no name: '||r::text;
  assert public.titan_challenge_link_preview_v1('nope') = '{"valid": false}'::jsonb and public.titan_challenge_link_preview_v1(repeat('0',64)) = '{"valid": false}'::jsonb and public.titan_challenge_link_preview_v1(null) = '{"valid": false}'::jsonb, 'invalid links all answer the same';
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok); exception when others then ok:=true; end; assert ok,'anonymous cannot accept';
  set local role authenticated;

  -- A stranger who just signed up accepts: a participant, not a friend. The link is then spent.
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  select xp into xp0 from public.profiles where id = n;
  r := public.titan_challenge_link_accept_v1(tok);
  assert r->>'title'='Duel du week-end', 'accepted: '||r::text;
  assert (select xp from public.profiles where id = n) is not distinct from xp0, 'no XP';
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok); exception when others then ok:=sqlerrm='LINK_INVALID'; end; assert ok,'one use only';
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok); exception when others then ok:=sqlerrm='LINK_INVALID'; end; assert ok,'a spent link is invalid for everybody';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  assert public.titan_challenge_link_preview_v1(tok) = '{"valid": false}'::jsonb, 'the preview of a spent link is invalid';
  set local role authenticated;

  -- The creator cannot use its own link; a block makes the link invalid for the blocked player; revocation and expiry work.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  tok2 := public.titan_challenge_link_create_v1(ch)->>'token';
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok2); exception when others then ok:=sqlerrm='LINK_OWN_CHALLENGE'; end; assert ok,'not its own challenge';
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.titan_user_blocks(blocker_id, blocked_id) values (a, k);
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',k,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok2); exception when others then ok:=sqlerrm='LINK_INVALID'; end; assert ok,'a blocked player is refused as if the link were invalid';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  inv := (select (l->>'id')::uuid from jsonb_array_elements(public.titan_challenge_links_v1()->'mine'->0->'links') l where (l->>'used')::boolean = false limit 1);
  assert public.titan_challenge_link_revoke_v1(inv) is true and public.titan_challenge_link_revoke_v1(inv) is false, 'revoked once';
  perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok2); exception when others then ok:=sqlerrm='LINK_INVALID'; end; assert ok,'a revoked link is invalid';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  tok2 := public.titan_challenge_link_create_v1(ch)->>'token';
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_challenge_invites set expires_at = now() - interval '1 minute' where token_hash = encode(sha256(convert_to(tok2, 'UTF8')), 'hex');
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_link_accept_v1(tok2); exception when others then ok:=sqlerrm='LINK_INVALID'; end; assert ok,'an expired link is invalid';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  for i in 1..5 loop perform public.titan_challenge_link_create_v1(ch); end loop;
  ok:=false; begin perform public.titan_challenge_link_create_v1(ch); exception when others then ok:=sqlerrm='LINK_LIMIT_5'; end; assert ok,'five live links at most';

  -- The finished challenge: results frozen once, participants only, later changes do not move them.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  set local session_replication_role = replica;
  update public.titan_challenges set starts_at = now() - interval '5 days', ends_at = now() - interval '1 day' where id = ch;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values
    (a, 'running', 5, 'km', 10, now() - interval '3 days', '{"effort":{"effort_minutes":45}}', now() - interval '3 days'),
    (a, 'running', 5, 'km', 10, now() - interval '2 days', '{"effort":{"effort_minutes":30}}', now() - interval '2 days'),
    (n, 'swimming', 1, 'km', 10, now() - interval '3 days', '{"effort":{"effort_minutes":20}}', now() - interval '3 days');
  set local session_replication_role = origin;
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_result_v1(ch); exception when others then ok:=sqlerrm='CHALLENGE_NOT_FOUND'; end; assert ok,'only participants read the result';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.titan_challenge_links_v1()->'ended'->0->>'title'='Duel du week-end', 'the finished challenge is offered for its result';
  ok:=false; begin perform public.titan_challenge_link_create_v1(ch); exception when others then ok:=sqlerrm='CHALLENGE_ENDED'; end; assert ok,'no new link once it ended';
  r := public.titan_challenge_result_v1(ch);
  assert (select count(*) from jsonb_array_elements(r->'results'))=2 and r->'results'->0->>'name'='Alba' and (r->'results'->0->>'progress')::numeric=75 and (r->'results'->0->>'reached')::boolean and (r->'results'->1->>'progress')::numeric=20 and not (r->'results'->1->>'reached')::boolean, 'frozen result: '||r::text;
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update public.training_logs set archived_at = now() where user_id = a;
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  r := public.titan_challenge_result_v1(ch);
  assert (r->'results'->0->>'progress')::numeric=75, 'a later archive never moves the result: '||r::text;
  assert jsonb_array_length(public.export_own_data()->'challengeResults')=1, 'own result is exported';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_challenge_result_v1(ch); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare n uuid := current_setting('titan.dl_n')::uuid; a uuid := current_setting('titan.dl_a')::uuid;
begin
  assert not private.titan_are_friends(a, n), 'a link does not make friends';
  assert exists (select 1 from private.titan_challenge_results where user_id = n), 'n has a frozen result';
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  delete from auth.users where id = n;
  assert not exists (select 1 from private.titan_challenge_results where user_id = n), 'erased with the account';
end $$;
rollback;

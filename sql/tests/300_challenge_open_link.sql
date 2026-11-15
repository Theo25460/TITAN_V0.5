-- AUD-22: a challenge anyone can join by link, without being friends first: created with its creator only, its first one-use link returned
-- once, joined through the usual accept (participant, not friend), same validation and daily limit as titan_challenge_create. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); n uuid := gen_random_uuid(); s uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(n,'{}'),(s,'{}');
  update public.profiles set is_suspended = true where id = s;
  perform set_config('titan.ol_a',a::text,true); perform set_config('titan.ol_n',n::text,true); perform set_config('titan.ol_s',s::text,true);
  assert not has_function_privilege('anon','public.titan_challenge_open_create_v1(text,text,text,numeric,integer)','execute'), 'anonymous cannot create';
  assert has_function_privilege('authenticated','public.titan_challenge_open_create_v1(text,text,text,numeric,integer)','execute'), 'players can create';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; ch uuid; tok text; i integer;
  a uuid := current_setting('titan.ol_a')::uuid; n uuid := current_setting('titan.ol_n')::uuid; s uuid := current_setting('titan.ol_s')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_open_create_v1('x','nope',null,10,7); exception when others then ok:=sqlerrm='CHALLENGE_INVALID'; end; assert ok,'same validation';
  ok:=false; begin perform public.titan_challenge_open_create_v1('x','distance_km',null,10,7); exception when others then ok:=sqlerrm='CHALLENGE_INVALID'; end; assert ok,'distance needs a sport';

  r := public.titan_challenge_open_create_v1('Je te défie','sessions',null,4,14);
  ch := (r->>'id')::uuid; tok := r->>'token';
  assert ch is not null and tok ~ '^[0-9a-f]{64}$' and r ? 'expiresAt' and r ? 'invite', 'challenge id, token, expiry and invite id: '||r::text;
  assert (public.titan_challenge_link_preview_v1(tok)->>'title') = 'Je te défie', 'the public preview shows the rules';
  perform set_config('titan.ol_ch',ch::text,true); perform set_config('titan.ol_tok',tok,true);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.titan_challenge_members where challenge_id = current_setting('titan.ol_ch')::uuid) = 1, 'only the creator at first';
end $$;
set local role authenticated;
do $$
declare n uuid := current_setting('titan.ol_n')::uuid;
begin
  -- Someone who is not a friend joins with the link: participant, not friend.
  perform set_config('request.jwt.claims',json_build_object('sub',n,'role','authenticated')::text,true);
  perform public.titan_challenge_link_accept_v1(current_setting('titan.ol_tok'));
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.ol_a')::uuid; n uuid := current_setting('titan.ol_n')::uuid; ch uuid := current_setting('titan.ol_ch')::uuid;
begin
  assert exists (select 1 from public.titan_challenge_members where challenge_id = ch and user_id = n and status = 'joined'), 'joined by link';
  assert not exists (select 1 from public.friendships where (user_id_1 = a and user_id_2 = n) or (user_id_1 = n and user_id_2 = a)), 'not made friends';
end $$;
set local role authenticated;
do $$
declare ok boolean; i integer;
  a uuid := current_setting('titan.ol_a')::uuid; s uuid := current_setting('titan.ol_s')::uuid;
begin

  -- Same daily limit as the other challenges (5 a day per creator).
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok := false;
  begin
    for i in 1..6 loop perform public.titan_challenge_open_create_v1('Encore','sessions',null,2,7); end loop;
  exception when others then ok := true;
  end;
  assert ok, 'the daily challenge limit applies';

  perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_challenge_open_create_v1('x','sessions',null,2,7); exception when others then ok:=sqlerrm='ACCOUNT_SUSPENDED'; end; assert ok,'suspended accounts are refused';
end $$;
rollback;

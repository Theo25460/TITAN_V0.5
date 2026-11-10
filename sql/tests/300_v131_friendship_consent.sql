-- Friendship acceptance must come from the recipient before friends-only data is visible.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  update public.profiles
    set friend_code = 'TN-VTHB3', privacy = '{"publicProfile":true,"socialPresence":true,"showStats":true}'
    where id = b;
  perform set_config('titan.v131_friend_a', a::text, true);
  perform set_config('titan.v131_friend_b', b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_friend_b'), 'role', 'authenticated')::text, true);
select set_config('titan.v131_friend_moment',
  public.titan_moment_share('record', 'QA friends-only record', '47:12', 'running', null, 'friends')->>'id', true);

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_friend_a'), 'role', 'authenticated')::text, true);
do $$
declare
  b uuid := current_setting('titan.v131_friend_b')::uuid;
  moment text := current_setting('titan.v131_friend_moment');
begin
  assert not exists(select 1 from jsonb_array_elements(public.titan_social_overview()->'moments') m
    where m->>'id' = moment), 'unrelated A cannot see B''s friends-only moment';
  begin
    insert into public.friendships(user_id_1, user_id_2, status) values(auth.uid(), b, 'accepted');
  exception when insufficient_privilege then null;
  end;
  assert not exists(select 1 from jsonb_array_elements(public.titan_social_overview()->'moments') m
    where m->>'id' = moment), 'A forged accepted friendship and read B''s friends-only moment';
  assert public.titan_social_request('TN-VTHB3')->>'status' = 'pending', 'A can still send a pending request';
  assert not exists(select 1 from jsonb_array_elements(public.titan_social_overview()->'moments') m
    where m->>'id' = moment), 'pending request cannot disclose B''s moment';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_friend_b'), 'role', 'authenticated')::text, true);
select public.titan_social_respond(current_setting('titan.v131_friend_a')::uuid, true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_friend_a'), 'role', 'authenticated')::text, true);
do $$
begin
  assert exists(select 1 from jsonb_array_elements(public.titan_social_overview()->'moments') m
    where m->>'id' = current_setting('titan.v131_friend_moment') and m->>'detail' = '47:12'),
    'B''s acceptance makes the shared moment visible to A';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform public.titan_social_overview();
    raise exception 'anonymous caller could read the social overview';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

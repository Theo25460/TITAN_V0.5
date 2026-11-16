-- D11: friend-code lookups are limited to 30 per account and hour; another account keeps its own allowance.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  perform set_config('titan.v131_fc_a', a::text, true);
  perform set_config('titan.v131_fc_b', b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_fc_a'), 'role', 'authenticated')::text, true);
do $$
declare refused boolean := false;
begin
  for i in 1..30 loop
    perform * from public.titan_find_profile_by_friend_code('TN-' || lpad(i::text, 5, '0'));
  end loop;
  begin
    perform * from public.titan_find_profile_by_friend_code('TN-99999');
  exception when sqlstate 'PT429' then refused := true;
  end;
  assert refused, 'the 31st lookup within an hour is refused';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_fc_b'), 'role', 'authenticated')::text, true);
do $$
begin
  perform * from public.titan_find_profile_by_friend_code('TN-00001');
end $$;
reset role;

do $$
begin
  assert has_function_privilege('authenticated', 'public.titan_find_profile_by_friend_code(text)', 'EXECUTE'), 'still open to players';
  assert not has_function_privilege('anon', 'public.titan_find_profile_by_friend_code(text)', 'EXECUTE'), 'still closed to anonymous callers';
end $$;
rollback;

-- An API identity must go through the scoped coach RPCs, never the entitlement internals.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (a, '{}'), (b, '{}');
  perform set_config('titan.v131_coach_a', a::text, true);
  perform set_config('titan.v131_coach_b', b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_coach_a'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform private.titan_coach_seat_write(auth.uid(), current_setting('titan.v131_coach_b')::uuid, true, null);
  exception when insufficient_privilege then null;
  end;
  assert public.titan_coach_portal('snapshot')->>'owner' = auth.uid()::text,
    'authenticated caller still has its own coach snapshot';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('titan.v131_coach_b'), 'role', 'authenticated')::text, true);
do $$
begin
  assert (select is_elite is not true from public.profiles where id = auth.uid()),
    'A wrote a paid coach seat for B without a paid plan or link';
end $$;
reset role;

do $$
declare f regprocedure;
begin
  assert not exists(select 1 from private.titan_entitlements
    where user_id = current_setting('titan.v131_coach_b')::uuid),
    'the forbidden write created no entitlement row';
  foreach f in array array[
    'private.titan_coach_plan(uuid)'::regprocedure,
    'private.titan_coach_capacity(uuid)'::regprocedure,
    'private.titan_coach_seat_write(uuid,uuid,boolean,timestamptz)'::regprocedure,
    'private.titan_coach_sync_seats(uuid)'::regprocedure,
    'private.titan_coach_seats_sweep()'::regprocedure,
    'private.titan_entitlements_coach_hook()'::regprocedure
  ] loop
    assert not has_function_privilege('anon', f, 'EXECUTE'), 'anon inherited EXECUTE on ' || f;
    assert not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated can execute ' || f;
  end loop;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.titan_coach_seats_sweep_v1();
rollback;

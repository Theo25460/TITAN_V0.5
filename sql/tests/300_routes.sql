-- V11-83: the private route library: no API grant, own rows only, idempotent save, strict validation, limits, deletion with the account, export carries routes.
begin;
create function public.zz_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_track(p_n integer) returns jsonb language sql as $$
  select jsonb_build_object('v', 1, 't0', 1793600000000, 'segs', jsonb_build_array((select jsonb_agg(jsonb_build_array(4885000 + i * 4, 235000, i * 2, 1000 + i)) from generate_series(0, p_n - 1) i)))
$$;
create function public.zz_fails(p_sql text, p_code text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlerrm = p_code;
end $$;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r1 jsonb; r2 jsonb; rid uuid; list jsonb; got jsonb; i integer; ex jsonb;
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  assert not has_table_privilege('authenticated','private.titan_routes','select'), 'no API grant on the table';
  assert not has_function_privilege('anon','public.titan_route_save_v1(text,text,timestamptz,integer,integer,integer,jsonb)','execute'), 'anonymous cannot save';
  perform public.zz_as(a);
  r1 := public.titan_route_save_v1('route-aaaa-0001', 'running', now() - interval '1 hour', 5000, 1800, 42, public.zz_track(60));
  assert (r1->>'created')::boolean, 'first save creates';
  rid := (r1->>'id')::uuid;
  r2 := public.titan_route_save_v1('route-aaaa-0001', 'running', now() - interval '1 hour', 5000, 1800, 42, public.zz_track(60));
  assert not (r2->>'created')::boolean and (r2->>'id')::uuid = rid, 'the same route sent again is the same row';
  assert (select count(*) from private.titan_routes where user_id = a) = 1, 'nothing written twice';
  assert (select points from private.titan_routes where id = rid) = 60, 'points counted by the server';
  list := public.titan_routes_v1();
  assert jsonb_array_length(list) = 1 and not (list->0 ? 'track'), 'the list carries no trace';
  got := public.titan_route_get_v1(rid);
  assert jsonb_array_length(got->'track'->'segs'->0) = 60 and (got->>'ascentM')::int = 42, 'the detail carries the trace';
  -- another account sees nothing of it and cannot delete it
  perform public.zz_as(b);
  assert jsonb_array_length(public.titan_routes_v1()) = 0, 'b sees no route of a';
  assert public.zz_fails(format('select public.titan_route_get_v1(%L)', rid), 'ROUTE_NOT_FOUND'), 'b cannot read it';
  assert not public.titan_route_delete_v1(rid), 'b cannot delete it';
  assert (select count(*) from private.titan_routes where id = rid) = 1, 'still there';
  -- the same client id for another account is its own route
  assert (public.titan_route_save_v1('route-aaaa-0001', 'running', now(), 1000, 300, null, public.zz_track(5))->>'created')::boolean, 'ids are per account';
  perform public.zz_as(a);
  -- validation
  assert public.zz_fails($q$select public.titan_route_save_v1('bad id!', 'running', now(), 1, 1, 1, public.zz_track(5))$q$, 'BAD_ROUTE_ID'), 'bad id';
  assert public.zz_fails($q$select public.titan_route_save_v1('route-aaaa-0002', 'no_such_sport', now(), 1, 1, 1, public.zz_track(5))$q$, 'SPORT_UNKNOWN'), 'unknown sport';
  assert public.zz_fails($q$select public.titan_route_save_v1('route-aaaa-0003', 'running', now() + interval '3 days', 1, 1, 1, public.zz_track(5))$q$, 'BAD_START'), 'future start';
  assert public.zz_fails($q$select public.titan_route_save_v1('route-aaaa-0004', 'running', now(), 1, 1, 1, '{"v":2,"segs":[]}'::jsonb)$q$, 'BAD_TRACK'), 'wrong version';
  assert public.zz_fails($q$select public.titan_route_save_v1('route-aaaa-0005', 'running', now(), 1, 1, 1, public.zz_track(1))$q$, 'BAD_TRACK'), 'one point is not a route';
  assert public.zz_fails($q$select public.titan_route_save_v1('route-aaaa-0006', 'running', now(), 1, 1, 1, jsonb_build_object('v',1,'segs',jsonb_build_array(jsonb_build_array(jsonb_build_array(99999999,0,0,null),jsonb_build_array(1,1,1,null)))))$q$, 'BAD_TRACK'), 'latitude out of range';
  assert public.zz_fails($q$select public.titan_route_save_v1('route-aaaa-0007', 'running', now(), 1, 1, 1, public.zz_track(3001))$q$, 'TRACK_TOO_LARGE'), 'too many points';
  assert (select count(*) from private.titan_routes where user_id = a) = 1, 'a refused route writes nothing';
  -- a route earns nothing
  assert not exists (select 1 from public.training_logs where user_id = a), 'no session, XP or credit comes from a route';
  -- the export carries the routes
  ex := private.titan_export_extras_v1(a);
  assert jsonb_array_length(ex->'routes') = 1 and ex->'routes'->0->>'client_route_id' = 'route-aaaa-0001', 'exported';
  assert ex ? 'coachCheckins' and ex ? 'garminLink', 'earlier sections are kept';
  -- deletion
  assert public.titan_route_delete_v1(rid), 'own deletion';
  assert jsonb_array_length(public.titan_routes_v1()) = 0, 'gone';
  -- the 200 route ceiling
  for i in 1..200 loop
    insert into private.titan_routes (user_id, client_route_id, sport, started_at, distance_m, duration_s, points, track)
    values (a, 'bulk-route-' || lpad(i::text, 4, '0'), 'running', now() - (i || ' minutes')::interval, 1, 1, 2, public.zz_track(2));
  end loop;
  assert public.zz_fails($q$select public.titan_route_save_v1('route-over-0201', 'running', now(), 1, 1, 1, public.zz_track(5))$q$, 'ROUTE_LIMIT'), 'ceiling';
  -- deleted with the account
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_routes where user_id = a), 'routes follow the account';
end $$;
rollback;

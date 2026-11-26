-- V1.7.7 — GPS et navigation sportive (migration 20261130102100). Synthetic accounts only, full rollback.
-- A. Route library v2: a save is idempotent by client id (the replay changes nothing), the name is trimmed and cut, a bad origin,
--    summary or name is refused and writes nothing; a route saved with v1 reads through v2 with origin 'recorded'; rename, clear.
-- B. Personal points: the same client id updates the point, 300 points at most, deletion one by one.
-- C. Isolation: another account reads, renames and deletes nothing; the tables have no API grant; anonymous callers are refused.
-- D. Quotas of the two Netlify functions: 30 route computations an hour and 150 a day, 60 point searches an hour; a refusal writes nothing.
-- E. The account export carries the points and the new columns; everything is erased with the account; nothing earns XP or credits.
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
declare k text;
begin
  foreach k in array array['a','b'] loop
    perform set_config('titan.gps_'||k, gen_random_uuid()::text, true);
    insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.gps_'||k)::uuid,'{}');
  end loop;
end $$;

do $$
declare
  a uuid := current_setting('titan.gps_a')::uuid; b uuid := current_setting('titan.gps_b')::uuid;
  digest jsonb := '{"v":1,"rules":"gps-engine-v1","family":"bike","autoPause":true,"elapsedS":5400,"movingS":4980,"stoppedS":300,"pausedS":120,"missingS":0,"distanceM":41250,"gapDistanceM":0,"ascentM":512,"descentM":498,"altitude":"gnss","points":60,"rejected":3}';
  r1 jsonb; r2 jsonb; rid uuid; old_id uuid; pid uuid; p2 jsonb; list jsonb; got jsonb; ex jsonb; i integer; xp0 bigint; credits0 integer;
begin
  -- No API grant on the tables, no anonymous execution.
  assert not has_table_privilege('authenticated','private.titan_routes','select') and not has_table_privilege('anon','private.titan_routes','select'), 'no API grant on the routes';
  for k in 1..4 loop
    assert not has_table_privilege('authenticated','private.titan_places',(array['select','insert','update','delete'])[k])
       and not has_table_privilege('anon','private.titan_places',(array['select','insert','update','delete'])[k]), 'no API grant on the points';
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'private.titan_places'::regclass), 'row level security is on';
  assert not has_function_privilege('anon','public.titan_route_save_v2(text,text,timestamptz,integer,integer,integer,jsonb,text,text,jsonb)','execute')
     and not has_function_privilege('anon','public.titan_routes_v2(integer,timestamptz)','execute') and not has_function_privilege('anon','public.titan_route_get_v2(uuid)','execute')
     and not has_function_privilege('anon','public.titan_route_rename_v1(uuid,text)','execute')
     and not has_function_privilege('anon','public.titan_place_save_v1(text,text,text,double precision,double precision,text)','execute')
     and not has_function_privilege('anon','public.titan_places_v1()','execute') and not has_function_privilege('anon','public.titan_place_delete_v1(uuid)','execute')
     and not has_function_privilege('anon','public.titan_route_plan_quota_v1()','execute') and not has_function_privilege('anon','public.titan_poi_quota_v1()','execute'), 'closed to anonymous callers';
  assert has_function_privilege('authenticated','public.titan_route_save_v2(text,text,timestamptz,integer,integer,integer,jsonb,text,text,jsonb)','execute')
     and has_function_privilege('authenticated','public.titan_place_save_v1(text,text,text,double precision,double precision,text)','execute')
     and has_function_privilege('authenticated','public.titan_route_plan_quota_v1()','execute'), 'open to players';
  assert not has_function_privilege('authenticated','private.titan_quota_take_v1(uuid,text,integer,integer)','execute')
     and not has_function_privilege('authenticated','private.titan_clean_label_v1(text,integer)','execute')
     and not has_function_privilege('authenticated','private.titan_export_extras_v1(uuid)','execute'), 'the private helpers stay private';
  select xp + total_xp, credits into xp0, credits0 from public.profiles where id = a;

  -- A. Route library v2
  perform public.zz_as(a);
  r1 := public.titan_route_save_v2('gps-route-0001', 'cycling', now() - interval '2 hours', 41250, 4980, 512, public.zz_track(60), E'  Col  de la\tCroix-de-Fer  ', 'planned', digest);
  assert (r1->>'created')::boolean, 'first save creates';
  rid := (r1->>'id')::uuid;
  r2 := public.titan_route_save_v2('gps-route-0001', 'cycling', now() - interval '2 hours', 1, 1, 1, public.zz_track(5), 'Autre nom', 'imported', null);
  assert not (r2->>'created')::boolean and (r2->>'id')::uuid = rid, 'the same route sent again is the same row';
  assert (select count(*) from private.titan_routes where user_id = a) = 1, 'nothing written twice';
  got := public.titan_route_get_v2(rid);
  assert got->>'name' = 'Col de la Croix-de-Fer' and got->>'origin' = 'planned' and got->'summary' = digest, 'the replay changed neither the name, the origin nor the summary';
  assert (got->>'distanceM')::int = 41250 and (got->>'points')::int = 60 and jsonb_array_length(got->'track'->'segs'->0) = 60, 'the v1 fields and the trace are there';
  list := public.titan_routes_v2();
  assert jsonb_array_length(list) = 1 and not (list->0 ? 'track') and list->0->>'name' = 'Col de la Croix-de-Fer' and list->0->>'origin' = 'planned'
     and (list->0->'summary'->>'movingS')::int = 4980, 'the list carries the name, the origin and the summary, never the trace';
  -- defaults: no name, recorded, no summary
  r1 := public.titan_route_save_v2('gps-route-0002', 'running', now() - interval '1 hour', 5000, 1800, null, public.zz_track(10));
  got := public.titan_route_get_v2((r1->>'id')::uuid);
  assert got->'name' = 'null'::jsonb and got->>'origin' = 'recorded' and got->'summary' = 'null'::jsonb, 'defaults';
  -- a name longer than 80 characters is cut, an empty one is no name
  r1 := public.titan_route_save_v2('gps-route-0003', 'running', now() - interval '3 hours', 5000, 1800, null, public.zz_track(10), repeat('é', 120), 'imported', null);
  assert char_length(public.titan_route_get_v2((r1->>'id')::uuid)->>'name') = 80, 'cut to 80 characters';
  r1 := public.titan_route_save_v2('gps-route-0004', 'running', now() - interval '4 hours', 5000, 1800, null, public.zz_track(10), '   ', 'imported', null);
  assert public.titan_route_get_v2((r1->>'id')::uuid)->'name' = 'null'::jsonb, 'blank name kept as no name';
  -- refused, and nothing written
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0010', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'shared', null)$q$, 'BAD_ORIGIN'), 'unknown origin';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0011', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'backtrack', null)$q$, 'BAD_ORIGIN'), 'a client-only origin is not stored';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0012', 'running', now(), 1, 1, 1, public.zz_track(5), repeat('x', 201), 'planned', null)$q$, 'BAD_NAME'), 'a text far beyond a title';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0013', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'planned', '[1,2]'::jsonb)$q$, 'BAD_SUMMARY'), 'summary: not an object';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0014', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'planned', '{"rules":"x"}'::jsonb)$q$, 'BAD_SUMMARY'), 'summary: no version';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0015', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'planned', '{"v":1,"track":[[1,2]]}'::jsonb)$q$, 'BAD_SUMMARY'), 'summary: nothing nested';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0016', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'planned', jsonb_build_object('v', 1, 'rules', repeat('x', 2100)))$q$, 'BAD_SUMMARY'), 'summary: over 2 kB';
  -- the validation of v1 is the validation of v2
  assert public.zz_fails($q$select public.titan_route_save_v2('bad id!', 'running', now(), 1, 1, 1, public.zz_track(5), 'x', 'planned', null)$q$, 'BAD_ROUTE_ID'), 'bad id';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0017', 'no_such_sport', now(), 1, 1, 1, public.zz_track(5), 'x', 'planned', null)$q$, 'SPORT_UNKNOWN'), 'unknown sport';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0018', 'running', now(), 1, 1, 1, public.zz_track(3001), 'x', 'planned', null)$q$, 'TRACK_TOO_LARGE'), 'too many points';
  assert public.zz_fails($q$select public.titan_route_save_v2('gps-route-0019', 'running', now(), 1, 1, 1, public.zz_track(1), 'x', 'planned', null)$q$, 'BAD_TRACK'), 'one point is not a route';
  assert (select count(*) from private.titan_routes where user_id = a) = 4, 'a refused route writes nothing';
  -- v1 still works, unchanged, and its row reads through v2 as a recorded route
  r1 := public.titan_route_save_v1('gps-route-v1-01', 'running', now() - interval '5 hours', 8000, 2700, 60, public.zz_track(20));
  assert (r1->>'created')::boolean, 'v1 saves';
  old_id := (r1->>'id')::uuid;
  got := public.titan_route_get_v2(old_id);
  assert got->>'origin' = 'recorded' and got->'name' = 'null'::jsonb and got->'summary' = 'null'::jsonb and (got->>'ascentM')::int = 60, 'a v1 route through v2';
  assert not (public.titan_route_get_v1(rid) ? 'name') and not (public.titan_routes_v1()->0 ? 'origin'), 'v1 answers keep their shape';
  assert jsonb_array_length(public.titan_routes_v1()) = 5 and jsonb_array_length(public.titan_routes_v2()) = 5, 'both lists read the same library';
  assert not (public.titan_route_save_v2('gps-route-v1-01', 'running', now(), 1, 1, 1, public.zz_track(5), 'Renommé par rejeu', 'planned', digest)->>'created')::boolean, 'a v2 replay of a v1 route creates nothing';
  got := public.titan_route_get_v2(old_id);
  assert got->'name' = 'null'::jsonb and got->>'origin' = 'recorded' and got->'summary' = 'null'::jsonb, 'and changes nothing either';
  assert jsonb_array_length(public.titan_routes_v2(2)) = 2 and jsonb_array_length(public.titan_routes_v2(50, now() - interval '150 minutes')) = 3, 'limit and paging like v1';
  -- rename
  assert public.titan_route_rename_v1(old_id, E' Tour  du lac\n '), 'renamed';
  assert public.titan_route_get_v2(old_id)->>'name' = 'Tour du lac', 'trimmed, white space collapsed';
  assert public.titan_route_rename_v1(old_id, repeat('n', 95)), 'renamed again';
  assert char_length(public.titan_route_get_v2(old_id)->>'name') = 80, 'cut to 80';
  assert public.zz_fails(format('select public.titan_route_rename_v1(%L, repeat(''x'', 201))', old_id), 'BAD_NAME'), 'rename: a text far beyond a title';
  assert public.titan_route_rename_v1(old_id, ''), 'cleared';
  assert public.titan_route_get_v2(old_id)->'name' = 'null'::jsonb, 'an empty name clears it';
  assert public.titan_route_rename_v1(old_id, null), 'null clears too';
  assert not public.titan_route_rename_v1(gen_random_uuid(), 'x'), 'unknown route: false';
  assert public.titan_route_rename_v1(rid, 'Croix-de-Fer par Saint-Jean'), 'renamed for the isolation checks below';

  -- B. Personal points
  p2 := public.titan_place_save_v1('pl-fontaine-01', E'  Fontaine   du village ', 'water', 45.19321, 6.43105, 'Eau potable, coupée en hiver');
  assert (p2->>'created')::boolean, 'point created';
  pid := (p2->>'id')::uuid;
  p2 := public.titan_place_save_v1('pl-fontaine-01', 'Fontaine de la place', 'water', 45.19330, 6.43110, null);
  assert not (p2->>'created')::boolean and (p2->>'id')::uuid = pid, 'the same client id is the same point';
  assert (select count(*) from private.titan_places where user_id = a) = 1, 'one row';
  list := public.titan_places_v1();
  assert jsonb_array_length(list) = 1 and list->0->>'name' = 'Fontaine de la place' and list->0->>'clientPlaceId' = 'pl-fontaine-01' and list->0->>'kind' = 'water'
     and (list->0->>'lat')::numeric = 45.19330 and (list->0->>'lon')::numeric = 6.43110 and list->0->>'note' = '' and list->0 ? 'updatedAt' and not (list->0 ? 'user_id'), 'updated in place: name, position, note';
  assert (public.titan_place_save_v1('pl-refuge-0001', 'Refuge', 'shelter', -90, 180, repeat('n', 260))->>'created')::boolean, 'the poles and the antimeridian are positions';
  assert (select char_length(note) from private.titan_places where user_id = a and client_place_id = 'pl-refuge-0001') = 200, 'a note is cut to 200';
  assert public.zz_fails($q$select public.titan_place_save_v1('short', 'x', 'water', 1, 1, '')$q$, 'BAD_PLACE_ID'), 'bad id';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000001', 'x', 'pharmacy', 1, 1, '')$q$, 'BAD_KIND'), 'unknown kind';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000002', 'x', 'water', 90.01, 1, '')$q$, 'BAD_POSITION'), 'latitude out of range';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000003', 'x', 'water', 1, -180.5, '')$q$, 'BAD_POSITION'), 'longitude out of range';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000004', 'x', 'water', 'NaN', 1, '')$q$, 'BAD_POSITION'), 'not a number';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000005', 'x', 'water', null, 1, '')$q$, 'BAD_POSITION'), 'no position';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000006', '   ', 'water', 1, 1, '')$q$, 'BAD_NAME'), 'a point has a name';
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-bad-000007', repeat('x', 201), 'water', 1, 1, '')$q$, 'BAD_NAME'), 'a text far beyond a name';
  assert (select count(*) from private.titan_places where user_id = a) = 2, 'a refused point writes nothing';
  assert (public.titan_place_save_v1('pl-long-name-1', repeat('é', 75), 'other', 1, 1, '')->>'created')::boolean, 'a long name is kept, cut';
  assert (select char_length(name) from private.titan_places where user_id = a and client_place_id = 'pl-long-name-1') = 60, 'a name is cut to 60';
  assert public.titan_place_delete_v1((select id from private.titan_places where user_id = a and client_place_id = 'pl-long-name-1')), 'own deletion';

  -- C. Another account sees and changes nothing
  perform public.zz_as(b);
  assert jsonb_array_length(public.titan_routes_v2()) = 0 and jsonb_array_length(public.titan_places_v1()) = 0, 'b lists nothing of a';
  assert public.zz_fails(format('select public.titan_route_get_v2(%L)', rid), 'ROUTE_NOT_FOUND'), 'b cannot read the route';
  assert not public.titan_route_rename_v1(rid, 'Volé'), 'b cannot rename it';
  assert not public.titan_route_delete_v1(rid), 'b cannot delete it';
  assert not public.titan_place_delete_v1(pid), 'b cannot delete the point';
  -- the same client ids belong to b's own library: a's rows are not touched
  assert (public.titan_route_save_v2('gps-route-0001', 'running', now(), 1000, 300, null, public.zz_track(5), 'À moi', 'imported', null)->>'created')::boolean, 'route ids are per account';
  assert (public.titan_place_save_v1('pl-fontaine-01', 'La mienne', 'food', 10, 10, '')->>'created')::boolean, 'point ids are per account';
  ex := private.titan_export_extras_v1(b);
  assert position(a::text in ex::text) = 0 and jsonb_array_length(ex->'places') = 1 and ex->'places'->0->>'name' = 'La mienne' and jsonb_array_length(ex->'routes') = 1, 'b exports its own point and route only';
  perform public.zz_as(a);
  assert public.titan_route_get_v2(rid)->>'name' = 'Croix-de-Fer par Saint-Jean'
     and exists (select 1 from jsonb_array_elements(public.titan_places_v1()) p where (p->>'id')::uuid = pid and p->>'name' = 'Fontaine de la place'), 'a''s rows are intact';
  assert (select count(*) from private.titan_places where user_id = a) = 2 and (select count(*) from private.titan_routes where user_id = a) = 5, 'nothing lost';

  -- D. Quotas: 30 route computations an hour, 150 a day; 60 point searches an hour. A refusal writes nothing.
  for i in 1..30 loop assert public.titan_route_plan_quota_v1(), 'route computation ' || i; end loop;
  assert not public.titan_route_plan_quota_v1(), 'the 31st of the hour is refused';
  assert not public.titan_route_plan_quota_v1(), 'and the next one too';
  assert (select count(*) from private.titan_rate_events where user_id = a and bucket = 'route_plan') = 30, 'a refusal is not counted';
  perform public.zz_as(b);
  assert public.titan_route_plan_quota_v1(), 'the quota is per account';
  perform public.zz_as(a);
  update private.titan_rate_events set at = now() - interval '2 hours' where user_id = a and bucket = 'route_plan';
  insert into private.titan_rate_events(user_id, bucket, at) select a, 'route_plan', now() - interval '3 hours' from generate_series(1, 119);
  assert public.titan_route_plan_quota_v1(), 'the 150th of the day, a new hour';
  assert not public.titan_route_plan_quota_v1(), 'the 151st of the day is refused although the hour is nearly empty';
  update private.titan_rate_events set at = now() - interval '25 hours' where user_id = a and bucket = 'route_plan' and at < now() - interval '1 hour';
  assert public.titan_route_plan_quota_v1(), 'a new day';
  for i in 1..60 loop assert public.titan_poi_quota_v1(), 'point search ' || i; end loop;
  assert not public.titan_poi_quota_v1(), 'the 61st search of the hour is refused';
  assert (select count(*) from private.titan_rate_events where user_id = a and bucket = 'poi_nearby') = 60, 'searches are counted apart from route computations';
  assert not exists (select 1 from public.titan_suspicious_actions where user_id = a), 'a quota reached is no moderation signal';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert public.zz_fails('select public.titan_route_plan_quota_v1()', 'AUTH_REQUIRED') and public.zz_fails('select public.titan_poi_quota_v1()', 'AUTH_REQUIRED')
     and public.zz_fails('select public.titan_places_v1()', 'AUTH_REQUIRED') and public.zz_fails('select public.titan_routes_v2()', 'AUTH_REQUIRED')
     and public.zz_fails($q$select public.titan_place_save_v1('pl-anon-00001', 'x', 'water', 1, 1, '')$q$, 'AUTH_REQUIRED')
     and public.zz_fails(format('select public.titan_route_rename_v1(%L, ''x'')', rid), 'AUTH_REQUIRED'), 'no account, no call';
  perform public.zz_as(a);

  -- E. Nothing here earns anything
  assert not exists (select 1 from public.training_logs where user_id in (a, b)), 'no session comes from a route or a point';
  assert (select xp + total_xp from public.profiles where id = a) = xp0 and (select credits from public.profiles where id = a) = credits0, 'no XP, no credit';
  -- the export carries the points and the new columns, and keeps every earlier section
  ex := private.titan_export_extras_v1(a);
  assert jsonb_array_length(ex->'routes') = 5, 'every route exported once';
  assert exists (select 1 from jsonb_array_elements(ex->'routes') r where r->>'client_route_id' = 'gps-route-0001' and r->>'name' = 'Croix-de-Fer par Saint-Jean'
                   and r->>'origin' = 'planned' and r->'summary' = digest and r ? 'track' and r ? 'event_id' and r ? 'created_at'), 'a route with its name, origin, summary and trace';
  assert jsonb_array_length(ex->'places') = 2 and ex->'places'->0->>'client_place_id' = 'pl-fontaine-01' and ex->'places'->0->>'name' = 'Fontaine de la place'
     and (ex->'places'->0->>'lat')::numeric = 45.19330 and not (ex->'places'->0 ? 'user_id'), 'the points exported, without an internal identifier';
  assert ex ? 'cadenceWeekClaims' and ex ? 'timeCapsules' and ex ? 'lifeChapters' and ex ? 'coachCheckins' and ex ? 'garminLink' and ex ? 'journey', 'earlier sections are kept';

  -- 300 points at most; a point already kept can still be corrected at the ceiling
  insert into private.titan_places (user_id, client_place_id, name, kind, lat, lon)
  select a, 'pl-bulk-' || lpad(n::text, 5, '0'), 'Point ' || n, 'other', 45 + n * 0.001, 6 from generate_series(1, 298) n;
  assert public.zz_fails($q$select public.titan_place_save_v1('pl-over-00301', 'De trop', 'water', 1, 1, '')$q$, 'PLACE_LIMIT'), 'ceiling';
  assert not (public.titan_place_save_v1('pl-fontaine-01', 'Fontaine corrigée', 'water', 45.2, 6.4, '')->>'created')::boolean, 'an update is not a new point';
  assert public.titan_place_delete_v1(pid), 'own deletion at the ceiling';
  assert (public.titan_place_save_v1('pl-over-00301', 'À sa place', 'water', 1, 1, '')->>'created')::boolean, 'a deletion frees a place';
end $$;

-- Under the real API role: the functions answer, the tables do not.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.gps_a')::uuid; denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.titan_places_v1()) = 300 and jsonb_array_length(public.titan_routes_v2(100)) = 5, 'the player reads through the functions';
  begin perform 1 from private.titan_places limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'the table itself is closed';
  denied := false;
  begin perform private.titan_quota_take_v1(a, 'route_plan', 1000, null); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a player cannot write the quota counter directly';
end $$;
reset role;

do $$
declare a uuid := current_setting('titan.gps_a')::uuid;
begin
  -- erased with the account
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_places where user_id = a) and not exists (select 1 from private.titan_routes where user_id = a)
     and not exists (select 1 from private.titan_rate_events where user_id = a), 'points, routes and quota counters follow the account';
  assert (select count(*) from private.titan_places where user_id = current_setting('titan.gps_b')::uuid) = 1, 'the other account keeps its own';
end $$;
rollback;

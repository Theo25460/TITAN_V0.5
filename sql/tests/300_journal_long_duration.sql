-- V1.6.6 — Journal longue durée (migration 20261123180000). Synthetic accounts only, full rollback.
-- A. The elevation of an old ride is corrected alone: one revision, one snapshot, nothing else moves (value, date, unit, reward);
--    the change is readable as « elevation 1450 > 1650 m ».
-- B. Elevation and duration in the same correction: still one revision and one snapshot.
-- C. null clears the elevation; invalid values, a session not measured in km, a stale revision, another account and anonymous
--    access are refused.
-- D. The manifest the clients read (id, revision, archived_at, status, is_suspicious) moves with every correction and archive, and
--    an account reads only its own lines.
begin;
do $$
declare k text;
begin
  foreach k in array array['a','b'] loop
    perform set_config('titan.ld_'||k, gen_random_uuid()::text, true);
    insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.ld_'||k)::uuid,'{}');
  end loop;
  update public.profiles set created_at = now() - interval '400 days'
   where id in (current_setting('titan.ld_a')::uuid, current_setting('titan.ld_b')::uuid);
end $$;

set local role authenticated;
do $$
declare
  a uuid := current_setting('titan.ld_a')::uuid;
  b uuid := current_setting('titan.ld_b')::uuid;
  t0 timestamptz := date_trunc('minute', now()) - interval '20 days';
  ride record; yoga record; row public.training_logs%rowtype; r jsonb; ch jsonb; xp0 bigint; failed boolean; m jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select * into ride from public.titan_submit_training_session('cycling','cardio',82.4,'km',jsonb_build_object('duration',245,'elevation',1450,'note','Col du Galibier par Valloire'),t0);
  select * into yoga from public.titan_submit_training_session('yoga','mobilite',45,'min',jsonb_build_object('duration',45),t0 + interval '1 day');
  select * into row from public.training_logs where id=ride.log_id::uuid;
  assert (row.details->>'elevation')::numeric = 1450, 'fixture: the ride carries its elevation: '||row.details::text;
  select coalesce(sum(xp),0) into xp0 from public.training_logs where user_id=a;

  -- A. Elevation alone.
  r := public.titan_update_training_session(row.id, row.revision, '{"elevation":1650}'::jsonb);
  assert (r->>'revision')::int = row.revision + 1, 'A: one revision: '||r::text;
  assert (r->'details'->>'elevation')::numeric = 1650, 'A: the elevation is corrected';
  assert (r->>'val')::numeric = 82.4 and r->>'unit' = 'km' and (r->>'date')::timestamptz = row.date, 'A: value, unit and date unchanged';
  assert (r->'details'->>'duration')::numeric = 245 and r->'details'->>'note' = 'Col du Galibier par Valloire', 'A: duration and note unchanged';
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=a) = xp0, 'A: a correction changes no reward';
  perform set_config('titan.ld_ride', row.id::text, true);
  perform set_config('titan.ld_yoga', yoga.log_id::text, true);
  ch := public.titan_session_changes_v1(row.id);
  assert jsonb_array_length(ch) = 1 and ch->0->'changes' @> '[{"field":"elevation","before":1450,"after":1650,"unit":"m"}]'::jsonb
         and jsonb_array_length(ch->0->'changes') = 1, 'A: the change is readable, and only it: '||ch::text;

  -- B. Elevation with the duration: one revision, one more snapshot.
  r := public.titan_update_training_session(row.id, row.revision + 1, '{"elevation":1700,"duration":240}'::jsonb);
  assert (r->>'revision')::int = row.revision + 2, 'B: one revision for both fields: '||r::text;
  assert (r->'details'->>'elevation')::numeric = 1700 and (r->'details'->>'duration')::numeric = 240, 'B: both corrected';
  ch := public.titan_session_changes_v1(row.id);
  assert ch->0->'changes' @> '[{"field":"elevation","before":1650,"after":1700}]'::jsonb and ch->0->'changes' @> '[{"field":"duration","before":245,"after":240}]'::jsonb, 'B: both changes listed: '||ch::text;

  -- C. null clears; refusals.
  r := public.titan_update_training_session(row.id, row.revision + 2, '{"elevation":null}'::jsonb);
  assert r->'details'->'elevation' is null and (r->>'revision')::int = row.revision + 3, 'C: null clears the elevation: '||r::text;
  foreach m in array array['{"elevation":-5}','{"elevation":13000}','{"elevation":"1500"}']::jsonb[] loop
    failed := false;
    begin perform public.titan_update_training_session(row.id, row.revision + 3, m); exception when others then failed := sqlerrm = 'ELEVATION_INVALID'; end;
    assert failed, 'C: refused value '||m::text;
  end loop;
  failed := false;
  begin perform public.titan_update_training_session(yoga.log_id::uuid, 1, '{"elevation":100}'::jsonb); exception when others then failed := sqlerrm = 'ELEVATION_INVALID'; end;
  assert failed, 'C: a session not measured in km has no elevation';
  failed := false;
  begin perform public.titan_update_training_session(row.id, row.revision, '{"elevation":1500}'::jsonb); exception when others then failed := sqlerrm = 'SESSION_VERSION_CONFLICT'; end;
  assert failed, 'C: a stale revision is a conflict, never a silent overwrite';
  failed := false;
  begin perform public.titan_update_training_session(row.id, row.revision + 3, '{"elevation":null}'::jsonb); exception when others then failed := sqlerrm = 'PATCH_INVALID'; end;
  assert failed, 'C: a correction that changes nothing is refused';

  -- D. The manifest moves with each correction and archive.
  m := (select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'archived_at',archived_at,'status',status,'is_suspicious',is_suspicious) order by id) from public.training_logs where user_id=a);
  assert jsonb_array_length(m) = 2 and m @> jsonb_build_array(jsonb_build_object('id',row.id,'revision',row.revision + 3)), 'D: the manifest carries the new revision: '||m::text;
  r := public.titan_update_training_session(yoga.log_id::uuid, 1, '{"archived":true}'::jsonb);
  assert (select revision from public.training_logs where id=yoga.log_id::uuid) = 2 and (select archived_at from public.training_logs where id=yoga.log_id::uuid) is not null, 'D: an archive moves revision and archived_at';

  -- Another account sees no line of A and cannot correct A's ride.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert (select count(*) from public.training_logs where user_id=a) = 0, 'D: B reads no manifest line of A';
  failed := false;
  begin perform public.titan_update_training_session(row.id, row.revision + 3, '{"elevation":900}'::jsonb); exception when others then failed := sqlerrm = 'SESSION_NOT_FOUND'; end;
  assert failed, 'C: B cannot correct A''s ride';
  assert (public.titan_session_changes_v1(row.id)) = '[]'::jsonb, 'C: B reads none of A''s changes';
end $$;

reset role;
set local role anon;
do $$
declare failed boolean := false;
begin
  begin perform public.titan_update_training_session(gen_random_uuid(), 1, '{"elevation":100}'::jsonb); exception when insufficient_privilege then failed := true; end;
  assert failed, 'C: no anonymous access';
end $$;
reset role;
-- One snapshot per correction (training_revisions is read by the owner through titan_session_changes_v1 only).
do $$
begin
  assert (select count(*) from public.training_revisions where log_id = current_setting('titan.ld_ride')::uuid) = 3, 'A, B, C: one snapshot per correction of the ride';
  assert (select count(*) from public.training_revisions where log_id = current_setting('titan.ld_yoga')::uuid) = 1, 'D: one snapshot for the archive';
end $$;
rollback;

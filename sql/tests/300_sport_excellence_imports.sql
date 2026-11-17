-- Sport excellence, lot C (migration 20261118090000). Synthetic accounts only, full rollback.
-- 1. The same effort under neighbouring sport ids (typed « treadmill », read by Health Connect as « running ») is ONE session.
-- 2. Two different efforts at the same time in different families stay two (no false merge).
-- 3. A watch swim is stored in metres, like a typed swim.
-- 4. The Strava history import ('archive') can be archived in one step, owner only.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}');
  update public.profiles set created_at = now() - interval '400 days' where id in (a, b);
  perform set_config('titan.se_a',a::text,true); perform set_config('titan.se_b',b::text,true);
  assert private.titan_sport_dedupe_group('treadmill') = private.titan_sport_dedupe_group('running'), 'treadmill and running are one effort family';
  assert private.titan_sport_dedupe_group('mountain_bike') = private.titan_sport_dedupe_group('cycling'), 'mountain bike and cycling';
  assert private.titan_sport_dedupe_group('open_water_swimming') = private.titan_sport_dedupe_group('swimming'), 'open water and pool';
  assert private.titan_sport_dedupe_group('running') <> private.titan_sport_dedupe_group('cycling'), 'run and ride stay apart';
  assert private.titan_sport_dedupe_group('tennis') = 'tennis', 'an ungrouped sport is its own group';
  assert not has_function_privilege('authenticated','private.titan_sport_dedupe_group(text)','execute'), 'private helper';
  assert (select unit from public.sports where id = 'swimming') = 'm', 'fixture: swims are measured in metres';
end $$;

set local role authenticated;
do $$
declare k text;
begin
  foreach k in array array['a','b'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.se_'||k),'role','authenticated')::text,true);
    perform public.titan_set_source_consent_v1('garmin',true);
    perform public.titan_set_source_consent_v1('health_connect',true);
  end loop;
end $$;
reset role;
set local role service_role;
do $$ begin perform public.titan_garmin_link_v1(current_setting('titan.se_a')::uuid,'se-garmin-a'); end $$;
reset role;

-- 1 and 2. A treadmill session typed with its real start; then Health Connect brings the same effort as « running », and a yoga
-- session at the same hour.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.se_a')::uuid; res record; r jsonb; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select * into res from public.titan_submit_training_session('treadmill','cardio',8,'km',jsonb_build_object('duration',45),now() - interval '50 minutes');
  r := public.titan_import_activity_v1('health_connect','se-hc-run','running',now() - interval '48 minutes',44);
  assert r->>'status'='linked' and r->>'log_id'=res.log_id, 'neighbouring ids: the import joins the typed treadmill run: '||r::text;
  select count(*) into n from public.training_logs where user_id=a and archived_at is null and sport in ('running','treadmill');
  assert n=1, 'one run in the journal, found '||n;
  r := public.titan_import_activity_v1('health_connect','se-hc-ride','cycling',now() - interval '48 minutes',44);
  assert r->>'status'='imported', 'a ride at the same hour is another effort, never merged into the run: '||r::text;
end $$;
reset role;

-- 3. Garmin pool swim of 2 000 m.
set local role service_role;
do $$
declare a uuid := current_setting('titan.se_a')::uuid; r jsonb; l record;
begin
  r := public.titan_garmin_ingest_v1('se-garmin-a', jsonb_build_object('summaryId','se-swim','activityType','LAP_SWIMMING',
        'startTimeInSeconds',floor(extract(epoch from now() - interval '5 hours')),'durationInSeconds',2700,'distanceInMeters',2000));
  assert r->>'status'='imported', 'swim imported: '||r::text;
  select unit, val into l from public.training_logs where id=(r->>'log_id')::uuid;
  assert l.unit='m' and l.val=2000, 'a watch swim is stored in metres: '||l.unit||' '||l.val;
end $$;
reset role;

-- 4. History import, then archive it in one step; another account's archive call touches nothing of A.
set local role authenticated;
do $$
declare a uuid := current_setting('titan.se_a')::uuid; b uuid := current_setting('titan.se_b')::uuid; r jsonb; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_import_history_v1(jsonb_build_array(
    jsonb_build_object('id','strava-se-1','sport','running','startedAt',(now() - interval '200 days')::text,'minutes',50,'km',10),
    jsonb_build_object('id','strava-se-2','sport','cycling','startedAt',(now() - interval '150 days')::text,'minutes',90,'km',40)));
  assert (r->>'imported')::int = 2, 'two history sessions: '||r::text;
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert public.titan_archive_imported_v1('archive') = 0, 'B archives nothing of A';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  n := public.titan_archive_imported_v1('archive');
  assert n = 2, 'the Strava history leaves the journal in one step, found '||n;
  assert (select count(*) from public.training_logs where user_id=a and archived_at is null and date < now() - interval '100 days') = 0, 'nothing of the history left';
  assert (select count(*) from public.training_logs where user_id=a and archived_at is null and sport='treadmill') = 1, 'recent sessions untouched';
end $$;
reset role;
rollback;

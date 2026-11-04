-- V11-11: ultra-distance beyond 300 km is accepted when its duration is declared and plausible; an undeclared duration, an impossible
-- average speed or more than 1000 km are refused; a session logged by duration alone (distance unknown) is accepted and never recorded as 0 km.
-- Real RPC, API role, full rollback.
begin;
do $$
declare u uuid := gen_random_uuid(); r record; ok boolean; n int;
begin
  insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  set local role authenticated;

  -- 420 km in 20 h: accepted, and its XP is time-based and capped like any other session.
  select * into r from public.titan_submit_training_session('cycling','endurance',420,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',1200), now() - interval '2 days');
  assert r.xp <= 1800, 'ultra-distance gets no extra XP';
  assert (select val from public.training_logs where id = r.log_id::uuid) = 420, 'the declared distance is kept';

  -- 300 km without a duration stays accepted (previous rule).
  select * into r from public.titan_submit_training_session('cycling','endurance',300,'km',
    jsonb_build_object('client_event_id',gen_random_uuid()), now() - interval '3 days');

  -- Beyond 300 km a duration is required.
  ok := false; begin perform public.titan_submit_training_session('cycling','endurance',420,'km', jsonb_build_object('client_event_id',gen_random_uuid()), now() - interval '4 days'); exception when others then ok := true; end;
  assert ok, '420 km without a duration is refused';
  -- More than 1000 km is refused whatever the duration.
  ok := false; begin perform public.titan_submit_training_session('cycling','endurance',1200,'km', jsonb_build_object('client_event_id',gen_random_uuid(),'duration',1440), now() - interval '5 days'); exception when others then ok := true; end;
  assert ok, '1200 km is refused';
  -- An impossible average speed is refused (600 km in one hour = 600 km/h).
  ok := false; begin perform public.titan_submit_training_session('cycling','endurance',600,'km', jsonb_build_object('client_event_id',gen_random_uuid(),'duration',60), now() - interval '6 days'); exception when others then ok := true; end;
  assert ok, '600 km in one hour is refused';
  -- ... but a very fast descent over a few minutes is not caught by the 5-minute floor.
  select * into r from public.titan_submit_training_session('alpine_skiing','outdoor',4,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',4), now() - interval '7 days');

  -- A run logged by duration alone (unit min): accepted, no distance invented.
  select * into r from public.titan_submit_training_session('running','cardio',45,'min',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',45,'extras',jsonb_build_object('distance_unknown',true)), now() - interval '8 days');
  assert (select unit from public.training_logs where id = r.log_id::uuid) = 'min', 'recorded in minutes';
  reset role;
  select count(*) into n from public.training_logs where user_id = u and unit = 'km' and val = 0;
  assert n = 0, 'no session is recorded as 0 km';
end $$;
rollback;

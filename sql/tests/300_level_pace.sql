-- V11-12: whatever a session, a GPX or a batch import contains, the server never grants a sudden jump of levels. Real RPC, API role, caps as deployed.
-- Measured on the maximum effort the XP formula can express (11 h at RPE 10 = 1890 XP requested), repeated on 7 consecutive days:
--   daily cap 1800 XP, weekly cap 9600 XP, so at most 2 levels in one event, 4 in a week from level 1, and 1 per week from level 8.
-- A 24 h session reaches the review threshold of the risk score and its reward is held (never granted blindly).
-- A batch of historical sessions (older than 30 days) grants nothing. Synthetic identities, full rollback.
begin;
do $$
declare
  lv int; u uuid; r record; day int; tot int; xp_week int; maxev int := 0;
  limits constant jsonb := '{"1":4,"2":3,"4":2,"8":1,"15":1,"30":1,"60":1}';
begin
  foreach lv in array array[1,2,4,8,15,30,60] loop
    u := gen_random_uuid();
    insert into auth.users(id,raw_user_meta_data) values (u,'{}');
    set local session_replication_role = replica;
    update public.profiles set xp = 0, level = lv where id = u;
    set local session_replication_role = origin;
    perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
    set local role authenticated;
    tot := 0; xp_week := 0;
    for day in 1..7 loop
      select * into r from public.titan_submit_training_session('yoga','mobility',660,'min',
        jsonb_build_object('client_event_id',gen_random_uuid(),'duration',660,'bio',jsonb_build_object('rpe',10)), now());
      tot := tot + r.leveled_up; xp_week := xp_week + r.xp; maxev := greatest(maxev, r.leveled_up);
      assert r.leveled_up <= 2, format('level %s day %s: %s levels in one event', lv, day, r.leveled_up);
      reset role;
      set local session_replication_role = replica;
      update public.training_logs set created_at = created_at - interval '1 day', date = date - interval '1 day' where user_id = u;
      set local session_replication_role = origin;
      set local role authenticated;
    end loop;
    reset role;
    assert xp_week <= 9600, format('level %s: %s XP in a week', lv, xp_week);
    assert tot <= (limits ->> lv::text)::int, format('level %s gained %s levels in a week (limit %s)', lv, tot, limits ->> lv::text);
  end loop;
  assert maxev <= 2 and maxev < 5, 'no event ever gives five levels';

  -- A 24 h session is held for review: no XP, no level.
  u := gen_random_uuid(); insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  set local role authenticated;
  select * into r from public.titan_submit_training_session('cycling','endurance',420,'km',
    jsonb_build_object('client_event_id',gen_random_uuid(),'duration',1440,'bio',jsonb_build_object('rpe',10)), now());
  assert r.reward_held and r.leveled_up = 0, '24 h of declared effort is held for review';

  -- A batch of thirty historical sessions grants nothing, whatever it holds.
  for day in 1..30 loop
    select * into r from public.titan_submit_training_session('running','cardio',60,'km',
      jsonb_build_object('client_event_id',gen_random_uuid(),'duration',360), now() - interval '60 days' - day * interval '1 hour');
    assert r.xp = 0 and r.leveled_up = 0, 'a historical import grants no XP and no level';
  end loop;
  reset role;
end $$;
rollback;

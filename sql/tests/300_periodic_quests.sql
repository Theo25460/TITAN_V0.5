-- V11-13 / V11-15: weekly and monthly personalised quests are a pure function of admissible history, never random, never counted twice,
-- alternatives exist for irregular or single-sport players, a claim is idempotent and grants nothing but a keepsake. Full rollback.
begin;
create function pg_temp.ins(u uuid, sp text, at timestamptz, mins numeric, extra jsonb default '{}') returns uuid language plpgsql as $$
declare id uuid := gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,client_event_id,details)
  values (id,u,sp,'cardio',mins,'min',10,at,gen_random_uuid(),
    jsonb_build_object('serverReward',true,'historical',false,'effort',jsonb_build_object('minutes',mins)) || extra);
  set local session_replication_role = origin;
  return id;
end $$;

do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  q jsonb; now1 timestamptz := timestamptz '2026-11-11 12:00+01'; now2 timestamptz := timestamptz '2026-11-04 12:00+01'; k int; wk date; lid uuid;
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(d,'{}'),(e,'{}');
  assert extract(week from date '2026-11-09')::int % 3 <> 0 and extract(week from date '2026-11-02')::int % 3 = 0, 'fixture weeks: 46 is plain, 45 is a progress week';

  -- A: three active days a week for the last weeks -> constancy of 3 days (plain week), progress in a progress week.
  for k in 1..4 loop
    wk := date '2026-11-09' - 7 * k;
    perform pg_temp.ins(a,'running', (wk::timestamp + interval '18 hours') at time zone 'Europe/Paris', 30);
    perform pg_temp.ins(a,'cycling', ((wk + 2)::timestamp + interval '18 hours') at time zone 'Europe/Paris', 30);
    perform pg_temp.ins(a,'running', ((wk + 4)::timestamp + interval '18 hours') at time zone 'Europe/Paris', 30);
  end loop;
  q := private.titan_periodic_quests(a, now1) -> 'week';
  assert q->>'kind' = 'constancy' and (q->'target'->>'days')::int = 3 and (q->'progress'->>'days')::int = 0 and not (q->>'complete')::boolean, 'usual rhythm: constancy '||q::text;
  assert q->'focus' @> '"running"'::jsonb, 'favourite sports named';
  perform pg_temp.ins(a,'running', timestamptz '2026-11-09 18:00+01', 40);
  perform pg_temp.ins(a,'running', timestamptz '2026-11-10 18:00+01', 40);
  q := private.titan_periodic_quests(a, now1) -> 'week';
  assert (q->'progress'->>'days')::int = 2 and not (q->>'complete')::boolean, 'two days of three';
  perform pg_temp.ins(a,'cycling', timestamptz '2026-11-11 08:00+01', 40);
  q := private.titan_periodic_quests(a, now1) -> 'week';
  assert (q->>'complete')::boolean, 'three days complete the quest';
  -- same history, a progress week one week earlier (the 4 prior weeks shift: only 3 weeks exist before 2026-10-26, still stable)
  q := private.titan_periodic_quests(a, now2) -> 'week';
  assert q->>'kind' = 'progress' and (q->'target'->>'minutes')::int between 90 and 150, 'stable and a progress week: reasonable minutes '||q::text;
  assert (q->'target'->>'minutes')::int <= 90 + 60, 'never more than +60 minutes';

  -- B: starter for an account with no history.
  q := private.titan_periodic_quests(b, now1) -> 'week';
  assert q->>'kind' = 'starter' and (q->'target'->>'minSessionMinutes')::int = 15, 'starter quest';
  perform pg_temp.ins(b,'yoga', timestamptz '2026-11-10 09:00+01', 10);
  assert not ((private.titan_periodic_quests(b, now1) -> 'week' ->> 'complete')::boolean), 'a 10-minute session does not finish the starter quest';
  perform pg_temp.ins(b,'yoga', timestamptz '2026-11-10 19:00+01', 20);
  assert (private.titan_periodic_quests(b, now1) -> 'week' ->> 'complete')::boolean, 'a 20-minute session does';

  -- C: return after a pause (active 3-4 weeks ago, nothing for two weeks).
  perform pg_temp.ins(c,'running', timestamptz '2026-10-14 18:00+02', 30);
  perform pg_temp.ins(c,'running', timestamptz '2026-10-21 18:00+02', 30);
  q := private.titan_periodic_quests(c, now1) -> 'week';
  assert q->>'kind' = 'return' and (q->'target'->>'minSessionMinutes')::int = 20, 'return quest: '||q::text;

  -- D: inadmissible sessions never count (quest of the starter kind, one session of 30 minutes each time).
  perform pg_temp.ins(d,'running', timestamptz '2026-11-10 10:00+01', 30, '{"historical":true}');
  perform pg_temp.ins(d,'running', timestamptz '2026-11-10 11:00+01', 30, '{"serverReward":false}');
  lid := pg_temp.ins(d,'running', timestamptz '2026-11-10 12:00+01', 30);
  set local session_replication_role = replica; update public.training_logs set archived_at = now() where training_logs.id = lid; set local session_replication_role = origin;
  lid := pg_temp.ins(d,'running', timestamptz '2026-11-10 13:00+01', 30);
  set local session_replication_role = replica; update public.training_logs set is_suspicious = true where training_logs.id = lid; set local session_replication_role = origin;
  lid := pg_temp.ins(d,'running', timestamptz '2026-11-10 14:00+01', 30);
  set local session_replication_role = replica; update public.training_logs set status = 'flagged' where training_logs.id = lid; set local session_replication_role = origin;
  lid := pg_temp.ins(d,'running', timestamptz '2026-11-10 15:00+01', 30);
  insert into private.titan_reward_holds(log_id,user_id,xp,credits,release_at) values (lid,d,10,1,now()+interval '1 day');
  assert (private.titan_periodic_quests(d, now1) -> 'week' -> 'progress' ->> 'sessions')::int = 0, 'unconfirmed, historical, archived, suspicious, flagged and held sessions do not count';
  perform pg_temp.ins(d,'running', timestamptz '2026-11-10 16:00+01', 30);
  assert (private.titan_periodic_quests(d, now1) -> 'week' -> 'progress' ->> 'sessions')::int = 1, 'an admissible one does';
  -- Another account never counts for this one.
  assert (private.titan_periodic_quests(e, now1) -> 'week' -> 'progress' ->> 'sessions')::int = 0, 'isolation between accounts';

  -- MONTH: three sports practised every month -> multisport of 3 among the sports already practised.
  for k in 1..3 loop
    wk := (date '2026-11-01' - make_interval(months => k))::date;
    perform pg_temp.ins(a,'swimming', ((wk + 3)::timestamp + interval '18 hours') at time zone 'Europe/Paris', 30);
    perform pg_temp.ins(a,'running', ((wk + 5)::timestamp + interval '18 hours') at time zone 'Europe/Paris', 30);
    perform pg_temp.ins(a,'cycling', ((wk + 7)::timestamp + interval '18 hours') at time zone 'Europe/Paris', 30);
  end loop;
  q := private.titan_periodic_quests(a, timestamptz '2026-11-18 12:00+01') -> 'month';
  assert q->>'kind' = 'multisport' and (q->'target'->>'sports')::int = 3, 'multisport month '||q::text;
  perform pg_temp.ins(a,'running', timestamptz '2026-11-12 18:00+01', 30);
  perform pg_temp.ins(a,'cycling', timestamptz '2026-11-13 18:00+01', 30);
  q := private.titan_periodic_quests(a, timestamptz '2026-11-18 12:00+01') -> 'month';
  assert (q->'progress'->>'sports')::int = 2 and not (q->>'complete')::boolean, 'running and cycling this month so far';
  perform pg_temp.ins(a,'swimming', timestamptz '2026-11-17 18:00+01', 30);
  assert (private.titan_periodic_quests(a, timestamptz '2026-11-18 12:00+01') -> 'month' ->> 'complete')::boolean, 'a third sport already practised completes it';

  -- A single-sport player gets the regularity alternative, not a sport to discover.
  q := private.titan_periodic_quests(c, now1) -> 'month';
  assert q->>'kind' = 'regularity' and (q->'target'->>'days')::int between 4 and 12, 'single sport: regularity '||q::text;
  q := private.titan_periodic_quests(b, now1) -> 'month';
  assert q->>'kind' = 'regularity', 'no history: regularity';
end $$;

-- Claims: real RPCs with API roles; idempotent, incomplete refused, nothing granted.
do $$
declare u uuid := gen_random_uuid(); q jsonb; xp0 int; ok boolean; n int;
begin
  insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  select xp into xp0 from public.profiles where id = u;
  perform set_config('titan.pq_u', u::text, true);
  perform pg_temp.ins(u,'yoga', now(), 30);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  q := public.titan_periodic_quests_v1();
  assert q->'week'->>'kind' = 'starter' and (q->'week'->>'complete')::boolean and not (q->'week'->>'claimed')::boolean, 'week quest ready to claim';
  ok := false; begin perform public.titan_periodic_quest_claim_v1('month'); exception when others then ok := sqlerrm = 'QUEST_INCOMPLETE'; end; assert ok, 'an unfinished month cannot be claimed';
  ok := false; begin perform public.titan_periodic_quest_claim_v1('year'); exception when others then ok := sqlerrm = 'INVALID_SCOPE'; end; assert ok, 'unknown scope';
  q := public.titan_periodic_quest_claim_v1('week');
  assert (q->'week'->>'claimed')::boolean and (q->'souvenirs'->>'weeks')::int = 1, 'claimed once';
  q := public.titan_periodic_quest_claim_v1('week');
  assert (q->'souvenirs'->>'weeks')::int = 1, 'a second claim changes nothing';
  reset role;
  select count(*) into n from private.titan_periodic_quest_claims where user_id = u; assert n = 1, 'one claim row';
  assert (select xp from public.profiles where id = u) is not distinct from xp0, 'a claim grants no XP';
  -- API closure.
  set local role authenticated;
  ok := false; begin perform 1 from private.titan_periodic_quest_claims; exception when insufficient_privilege then ok := true; end; assert ok, 'claims table closed to the API';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  reset role; set local role anon;
  ok := false; begin perform public.titan_periodic_quests_v1(); exception when others then ok := true; end; assert ok, 'anonymous cannot read quests';
  ok := false; begin perform public.titan_periodic_quest_claim_v1('week'); exception when others then ok := true; end; assert ok, 'anonymous cannot claim';
  reset role;
end $$;
rollback;

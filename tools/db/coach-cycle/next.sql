-- V1.9.5: the coach prepares the next cycle from the published report, and keeps the transaction open 1.5 s.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cy_ids where k = 'c'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, r->>'ok' as ok, r->>'already' as already, r#>>'{plan,goals,0}' as goal
  from (select public.titan_coach_cycle_v1('next', jsonb_build_object('id', (select v from public.cy_ids where k = 'r'))) r) x;
select pg_sleep(1.5);
commit;

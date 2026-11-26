-- V1.9.5: Inès validates the proposed report with the op_id given (:op) on the reading stored, and keeps the transaction open 1.5 s.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cy_ids where k = 'a'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, r->>'ok' as ok, r->>'already' as already, r->>'version' as version
  from (select public.titan_coach_cycle_v1('validate', jsonb_build_object('id', (select v from public.cy_ids where k = 'r'), 'preview_key', (select v from public.cy_ids where k = 'k'),
          'op_id', (select v from public.cy_ids where k = :'op'), 'decisions', '[{"key":"d1","answer":"approve"}]'::jsonb)) r) x;
select pg_sleep(1.5);
commit;

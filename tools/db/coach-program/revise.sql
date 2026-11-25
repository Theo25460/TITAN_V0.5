-- V1.9.4: the coach applies the previewed week-2 shift with the op_id given (:op), and keeps the transaction open 1.5 s.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cp_ids where k = 'c'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, r->>'ok' as ok, r->>'already' as already, r->>'version' as version
  from (select public.titan_coach_program_v1('revise', jsonb_build_object('id', (select v from public.cp_ids where k = 'p'), 'scope', 'week', 'week', 2, 'shift_days', 1,
          'preview_key', (select v from public.cp_ids where k = 'k'), 'op_id', (select v from public.cp_ids where k = :'op'))) r) x;
select pg_sleep(1.5);
commit;

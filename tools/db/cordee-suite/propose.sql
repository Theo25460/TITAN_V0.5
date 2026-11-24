-- V1.8.3: one member proposes the Marées, douce, 14 days, and keeps the transaction open 1.5 s (psql -v who=b|c).
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cs_ids where k = :'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, (x->>'canonical') || '|' || (x->>'status') as result
  from (select public.titan_cordee_suite_v1((select v from public.cs_ids where k = 'id'), 'propose', null, 'marees', 'douce', 14) as x) y;
select pg_sleep(1.5);
commit;

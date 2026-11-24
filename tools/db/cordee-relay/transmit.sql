-- V1.8.1: one member transmits and keeps the transaction open 1.5 s (psql -v who=a|b).
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cc_ids where k = :'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, public.titan_cordee_relay_v1((select v from public.cc_ids where k = 'id'), 'transmit')->>'changed' as changed;
select pg_sleep(1.5);
commit;

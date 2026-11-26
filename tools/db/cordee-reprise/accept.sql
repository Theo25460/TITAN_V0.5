-- V1.8.2: one member accepts the open handover and keeps the transaction open 1.5 s (psql -v who=c|d).
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cr_ids where k = :'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, public.titan_cordee_relay_turn_v1((select v from public.cr_ids where k = 'id'), 'accept')->>'changed' as changed;
select pg_sleep(1.5);
commit;

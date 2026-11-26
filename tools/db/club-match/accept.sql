-- V1.8.5: one administrator accepts the proposal for their club (psql -v who=a|b -v hold=seconds) and keeps the transaction open.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cmt_ids where k = :'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, :'who' || '|' || (x->'current'->>'phase')
  from (select public.titan_club_match_act_v1((select v from public.cmt_ids where k = 'c' || :'who'), 'accept', p_match => (select v from public.cmt_ids where k = 'match')) as x) y;
select clock_timestamp() as t1;
select pg_sleep(:hold);
commit;

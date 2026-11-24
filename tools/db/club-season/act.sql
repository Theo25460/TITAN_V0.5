-- V1.8.4: one account acts on the club's season (psql -v who=j|o -v action=join|stop -v hold=seconds) and keeps its transaction open.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.csn_ids where k = :'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, :'action' || '|' || coalesce(x->'current'->>'participants', x->'last'->>'phase' || ':' || (x->'last'->>'participants'))
  from (select public.titan_club_season_act_v1((select v from public.csn_ids where k = 'club'), :'action') as x) y;
select clock_timestamp() as t1;
select pg_sleep(:hold);
commit;

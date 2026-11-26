-- V1.8.6: one account answers « yes » to the meeting (psql -v who=j|k -v hold=seconds) and keeps its transaction open.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cag_ids where k = :'who'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, :'who' || '|' || (x->'me'->>'answer') || '|' || (x->'counts'->>'yes')
  from (select y from jsonb_array_elements(public.titan_club_agenda_act_v1((select v from public.cag_ids where k = 'club'), 'answer',
          (select v from public.cag_ids where k = 'slot'), p_answer => 'yes')->'upcoming') y) z(x);
select clock_timestamp() as t1;
select pg_sleep(:hold);
commit;

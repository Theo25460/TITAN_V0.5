-- V1.9.1: Inès links (psql -v p=p1|p2 -v t=t1|t2) and keeps the transaction open 1.5 s.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cf_ids where k = 'a'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, r->>'ok' as ok, coalesce(r->>'code', '-') as code
  from (select public.titan_coach_followup_v1('link', jsonb_build_object('id', (select v from public.cf_ids where k = :'p'), 'revision', 2, 'session_id', (select v from public.cf_ids where k = :'t'))) r) x;
select pg_sleep(1.5);
commit;

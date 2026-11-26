-- V1.9.3: the coach sends the prepared draft (revision 1) and keeps the transaction open 1.5 s, as a slow network would.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.cr_ids where k = 'c'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, r->>'ok' as ok, r->>'already' as already, r#>>'{assignment,id}' as assignment
  from (select public.titan_coach_review_v1('send', jsonb_build_object('id', (select v from public.cr_ids where k = 'd'), 'revision', 1)) r) x;
select pg_sleep(1.5);
commit;

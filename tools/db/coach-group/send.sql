-- V1.9.6: Lou sends the block with the op_id given (:op) on the preview stored, and keeps the transaction open 1.5 s.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select v from public.gr_ids where k = 'c'), 'role', 'authenticated')::text, true);
set local role authenticated;
\set ON_ERROR_STOP 0
select clock_timestamp() as t0, r->>'ok' as ok, r->>'already' as already, (select count(*) from jsonb_array_elements(r->'results') e where e->>'status' = 'sent') as sent
  from (select public.titan_coach_group_v1('send', jsonb_build_object('id', (select v from public.gr_ids where k = 'd'), 'preview_key', (select v from public.gr_ids where k = 'k'),
          'op_id', (select v from public.gr_ids where k = :'op'))) r) x;
select pg_sleep(1.5);
commit;

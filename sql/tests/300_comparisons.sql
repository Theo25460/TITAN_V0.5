-- Personal comparisons: synthetic owners, transaction rollback, no production data.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  monday date := date_trunc('week', timezone('Europe/Paris', now()))::date;
begin
  perform set_config('titan.compare_a', a::text, true);
  perform set_config('titan.compare_b', b::text, true);
  perform set_config('titan.compare_c', c::text, true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}');
  insert into public.profiles(id,username,is_elite) values(a,'qa_compare',true),(b,'qa_compare_free',false),(c,'qa_compare_calendar',true)
  on conflict(id) do update set is_elite=excluded.is_elite;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  -- One flagged session is still in its owner's private journal. Forged effort is ignored.
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at,status,is_suspicious)
    select a,'running','cardio',5,'km',0,((monday-7+i)::timestamp+interval '12 hours') at time zone 'Europe/Paris',
      '{"val2":30,"effort":{"minutes":9999},"note":"PRIVATE_NOTE","bio":{"weight":71}}',gen_random_uuid(),now(),case when i=0 then 'flagged' else 'valid' end,i=0 from generate_series(0,5) i;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at,archived_at) values
    (a,'running','cardio',10,'km',0,((monday-35)::timestamp+interval '12 hours') at time zone 'Europe/Paris','{"val2":60}',gen_random_uuid(),now(),null),
    (a,'yoga','mobility',20,'min',0,((monday-7)::timestamp+interval '12 hours') at time zone 'Europe/Paris','{}',gen_random_uuid(),now(),null),
    (a,'running','cardio',5,'km',0,((monday-7)::timestamp+interval '13 hours') at time zone 'Europe/Paris','{"val2":100}',gen_random_uuid(),now(),now()),
    (a,'running','cardio',5,'km',0,monday::timestamp at time zone 'Europe/Paris','{"val2":100}',gen_random_uuid(),now(),null),
    (b,'running','cardio',5,'km',0,((monday-7)::timestamp+interval '12 hours') at time zone 'Europe/Paris','{"val2":900}',gen_random_uuid(),now(),null);
  -- 52 Sunday-night sessions: every bucket must keep exactly one across both DST transitions.
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at)
    select c,'yoga','mobility',10,'min',0,((monday-7*k+6)::timestamp+interval '23 hours 30 minutes') at time zone 'Europe/Paris', '{}',gen_random_uuid(),((monday-7*k+6)::timestamp+interval '23 hours 30 minutes') at time zone 'Europe/Paris' from generate_series(1,52) k;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.compare_a'),'role','authenticated')::text,true);
do $$
declare j jsonb; n int; s jsonb;
begin
  assert to_regprocedure('public.titan_compare_periods(integer,text,text)') is not null, 'comparison RPC must exist';
  j:=public.titan_compare_periods(4,null,'Europe/Paris');
  assert (j->>'available')::boolean and j->>'owner'=current_setting('titan.compare_a'), 'server owns entitlement and owner';
  assert j->'recent'->>'sessions'='7' and (j->'recent'->>'minutes')::numeric=200, 'all own unarchived sessions, duration recalculated: '||(j->'recent')::text;
  assert j->'recent'->>'active_days'='6', 'same day across sports counted once';
  assert j->'previous'->>'sessions'='1' and (j->'previous'->>'minutes')::numeric=60, 'previous equal period';
  assert j->'previous'->>'to'=j->'recent'->>'from', 'adjacent half-open periods';
  assert jsonb_array_length(j->'recent'->'series')=4 and jsonb_array_length(j->'recent'->'sources')=5, 'all buckets, bounded examples';
  assert j::text not like '%PRIVATE_NOTE%' and j::text not like '%weight%' and j::text not like '%9999%', 'no private details or client effort';
  for s in select value from jsonb_array_elements(j->'recent'->'sources') loop
    select count(*) into n from public.training_logs where id=(s->>'id')::uuid and user_id=auth.uid() and archived_at is null;
    assert n=1, 'source resolves to own live journal';
  end loop;
  j:=public.titan_compare_periods(4,'running','Europe/Paris');
  assert j->'recent'->>'sessions'='6' and (j->'recent'->>'minutes')::numeric=180, 'sport filter';
  assert j->'recent'->>'estimated_sessions'='0', 'declared duration not estimated';
  j:=public.titan_compare_periods(4,'bouldering','Europe/Paris');
  assert j->'recent'->>'sessions'='0' and j->'previous'->>'sessions'='0', 'empty means zero, no invented result';
  j:=public.titan_compare_periods(12,null,'UTC');
  assert jsonb_array_length(j->'recent'->'series')=12, '12-week choice';
  begin perform public.titan_compare_periods(5,null,'UTC'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_COMPARISON_OPTIONS'; end;
  begin perform public.titan_compare_periods(4,'missing_sport','UTC'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_COMPARISON_OPTIONS'; end;
  begin perform public.titan_compare_periods(4,null,'Fake/Timezone'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_COMPARISON_OPTIONS'; end;
  begin perform public.titan_compare_periods(null,null,'UTC'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_COMPARISON_OPTIONS'; end;
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.compare_c'),'role','authenticated')::text,true);
do $$
declare j jsonb; s jsonb;
begin
  j:=public.titan_compare_periods(26,null,'Europe/Paris');
  assert j->'recent'->>'sessions'='26' and j->'previous'->>'sessions'='26', '52 Sundays across DST';
  for s in select value from jsonb_array_elements((j->'recent'->'series')||(j->'previous'->'series')) loop
    assert (s->>'to')::date-(s->>'from')::date=7 and s->>'sessions'='1', 'calendar bucket includes late Sunday';
  end loop;
end $$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.compare_b'),'role','authenticated')::text,true);
do $$ declare j jsonb; begin
  j:=public.titan_compare_periods();
  assert not (j->>'available')::boolean and j->>'reason'='premium_required' and not(j?'recent'), 'Free cannot request paid aggregates';
  update public.profiles set is_elite=true where id=auth.uid();
  j:=public.titan_compare_periods();
  assert not (j->>'available')::boolean, 'direct owner profile spoof cannot unlock';
end $$;

reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=now()-interval '1 second' where id=current_setting('titan.compare_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.compare_a'),'role','authenticated')::text,true);
do $$ begin assert not(public.titan_compare_periods()->>'available')::boolean, 'expired true flag is refused'; end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=null,elite_refunded_at=now() where id=current_setting('titan.compare_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.compare_a'),'role','authenticated')::text,true);
do $$ begin assert not(public.titan_compare_periods()->>'available')::boolean, 'refund true flag is refused'; end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_refunded_at=null,is_suspended=true where id=current_setting('titan.compare_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.compare_a'),'role','authenticated')::text,true);
do $$ begin assert not(public.titan_compare_periods()->>'available')::boolean, 'suspended true flag is refused'; end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin perform public.titan_compare_periods(); assert false; exception when insufficient_privilege then assert sqlerrm='AUTH_REQUIRED'; end;
end $$;
reset role;
do $$ declare p record; begin
  select * into p from pg_proc where oid='public.titan_compare_periods(integer,text,text)'::regprocedure;
  assert not p.prosecdef and p.provolatile='s' and 'search_path=""'=any(p.proconfig), 'invoker, stable, empty path';
  assert not has_function_privilege('anon',p.oid,'EXECUTE'), 'anonymous execution closed';
  assert has_function_privilege('authenticated',p.oid,'EXECUTE'), 'authenticated execution granted';
end $$;
rollback;

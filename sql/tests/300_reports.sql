-- Read-only personal reports, synthetic fixtures, rollback. Never applied to production.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  m date:=(date_trunc('month',timezone('Europe/Paris',now()))-interval '1 month')::date;
  y date:=(date_trunc('year',timezone('Europe/Paris',now()))-interval '1 year')::date;
begin
  perform set_config('titan.report_a',a::text,true); perform set_config('titan.report_b',b::text,true);
  perform set_config('titan.report_c',c::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}');
  insert into public.profiles(id,username,is_elite) values(a,'qa_report',true),(b,'qa_report_free',false),(c,'qa_report_calendar',true)
  on conflict(id) do update set is_elite=excluded.is_elite;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at,status,is_suspicious)
    select a,'running','cardio',5,'km',0,((m+i)::timestamp+interval '12 hours') at time zone 'Europe/Paris',
      case when i=5 then '{}'::jsonb else '{"val2":30,"effort":{"minutes":9999},"note":"PRIVATE_NOTE","bio":{"weight":71}}'::jsonb end,gen_random_uuid(),
      ((m+i)::timestamp+interval '12 hours') at time zone 'Europe/Paris',case when i=0 then 'flagged' else 'valid' end,i=0 from generate_series(0,5) i;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at,archived_at) values
    (a,'yoga','mobility',20,'min',0,(m::timestamp+interval '13 hours') at time zone 'Europe/Paris','{}',gen_random_uuid(),m::timestamp,null),
    (a,'running','cardio',5,'km',0,(m::timestamp+interval '14 hours') at time zone 'Europe/Paris','{"val2":100}',gen_random_uuid(),m::timestamp,now()),
    -- The ingestion guard allows a ten-minute clock skew; reports still exclude future dates.
    (a,'running','cardio',5,'km',0,now()+interval '1 minute','{"val2":100}',gen_random_uuid(),now(),null),
    (b,'running','cardio',5,'km',0,(m::timestamp+interval '12 hours') at time zone 'Europe/Paris','{"val2":900}',gen_random_uuid(),m::timestamp,null);
  -- Exactly one late local session in each prior-year month, including the two DST changes.
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,client_event_id,created_at)
    select c,'yoga','mobility',10,'min',0,
      (y::timestamp+(k+1)*interval '1 month'-interval '1 day'+interval '23 hours 30 minutes') at time zone 'Europe/Paris',
      '{}',gen_random_uuid(),y::timestamp+k*interval '1 month' from generate_series(0,11) k;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.report_a'),'role','authenticated')::text,true);
do $$ declare j jsonb; s jsonb; days int; n int; before_count int; begin
  assert to_regprocedure('public.titan_practice_report(text,integer,text)') is not null,'report RPC must exist';
  select count(*) into before_count from public.training_logs;
  j:=public.titan_practice_report('month',1,'Europe/Paris');
  assert j->>'owner'=auth.uid()::text and (j->>'available')::boolean,'fresh server entitlement and own identity';
  assert j->>'sessions'='7' and j->>'active_days'='6' and (j->>'minutes')::numeric=200,'private, unarchived, recalculated multisport volume';
  assert not(j->>'current')::boolean and j->>'estimated_sessions'='1','closed month and explicitly estimated duration';
  days:=(j->>'to')::date-(j->>'from')::date;
  assert days in (28,29,30,31) and jsonb_array_length(j->'series')=days,'every actual calendar day';
  assert jsonb_array_length(j->'sports')=2 and jsonb_array_length(j->'sources')=5,'full breakdown, bounded sources';
  assert (select sum((value->>'active_days')::int) from jsonb_array_elements(j->'sports'))=7,'same day is shared across sports, not summed in total';
  assert j::text not like '%PRIVATE_NOTE%' and j::text not like '%weight%' and j::text not like '%9999%','no sensitive details or forged effort';
  for s in select value from jsonb_array_elements(j->'sources') loop
    select count(*) into n from public.training_logs where id=(s->>'id')::uuid and user_id=auth.uid() and archived_at is null;
    assert n=1,'all sources resolve to own live journal';
  end loop;
  for s in select value from jsonb_array_elements(j->'series') loop
    assert (s->>'to')::date-(s->>'from')::date=1,'local day, including daylight saving';
  end loop;
  j:=public.titan_practice_report('month',0,'Europe/Paris');
  assert (j->>'current')::boolean and j->>'sessions'='0','future session excluded from provisional month';
  assert jsonb_array_length(j->'series')=extract(day from timezone('Europe/Paris',now()))::int,'no future day presented as observed';
  j:=public.titan_practice_report('year',0,'Europe/Paris');
  assert jsonb_array_length(j->'series')=extract(month from timezone('Europe/Paris',now()))::int,'only elapsed calendar months';
  assert (j->>'sessions')::int=case when extract(month from timezone('Europe/Paris',now()))=1 then 0 else 7 end,'provisional year also excludes archives and future';
  select count(*) into n from public.training_logs;
  assert n=before_count,'reading report mutates no sessions';
  begin perform public.titan_practice_report('week',0,'UTC'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_REPORT_OPTIONS'; end;
  begin perform public.titan_practice_report('year',2,'UTC'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_REPORT_OPTIONS'; end;
  begin perform public.titan_practice_report('month',0,'Fake/Zone'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_REPORT_OPTIONS'; end;
  begin perform public.titan_practice_report(null,0,'UTC'); assert false; exception when invalid_parameter_value then assert sqlerrm='INVALID_REPORT_OPTIONS'; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.report_c'),'role','authenticated')::text,true);
do $$ declare j jsonb; s jsonb; begin
  j:=public.titan_practice_report('year',1,'Europe/Paris');
  assert j->>'sessions'='12' and j->>'active_days'='12' and (j->>'minutes')::numeric=120,'late month ends across DST retained';
  assert jsonb_array_length(j->'series')=12,'twelve complete calendar months';
  for s in select value from jsonb_array_elements(j->'series') loop
    assert s->>'sessions'='1' and extract(day from (s->>'from')::date)=1 and extract(day from (s->>'to')::date)=1,'month boundary includes last evening';
  end loop;
  if j->>'from'='2024-01-01' then
    assert j->'series'->1->>'from'='2024-02-01' and j->'series'->1->>'to'='2024-03-01','leap February is a real calendar month';
  end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.report_b'),'role','authenticated')::text,true);
do $$ declare j jsonb; begin
  j:=public.titan_practice_report();
  assert not(j->>'available')::boolean and j->>'reason'='premium_required' and not(j?'sessions'),'Free has no paid aggregates';
  update public.profiles set is_elite=true where id=auth.uid();
  assert not(public.titan_practice_report()->>'available')::boolean,'client owner profile spoof cannot unlock';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=now()-interval '1 second' where id=current_setting('titan.report_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.report_a'),'role','authenticated')::text,true);
do $$ begin assert not(public.titan_practice_report()->>'available')::boolean,'expired true flag refused'; end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=null,elite_refunded_at=now() where id=current_setting('titan.report_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.report_a'),'role','authenticated')::text,true);
do $$ begin assert not(public.titan_practice_report()->>'available')::boolean,'refund true flag refused'; end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_refunded_at=null,is_suspended=true where id=current_setting('titan.report_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.report_a'),'role','authenticated')::text,true);
do $$ begin assert not(public.titan_practice_report()->>'available')::boolean,'suspended true flag refused'; end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin begin perform public.titan_practice_report(); assert false; exception when insufficient_privilege then assert sqlerrm='AUTH_REQUIRED'; end; end $$;
reset role;
do $$ declare p record; begin
  select * into p from pg_proc where oid='public.titan_practice_report(text,integer,text)'::regprocedure;
  assert not p.prosecdef and p.provolatile='s' and 'search_path=""'=any(p.proconfig),'stable invoker, empty path';
  assert not has_function_privilege('anon',p.oid,'EXECUTE') and has_function_privilege('authenticated',p.oid,'EXECUTE'),'narrow privileges';
end $$;
rollback;

-- QA03: real server contracts, synthetic identities, full rollback. No rule changes.
begin;
set local plpgsql.check_asserts = on;

-- Keep the call under the caller's role. A successful unexpected call must fail the test.
create function pg_temp.training_expect_error(label text, value numeric, unit text,
  details jsonb, stamp timestamptz, expected_state text, expected_message text)
returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin
    perform public.titan_submit_training_session('running','cardio',value,unit,
      details || jsonb_build_object('client_event_id',gen_random_uuid()),stamp);
  exception when others then
    caught := true;
    assert sqlstate = expected_state and sqlerrm = expected_message,
      label || ': unexpected ' || sqlstate || '/' || sqlerrm;
  end;
  assert caught, label || ': server accepted a rejected request';
end $$;

do $$
declare u uuid := gen_random_uuid();
begin
  perform set_config('titan.qa_anticheat',u::text,true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set xp=0,credits=0,level=1 where id=u;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_anticheat'),'role','authenticated')::text,true);

-- Public RPC validation and the deeper row trigger must both reject, with exact errors.
select pg_temp.training_expect_error('zero',0,'km','{}',now(),'22023','TRAINING_VALUE_OUT_OF_RANGE');
select pg_temp.training_expect_error('negative',-1,'km','{}',now(),'22023','TRAINING_VALUE_OUT_OF_RANGE');
select pg_temp.training_expect_error('value above maximum',300001,'reps','{}',now(),'22023','TRAINING_VALUE_OUT_OF_RANGE');
select pg_temp.training_expect_error('missing value',null,'km','{}',now(),'22023','TRAINING_VALUE_OUT_OF_RANGE');
select pg_temp.training_expect_error('missing date',5,'km','{}',null,'22023','TRAINING_DATE_REQUIRED');
select pg_temp.training_expect_error('future beyond tolerance',5,'km','{}',now()+interval '10 minutes 1 second','22023','TRAINING_DATE_OUT_OF_RANGE');
select pg_temp.training_expect_error('before date floor',5,'km','{}',timestamptz '1989-12-31 23:59:59+00','22023','TRAINING_DATE_OUT_OF_RANGE');
select pg_temp.training_expect_error('minutes above day',1441,'min','{}',now(),'22023','TRAINING_DURATION_OUT_OF_RANGE');
select pg_temp.training_expect_error('duration above day',5,'km','{"duration":1441}',now(),'22023','TRAINING_DURATION_OUT_OF_RANGE');
select pg_temp.training_expect_error('secondary duration above day',5,'km','{"val2":1441}',now(),'22023','TRAINING_DURATION_OUT_OF_RANGE');
select pg_temp.training_expect_error('negative duration',5,'km','{"duration":-1}',now(),'23514','TRAINING_REJECTED');
select pg_temp.training_expect_error('distance above trigger bound',301,'km','{}',now(),'23514','TRAINING_REJECTED');
select pg_temp.training_expect_error('details distance above bound',5,'reps','{"distance":301}',now(),'23514','TRAINING_REJECTED');
select pg_temp.training_expect_error('elevation above bound',5,'km','{"elevation":12001}',now(),'23514','TRAINING_REJECTED');
select pg_temp.training_expect_error('nonobject diagnostics',5,'km','[]',now(),'22023','TRAINING_DETAILS_INVALID');
select pg_temp.training_expect_error('RPC oversized diagnostics',5,'km',jsonb_build_object('note',repeat('x',100001)),now(),'22023','TRAINING_DETAILS_INVALID');
select pg_temp.training_expect_error('trigger oversized diagnostics',5,'km',jsonb_build_object('note',repeat('x',51000)),now(),'23514','TRAINING_REJECTED');
select pg_temp.training_expect_error('too many GPS points',5,'km',jsonb_build_object('gpxPath',(select jsonb_agg(0) from generate_series(1,1201))),now(),'23514','TRAINING_REJECTED');
reset role;
-- A trigger error rolls back earlier weekly-cap work in the RPC as well as the log.
do $$
declare u uuid := current_setting('titan.qa_anticheat')::uuid;
begin
  assert not exists(select 1 from public.training_logs where user_id=u),'rejected requests created no session';
  assert not exists(select 1 from public.training_receipts where user_id=u),'rejected requests created no receipt';
  assert not exists(select 1 from public.titan_weekly_reward_usage where user_id=u),'rejected requests consumed no weekly allowance';
  assert (select xp=0 and credits=0 and level=1 from public.profiles where id=u),'rejected requests changed no balance';
end $$;

-- Each accepted case has its own owner: frequency limits cannot hide a boundary failure.
do $$
declare c record; u uuid; r record; n integer:=0;
begin
  for c in select * from (values
    ('normal run',5::numeric,'km','{"duration":30}'::jsonb,now()-interval '1 hour',false),
    ('distance boundary',300,'km','{"duration":90}',now()-interval '1 hour',false),
    ('duration boundary',1440,'min','{}',now()-interval '1 hour',false),
    ('value boundary',300000,'reps','{}',now()-interval '1 hour',false),
    ('elevation boundary',5,'km','{"elevation":12000}',now()-interval '1 hour',false),
    ('date tolerance boundary',5,'km','{}',now()+interval '10 minutes',false),
    ('old import at date floor',5,'km','{}',timestamptz '1990-01-01 00:00:00+00',true),
    ('unmeasured atypical metric',20,'moves','{}',now()-interval '1 hour',false),
    ('GPS point boundary',5,'km',jsonb_build_object('gpxPath',(select jsonb_agg(0) from generate_series(1,1200))),now()-interval '1 hour',false)
  ) as cases(label,value,unit,details,stamp,historical) loop
    u:=gen_random_uuid();
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    insert into auth.users(id,raw_user_meta_data) values(u,'{}');
    update public.profiles set xp=0,credits=0,level=1 where id=u;
    perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select * into r from public.titan_submit_training_session('running','cardio',c.value,c.unit,
      c.details || jsonb_build_object('client_event_id',gen_random_uuid()),c.stamp);
    execute 'reset role';
    assert r.log_id is not null,c.label || ': accepted session missing';
    assert (select count(*)=1 from public.training_logs where user_id=u),c.label || ': exactly one session';
    assert (select count(*)=1 from public.training_receipts where user_id=u),c.label || ': exactly one receipt';
    if c.historical then
      assert r.xp=0 and r.credits=0,c.label || ': history has no reward';
      assert (select xp=0 and credits=0 and level=1 from public.profiles where id=u),c.label || ': historical persisted balance unchanged';
      assert (select xp=0 from public.training_logs where user_id=u),c.label || ': historical persisted log XP is zero';
      assert (select (details->>'historical')::boolean and not (details->>'rewardEligible')::boolean from public.training_logs where user_id=u),'history marked ineligible';
    end if;
    n:=n+1;
  end loop;
  raise notice 'QA03: % accepted boundary cases passed',n;
end $$;

-- Actual created_at windows, not user-supplied training dates. Independent owners.
do $$
declare c record; u uuid; i integer; r record; before_usage jsonb; after_usage jsonb;
begin
  for c in select * from (values
    ('hour limit',12,now()-interval '10 minutes',false,now(),true),
    ('day limit',40,now()-interval '2 hours',false,now(),true),
    ('history import limit',300,now()-interval '10 minutes',true,now()-interval '45 days',true),
    ('hour review threshold',6,now()-interval '10 minutes',false,now(),false),
    ('day review threshold',20,now()-interval '2 hours',false,now(),false)
  ) as cases(label,n,created,historical,stamp,rejected) loop
    u:=gen_random_uuid();
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    insert into auth.users(id,raw_user_meta_data) values(u,'{}');
    update public.profiles set xp=0,credits=0,level=1 where id=u;
    for i in 1..c.n loop
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,created_at,details)
        values(u,'yoga','mobility',30,'min',0,c.stamp,c.created,jsonb_build_object('historical',c.historical));
    end loop;
    select coalesce(jsonb_agg(to_jsonb(w)),'[]') into before_usage from public.titan_weekly_reward_usage w where user_id=u;
    perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if c.rejected then
      perform pg_temp.training_expect_error(c.label,30,'min','{}',c.stamp,'23514','TRAINING_RATE_LIMIT');
    else
      select * into r from public.titan_submit_training_session('yoga','mobility',30,'min',
        jsonb_build_object('client_event_id',gen_random_uuid()),c.stamp);
    end if;
    execute 'reset role';
    if not c.rejected then
      assert r.log_id is not null,c.label || ': flagged request still accepted';
      assert (select count(*)=c.n+1 from public.training_logs where user_id=u),c.label || ': one new session';
      assert (select count(*)=1 from public.training_receipts where user_id=u),c.label || ': receipt preserved';
      assert (select count(*)=1 from public.titan_suspicious_actions where user_id=u and reason='TRAINING_FREQUENCY_HIGH' and action_type='training_log.flagged'),c.label || ': review signal logged';
      continue;
    end if;
    assert (select count(*)=c.n from public.training_logs where user_id=u),c.label || ': no extra session';
    assert not exists(select 1 from public.training_receipts where user_id=u),c.label || ': no receipt';
    select coalesce(jsonb_agg(to_jsonb(w)),'[]') into after_usage from public.titan_weekly_reward_usage w where user_id=u;
    assert after_usage=before_usage,c.label || ': no weekly allowance consumed';
    assert (select xp=0 and credits=0 and level=1 from public.profiles where id=u),c.label || ': no reward';
  end loop;
  raise notice 'QA03: hour/day/history limits and rollback passed';
end $$;
rollback;

-- QA03/SEC10: untrusted reward metadata, failed-then-corrected events, and import isolation.
-- Real RPC with API role; synthetic identities and full rollback. No production DDL.
begin;
set local plpgsql.check_asserts = on;

-- Forged metadata is replaced by canonical server fields, not trusted for rewards.
do $$
declare u uuid; h boolean; r record; d jsonb; log_record public.training_logs%rowtype;
  stamp timestamptz; ev uuid; expected_xp integer; expected_credits integer;
begin
  foreach h in array array[false,true] loop
    u:=gen_random_uuid(); ev:=gen_random_uuid();
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    insert into auth.users(id,raw_user_meta_data) values(u,'{}');
    update public.profiles set xp=0,credits=0,level=1 where id=u;
    stamp:=now()-case when h then interval '45 days' else interval '1 hour' end;
    d:=jsonb_build_object('client_event_id',ev,'duration',30,
      'historical',not h,'rewardEligible',h,'serverReward',h,
      'serverVersion','client-forged','credits',999999,'requestedXp',999999,
      'requestedCredits',999999,'effort',jsonb_build_object('xp',999999,'minutes',999999),
      'weeklyXpRemaining',999999,'weeklyCreditsRemaining',999999);
    perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select * into r from public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
    execute 'reset role';
    expected_xp:=case when h then 0 else 300 end;
    expected_credits:=case when h then 0 else 30 end;
    assert r.xp=expected_xp and r.credits=expected_credits,'forged metadata cannot choose awards';
    select * into log_record from public.training_logs where id=r.log_id::uuid;
    assert log_record.user_id=u and log_record.xp=expected_xp,'owner and XP persisted from server';
    assert (log_record.details->>'historical')::boolean=h,'historical derived from date';
    assert (log_record.details->>'serverReward')::boolean=(not h)
      and (log_record.details->>'rewardEligible')::boolean=(not h),'eligibility derived by server';
    assert log_record.details->>'serverVersion'='sport-effort-v300','canonical version';
    assert (log_record.details->>'credits')::integer=expected_credits,'canonical credits';
    assert (log_record.details->>'requestedXp')::integer=expected_xp
      and (log_record.details->>'requestedCredits')::integer=expected_credits,'canonical requested rewards';
    assert (log_record.details#>>'{effort,xp}')::integer=300,'effort recalculated from real inputs';
    assert (log_record.details->>'weeklyXpRemaining')::integer=r.weekly_xp_remaining
      and (log_record.details->>'weeklyCreditsRemaining')::integer=r.weekly_credits_remaining,'canonical allowance metadata';
    assert (select xp=expected_xp and credits=expected_credits and level=1 from public.profiles where id=u),'persisted balances equal awards';
    assert (select count(*)=1 from public.training_receipts where user_id=u),'one receipt';
    assert (select coalesce(sum(xp_awarded),0)=expected_xp and coalesce(sum(credits_awarded),0)=expected_credits
      from public.titan_weekly_reward_usage where user_id=u),'only canonical allowance consumed';
  end loop;
  raise notice 'Training trust: current and historical forged metadata passed';
end $$;

-- The trigger rejects after the quota call: all work must roll back, leaving the same UUID reusable.
do $$
declare u uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); caught boolean:=false;
  r record; replay record; d jsonb; stamp timestamptz:=now()-interval '1 hour';
  quota_before jsonb; quota_after jsonb; profile_before jsonb; profile_after jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set xp=0,credits=0,level=1 where id=u;
  d:=jsonb_build_object('client_event_id',ev,'duration',30,'elevation',12001);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    perform public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
  exception when check_violation then
    caught:=true; assert sqlerrm='TRAINING_REJECTED',sqlerrm;
  end;
  assert caught,'over-elevation trigger must reject before correction';
  execute 'reset role';
  assert not exists(select 1 from public.training_logs where user_id=u),'refused event has no log';
  assert not exists(select 1 from public.training_receipts where user_id=u),'refused UUID is not reserved';
  assert not exists(select 1 from public.titan_weekly_reward_usage where user_id=u),'trigger refusal rolls back earlier quota allocation';
  assert (select xp=0 and credits=0 and level=1 from public.profiles where id=u),'refusal preserves balances';
  d:=d||'{"elevation":12000}'::jsonb;
  execute 'set local role authenticated';
  select * into r from public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
  execute 'reset role';
  assert r.xp=300 and r.credits=30,'corrected event with same UUID rewarded once';
  select to_jsonb(p) into profile_before from public.profiles p where id=u;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into quota_before from public.titan_weekly_reward_usage w where user_id=u;
  execute 'set local role authenticated';
  select * into replay from public.titan_submit_training_session('running','cardio',5,'km',d,stamp);
  execute 'reset role';
  assert to_jsonb(replay)=to_jsonb(r),'corrected event replay returns exact original receipt';
  assert (select count(*)=1 from public.training_logs where user_id=u and client_event_id=ev),'one corrected log';
  assert (select count(*)=1 from public.training_receipts where user_id=u and client_event_id=ev),'one corrected receipt';
  select to_jsonb(p) into profile_after from public.profiles p where id=u;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into quota_after from public.titan_weekly_reward_usage w where user_id=u;
  assert profile_after=profile_before and quota_after=quota_before,'replay consumes neither balance nor quota';
  raise notice 'Training trust: refused UUID corrected and replayed atomically';
end $$;

-- Bulk history must not trip the real-time frequency limit; forged historical flags must not bypass it.
do $$
declare u uuid:=gen_random_uuid(); i integer; r record; caught boolean:=false;
  quota_before jsonb; quota_after jsonb; profile_before jsonb; profile_after jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set xp=0,credits=0,level=1 where id=u;
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  for i in 1..13 loop
    select * into r from public.titan_submit_training_session('yoga','mobility',30,'min',
      jsonb_build_object('client_event_id',gen_random_uuid(),'historical',false,'serverReward',true),
      now()-interval '45 days'-i*interval '1 day');
    assert r.xp=0 and r.credits=0,'every bulk history receipt is unrewarded';
  end loop;
  execute 'reset role';
  assert (select count(*)=13 and bool_and(xp=0 and (details->>'historical')::boolean)
    from public.training_logs where user_id=u),'all bulk history persisted without XP';
  assert (select xp=0 and credits=0 and level=1 from public.profiles where id=u),'bulk history preserved balances';
  assert (select coalesce(sum(xp_awarded),0)=0 and coalesce(sum(credits_awarded),0)=0
    from public.titan_weekly_reward_usage where user_id=u),'history consumes no allowance';
  execute 'set local role authenticated';
  for i in 1..12 loop
    select * into r from public.titan_submit_training_session('yoga','mobility',30,'min',
      jsonb_build_object('client_event_id',gen_random_uuid(),'historical',true,'rewardEligible',false),
      now()-interval '1 hour');
    assert r.log_id is not null,'history does not consume real-time frequency slots';
  end loop;
  execute 'reset role';
  assert (select count(*)=12 and bool_and(not (details->>'historical')::boolean)
    from public.training_logs where user_id=u and date>now()-interval '30 days'),'server overrides forged historical flags';
  select to_jsonb(p) into profile_before from public.profiles p where id=u;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into quota_before from public.titan_weekly_reward_usage w where user_id=u;
  execute 'set local role authenticated';
  begin
    perform public.titan_submit_training_session('yoga','mobility',30,'min',
      jsonb_build_object('client_event_id',gen_random_uuid(),'historical',true),now()-interval '1 hour');
  exception when check_violation then
    caught:=true; assert sqlerrm='TRAINING_RATE_LIMIT',sqlerrm;
  end;
  assert caught,'forged historical=true does not bypass the thirteenth real-time refusal';
  execute 'reset role';
  assert (select count(*)=25 from public.training_logs where user_id=u),'no twenty-sixth log';
  assert (select count(*)=25 from public.training_receipts where user_id=u),'no twenty-sixth receipt';
  select to_jsonb(p) into profile_after from public.profiles p where id=u;
  select coalesce(jsonb_agg(to_jsonb(w)),'[]') into quota_after from public.titan_weekly_reward_usage w where user_id=u;
  assert profile_after=profile_before and quota_after=quota_before,'frequency refusal cannot consume capped rewards';
  raise notice 'Training trust: bulk history isolated and forged rate-limit bypass refused';
end $$;
rollback;

-- BOT01 / BOT02 / CHEAT18: periodic analysis of recent sessions. It only writes de-duplicated signals; it never
-- changes an account or a session. Synthetic identities, fixtures with triggers bypassed, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); bad uuid:=gen_random_uuid();
  base timestamptz:=(date_trunc('day', (now() - interval '3 days') at time zone 'utc') + interval '10 hours') at time zone 'utc';
  i int; dup1 uuid:=gen_random_uuid(); dup2 uuid:=gen_random_uuid();
begin
  assert to_regprocedure('private.titan_run_risk_analysis(integer,integer)') is not null,'the analysis function exists';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(p,'{}'),(q,'{}'),(r,'{}'),(w,'{}');
  perform set_config('titan.ra_w',w::text,true);
  update public.profiles set role='admin' where id=a;
  perform set_config('titan.ra_a',a::text,true); perform set_config('titan.ra_p',p::text,true);
  perform set_config('titan.ra_q',q::text,true); perform set_config('titan.ra_r',r::text,true);
  perform set_config('titan.ra_dup',dup1::text,true);
  set local session_replication_role = replica;
  -- p: an exact duplicate pair (high overlap -> state review) plus one ordinary session.
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values
    (dup1,p,'rowing','cardio',30,'min',5,base,'{"duration":60}'),
    (dup2,p,'rowing','cardio',30,'min',5,base,'{"duration":60}'),
    (gen_random_uuid(),p,'yoga','mobility',20,'min',3,base + interval '1 day','{"duration":20}');
  -- w: a 50-minute overlap of 60 (state watch, 3 points each): worth a look, not a signal.
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (w,'cycling','cardio',30,'min',5,base,'{"duration":60}'),(w,'swimming','cardio',30,'min',5,base + interval '10 minutes','{"duration":60}');
  -- q: steady running only, nothing unusual.
  for i in 1..6 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (q,'running','cardio',10,'km',10, now() - (10 - i) * interval '1 day','{"duration":60}');
  end loop;
  -- r: old activity (created long ago): outside the analysis window.
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,created_at) values
    (gen_random_uuid(),r,'rowing','cardio',30,'min',5,base,'{"duration":60}', now() - interval '30 days'),
    (gen_random_uuid(),r,'rowing','cardio',30,'min',5,base,'{"duration":60}', now() - interval '30 days');
  set local session_replication_role = origin;
end $$;

create temporary table qa_ra_before as
  select 'log' k, to_jsonb(l) r from public.training_logs l
  union all select 'profile', to_jsonb(p) from public.profiles p;

do $$
declare res jsonb; n int;
begin
  res := private.titan_run_risk_analysis(24, 100);
  assert (res->>'signals')::int = 2, 'two signals: one per session of the duplicate pair, got '||res::text;
  select count(*) into n from public.titan_suspicious_actions where user_id=current_setting('titan.ra_p')::uuid and action_type='session_risk.review';
  assert n=2,'both duplicate sessions flagged for review';
  assert exists(select 1 from public.titan_suspicious_actions where user_id=current_setting('titan.ra_p')::uuid and action_type='session_risk.review'
    and severity='high' and reason='SESSION_RISK_REVIEW' and status='open' and payload ? 'session' and (payload->>'score')::int=8 and payload->'signals'->0->>'code'='overlap'),'severity, reason and explanation are recorded';
  assert not exists(select 1 from public.titan_suspicious_actions where user_id=current_setting('titan.ra_q')::uuid and action_type='session_risk.review'),'steady sessions raise nothing';
  assert not exists(select 1 from public.titan_suspicious_actions where user_id=current_setting('titan.ra_w')::uuid and action_type='session_risk.review'),'a session that is only worth watching raises nothing';
  assert not exists(select 1 from public.titan_suspicious_actions where user_id=current_setting('titan.ra_r')::uuid and action_type='session_risk.review'),'old activity is outside the window';
  -- Idempotent: the same sessions are not signalled twice, even after a human reviewed the signal.
  update public.titan_suspicious_actions set status='reviewed' where user_id=current_setting('titan.ra_p')::uuid and action_type='session_risk.review';
  res := private.titan_run_risk_analysis(24, 100);
  assert (res->>'signals')::int = 0,'a second run signals nothing new, even for reviewed signals';
  select count(*) into n from public.titan_suspicious_actions where action_type='session_risk.review';
  assert n=2,'still two signals in total';
  -- The cap on analysed accounts is honoured.
  assert (private.titan_run_risk_analysis(24, 1)->>'accounts')::int = 1,'plafond de comptes respecté';
  -- Never touches accounts or sessions.
  assert not exists((select k,r from qa_ra_before) except (select 'log',to_jsonb(l) from public.training_logs l union all select 'profile',to_jsonb(p) from public.profiles p)),'no session or profile changed';
end $$;

-- The moderation queue now ranks the account, from persisted signals (BOT02).
set local role authenticated;
do $$
declare q jsonb; e jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ra_a'),'role','authenticated')::text,true);
  -- reviewed signals leave the queue, so reopen them for this check
  reset role;
  update public.titan_suspicious_actions set status='open' where user_id=current_setting('titan.ra_p')::uuid and action_type='session_risk.review';
  set local role authenticated;
  q := public.titan_moderation_queue_v1(20);
  e := (select x from jsonb_array_elements(q->'entries') x where x->>'user_id'=current_setting('titan.ra_p'));
  assert e is not null and (e->>'score')::int=16 and e->>'level'='watch','the account is queued: two signals of one reason, 8 points each (the rule caps at three occurrences): '||coalesce(e::text,'null');
  assert (select count(*) from jsonb_array_elements(q->'entries') x where x->>'user_id'=current_setting('titan.ra_q'))=0,'the steady account is not queued';
end $$;
reset role;

-- Critical path, escalation, failure isolation, absurd durations and the single-run lock.
do $$
declare c uuid:=gen_random_uuid(); iso uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); i int; res jsonb; sid text; n int;
  d timestamptz:=(date_trunc('day', (now() - interval '3 days') at time zone 'utc') + interval '10 hours') at time zone 'utc';
  day0 timestamptz:=(date_trunc('day', (now() - interval '3 days') at time zone 'utc')) at time zone 'utc';
begin
  insert into auth.users(id,raw_user_meta_data) values(c,'{}'),(iso,'{}'),(h,'{}');
  perform set_config('titan.ra_iso',iso::text,true);
  set local session_replication_role = replica;
  for i in 1..5 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (c,'running','cardio',10,'km',10, d - (i + 1) * interval '1 day','{"duration":60}');
  end loop;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (c,'running','cardio',20,'km',10,d,'{"duration":60}'),(c,'running','cardio',20,'km',10,d,'{"duration":60}'),
    (c,'hiking','cardio',480,'min',10,day0 + interval '6 hours','{"duration":480}'),
    (c,'hiking','cardio',480,'min',10,day0 + interval '23 hours 30 minutes','{"duration":480}');
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values (iso,'rowing','cardio',30,'min',5,d,'{"duration":60}');
  -- an impossible stored duration (clamped to 24 h) must not abort the run; a 24 h day is itself worth a look
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (h,'rowing','cardio',30,'min',5,d,'{"duration":9000000000000000}');
  set local session_replication_role = origin;

  -- one analysis account fails: the others still get their signals
  alter function private.titan_session_risk(uuid,integer) rename to titan_session_risk_real;
  create function private.titan_session_risk(p_user uuid, p_limit integer default 30) returns jsonb language plpgsql as $f$
  begin
    if p_user = current_setting('titan.ra_iso')::uuid then raise exception 'boom'; end if;
    return private.titan_session_risk_real(p_user, p_limit);
  end $f$;
  -- a human already looked at one of c's sessions at the lower state: a later "critical" is a new signal
  select (l.id)::text into sid from public.training_logs l where l.user_id=c and l.val=20 limit 1;
  insert into public.titan_suspicious_actions(user_id,action_type,severity,reason,payload)
    values (c,'session_risk.review','high','SESSION_RISK_REVIEW',jsonb_build_object('session',sid,'state','review'));
  res := private.titan_run_risk_analysis(24, 100);
  assert (res->>'failed')::int = 1,'exactly the failing account is skipped: '||res::text;
  select count(*) into n from public.titan_suspicious_actions where user_id=c and action_type='session_risk.review' and reason='SESSION_RISK_CRITICAL' and severity='critical' and (payload->>'score')::int >= 20;
  assert n=2,'both duplicated runs are critical (overlap + speed + day volume), got '||n;
  assert exists(select 1 from public.titan_suspicious_actions where user_id=c and payload->>'session'=sid and reason='SESSION_RISK_REVIEW') and
         exists(select 1 from public.titan_suspicious_actions where user_id=c and payload->>'session'=sid and reason='SESSION_RISK_CRITICAL'),'a session that worsens from review to critical is signalled again';
  assert not exists(select 1 from public.titan_suspicious_actions where user_id=iso and action_type='session_risk.review'),'the failed account raises nothing';
  assert exists(select 1 from public.titan_suspicious_actions where user_id=h and action_type='session_risk.review' and payload->'signals'->0->>'code'='day_volume'),'an impossible duration is analysed (clamped), not fatal, and flagged as a full day';
  assert exists(select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid()),'the run holds its single-run advisory lock until the transaction ends';
  assert (private.titan_run_risk_analysis(24, 100)->>'signals')::int = 0,'nothing is signalled twice';
end $$;

-- Closed to the API roles.
do $$ begin
  assert not has_function_privilege('authenticated','private.titan_run_risk_analysis(integer,integer)','execute'),'authenticated cannot run it';
  assert not has_function_privilege('anon','private.titan_run_risk_analysis(integer,integer)','execute'),'anon cannot run it';
end $$;
rollback;

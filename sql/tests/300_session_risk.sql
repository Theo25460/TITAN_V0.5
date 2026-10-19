-- CHEAT12 / CHEAT13 / CHEAT06: per-session explainable risk, administrators only, strictly read-only.
-- Synthetic identities, fixtures written with triggers bypassed (the training guard rate-limits inserts), full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); y uuid:=gen_random_uuid();
  z uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); i int; base timestamptz:=(date_trunc('day', (now() - interval '8 days') at time zone 'utc') + interval '10 hours') at time zone 'utc';
  day5 timestamptz:=date_trunc('day', (now() - interval '5 days') at time zone 'utc') at time zone 'utc';
  u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); u3 uuid:=gen_random_uuid(); u4 uuid:=gen_random_uuid(); u5 uuid:=gen_random_uuid();
  t text;
begin
  perform set_config('titan.sr_a',a::text,true); perform set_config('titan.sr_m',m::text,true);
  perform set_config('titan.sr_x',x::text,true); perform set_config('titan.sr_y',y::text,true);
  perform set_config('titan.sr_z',z::text,true); perform set_config('titan.sr_w',w::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(m,'{}'),(x,'{}'),(y,'{}'),(z,'{}'),(w,'{}'),(v,'{}'),(u1,'{}'),(u2,'{}'),(u3,'{}'),(u4,'{}'),(u5,'{}');
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='moderator' where id=m;
  set local session_replication_role = replica;
  -- x: five steady 10 km/h runs, then a 20 km/h run (ratio 2 = high), then the same run at 16 km/h (ratio 1.6 = medium).
  for i in 1..5 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (x,'running','cardio',10,'km',10, now() - (20 - i) * interval '1 day', jsonb_build_object('duration',60));
  end loop;
  perform set_config('titan.sr_jump', (select gen_random_uuid()::text), true);
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details)
  values (current_setting('titan.sr_jump')::uuid,x,'running','cardio',20,'km',10, now() - interval '12 days', '{"duration":60}');
  perform set_config('titan.sr_mid', (select gen_random_uuid()::text), true);
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details)
  values (current_setting('titan.sr_mid')::uuid,x,'running','cardio',16,'km',10, now() - interval '11 days', '{"duration":60}');
  -- y: overlap pair 50 of 60 minutes (medium), exact duplicate pair (high), back-to-back pair (normal).
  foreach t in array array['ovA','ovB','dupC','dupD','btbE','btbF'] loop
    perform set_config('titan.sr_'||t, gen_random_uuid()::text, true);
  end loop;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values
    (current_setting('titan.sr_ovA')::uuid,y,'cycling','cardio',30,'min',5,base,'{"duration":60}'),
    (current_setting('titan.sr_ovB')::uuid,y,'swimming','cardio',30,'min',5,base + interval '10 minutes','{"duration":60}'),
    (current_setting('titan.sr_dupC')::uuid,y,'rowing','cardio',30,'min',5,base + interval '1 day','{"duration":60}'),
    (current_setting('titan.sr_dupD')::uuid,y,'rowing','cardio',30,'min',5,base + interval '1 day','{"duration":60}'),
    (current_setting('titan.sr_btbE')::uuid,y,'yoga','mobility',30,'min',5,base + interval '2 days','{"duration":60}'),
    (current_setting('titan.sr_btbF')::uuid,y,'yoga','mobility',30,'min',5,base + interval '2 days' + interval '1 hour','{"duration":60}');
  -- historical imports and archived sessions never count; another account's sessions never count.
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details,archived_at)
  values (y,'cycling','cardio',30,'min',0,base,'{"duration":60}', now());
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
  values (y,'cycling','cardio',30,'min',0,base,'{"duration":60,"historical":true}'),
         (w,'cycling','cardio',30,'min',5,base,'{"duration":60}');
  -- z: four 240-minute sessions in one UTC day = 960 minutes (the high boundary), spaced 6h apart; one flagged for exclusion.
  for i in 0..3 loop
    insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details,is_suspicious)
    values (gen_random_uuid(),z,'padel','team',240,'min',5,day5 + interval '5 hours' + i * interval '6 hours','{"duration":240}', i = 0);
  end loop;
  -- v: 10 minutes overlap under one reading of `date` and 30 under the other, 0.33 of the shorter: never flagged.
  perform set_config('titan.sr_v', v::text, true);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (v,'cycling','cardio',30,'min',5,base,'{"duration":30}'),
    (v,'cycling','cardio',30,'min',5,base + interval '20 minutes','{"duration":60}');
  -- u1: no single pair qualifies as high, only the worst pair counts (5 min of 60 fully inside, 30 min of 60 at half).
  perform set_config('titan.sr_u1', u1::text, true); perform set_config('titan.sr_mixed', gen_random_uuid()::text, true);
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values
    (current_setting('titan.sr_mixed')::uuid,u1,'cycling','cardio',30,'min',5,base,'{"duration":60}'),
    (gen_random_uuid(),u1,'cycling','cardio',5,'min',5,base,'{"duration":5}'),
    (gen_random_uuid(),u1,'cycling','cardio',30,'min',5,base + interval '30 minutes','{"duration":60}');
  -- u2: two entries stamped at the same instant for different sports are capped at medium, never a duplicate.
  perform set_config('titan.sr_u2', u2::text, true);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (u2,'yoga','mobility',30,'min',5,base,'{"duration":30}'),(u2,'cycling','cardio',30,'min',5,base,'{"duration":30}');
  -- u3: future-dated rows never crowd out real sessions.
  perform set_config('titan.sr_u3', u3::text, true);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    select u3,'running','cardio',5,'km',5, now() + interval '3 days' + g * interval '1 minute','{"duration":30}' from generate_series(1,120) g;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values (u3,'running','cardio',5,'km',5, now() - interval '2 days','{"duration":30}');
  -- u4: a short fast piece is not a speed jump.
  perform set_config('titan.sr_u4', u4::text, true); perform set_config('titan.sr_short', gen_random_uuid()::text, true);
  for i in 1..6 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (u4,'running','cardio',10,'km',10, now() - (20 - i) * interval '1 day','{"duration":60}');
  end loop;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details)
  values (current_setting('titan.sr_short')::uuid,u4,'running','cardio',2,'km',2, now() - interval '3 days','{"duration":6}');
  -- u5: a thousand sessions stay fast.
  perform set_config('titan.sr_u5', u5::text, true);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    select u5,'running','cardio',8+(g%5),'km',5, now() - g * interval '2 hours','{"duration":45}' from generate_series(1,1000) g;
  -- u6: an impossible stored duration is clamped to 24 h instead of overflowing the interval arithmetic.
  perform set_config('titan.sr_u6', gen_random_uuid()::text, true);
  set local session_replication_role = origin;
  insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.sr_u6')::uuid,'{}');
  set local session_replication_role = replica;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (current_setting('titan.sr_u6')::uuid,'rowing','cardio',30,'min',5,base,'{"duration":9000000000000000}'),
    (current_setting('titan.sr_u6')::uuid,'rowing','cardio',30,'min',5,base - interval '1 day','{"duration":60}');
  set local session_replication_role = origin;
end $$;

create temporary table qa_sr_before as
  select 'log' k, to_jsonb(l) r from public.training_logs l
  union all select 'sig', to_jsonb(s) from public.titan_suspicious_actions s
  union all select 'profile', to_jsonb(p) from public.profiles p;

-- Only administrators.
set local role authenticated;
do $$ declare who text; ok boolean; begin
  foreach who in array array['titan.sr_m','titan.sr_x'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting(who),'role','authenticated')::text,true);
    ok:=false; begin perform public.titan_session_risk_v1(current_setting('titan.sr_x')::uuid); exception when insufficient_privilege then ok:=sqlerrm='ADMIN_ONLY'; end;
    assert ok,'refused for '||who;
  end loop;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_session_risk_v1(current_setting('titan.sr_x')::uuid); exception when others then ok:=true; end;
  assert ok,'anonymous refused';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.sr_a'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_session_risk_v1(gen_random_uuid()); exception when no_data_found then ok:=sqlerrm='ACCOUNT_NOT_FOUND'; end;
  assert ok,'unknown account refused';
end $$;

do $$
declare r jsonb; e jsonb; sess jsonb; t0 timestamptz;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.sr_a'),'role','authenticated')::text,true);

  -- x: speed jump against the player's own median.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_x')::uuid, 50);
  sess:=r->'sessions';
  e:=(select s from jsonb_array_elements(sess) s where s->>'id'=current_setting('titan.sr_jump'));
  assert e->>'state'='review' and (e->>'score')::int=8,'20 km/h against a 10 km/h median is a review (8)';
  assert e#>>'{signals,0,code}'='speed_jump' and e#>>'{signals,0,severity}'='high','speed_jump high, explained';
  assert (e#>>'{signals,0,detail,medianKmh}')::numeric=10 and (e#>>'{signals,0,detail,priorSessions}')::int=5,'median and history size shown';
  e:=(select s from jsonb_array_elements(sess) s where s->>'id'=current_setting('titan.sr_mid'));
  assert e->>'state'='watch' and e#>>'{signals,0,severity}'='medium' and (e->>'score')::int=3,'a 1.6x jump is medium, watched';
  assert (select count(*) from jsonb_array_elements(sess) s where s->>'state'='normal')=5,'the five steady sessions stay normal';
  assert (r->'rule') is not null and (r#>>'{counts,review}')::int>=1,'rule text and counts present';

  -- y: overlap and duplicates, nothing else.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_y')::uuid, 50);
  sess:=r->'sessions';
  assert jsonb_array_length(sess)=7,'six live sessions plus the historical import; archived and foreign ones are absent';
  for e in select s from jsonb_array_elements(sess) s where s->>'id' in (current_setting('titan.sr_ovA'),current_setting('titan.sr_ovB')) loop
    assert e->>'state'='watch' and e#>>'{signals,0,code}'='overlap' and e#>>'{signals,0,severity}'='medium','50/60 minute overlap is medium: '||e::text;
    assert (e#>>'{signals,0,detail,overlapMinutes}')::numeric=50,'overlap minutes explained';
  end loop;
  for e in select s from jsonb_array_elements(sess) s where s->>'id' in (current_setting('titan.sr_dupC'),current_setting('titan.sr_dupD')) loop
    assert e->>'state'='review' and e#>>'{signals,0,severity}'='high','an exact duplicate is high';
  end loop;
  for e in select s from jsonb_array_elements(sess) s where s->>'id' in (current_setting('titan.sr_btbE'),current_setting('titan.sr_btbF')) loop
    assert e->>'state'='normal' and e->'signals'='[]'::jsonb,'back-to-back sessions never overlap';
  end loop;
  assert not exists(select 1 from jsonb_array_elements(sess) s where (s->>'historical')::boolean and s->>'state'<>'normal'),'historical import is never scored';

  -- z: day volume, and the existing exclusion flag is reported, not changed.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_z')::uuid, 50);
  sess:=r->'sessions';
  assert jsonb_array_length(sess)=4 and (select count(*) from jsonb_array_elements(sess) s where s#>>'{signals,0,code}'='day_volume' and s#>>'{signals,0,severity}'='high')=4,
    '960 minutes in a UTC day is flagged on each of its sessions';
  assert (select count(*) from jsonb_array_elements(sess) s where (s->>'excludedFromRankings')::boolean)=1,'existing exclusion reported';

  -- limits are clamped.
  assert jsonb_array_length((public.titan_session_risk_v1(current_setting('titan.sr_y')::uuid, 0))->'sessions')=1,'limit floors at 1';
  assert jsonb_array_length((public.titan_session_risk_v1(current_setting('titan.sr_y')::uuid, null))->'sessions')<=30,'default limit';
  assert jsonb_array_length((public.titan_session_risk_v1(current_setting('titan.sr_x')::uuid, 100000))->'sessions')<=100,'limit capped at 100';

  r:=public.titan_session_risk_v1(current_setting('titan.sr_v')::uuid, 50);
  assert jsonb_array_length(r->'sessions')=2 and not exists(select 1 from jsonb_array_elements(r->'sessions') s where s->>'state'<>'normal'),
    'an overlap that exists under only one reading of the date is not flagged';

  -- u1: the worst single pair decides.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_u1')::uuid, 50);
  e:=(select s from jsonb_array_elements(r->'sessions') s where s->>'id'=current_setting('titan.sr_mixed'));
  assert e#>>'{signals,0,severity}'='medium' and (e#>>'{signals,0,detail,overlapMinutes}')::numeric=30 and (e#>>'{signals,0,detail,shareOfShorter}')::numeric=0.5,
    'two different partners never combine into a high overlap: '||e::text;
  -- u2: same instant, different sports: watched, not reviewed.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_u2')::uuid, 50);
  assert (select count(*) from jsonb_array_elements(r->'sessions') s where s->>'state'='watch')=2
     and not exists(select 1 from jsonb_array_elements(r->'sessions') s where s->>'state' in ('review','critical')),'same-instant entries are capped at medium';
  -- u3: the real session is listed even with 120 future-dated rows.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_u3')::uuid, 100);
  assert jsonb_array_length(r->'sessions')=1,'future-dated rows are not listed or compared';
  -- u4: a 6-minute piece at 20 km/h is not a speed jump.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_u4')::uuid, 50);
  e:=(select s from jsonb_array_elements(r->'sessions') s where s->>'id'=current_setting('titan.sr_short'));
  assert e->>'state'='normal','short pieces are not judged on speed';
  -- u5: a thousand sessions, bounded time.
  t0:=clock_timestamp();
  r:=public.titan_session_risk_v1(current_setting('titan.sr_u5')::uuid, 100);
  assert jsonb_array_length(r->'sessions')=100,'limit applies';
  assert clock_timestamp()-t0 < interval '3 seconds','a thousand sessions answer within 3 seconds, took '||(clock_timestamp()-t0)::text;

  r:=public.titan_session_risk_v1(current_setting('titan.sr_u6')::uuid, 50);
  assert jsonb_array_length(r->'sessions')=2 and (select max((x->>'durationMin')::numeric) from jsonb_array_elements(r->'sessions') x)=1440,
    'an impossible duration is clamped to 1440 minutes and does not abort the analysis';

  -- a single session has no history to compare with. history for a speed signal.
  r:=public.titan_session_risk_v1(current_setting('titan.sr_w')::uuid, 50);
  assert jsonb_array_length(r->'sessions')=1 and r#>>'{sessions,0,state}'='normal','a lone session is normal';
end $$;
reset role;

-- Strictly read-only: no session, signal or profile changed.
do $$ begin
  assert not exists((select k,r from qa_sr_before) except (select 'log',to_jsonb(l) from public.training_logs l union all
    select 'sig',to_jsonb(s) from public.titan_suspicious_actions s union all select 'profile',to_jsonb(p) from public.profiles p)),'nothing existing changed';
  assert (select count(*) from public.training_logs)=(select count(*) from qa_sr_before where k='log'),'no session added';
  assert (select count(*) from public.titan_suspicious_actions)=(select count(*) from qa_sr_before where k='sig'),'no signal logged';
  assert not has_function_privilege('anon','public.titan_session_risk_v1(uuid,integer)','execute'),'anon cannot execute';
  assert not has_function_privilege('authenticated','private.titan_session_risk(uuid,integer)','execute'),'private function not callable by API roles';
end $$;
rollback;

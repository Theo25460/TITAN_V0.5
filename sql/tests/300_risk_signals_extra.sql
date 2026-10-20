-- CHEAT05 / CHEAT09: pace beyond human limits, and a series of extraordinary performances. Advisory signals only.
-- Synthetic identities, triggers bypassed for fixtures, full rollback.
begin;
do $$
declare u uuid; r jsonb; e jsonb; i int; code text;
  day0 timestamptz := now() - interval '40 days';
begin
  -- 1. Beyond human: 40 km in one hour of running; 25 km/h running, 50 km/h cycling and a 5 km/h walk are fine.
  u := gen_random_uuid(); insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  set local session_replication_role = replica;
  insert into public.training_logs(id,user_id,sport,category,val,unit,xp,date,details) values
    (gen_random_uuid(),u,'running','cardio',40,'km',1, now() - interval '1 hour','{"duration":60}'),
    (gen_random_uuid(),u,'running','cardio',25,'km',1, now() - interval '3 hours','{"duration":60}'),
    (gen_random_uuid(),u,'cycling','cardio',50,'km',1, now() - interval '5 hours','{"duration":60}'),
    (gen_random_uuid(),u,'walking','cardio',5,'km',1, now() - interval '7 hours','{"duration":60}'),
    (gen_random_uuid(),u,'swimming','cardio',4,'km',1, now() - interval '9 hours','{"duration":60}'),
    (gen_random_uuid(),u,'swimming','cardio',8,'km',1, now() - interval '11 hours','{"duration":60}'),
    (gen_random_uuid(),u,'walking','cardio',20,'km',1, now() - interval '13 hours','{"duration":60}'),
    (gen_random_uuid(),u,'running','cardio',6,'km',1, now() - interval '15 hours','{"duration":10}');
  set local session_replication_role = origin;
  r := private.titan_session_risk(u, 50);
  for e in select * from jsonb_array_elements(r) loop
    code := (select string_agg(s->>'code', ',') from jsonb_array_elements(e->'signals') s);
    if (e->>'sport') = 'running' and (e->>'value')::numeric = 40 then
      assert code like '%beyond_human%' and e->>'state' = 'review', '40 km/h running is beyond human: '||coalesce(code,'none');
    elsif (e->>'sport') = 'swimming' and (e->>'value')::numeric = 8 then
      assert code like '%beyond_human%', '8 km/h swimming for an hour is beyond human';
    elsif (e->>'sport') = 'walking' and (e->>'value')::numeric = 20 then
      assert code like '%beyond_human%', '20 km/h walking for an hour is beyond human';
    else
      assert coalesce(code,'') not like '%beyond_human%', 'plausible effort not flagged: '||(e->>'sport')||' '||(e->>'value')||' '||coalesce(code,'');
    end if;
  end loop;
  -- the short 10-minute run (36 km/h over 10 min) is below the 15-minute floor: not flagged
  assert (select count(*) from jsonb_array_elements(r) x where x->>'sport'='running' and (x->>'durationMin')::int=10 and (x->>'score')::int=0)=1, 'short effort below the duration floor is not judged';

  -- 2. Series: 10 steady 10 km/h runs, then three runs at 16 km/h within 14 days -> the third is a series.
  u := gen_random_uuid(); insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  set local session_replication_role = replica;
  for i in 1..10 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (u,'running','cardio',10,'km',1, day0 + i * interval '1 day','{"duration":60}');
  end loop;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (u,'running','cardio',16,'km',1, now() - interval '9 days','{"duration":60}'),
    (u,'running','cardio',16,'km',1, now() - interval '6 days','{"duration":60}'),
    (u,'running','cardio',16,'km',1, now() - interval '3 days','{"duration":60}');
  set local session_replication_role = origin;
  r := private.titan_session_risk(u, 50);
  e := (select x from jsonb_array_elements(r) x order by x->>'date' desc limit 1);
  assert exists(select 1 from jsonb_array_elements(e->'signals') s where s->>'code'='extraordinary_series' and s->>'severity'='high'), 'a third extraordinary run in 14 days is a series: '||e::text;
  e := (select x from jsonb_array_elements(r) x order by x->>'date' asc limit 1 offset 10);
  assert not exists(select 1 from jsonb_array_elements(e->'signals') s where s->>'code'='extraordinary_series'), 'the first extraordinary run alone is not a series';

  -- 3. Two extraordinary runs are not a series; a steady improver (pace rises 3 %/week) is never one.
  u := gen_random_uuid(); insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  set local session_replication_role = replica;
  for i in 1..10 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (u,'running','cardio',10,'km',1, day0 + i * interval '1 day','{"duration":60}');
  end loop;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (u,'running','cardio',16,'km',1, now() - interval '6 days','{"duration":60}'),
    (u,'running','cardio',16,'km',1, now() - interval '3 days','{"duration":60}');
  set local session_replication_role = origin;
  r := private.titan_session_risk(u, 50);
  assert not exists(select 1 from jsonb_array_elements(r) x, jsonb_array_elements(x->'signals') s where s->>'code'='extraordinary_series'), 'two extraordinary runs are no series';

  u := gen_random_uuid(); insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  set local session_replication_role = replica;
  for i in 0..15 loop
    insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
    values (u,'running','cardio',round((9 * power(1.03, i))::numeric,2),'km',1, now() - (16 - i) * interval '3 days','{"duration":60}');
  end loop;
  set local session_replication_role = origin;
  r := private.titan_session_risk(u, 50);
  assert not exists(select 1 from jsonb_array_elements(r) x, jsonb_array_elements(x->'signals') s where s->>'code' in ('extraordinary_series','beyond_human')), 'a steady improver is never flagged';
end $$;
rollback;

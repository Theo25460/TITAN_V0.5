-- CHEAT20: legitimate profiles must not be pushed to human review (score >= 8) by the session risk rules.
-- Synthetic identities, triggers bypassed for fixtures, full rollback. Each case states the worst state it may reach.
begin;
do $$
declare
  day0 timestamptz := (date_trunc('day', (now() - interval '10 days') at time zone 'utc') + interval '6 hours') at time zone 'utc';
  u uuid; i int; r jsonb; worst int; label text;
  cases text[] := array['beginner','advanced','volume','pause','import','atypical','improver','double_day','near_record','multisport_elite','no_reference'];
  worst_allowed int[] := array[2,2,3,2,2,2,2,2,2,2,2]; -- score ceiling per case: 2 = normal, 3 = watch at most
  k int;
begin
  for k in 1..array_length(cases,1) loop
    label := cases[k]; u := gen_random_uuid();
    insert into auth.users(id,raw_user_meta_data) values (u,'{}');
    set local session_replication_role = replica;
    if label = 'beginner' then
      -- three short easy sessions, one every other day, slow pace.
      for i in 0..2 loop
        insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
        values (u,'running','cardio',2.5,'km',5, day0 + i * interval '2 days','{"duration":25}');
      end loop;
    elsif label = 'advanced' then
      -- six steady 15 km/h hours a week for four weeks, one session a day.
      for i in 0..23 loop
        insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
        values (u,'running','cardio',15 + (i % 3) * 0.5,'km',10, day0 - interval '20 days' + i * interval '1 day','{"duration":60}');
      end loop;
    elsif label = 'volume' then
      -- long-course triathlon day: 1.5 h swim, 6 h bike, 3.5 h run = 11 h, back to back (no overlap).
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
        (u,'swimming','cardio',3.8,'km',20, day0,'{"duration":90}'),
        (u,'cycling','cardio',180,'km',40, day0 + interval '100 minutes','{"duration":360}'),
        (u,'running','cardio',42,'km',40, day0 + interval '470 minutes','{"duration":210}');
    elsif label = 'pause' then
      -- steady history, ninety days of silence (outside the window), then one session at the same pace.
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
      select u,'running','cardio',8,'km',5, now() - interval '200 days' - g * interval '1 day','{"duration":60}' from generate_series(1,10) g;
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
      values (u,'running','cardio',8,'km',5, now() - interval '1 day','{"duration":60}');
    elsif label = 'import' then
      -- a decade of history imported in one go: same instants, long totals, flagged historical.
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
      select u,'running','cardio',30,'km',0, day0, '{"duration":60,"historical":true}' from generate_series(1,40) g;
    elsif label = 'atypical' then
      -- climbing logged in minutes, a rest-day walk, and a very slow swim in km.
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
        (u,'climbing','strength',90,'min',10, day0,'{"duration":90}'),
        (u,'walking','cardio',4,'km',3, day0 + interval '1 day','{"duration":50}'),
        (u,'swimming','cardio',1.5,'km',8, day0 + interval '2 days','{"duration":60}');
    elsif label = 'improver' then
      -- six runs at 8 km/h, then a clearly better 11 km/h day (+37%): fitness gain, not a jump.
      for i in 0..5 loop
        insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
        values (u,'running','cardio',8,'km',5, day0 + i * interval '1 day','{"duration":60}');
      end loop;
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
      values (u,'running','cardio',11,'km',8, day0 + interval '7 days','{"duration":60}');
    elsif label = 'double_day' then
      -- morning run and evening cycling, short strength block after lunch.
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
        (u,'running','cardio',10,'km',10, day0,'{"duration":55}'),
        (u,'strength','strength',45,'min',8, day0 + interval '6 hours','{"duration":45}'),
        (u,'cycling','cardio',30,'km',12, day0 + interval '12 hours','{"duration":80}');
    elsif label = 'near_record' then
      -- CHEAT04: a personal record (+25 % on the usual pace) is a performance, not an anomaly.
      for i in 0..5 loop
        insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
        values (u,'running','cardio',12,'km',5, day0 + i * interval '1 day','{"duration":60}');
      end loop;
      insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
      values (u,'running','cardio',15,'km',9, day0 + interval '7 days','{"duration":60}');
    elsif label = 'multisport_elite' then
      -- CHEAT10: a high-level multisport athlete; each sport is judged against its own history, not against the others.
      for i in 0..5 loop
        insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
          (u,'running','cardio',15,'km',10, day0 + i * interval '1 day','{"duration":60}'),
          (u,'cycling','cardio',48,'km',12, day0 + i * interval '1 day' + interval '3 hours','{"duration":90}'),
          (u,'swimming','cardio',2.6,'km',10, day0 + i * interval '1 day' + interval '6 hours','{"duration":45}');
      end loop;
    elsif label = 'no_reference' then
      -- CHEAT11: a sport with no comparable world record is judged on the player's own history only; large counts are no cap.
      for i in 0..9 loop
        insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
        values (u,'curling','precision', 5000 + i * 1500,'pts',5, day0 + i * interval '1 day','{"duration":40}');
      end loop;
    end if;
    set local session_replication_role = origin;
    r := private.titan_session_risk(u, 100);
    select coalesce(max((s->>'score')::int), 0) into worst from jsonb_array_elements(r) s;
    assert worst < 8, label || ': a legitimate profile reached human review (score ' || worst || ', ' || r::text || ')';
    assert worst <= worst_allowed[k] + 0, label || ': score ' || worst || ' above its ceiling ' || worst_allowed[k];
  end loop;
end $$;
rollback;

-- V11-11: the added pace ceilings flag an impossible average speed on a newly covered sport, stay silent on a plausible one,
-- and an ultra-distance effort at a human pace is never flagged. Synthetic identities, full rollback.
begin;
do $$
declare u uuid:=gen_random_uuid(); r jsonb; e jsonb; code text;
begin
  assert (select count(*) from private.titan_sport_limits where sport in ('trail','nordic_walk','race_walking','treadmill','rowing','coastal_rowing','kayak','cross_country_skiing'))=8,'eight sports added';
  assert not exists(select 1 from private.titan_sport_limits where sport in ('cycling','mountain_bike','hiking','alpine_skiing','roller')),'motor or terrain dependent sports stay unbounded';
  insert into auth.users(id,raw_user_meta_data) values (u,'{}');
  set local session_replication_role = replica;
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details) values
    (u,'trail','cardio',40,'km',1, now() - interval '2 hours','{"duration":60}'),          -- 40 km/h trail: beyond human
    (u,'trail','cardio',12,'km',1, now() - interval '30 hours','{"duration":60}'),         -- plausible
    (u,'kayak','cardio',40,'km',1, now() - interval '50 hours','{"duration":60}'),         -- beyond human
    (u,'rowing','cardio',14,'km',1, now() - interval '70 hours','{"duration":60}'),        -- plausible
    (u,'cross_country_skiing','cardio',70,'km',1, now() - interval '90 hours','{"duration":240}'), -- 17.5 km/h ultra-distance: plausible
    (u,'trail','cardio',330,'km',1, now() - interval '120 hours','{"duration":1380}');     -- 330 km in 23 h would be 14 km/h: plausible
  set local session_replication_role = origin;
  r := private.titan_session_risk(u, 50);
  for e in select * from jsonb_array_elements(r) loop
    code := (select string_agg(s->>'code', ',') from jsonb_array_elements(e->'signals') s);
    if (e->>'sport') in ('trail','kayak') and (e->>'value')::numeric = 40 then
      assert code like '%beyond_human%', (e->>'sport')||' 40 km/h is beyond human: '||coalesce(code,'none');
    else
      assert coalesce(code,'') not like '%beyond_human%', 'plausible effort not flagged: '||(e->>'sport')||' '||(e->>'value')||' '||coalesce(code,'');
    end if;
  end loop;
end $$;
rollback;

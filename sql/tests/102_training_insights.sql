-- Integration test with temporary synthetic users; EVERY change is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
begin
  perform set_config('titan.qa_user',a::text,true);
  perform set_config('titan.qa_other',b::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.profiles set is_elite=true,is_admin=true,role='admin' where id=a;
  insert into public.training_logs(user_id,sport,category,val,unit,date,details) values
    (a,'running','cardio',5,'km',now()-interval '1 day','{"duration":30,"bio":{"rpe":5}}'),
    (a,'running','cardio',3,'km',now()-interval '2 days','{}'),
    (a,'yoga','training',20,'min',now()-interval '3 days','{}'),
    (a,'running','cardio',2,'km',now()-interval '40 days','{"duration":15,"bio":{"rpe":4}}'),
    (b,'running','cardio',100,'km',now()-interval '1 day','{"duration":300}');
  insert into public.training_logs(user_id,sport,category,val,unit,date,details,archived_at)
    values(a,'running','cardio',100,'km',now()-interval '4 days','{}',now());
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$
declare r jsonb; denied boolean;
begin
  r:=public.titan_training_insights(now()-interval '30 days',now(),null,'Europe/Paris');
  assert (r#>>'{periods,current,sessions}')::int=3, 'ownership/archive count';
  assert (r#>>'{periods,current,minutes}')::numeric=50, 'duration fallback';
  assert (r#>>'{periods,current,duration_measured}')::int=2, 'missing duration';
  assert (r#>>'{periods,current,distance}')::numeric=8, 'distance units';
  assert (r#>>'{periods,current,load_measured}')::int=1, 'missing RPE';
  assert (r#>>'{periods,current,reported_load}')::numeric=150, 'reported load';
  assert (r#>>'{periods,previous,sessions}')::int=1, 'previous interval';
  r:=public.titan_training_insights(now()-interval '30 days',now(),'yoga','Europe/Paris');
  assert (r#>>'{periods,current,sessions}')::int=1, 'sport filtering';
  assert (r#>>'{periods,current,distance_measured}')::int=0, 'missing distance';
  denied:=false;
  begin update public.profiles set elite_ends_at=now()+interval '50 years' where id=auth.uid();
  exception when insufficient_privilege then denied:=sqlerrm='BILLING_FIELDS_READ_ONLY'; end;
  assert denied, 'client billing mutation rejected';
  denied:=false;
  begin perform public.titan_training_insights(now(),now()-interval '1 day');
  exception when others then denied:=sqlerrm='INVALID_REPORT_PERIOD'; end;
  assert denied, 'invalid range rejection';
  denied:=false;
  begin perform public.titan_training_insights(now()-interval '1 day',now(),null,'invalid/zone');
  exception when others then denied:=sqlerrm='INVALID_TIMEZONE'; end;
  assert denied, 'invalid timezone rejection';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_other'),'role','authenticated')::text,true);
  denied:=false;
  begin perform public.titan_training_insights(now()-interval '30 days',now());
  exception when others then denied:=sqlerrm='TITAN_PLUS_REQUIRED'; end;
  assert denied, 'free account rejection';
  assert not has_function_privilege('anon','public.titan_training_insights(timestamptz,timestamptz,text,text)','execute'), 'anonymous execution denied';
end $$;
rollback;

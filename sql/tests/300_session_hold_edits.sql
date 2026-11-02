-- Real authenticated RPC: preserve timed holds, rewards, revision and account isolation.
begin;
do $$
declare athlete uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid();
begin
 perform set_config('titan.hold_athlete',athlete::text,true);
 perform set_config('titan.hold_stranger',stranger::text,true);
 perform set_config('titan.hold_session',session_id::text,true);
 insert into auth.users(id,raw_user_meta_data) values(athlete,'{}'),(stranger,'{}');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.training_logs(id,user_id,sport,category,val,unit,date,xp,details)
 values(session_id,athlete,'bodyweight','strength',1,'min',now(),100,
 '{"val1":1,"exercises":[{"name":"Gainage","kind":"hold","setRows":[{"weight":0,"seconds":60}]}],"extras":{"old_private_metric":"kept"},"serverReward":true}');
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.hold_athlete'),'role','authenticated')::text,true);
do $$
declare r jsonb; denied boolean; payload jsonb;
begin
 r:=public.titan_update_training_session(current_setting('titan.hold_session')::uuid,1,
 '{"exercises":[{"name":"Gainage","kind":"hold","setRows":[{"weight":0,"seconds":45},{"weight":0,"seconds":30}]}],"extras":{"rest_seconds":90}}');
 assert r#>>'{details,exercises,0,kind}'='hold' and (r#>>'{details,exercises,0,holdSeconds}')::numeric=75, 'hold kind and measured seconds preserved';
 assert (r#>>'{details,exercises,0,setRows,0,seconds}')::numeric=45 and not (r#>'{details,exercises,0,setRows,0}') ? 'reps', 'holds never become repetitions';
 assert (r->>'val')::numeric=1.25 and r->>'unit'='min', 'hold-only value in minutes';
 assert (r->>'xp')::numeric=100 and (r->>'revision')::integer=2 and r#>>'{details,extras,old_private_metric}'='kept', 'rewards and historical extras unchanged';
 for payload in select value from jsonb_array_elements('[null,"",-1,0,3601,1.5,"30",{},true]') loop
  denied:=false;
  begin
   perform public.titan_update_training_session(current_setting('titan.hold_session')::uuid,2,
    jsonb_build_object('exercises',jsonb_build_array(jsonb_build_object('name','Gainage','kind','hold','setRows',jsonb_build_array(jsonb_build_object('weight',0,'seconds',payload))))));
  exception when others then denied:=sqlerrm='SET_INVALID'; end;
  assert denied, 'invalid hold rejected: '||payload::text;
 end loop;
 r:=public.titan_update_training_session(current_setting('titan.hold_session')::uuid,2,
 '{"exercises":[{"name":"Gainage","kind":"hold","setRows":[{"weight":0,"seconds":60}]},{"name":"Pompes","kind":"bodyweight","setRows":[{"weight":0,"reps":10,"rir":2}]}]}');
 assert (r->>'val')::numeric=10 and r->>'unit'='reps' and r#>>'{details,exercises,0,kind}'='hold', 'mixed holds and reps never count holds as reps';
 denied:=false;
 begin perform public.titan_update_training_session(current_setting('titan.hold_session')::uuid,2,'{"note":"stale"}');
 exception when others then denied:=sqlerrm='SESSION_VERSION_CONFLICT'; end;
 assert denied, 'revision conflict retained';
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.hold_stranger'),'role','authenticated')::text,true);
 denied:=false;
 begin perform public.titan_update_training_session(current_setting('titan.hold_session')::uuid,3,'{"note":"foreign"}');
 exception when others then denied:=sqlerrm='SESSION_NOT_FOUND'; end;
 assert denied, 'cross-account edit rejected';
end $$;
rollback;

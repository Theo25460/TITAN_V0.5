begin;
do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();l uuid:=gen_random_uuid();begin
 perform set_config('titan.qa_user',a::text,true);perform set_config('titan.qa_other',b::text,true);perform set_config('titan.qa_log',l::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.training_logs(id,user_id,sport,category,val,unit,date,xp,details)
 values(l,a,'muscu_builder','strength',800,'kg',now(),100,'{"val1":800,"duration":30,"summary":"old summary","exercises":[{"name":"Squat","sets":2,"reps":10,"weight":40,"setRows":[{"weight":40,"reps":10,"rir":2},{"weight":40,"reps":10,"rir":2}]}],"serverReward":true}');
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$declare g uuid;row jsonb;denied boolean:=false;begin
 insert into public.sport_goals(user_id,title,metric,target,start_date,end_date)
 values(auth.uid(),'Mes quatre semaines','sessions',8,current_date,current_date+27) returning id into g;
 perform set_config('titan.qa_goal',g::text,true);
 update public.sport_goals set target=10 where id=g and revision=1;
 assert (select revision=2 and target=10 from public.sport_goals where id=g),'revision and goal edit';
 begin update public.sport_goals set user_id=current_setting('titan.qa_other')::uuid where id=g;exception when insufficient_privilege then denied:=true;end;
 assert denied,'cannot transfer goal ownership';denied:=false;
 begin insert into public.sport_goals(user_id,title,metric,target,start_date,end_date) values(current_setting('titan.qa_other')::uuid,'Unauthorized','sessions',3,current_date,current_date+1);exception when insufficient_privilege then denied:=true;end;
 assert denied,'cannot create another user goal';denied:=false;
 begin insert into public.sport_goals(user_id,title,metric,target,start_date,end_date) values(auth.uid(),'Invalid','days',1.5,current_date,current_date+1);exception when check_violation then denied:=true;end;
 assert denied,'discrete metrics require integers';
 row:=public.titan_update_training_session(current_setting('titan.qa_log')::uuid,1,'{"exercises":[{"name":"Squat","setRows":[{"weight":50,"reps":8,"rir":2},{"weight":45,"reps":10,"rir":null}]}],"note":"Correction des deux séries"}');
 assert (row->>'val')::numeric=850,'volume from individual sets';assert (row#>>'{details,val1}')::numeric=850,'derived value consistent';
 assert row#>'{details,summary}' is null,'stale summary removed';assert (row->>'xp')::int=100,'historical xp unchanged';assert (row->>'revision')::int=2,'session revision';
 assert (row#>>'{details,exercises,0,totalReps}')::int=18,'repetitions recomputed';
 assert row#>'{details,exercises,0,setRows,1,rir}'='null'::jsonb,'unknown RIR remains unknown';
 denied:=false;begin perform public.titan_update_training_session(current_setting('titan.qa_log')::uuid,2,'{"xp":100000}');exception when others then denied:=sqlerrm='PATCH_INVALID';end;
 assert denied,'reward injection rejected';denied:=false;
 begin perform public.titan_update_training_session(current_setting('titan.qa_log')::uuid,1,'{"note":"stale"}');exception when others then denied:=sqlerrm='SESSION_VERSION_CONFLICT';end;
 assert denied,'stale edition rejected';denied:=false;
 begin perform public.titan_update_training_session(current_setting('titan.qa_log')::uuid,2,'{"exercises":[{"name":"Squat","setRows":[{"weight":-2,"reps":10}]}]}');exception when others then denied:=sqlerrm='SET_INVALID';end;
 assert denied,'negative weight rejected';
 row:=public.titan_update_training_session(current_setting('titan.qa_log')::uuid,2,'{"exercises":[{"name":"Squat","setRows":[{"weight":0,"reps":12},{"weight":0,"reps":10}]}]}');
 assert row->>'unit'='reps' and (row->>'val')::int=22,'bodyweight unit conversion';
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_other'),'role','authenticated')::text,true);
 assert (select count(*)=0 from public.sport_goals),'cross account goals hidden';
 update public.sport_goals set title='attempt' where id=g;assert not found,'cross account edit has no effect';
 denied:=false;begin perform public.titan_update_training_session(current_setting('titan.qa_log')::uuid,3,'{"note":"Unauthorized"}');exception when others then denied:=sqlerrm='SESSION_NOT_FOUND';end;
 assert denied,'cross account training edit rejected';
 assert not has_table_privilege('anon','public.sport_goals','select'),'anonymous goals hidden';
end $$;
rollback;

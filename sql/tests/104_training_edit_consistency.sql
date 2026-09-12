-- Synthetic users and sessions only. All writes are rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); l uuid;
begin
 perform set_config('titan.qa_user',a::text,true);
 perform set_config('titan.qa_other',b::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
 insert into public.training_logs(user_id,sport,category,val,unit,date,details)
 values(a,'running','cardio',5,'km',now()-interval '1 day','{"val1":5,"val2":30,"summary":"Distance 5 km"}') returning id into l;
 perform set_config('titan.qa_log',l::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$
declare r jsonb; l uuid:=current_setting('titan.qa_log')::uuid; denied boolean;
begin
 r:=public.titan_update_training_session(l,1,'{"val":6,"duration":40,"note":"Correction"}');
 assert (r->>'val')::numeric=6 and (r#>>'{details,val1}')::numeric=6, 'corrected distance everywhere';
 assert (r#>>'{details,duration}')::numeric=40 and (r#>>'{details,val2}')::numeric=40, 'corrected duration everywhere';
 assert not (r->'details' ? 'summary'), 'stale summary removed';
 assert (r->>'revision')::int=2, 'revision increment';
 denied:=false;
 begin perform public.titan_update_training_session(l,1,'{"val":7}');
 exception when serialization_failure then denied:=true; end;
 assert denied, 'stale revision rejected';
 denied:=false;
 begin perform public.titan_update_training_session(l,null,'{"val":7}');
 exception when serialization_failure then denied:=true; end;
 assert denied, 'null revision rejected';
 r:=public.titan_update_training_session(l,2,'{"archived":true}');
 assert r->>'archived_at' is not null, 'archive';
 r:=public.titan_update_training_session(l,3,'{"archived":false}');
 assert r->>'archived_at' is null and (r->>'revision')::int=4, 'restore without duplication';
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_other'),'role','authenticated')::text,true);
 denied:=false;
 begin perform public.titan_update_training_session(l,4,'{"val":9}');
 exception when insufficient_privilege then denied:=true; end;
 assert denied, 'other owner rejected';
end $$;
rollback;

-- Synthetic private presets, authenticated role, transaction rollback only.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
  assert to_regprocedure('public.titan_analysis_views(uuid)') is not null,'analysis views RPC must exist';
  assert to_regprocedure('public.titan_mutate_analysis_view(text,uuid,integer,text,text,jsonb)') is not null,'mutation RPC must exist';
end $$;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); begin
  perform set_config('titan.views_a',a::text,true); perform set_config('titan.views_b',b::text,true);
  perform set_config('titan.views_id',gen_random_uuid()::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  update public.profiles set is_elite=true,elite_ends_at=now()+interval '1 day',elite_refunded_at=null,is_suspended=false where id=a;
  update public.profiles set is_elite=false where id=b;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.views_a'),'role','authenticated')::text,true);
do $$ declare j jsonb; receipt jsonb; again jsonb; id uuid:=current_setting('titan.views_id')::uuid; bad jsonb; n int; begin
  j:=public.titan_analysis_views();
  assert j->>'owner'=auth.uid()::text and j->>'available'='true' and j->>'limit'='10' and j->>'count'='0','empty owner envelope';
  receipt:=public.titan_mutate_analysis_view('save',id,0,'  Mon mois  ','report','{"period":"month","offset":0}');
  assert receipt->>'action'='save' and receipt->'view'->>'name'='Mon mois' and receipt->'view'->>'revision'='1','normalized create receipt';
  assert not(receipt->'view' ? 'user_id') and not(receipt->'view' ? 'results'),'bounded private parameters';
  again:=public.titan_mutate_analysis_view('save',id,0,'Mon mois','report','{"period":"month","offset":0}');
  assert again=receipt,'uncertain create retry is identical and idempotent';
  j:=public.titan_analysis_views(id);
  assert j->>'count'='1' and j->'views'->0=receipt->'view','separate read sees committed local write';
  begin perform public.titan_mutate_analysis_view('save',id,0,'Autre','report','{"period":"month","offset":0}');
    assert false,'different retry must conflict'; exception when serialization_failure then assert sqlerrm='VIEW_VERSION_CONFLICT',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'mon mois','report','{"period":"month","offset":0}');
    assert false,'duplicate name'; exception when unique_violation then assert sqlerrm='VIEW_NAME_TAKEN',sqlerrm; end;
  for bad in select value from jsonb_array_elements('[null,[],{}, {"period":"month","offset":0,"note":"PRIVATE"},{"period":"month","offset":"0"},{"period":"month","offset":0.5},{"period":"week","offset":0},{"period":"year","offset":2}]') loop
    begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Bad report','report',bad);
      assert false,'invalid report options'; exception when invalid_parameter_value then assert sqlerrm='INVALID_VIEW_OPTIONS',sqlerrm; end;
  end loop;
  for bad in select value from jsonb_array_elements('[{"weeks":4,"sport":null,"timezone":"UTC"},{"weeks":"4","sport":null},{"weeks":5,"sport":null},{"weeks":4,"sport":"unknown-sport"},{"weeks":4,"sport":12},{"weeks":12}]') loop
    begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Bad comparison','comparison',bad);
      assert false,'invalid comparison options'; exception when invalid_parameter_value then assert sqlerrm='INVALID_VIEW_OPTIONS',sqlerrm; end;
  end loop;
  begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,E'Bad\nname','report','{"period":"month","offset":0}');
    assert false,'control characters'; exception when invalid_parameter_value then assert sqlerrm='INVALID_VIEW_OPTIONS',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,repeat('é',41),'report','{"period":"month","offset":0}');
    assert false,'unicode too long'; exception when invalid_parameter_value then assert sqlerrm='INVALID_VIEW_OPTIONS',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('save',null,0,'Name','report','{"period":"month","offset":0}');
    assert false,'null id'; exception when invalid_parameter_value then assert sqlerrm='INVALID_VIEW_OPTIONS',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view(null,id,1);
    assert false,'null action'; exception when invalid_parameter_value then assert sqlerrm='INVALID_VIEW_OPTIONS',sqlerrm; end;
  again:=public.titan_mutate_analysis_view('save',id,1,'Mon année','report','{"period":"year","offset":1}');
  assert again->'view'->>'revision'='2' and again->'view'->'options'->>'period'='year','version increments once';
  begin perform public.titan_mutate_analysis_view('save',id,1,'Stale','report','{"period":"month","offset":0}');
    assert false,'stale update'; exception when serialization_failure then assert sqlerrm='VIEW_VERSION_CONFLICT',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('delete',id,1);
    assert false,'stale delete'; exception when serialization_failure then assert sqlerrm='VIEW_VERSION_CONFLICT',sqlerrm; end;
  for n in 2..10 loop
    perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Vue '||n,'comparison',jsonb_build_object('weeks',12,'sport',case when n=2 then 'running' else null end));
  end loop;
  j:=public.titan_analysis_views(); assert j->>'count'='10' and jsonb_array_length(j->'views')=10,'ten views';
  begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Onzième','report','{"period":"month","offset":0}');
    assert false,'limit'; exception when check_violation then assert sqlerrm='VIEW_LIMIT',sqlerrm; end;
  again:=public.titan_mutate_analysis_view('save',id,2,'Toujours dix','report','{"period":"year","offset":1}');
  assert again->'view'->>'revision'='3','rename allowed at quota';
  assert (select count(*) from private.titan_analysis_views)=10,'own RLS selection';
  begin insert into private.titan_analysis_views(id,user_id,name,kind,options) values(gen_random_uuid(),auth.uid(),'Bypass','report','{"period":"month","offset":0}');
    assert false,'direct insert denied'; exception when insufficient_privilege then null; end;
  begin update private.titan_analysis_views set name='Bypass'; assert false,'direct update denied'; exception when insufficient_privilege then null; end;
  begin delete from private.titan_analysis_views; assert false,'direct delete denied'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.views_b'),'role','authenticated')::text,true);
do $$ declare id uuid:=current_setting('titan.views_id')::uuid; j jsonb; begin
  j:=public.titan_analysis_views(id);
  assert j->>'available'='false' and j->>'reason'='premium_required' and j->>'count'='0' and jsonb_array_length(j->'views')=0,'foreign id and Free status';
  assert (select count(*) from private.titan_analysis_views)=0,'RLS isolates owner';
  begin perform public.titan_mutate_analysis_view('delete',id,3); assert false,'foreign delete';
    exception when no_data_found then assert sqlerrm='VIEW_NOT_FOUND',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Free','report','{"period":"month","offset":0}');
    assert false,'Free cannot create'; exception when insufficient_privilege then assert sqlerrm='PREMIUM_REQUIRED',sqlerrm; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=now()-interval '1 second' where id=current_setting('titan.views_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.views_a'),'role','authenticated')::text,true);
do $$ declare j jsonb; id uuid:=current_setting('titan.views_id')::uuid; begin
  j:=public.titan_analysis_views(); assert j->>'available'='false' and j->>'count'='10','expired parameters retained';
  begin perform public.titan_mutate_analysis_view('save',id,3,'Expired','report','{"period":"month","offset":0}');
    assert false,'expired cannot update'; exception when insufficient_privilege then assert sqlerrm='PREMIUM_REQUIRED',sqlerrm; end;
  j:=public.titan_mutate_analysis_view('delete',id,3);
  assert j->>'action'='delete' and j->>'deleted_id'=id::text,'Free cleanup allowed';
  assert public.titan_analysis_views()->>'count'='9','deleted once';
  begin perform public.titan_mutate_analysis_view('delete',id,3); assert false,'missing delete';
    exception when no_data_found then assert sqlerrm='VIEW_NOT_FOUND',sqlerrm; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=null,elite_refunded_at=now() where id=current_setting('titan.views_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.views_a'),'role','authenticated')::text,true);
do $$ begin assert public.titan_analysis_views()->>'available'='false','refunded unavailable'; end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_refunded_at=null,is_suspended=true where id=current_setting('titan.views_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.views_a'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.titan_analysis_views(); assert false,'suspended read'; exception when insufficient_privilege then assert sqlerrm='PROFILE_UNAVAILABLE',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('save',gen_random_uuid(),0,'Suspended','report','{"period":"month","offset":0}');
    assert false,'suspended save'; exception when insufficient_privilege then assert sqlerrm='PROFILE_UNAVAILABLE',sqlerrm; end;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
  begin perform public.titan_analysis_views(); assert false,'anonymous uid'; exception when insufficient_privilege then assert sqlerrm='AUTH_REQUIRED',sqlerrm; end;
  begin perform public.titan_mutate_analysis_view('delete',gen_random_uuid(),1); assert false,'anonymous mutation'; exception when insufficient_privilege then assert sqlerrm='AUTH_REQUIRED',sqlerrm; end;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.titan_analysis_views(uuid)','execute'),'anonymous read denied';
  assert not has_function_privilege('anon','public.titan_mutate_analysis_view(text,uuid,integer,text,text,jsonb)','execute'),'anonymous mutation denied';
  assert not has_table_privilege('authenticated','private.titan_analysis_views','INSERT,UPDATE,DELETE'),'no direct mutation grants';
  assert (select not prosecdef from pg_proc where oid='public.titan_analysis_views(uuid)'::regprocedure),'read invoker';
  assert (select proconfig @> array['search_path=""'] from pg_proc where oid='public.titan_mutate_analysis_view(text,uuid,integer,text,text,jsonb)'::regprocedure),'definer path empty';
  assert not exists(select 1 from pg_publication_tables where schemaname='private' and tablename='titan_analysis_views'),'no Realtime publication';
  delete from auth.users where id=current_setting('titan.views_a')::uuid;
  assert not exists(select 1 from private.titan_analysis_views where user_id=current_setting('titan.views_a')::uuid),'account deletion cascades presets';
end $$;
rollback;

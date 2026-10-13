-- Existing analytics collector contract. Synthetic identities; no real data; full rollback.
begin;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); begin
  perform set_config('titan.analytics_a',a::text,true);
  perform set_config('titan.analytics_b',b::text,true);
  perform set_config('titan.analytics_granted',gen_random_uuid()::text,true);
  perform set_config('titan.analytics_anonymous',gen_random_uuid()::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.analytics_a'),'role','authenticated')::text,true);
insert into public.analytics_events(id,user_id,event_name,page,source,referrer,metadata)
values(current_setting('titan.analytics_granted')::uuid,auth.uid(),'analysis_view_created','/stats',null,null,
  '{"kind":"report","consent":"granted","v":300}');
do $$ begin
  begin
    insert into public.analytics_events(user_id,event_name,page,metadata)
    values(current_setting('titan.analytics_b')::uuid,'analysis_report_viewed','/stats','{"consent":"granted","v":300}');
    assert false,'a linked analytics event cannot be attributed to another account';
  exception when insufficient_privilege then null; end;
  assert not exists(select 1 from public.analytics_events where id=current_setting('titan.analytics_granted')::uuid),
    'ordinary clients cannot read analytics rows, including their own';
end $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
insert into public.analytics_events(id,user_id,event_name,page,source,referrer,metadata)
values(current_setting('titan.analytics_anonymous')::uuid,null,'analysis_report_viewed','/stats',null,null,
  '{"consent":"anonymous","v":300}');
do $$ begin
  begin
    insert into public.analytics_events(user_id,event_name,page,metadata)
    values(current_setting('titan.analytics_a')::uuid,'analysis_report_viewed','/stats','{"consent":"granted","v":300}');
    assert false,'an anonymous collector cannot link an event to an account';
  exception when insufficient_privilege then null; end;
  assert not exists(select 1 from public.analytics_events where id=current_setting('titan.analytics_anonymous')::uuid),
    'anonymous clients cannot read analytics rows';
end $$;

reset role;
do $$ begin
  assert (select count(*)=1 from public.analytics_events
    where id=current_setting('titan.analytics_granted')::uuid and user_id=current_setting('titan.analytics_a')::uuid
      and event_name='analysis_view_created' and page='/stats' and source is null and referrer is null
      and metadata='{"kind":"report","consent":"granted","v":300}'::jsonb),
    'accepted linked collector row retains the minimal payload';
  assert (select count(*)=1 from public.analytics_events
    where id=current_setting('titan.analytics_anonymous')::uuid and user_id is null
      and event_name='analysis_report_viewed' and source is null and referrer is null
      and metadata='{"consent":"anonymous","v":300}'::jsonb),
    'accepted anonymous collector row carries no account or attribution';
end $$;
rollback;

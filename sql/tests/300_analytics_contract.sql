-- New API writes must obey the documented collector contract; historical rows are not revalidated.
-- Removing/bypassing the restrictive policy must fail these actual INSERT tests.
begin;
select set_config('titan.analytics_contract_owner',gen_random_uuid()::text,true);
select set_config('titan.analytics_contract_before',(select count(*)::text from public.analytics_events),true);
insert into auth.users(id,raw_user_meta_data) values(current_setting('titan.analytics_contract_owner')::uuid,'{}');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare
  name text; props jsonb; mode text;
begin
  foreach name in array array[
    'signup','onboarding_completed','first_session','second_session','goal_created','record_unlocked',
    'campaign_started','campaign_progress','challenge_joined','weekly_recap_viewed',
    'premium_checkout_started','premium_activated','sport_navigation_searched','sport_navigation_filtered',
    'analysis_comparison_viewed','analysis_report_viewed','analysis_report_exported',
    'analysis_view_created','analysis_view_renamed','analysis_view_deleted','analysis_view_opened','dynamic_page_opened'
  ] loop
    props:=case when name like 'analysis_view_%' then '{"kind":"report"}'::jsonb
      when name like 'analysis_%' or name='dynamic_page_opened' then '{}'::jsonb
      else '{"family":"cardio","sport":"running","step":12,"source":7,"plan":300,"world":"mist","chapter":2,"kind":"time","count":12}'::jsonb end;
    foreach mode in array array['anonymous','granted'] loop
      -- Granted without an auth session is an existing supported confirmation-only/guest case.
      insert into public.analytics_events(user_id,event_name,page,source,referrer,metadata)
      values(null,name,'/stats',null,null,props||jsonb_build_object('consent',mode,'v',300));
    end loop;
  end loop;
end $$;

do $$ declare label text; patch jsonb; row jsonb; failures text[]:='{}'; begin
  for label,patch in select * from (values
    ('unknown event','{"event_name":"private_health_event"}'::jsonb),
    ('historical admin filter is not a current producer','{"event_name":"page_view"}'::jsonb),
    ('missing consent','{"metadata":{"v":300}}'::jsonb),
    ('refused consent','{"metadata":{"consent":"denied","v":300}}'::jsonb),
    ('unknown consent','{"metadata":{"consent":"other","v":300}}'::jsonb),
    ('missing version','{"metadata":{"consent":"anonymous"}}'::jsonb),
    ('wrong version','{"metadata":{"consent":"anonymous","v":299}}'::jsonb),
    ('string version','{"metadata":{"consent":"anonymous","v":"300"}}'::jsonb),
    ('metadata array','{"metadata":["private"]}'::jsonb),
    ('metadata string','{"metadata":"private"}'::jsonb),
    ('metadata number','{"metadata":1}'::jsonb),
    ('metadata null','{"metadata":null}'::jsonb),
    ('notes','{"metadata":{"consent":"anonymous","v":300,"notes":"private"}}'::jsonb),
    ('GPS','{"metadata":{"consent":"anonymous","v":300,"gps":[1,2]}}'::jsonb),
    ('property array','{"metadata":{"consent":"anonymous","v":300,"family":["cardio"]}}'::jsonb),
    ('property boolean','{"metadata":{"consent":"anonymous","v":300,"family":true}}'::jsonb),
    ('property null','{"metadata":{"consent":"anonymous","v":300,"family":null}}'::jsonb),
    ('non-ASCII property','{"metadata":{"consent":"anonymous","v":300,"family":"cardié"}}'::jsonb),
    ('numeric sport','{"metadata":{"consent":"anonymous","v":300,"sport":42}}'::jsonb),
    ('invalid family','{"metadata":{"consent":"anonymous","v":300,"family":"private text"}}'::jsonb),
    ('unbounded property','{"metadata":{"consent":"anonymous","v":300,"step":"abcdefghijklmnopqrstuvwxyz12345"}}'::jsonb),
    ('string count','{"metadata":{"consent":"anonymous","v":300,"count":"2"}}'::jsonb),
    ('fractional count','{"metadata":{"consent":"anonymous","v":300,"count":1.5}}'::jsonb),
    ('unbounded count','{"metadata":{"consent":"anonymous","v":300,"count":10000}}'::jsonb),
    ('query in pathname','{"page":"/stats?notes=private"}'::jsonb),
    ('fragment in pathname','{"page":"/stats#private"}'::jsonb),
    ('absolute page URL','{"page":"https://example.test/private"}'::jsonb),
    ('missing page','{"page":null}'::jsonb),
    ('unbounded page',jsonb_build_object('page','/'||repeat('p',80))),
    ('control in page',jsonb_build_object('page',E'/stats\nprivate')),
    ('referrer','{"referrer":"https://example.test/private"}'::jsonb),
    ('anonymous UTM','{"source":"private"}'::jsonb),
    ('analysis detail','{"event_name":"analysis_report_viewed","metadata":{"consent":"anonymous","v":300,"sport":"running"}}'::jsonb),
    ('invalid view kind','{"event_name":"analysis_view_created","metadata":{"consent":"anonymous","v":300,"kind":"private"}}'::jsonb),
    ('view extra field','{"event_name":"analysis_view_opened","metadata":{"consent":"anonymous","v":300,"kind":"report","count":1}}'::jsonb),
    ('public slug','{"event_name":"dynamic_page_opened","metadata":{"consent":"anonymous","v":300,"slug":"private"}}'::jsonb),
    ('public ordinary property','{"event_name":"dynamic_page_opened","metadata":{"consent":"anonymous","v":300,"sport":"running"}}'::jsonb),
    ('public granted UTM','{"event_name":"dynamic_page_opened","source":"private","metadata":{"consent":"granted","v":300}}'::jsonb),
    ('analysis granted UTM','{"event_name":"analysis_report_viewed","source":"private","metadata":{"consent":"granted","v":300}}'::jsonb)
  ) cases(label,patch) loop
    row:='{"event_name":"first_session","page":"/stats","metadata":{"consent":"anonymous","v":300}}'::jsonb||patch;
    begin
      insert into public.analytics_events(event_name,page,source,referrer,metadata)
      values(row->>'event_name',row->>'page',row->>'source',row->>'referrer',row->'metadata');
      failures:=array_append(failures,label);
    exception when insufficient_privilege then null; end;
  end loop;
  insert into public.analytics_events(user_id,event_name,page,source,metadata)
  values(auth.uid(),'first_session','/'||repeat('p',79),repeat('s',40),
    '{"consent":"granted","v":300,"chapter":99,"count":9999}');
  insert into public.analytics_events(event_name,page,metadata)
  values('first_session','/stats',
    '{"consent":"granted","v":300,"chapter":99.0,"count":9999.0,"step":12.0,"source":7.0,"plan":300.0,"world":12.0}');
  assert cardinality(failures)=0,'accepted forbidden API payloads: '||array_to_string(failures,', ');
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.analytics_contract_owner'),'role','authenticated')::text,true);
do $$ declare name text; props jsonb; bad jsonb; failures text[]:='{}'; begin
  foreach name in array array[
    'signup','onboarding_completed','first_session','second_session','goal_created','record_unlocked',
    'campaign_started','campaign_progress','challenge_joined','weekly_recap_viewed',
    'premium_checkout_started','premium_activated','sport_navigation_searched','sport_navigation_filtered',
    'analysis_comparison_viewed','analysis_report_viewed','analysis_report_exported',
    'analysis_view_created','analysis_view_renamed','analysis_view_deleted','analysis_view_opened','dynamic_page_opened'
  ] loop
    props:=case when name like 'analysis_view_%' then '{"kind":"comparison"}'::jsonb
      when name like 'analysis_%' or name='dynamic_page_opened' then '{}'::jsonb
      else '{"family":"cardio","sport":"42","step":"finish","source":"atelier","plan":"monthly","world":12,"chapter":0,"kind":"time","count":0}'::jsonb end;
    insert into public.analytics_events(user_id,event_name,page,source,referrer,metadata)
    values(auth.uid(),name,'/stats',case when name like 'analysis_%' or name='dynamic_page_opened' then null else 'fixture_campaign' end,null,
      props||'{"consent":"granted","v":300}'::jsonb);
  end loop;
  -- Every API role is restricted, even when it owns the supplied account.
  for bad in select value from jsonb_array_elements('[
    {"consent":"denied","v":300}, {"consent":"anonymous","v":300},
    {"consent":"granted","v":300,"notes":"private"}
  ]'::jsonb) loop
    begin
      insert into public.analytics_events(user_id,event_name,page,metadata)
      values(auth.uid(),'first_session','/stats',bad);
      failures:=array_append(failures,bad::text);
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    insert into public.analytics_events(event_name,page,metadata)
    values('first_session','/stats','{"consent":"granted","v":300}');
    failures:=array_append(failures,'unlinked authenticated event');
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events(user_id,event_name,page,source,metadata)
    values(auth.uid(),'first_session','/stats',repeat('s',41),'{"consent":"granted","v":300}');
    failures:=array_append(failures,'unbounded granted UTM');
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events(event_name,page,metadata)
    values('first_session','/stats','{"consent":"anonymous","v":300}');
    failures:=array_append(failures,'anonymous event using account auth');
  exception when insufficient_privilege then null; end;
  assert cardinality(failures)=0,'accepted forbidden authenticated payloads: '||array_to_string(failures,', ');
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.analytics_events)=current_setting('titan.analytics_contract_before')::bigint+68,
    'all 22 names accept existing anonymous, sessionless-granted and authenticated envelopes, without extra writes';
end $$;
rollback;

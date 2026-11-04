-- Real INSERT/RLS checks for minimal support counters; no ticket fixtures/content required.
begin;
-- Reapplication must preserve old rows and remain inside the caller's transaction.
insert into public.analytics_events(event_name,page,metadata) values('historical_support_fixture','/old','{"legacy":"PRIVATE"}');
\ir ../../supabase/migrations/20261013074320_analytics_support_metadata_v300.sql
\ir ../../supabase/migrations/20261013074320_analytics_support_metadata_v300.sql
do $$ begin
  if not exists(select 1 from public.analytics_events where event_name='historical_support_fixture') then raise exception 'support migration changed history'; end if;
end $$;
select set_config('titan.support_analytics_owner',gen_random_uuid()::text,true);
insert into auth.users(id,raw_user_meta_data) values(current_setting('titan.support_analytics_owner')::uuid,'{}');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
insert into public.analytics_events(user_id,event_name,page,metadata) values(null,'support_opened','/service','{"consent":"granted","v":300}');
do $$ declare category text; outcome text; begin
  foreach category in array array['bug','compte','titanplus','donnees','communaute','autre'] loop
    insert into public.analytics_events(user_id,event_name,page,metadata)
    values(null,'support_category_selected','/social',jsonb_build_object('consent','granted','v',300,'category',category));
    foreach outcome in array array['received','rejected','uncertain','unavailable','offline'] loop
      insert into public.analytics_events(user_id,event_name,page,metadata)
      values(null,'support_submission_result','/social',jsonb_build_object('consent','granted','v',300,'category',category,'result',outcome));
    end loop;
  end loop;
end $$;
do $$ declare patch jsonb; row jsonb; begin
  for patch in select value from jsonb_array_elements('[
    {"metadata":{"consent":"anonymous","v":300}},
    {"metadata":{"consent":"granted","v":300,"message":"PRIVATE"}},
    {"metadata":{"consent":"granted","v":300,"request_id":"PRIVATE"}},
    {"metadata":{"consent":"granted","v":300,"reference":"PRIVATE"}},
    {"metadata":{"consent":"granted","v":300,"diagnostics":"PRIVATE"}},
    {"metadata":{"consent":"granted","v":300,"family":"cardio"}},
    {"metadata":{"consent":"granted","v":300,"category":"bug"}},
    {"source":"PRIVATE"}, {"referrer":"PRIVATE"}, {"page":"/profile"}, {"page":"/service?PRIVATE"},
    {"event_name":"support_category_selected"},
    {"event_name":"support_category_selected","metadata":{"consent":"granted","v":300,"category":["bug"]}},
    {"event_name":"support_category_selected","metadata":{"consent":"granted","v":300,"category":"PRIVATE"}},
    {"event_name":"support_submission_result","metadata":{"consent":"granted","v":300,"category":"bug"}},
    {"event_name":"support_submission_result","metadata":{"consent":"granted","v":300,"category":"bug","result":"PRIVATE"}},
    {"event_name":"support_submission_result","metadata":{"consent":"granted","v":300,"category":"bug","result":["received"]}}
  ]'::jsonb) loop
    row:='{"event_name":"support_opened","page":"/service","metadata":{"consent":"granted","v":300}}'::jsonb||patch;
    begin
      insert into public.analytics_events(user_id,event_name,page,source,referrer,metadata)
      values(null,row->>'event_name',row->>'page',row->>'source',row->>'referrer',row->'metadata');
      raise exception 'support analytics accepted unsafe patch %',patch;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('titan.support_analytics_owner'))::text,true);
select set_config('request.jwt.claim.sub',current_setting('titan.support_analytics_owner'),true);
do $$ begin
  begin
    insert into public.analytics_events(user_id,event_name,page,metadata)
    values(current_setting('titan.support_analytics_owner')::uuid,'support_opened','/service','{"consent":"granted","v":300}');
    raise exception 'support analytics must not accept an account-linked counter';
  exception when insufficient_privilege then null; end;
  -- The old consented event continues to support authenticated account attribution.
  insert into public.analytics_events(user_id,event_name,page,metadata)
  values(current_setting('titan.support_analytics_owner')::uuid,'first_session','/training','{"consent":"granted","v":300}');
end $$;
rollback;

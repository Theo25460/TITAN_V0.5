-- « Partager » (before V2): the four story-card events are accepted with `kind` = session | achievement only, never with a sport,
-- a value, a name or a campaign attribution; every earlier rule of the collector contract still applies to them.
begin;
select set_config('titan.share_story_owner',gen_random_uuid()::text,true);
insert into auth.users(id,raw_user_meta_data) values(current_setting('titan.share_story_owner')::uuid,'{}');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare name text; kind text; mode text; label text; patch jsonb; row jsonb; failures text[]:='{}'; begin
  foreach name in array array['share_preview_opened','share_export_succeeded','share_export_failed','share_sheet_opened'] loop
    foreach kind in array array['session','achievement'] loop
      foreach mode in array array['anonymous','granted'] loop
        insert into public.analytics_events(user_id,event_name,page,source,referrer,metadata)
        values(null,name,'/journal',null,null,jsonb_build_object('kind',kind,'consent',mode,'v',300));
      end loop;
    end loop;
    -- No property at all is accepted too (an older client sending the name alone).
    insert into public.analytics_events(event_name,page,metadata) values(name,'/records','{"consent":"anonymous","v":300}');
  end loop;

  for label,patch in select * from (values
    ('sport','{"metadata":{"consent":"anonymous","v":300,"kind":"session","sport":"running"}}'::jsonb),
    ('family','{"metadata":{"consent":"anonymous","v":300,"family":"endurance"}}'::jsonb),
    ('value','{"metadata":{"consent":"anonymous","v":300,"count":10}}'::jsonb),
    ('unknown kind','{"metadata":{"consent":"anonymous","v":300,"kind":"record"}}'::jsonb),
    ('numeric kind','{"metadata":{"consent":"anonymous","v":300,"kind":1}}'::jsonb),
    ('name','{"metadata":{"consent":"anonymous","v":300,"kind":"session","name":"private"}}'::jsonb),
    ('anonymous UTM','{"source":"instagram"}'::jsonb),
    ('refused consent','{"metadata":{"consent":"denied","v":300,"kind":"session"}}'::jsonb),
    ('query in page','{"page":"/journal?id=private"}'::jsonb),
    ('lookalike name','{"event_name":"share_published"}'::jsonb)
  ) cases(label,patch) loop
    row:='{"event_name":"share_export_succeeded","page":"/journal","metadata":{"consent":"anonymous","v":300,"kind":"session"}}'::jsonb||patch;
    begin
      insert into public.analytics_events(event_name,page,source,referrer,metadata)
      values(row->>'event_name',row->>'page',row->>'source',row->>'referrer',row->'metadata');
      failures:=array_append(failures,label);
    exception when insufficient_privilege then null; end;
  end loop;
  assert cardinality(failures)=0,'accepted forbidden share payloads: '||array_to_string(failures,', ');
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.share_story_owner'),'role','authenticated')::text,true);
do $$ declare failures text[]:='{}'; begin
  insert into public.analytics_events(user_id,event_name,page,metadata)
  values(auth.uid(),'share_sheet_opened','/training','{"consent":"granted","v":300,"kind":"achievement"}');
  -- Granted consent still carries no campaign attribution for these events.
  begin
    insert into public.analytics_events(user_id,event_name,page,source,metadata)
    values(auth.uid(),'share_preview_opened','/training','fixture_campaign','{"consent":"granted","v":300,"kind":"session"}');
    failures:=array_append(failures,'granted UTM');
  exception when insufficient_privilege then null; end;
  assert cardinality(failures)=0,'accepted forbidden share payloads: '||array_to_string(failures,', ');
  -- The earlier events keep their rules: a share name does not widen them.
  insert into public.analytics_events(user_id,event_name,page,source,metadata)
  values(auth.uid(),'first_session','/stats','fixture_campaign','{"consent":"granted","v":300,"kind":"time"}');
end $$;
rollback;

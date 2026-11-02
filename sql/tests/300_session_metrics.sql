-- V11-09R: server-side typed correction, backward compatibility and conditional fields.
begin;
insert into public.sports(id,label,category,is_active,extra_fields) values (
 '__metric_fixture','Test-only metrics','skill',false,
 '[{"id":"cadence","type":"number","min":0,"max":220},{"id":"mode","type":"select","options":["Match","Training"]},{"id":"recorded","type":"checkbox"},{"id":"note","type":"text"},{"id":"goals","type":"number","min":0,"max":20,"visibleWhen":{"field":"mode","equals":"Match"}}]'::jsonb
);
do $$
declare v jsonb; payload jsonb;
begin
 assert not has_function_privilege('anon','private.titan_merge_session_metrics_v1(text,jsonb,jsonb)','EXECUTE'), 'anonymous cannot invoke private metric helper';
 assert not has_function_privilege('authenticated','private.titan_merge_session_metrics_v1(text,jsonb,jsonb)','EXECUTE'), 'helper is only reachable through the owner-checked edit RPC';
 v:=private.titan_merge_session_metrics_v1('__metric_fixture','{"old_field":"kept","cadence":90}', '{"cadence":95,"mode":"Match","goals":2,"recorded":false}');
 assert v->>'old_field'='kept' and v->'cadence'='95' and v->'recorded'='false', 'typed merge preserves old data and false';
 v:=private.titan_merge_session_metrics_v1('__metric_fixture',v,'{"cadence":null,"mode":"Training"}');
 assert v->'cadence'='null' and not v ? 'goals', 'clear optional and now-hidden data';
 for payload in select * from jsonb_array_elements('[{"cadence":999},{"cadence":true},{"mode":"invalid"},{"recorded":"yes"},{"unknown":2},{"mode":"Training","goals":3}]') loop
  begin
   perform private.titan_merge_session_metrics_v1('__metric_fixture','{}',payload);
   raise exception 'MISSING_VALIDATION: %',payload;
  exception when others then
   if sqlerrm not like '%EXTRAS_INVALID%' then raise; end if;
  end;
 end loop;
end $$;
rollback;

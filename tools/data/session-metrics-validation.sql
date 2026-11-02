-- Validates only sport catalog fields and the historical structured climbing keys.
-- Called by the existing owner/revision-checked edit RPC, never a public endpoint.
create or replace function private.titan_merge_session_metrics_v1(p_sport text,p_previous jsonb,p_patch jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 fields jsonb; merged jsonb; item record; field_spec jsonb; val text; n numeric; rule jsonb; controller jsonb;
begin
 if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>5000 then raise exception 'EXTRAS_INVALID'; end if;
 select s.extra_fields into fields from public.sports s where s.id=p_sport;
 if fields is null then raise exception 'EXTRAS_INVALID'; end if;
 merged := coalesce(p_previous,'{}'::jsonb) || p_patch;
 for item in select key,value from jsonb_each(p_patch) loop
  select f into field_spec from jsonb_array_elements(fields) f where f->>'id'=item.key limit 1;
  if field_spec is null and item.key not in ('climbing_discipline','belay','location','grade_system','max_attempt','max_done','attempts','successful_routes','session_type','result','score') then raise exception 'EXTRAS_INVALID'; end if;
  if item.value='null'::jsonb then continue; end if;
  if octet_length(item.value::text)>500 then raise exception 'EXTRAS_INVALID'; end if;
  val := item.value#>>'{}';
  if field_spec is null then
   if jsonb_typeof(item.value) not in ('string','number') or length(val)>120 then raise exception 'EXTRAS_INVALID'; end if;
   if item.key in ('attempts','successful_routes') and (val !~ '^[0-9]{1,3}$' or val::numeric>500) then raise exception 'EXTRAS_INVALID'; end if;
  elsif field_spec->>'type'='number' then
   if jsonb_typeof(item.value) not in ('number','string') or val !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then raise exception 'EXTRAS_INVALID'; end if;
   n := val::numeric;
   if (field_spec->>'min' is not null and n<(field_spec->>'min')::numeric) or (field_spec->>'max' is not null and n>(field_spec->>'max')::numeric) then raise exception 'EXTRAS_INVALID'; end if;
   merged := jsonb_set(merged,array[item.key],to_jsonb(n));
  elsif field_spec->>'type'='select' then
   if jsonb_typeof(item.value)<>'string' or not coalesce(field_spec->'options' ? val,false) then raise exception 'EXTRAS_INVALID'; end if;
  elsif field_spec->>'type'='checkbox' then
   if jsonb_typeof(item.value)<>'boolean' then raise exception 'EXTRAS_INVALID'; end if;
  elsif field_spec->>'type'='text' then
   if jsonb_typeof(item.value)<>'string' or length(val)>120 then raise exception 'EXTRAS_INVALID'; end if;
  else raise exception 'EXTRAS_INVALID';
  end if;
  rule := field_spec->'visibleWhen';
  if rule ? 'field' then
   controller := merged->(rule->>'field');
   if (rule ? 'equals' and controller is distinct from rule->'equals') or
      (rule ? 'in' and not coalesce(rule->'in' @> jsonb_build_array(controller),false)) then raise exception 'EXTRAS_INVALID'; end if;
  end if;
 end loop;
 -- Changing a controller must also remove old now-hidden data.
 for field_spec in select * from jsonb_array_elements(fields) loop
  rule := field_spec->'visibleWhen';
  if rule ? 'field' and p_patch ? (rule->>'field') then
   controller := merged->(rule->>'field');
   if (rule ? 'equals' and controller is distinct from rule->'equals') or
      (rule ? 'in' and not coalesce(rule->'in' @> jsonb_build_array(controller),false)) then
    merged := merged - (field_spec->>'id');
   end if;
  end if;
 end loop;
 return merged;
end $$;
revoke all on function private.titan_merge_session_metrics_v1(text,jsonb,jsonb) from public,anon,authenticated;

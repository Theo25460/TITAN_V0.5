-- Read-only. Run alongside postflight-v13.sql after the authorized migration window.
-- Every row must be true before exposing the corresponding services.
with versions(version) as (values
  ('20261110140000'), ('20261110142656'), ('20261110152700'), ('20261110152800'), ('20261110152900')
), restricted(signature) as (values
  ('private.titan_coach_seat_write(uuid,uuid,boolean,timestamptz)'),
  ('public.titan_garmin_ingest_dailies_v1(jsonb)'),
  ('public.titan_garmin_ingest_v1(text,jsonb)'),
  ('public.titan_apply_play_entitlement_v1(uuid,text,boolean,text,text,timestamptz,boolean,text,text,text,timestamptz,timestamptz,boolean)'),
  ('public.titan_play_checkout_ready_v1(uuid)'),
  ('public.titan_play_entitlements_due_v1(integer)')
), expected_plans(product_id, plan) as (values
  ('titan01', 'titan_plus'), ('titan02', 'coach'), ('titan03', 'coach_pro')
)
select 'ledger:' || v.version as "check", exists (
  select 1 from supabase_migrations.schema_migrations m where m.version = v.version
) as ok from versions v
union all
select 'friendships:direct insert blocked', coalesce(
  not has_table_privilege('authenticated', to_regclass('public.friendships'), 'INSERT')
  and not has_any_column_privilege('authenticated', to_regclass('public.friendships'), 'INSERT'), false
)
union all
select 'rpc:' || r.signature, coalesce(
  not has_function_privilege('anon', to_regprocedure(r.signature), 'EXECUTE')
  and not has_function_privilege('authenticated', to_regprocedure(r.signature), 'EXECUTE')
  and (r.signature like 'private.%' or has_function_privilege('service_role', to_regprocedure(r.signature), 'EXECUTE')), false
) from restricted r
union all
select 'play-plan:' || p.product_id, exists (
  select 1 from private.titan_plan_products configured where configured.product_id = p.product_id and configured.plan = p.plan
) from expected_plans p
order by ok, "check";

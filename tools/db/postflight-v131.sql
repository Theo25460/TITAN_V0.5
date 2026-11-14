-- Read-only. Run alongside postflight-v13.sql after the authorized migration window.
-- Every row must be true before exposing the corresponding services.
with versions(version) as (values
  ('20261110140000'), ('20261110142656'), ('20261110152700'), ('20261110152800'), ('20261110152900'), ('20261114160000')
), restricted(signature) as (values
  ('private.titan_coach_plan(uuid)'),
  ('private.titan_coach_capacity(uuid)'),
  ('private.titan_coach_seat_write(uuid,uuid,boolean,timestamptz)'),
  ('private.titan_coach_sync_seats(uuid)'),
  ('private.titan_coach_seats_sweep()'),
  ('private.titan_entitlements_coach_hook()'),
  ('public.titan_garmin_ingest_dailies_v1(jsonb)'),
  ('public.titan_garmin_ingest_v1(text,jsonb)'),
  ('public.titan_apply_play_entitlement_v1(uuid,text,boolean,text,text,timestamptz,boolean,text,text,text,timestamptz,timestamptz,boolean)'),
  ('public.titan_play_checkout_ready_v1(uuid)'),
  ('public.titan_play_entitlements_due_v1(integer)')
), expected_plans(product_id, plan) as (values
  ('titan01', 'titan_plus'), ('titan02', 'coach'), ('titan03', 'coach_pro')
), api_roles(role_name) as (values
  ('public'), ('anon'), ('authenticated')
), hardened(signature, marker, player_rpc) as (values
  -- 20261114160000: the body carries the rule (marker), runs with an empty search_path, is closed to anonymous callers
  -- and, for the functions players call, stays open to signed-in players.
  ('public.titan_guard_friendship_delete()', 'titan.friendship_delete', false),
  ('public.delete_own_account()', 'titan.friendship_delete', true),
  ('public.titan_block_user(uuid,text)', 'titan.friendship_delete', true),
  ('public.titan_block_user(uuid,text)', 'titan_challenge_members', true),
  ('public.titan_create_social_challenge(uuid,text,numeric)', 'titan_are_friends', true),
  ('public.titan_social_overview()', '''Participant''', true),
  ('public.titan_challenge_link_accept_v1(text)', 'm.user_id = k.blocker_id', true),
  ('public.titan_social_request(text)', 'unique_violation', true),
  ('public.titan_admin_role(uuid)', 'ADMIN_REQUIRED', true),
  ('public.titan_is_admin(uuid)', 'current_user', true),
  ('private.titan_friendship_status_guard()', 'current_user', false)
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
select 'friendships:direct write blocked:' || a.role_name, coalesce(
  not has_table_privilege(a.role_name, to_regclass('public.friendships'), 'INSERT')
  and not has_any_column_privilege(a.role_name, to_regclass('public.friendships'), 'INSERT')
  and not has_table_privilege(a.role_name, to_regclass('public.friendships'), 'UPDATE')
  and not has_any_column_privilege(a.role_name, to_regclass('public.friendships'), 'UPDATE'), false
) from api_roles a
union all
select 'friendships:no write policy', not exists (
  select 1 from pg_policy p where p.polrelid = to_regclass('public.friendships') and p.polcmd in ('a', 'w', '*')
)
union all
select 'friendships:status pending or accepted, validated', exists (
  select 1 from pg_constraint c where c.conrelid = to_regclass('public.friendships') and c.conname = 'friendships_status_check'
    and c.contype = 'c' and c.convalidated and pg_get_constraintdef(c.oid) like '%pending%' and pg_get_constraintdef(c.oid) like '%accepted%'
)
union all
select 'friendships:status never null, pending by default', coalesce((
  select a.attnotnull and pg_get_expr(d.adbin, d.adrelid) = '''pending''::text'
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = to_regclass('public.friendships') and a.attname = 'status'), false)
union all
select 'friendships:status guard runs as the writing role', exists (
  select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
   where t.tgrelid = to_regclass('public.friendships') and t.tgname = 'titan_friendships_status_guard' and t.tgenabled = 'O'
     and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16
     and f.oid = to_regprocedure('private.titan_friendship_status_guard()') and not f.prosecdef
)
union all
select 'hardened:' || h.signature || ':' || h.marker, coalesce((
  select position(h.marker in f.prosrc) > 0
     and exists (select 1 from unnest(f.proconfig) c where c = 'search_path=""')
     and not has_function_privilege('anon', f.oid, 'EXECUTE')
     and (not h.player_rpc or has_function_privilege('authenticated', f.oid, 'EXECUTE'))
    from pg_proc f where f.oid = to_regprocedure(h.signature)), false
) from hardened h
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

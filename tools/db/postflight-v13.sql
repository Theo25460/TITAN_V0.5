-- Lecture seule. Ce SELECT inspecte l'historique, les catalogues et la configuration, sans données de compte.
-- À exécuter après l'application autorisée. Chaque ligne bloquante doit avoir ok=true.
with expected_versions(version) as (values
  ('20261105213712'),
  ('20261110130137')
), expected_tables(relation) as (values
  ('private.titan_journey_configs'),
  ('private.titan_journey_discovery_config'),
  ('private.titan_journey_career_config'),
  ('private.titan_journey_acquisitions'),
  ('private.titan_journey_verified_days')
), table_state as (
  select t.relation, c.oid, c.relrowsecurity, c.relkind
  from expected_tables t left join pg_class c on c.oid = to_regclass(t.relation)
), expected_functions(signature, volatility, definer, authenticated_execute, service_execute) as (values
  ('public.titan_journey_snapshot_v1()', 's', false, true, false),
  ('public.titan_journey_sync_v1()', 'v', false, true, false),
  ('private.titan_journey_snapshot_v1()', 's', true, true, false),
  ('private.titan_journey_sync_v1()', 'v', true, true, false),
  ('private.titan_journey_days_v1()', 's', true, false, false),
  ('private.titan_journey_observed_days_v1()', 's', true, false, false),
  ('private.titan_export_extras_v1(uuid)', 's', true, false, false),
  ('private.titan_export_extras_before_journey_v1(uuid)', 's', true, false, false),
  ('private.titan_entitlement_refresh_profile(uuid)', 'v', true, false, false),
  ('public.titan_journey_attest_day_v1(text,text,date,integer)', 'v', false, false, true),
  ('private.titan_journey_attest_day_v1(text,text,date,integer)', 'v', true, false, true)
), function_state as (
  select e.*, p.oid, p.provolatile, p.prosecdef, p.proconfig, p.proacl, p.proowner
  from expected_functions e left join pg_proc p on p.oid = to_regprocedure(e.signature)
), checks(check_name, blocking, ok, detail) as (
  select 'ledger:V1.1 prerequisite', true,
    exists(select 1 from supabase_migrations.schema_migrations where version = '20261104085851'),
    'le correctif historique des conflits métier figure dans le registre'
  union all
  select 'ledger:V1.3:' || v.version, true,
    exists(select 1 from supabase_migrations.schema_migrations m where m.version = v.version),
    'version exacte du lot présente' from expected_versions v
  union all
  select 'ledger:unexpected V1.3', true, not exists(
    select 1 from supabase_migrations.schema_migrations m
    where m.version > '20261104085851' and m.version <= (select max(version) from expected_versions)
      and not exists (select 1 from expected_versions v where v.version = m.version)),
    'aucune version inconnue dans ce lot'
  union all
  select 'schema:private:RPC usage', true, coalesce(
    has_schema_privilege('authenticated', to_regnamespace('private'), 'USAGE')
    and has_schema_privilege('service_role', to_regnamespace('private'), 'USAGE'), false),
    'les deux rôles peuvent atteindre les fonctions privées dont dépendent leurs RPC'
  union all
  select 'table:' || relation || ':RLS', true, coalesce(relkind in ('r', 'p') and relrowsecurity, false),
    'table présente et RLS activée' from table_state
  union all
  select 'table:' || relation || ':API privileges', true, oid is not null and coalesce(
    not has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES')
    and not has_any_column_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,REFERENCES'), false),
    'aucun accès API direct ou hérité' from table_state
  union all
  select 'rpc:' || signature || ':contract', true, oid is not null and coalesce(
    provolatile::text = volatility and prosecdef = definer
    and exists(select 1 from unnest(proconfig) setting where setting = 'search_path=""'), false),
    'volatilité, mode de sécurité et chemin vide conformes' from function_state
  union all
  select 'rpc:' || signature || ':API privileges', true, oid is not null and coalesce(
    not has_function_privilege('anon', oid, 'EXECUTE')
    and has_function_privilege('authenticated', oid, 'EXECUTE') = authenticated_execute
    and (not service_execute or has_function_privilege('service_role', oid, 'EXECUTE'))
    and not exists(select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'), false),
    'droits authentifiés et service conformes, aucun appel anonyme ou PUBLIC' from function_state
  union all
  select 'acquisitions:unique owner track id', true, exists(
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('private.titan_journey_acquisitions') and c.contype = 'p'
      and (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(num, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num) = array['user_id', 'track', 'id']),
    'une acquisition par propriétaire et souvenir'
  union all
  select 'acquisitions:account cascade', true, exists(
    select 1 from pg_constraint c where c.conrelid = to_regclass('private.titan_journey_acquisitions')
      and c.contype = 'f' and c.confrelid = to_regclass('auth.users') and c.confdeltype = 'c'),
    'journal effacé avec le compte Auth'
  union all
  select 'config:one active version', true, exists(
    select 1 from pg_index i where i.indrelid = to_regclass('private.titan_journey_configs')
      and i.indisunique and i.indisvalid and pg_get_expr(i.indpred, i.indrelid) = 'active'
      and (select array_agg(a.attname::text order by k.ord) from unnest(i.indkey) with ordinality k(num, ord)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.num) = array['active']),
    'index unique partiel du catalogue actif'
  union all
  select 'config:active catalogue', true,
    (select count(*) = 1 from private.titan_journey_configs where active),
    'une version active du catalogue est disponible'
  union all
  select 'export:journey and predecessor', true, coalesce(
    pg_get_functiondef(to_regprocedure('private.titan_export_extras_v1(uuid)')) like '%private.titan_export_extras_before_journey_v1(p_uid)%'
    and pg_get_functiondef(to_regprocedure('private.titan_export_extras_v1(uuid)')) like '%''journey''%'
    and pg_get_functiondef(to_regprocedure('private.titan_export_extras_v1(uuid)')) like '%''journeyVerifiedDailyActivity''%'
    and to_regprocedure('private.titan_export_extras_before_journey_v1(uuid)') is not null, false),
    'journal ajouté à la chaîne d’export conservée'
)
select check_name as "check", blocking, ok, detail from checks order by blocking desc, ok, check_name;

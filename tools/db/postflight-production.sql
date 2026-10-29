-- Contrôle APRÈS les 29 migrations 20261008110220 → 20261021020000, avant publication du site.
-- LECTURE SEULE : un SELECT, uniquement historique et catalogues, aucune donnée de compte.
-- Toutes les lignes blocking=true doivent avoir ok=true. Ce contrôle ne remplace ni la
-- restauration de sauvegarde ni la répétition et la mesure de la purge sur cette copie.
-- pg_cron est absent du banc local : son contrôle est séparé et OBLIGATOIRE sur la cible.
-- Exécuter uniquement si l'extension existe ; exiger exactement une ligne et les quatre true :
-- select jobname, active, schedule = '20 4 * * *' as schedule_ok,
--        database = current_database() as database_ok,
--        command = 'select private.titan_purge_expired_data_v1();' as command_ok
-- from cron.job where jobname = 'titan_purge_expired_data';
with
expected_migrations(version) as (values
  ('20261008110220'), ('20261008113411'), ('20261008120931'),
  ('20261008180429'), ('20261009205151'), ('20261009212850'),
  ('20261010163122'), ('20261011061707'), ('20261011213600'),
  ('20261013074320'), ('20261019053123'), ('20261019062757'),
  ('20261019090000'), ('20261019120000'), ('20261019122259'),
  ('20261019150000'), ('20261019180000'), ('20261019200000'),
  ('20261019210000'), ('20261019220000'), ('20261019230000'),
  ('20261020000000'), ('20261020010000'), ('20261020020000'),
  ('20261020030000'), ('20261020040000'), ('20261020050000'), ('20261021010000'), ('20261021020000')
),
api_roles as (
  select
    (select oid from pg_roles where rolname = 'anon') as anon_oid,
    (select oid from pg_roles where rolname = 'authenticated') as authenticated_oid,
    (select oid from pg_roles where rolname = 'service_role') as service_oid
),
expected_tables(relation) as (values
  ('private.titan_entitlements'), ('private.titan_retention_rules'),
  ('private.titan_verification_requests'), ('private.titan_feature_flags')
),
table_state as (
  select t.relation, c.oid, c.relkind, c.relrowsecurity
  from expected_tables t left join pg_class c on c.oid = to_regclass(t.relation)
),
-- service_execute=NULL leaves that role unconstrained where the migration only
-- specifies authenticated/anon rights. The payment and purge RPCs require service_role.
expected_rpc(signature, result_type, anon_execute, authenticated_execute, service_execute) as (values
  ('public.titan_apply_entitlement_v1(uuid,text,text,boolean,text,text,timestamp with time zone,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)', 'boolean', false, false, true),
  ('public.titan_entitlement_owner_v1(text,text)', 'uuid', false, false, true),
  ('public.titan_apply_paddle_entitlement_v87(uuid,boolean,text,text,timestamp with time zone,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)', 'boolean', false, false, true),
  ('private.titan_purge_expired_data_v1()', 'jsonb', false, false, true),
  ('public.titan_verification_request_v1(uuid,text)', 'jsonb', false, true, null),
  ('public.titan_verification_close_v1(bigint)', 'jsonb', false, true, null),
  ('public.titan_verification_list_v1(text,uuid,integer)', 'jsonb', false, true, null),
  ('public.titan_my_verification_requests_v1()', 'jsonb', false, true, null),
  ('public.titan_verification_answer_v1(bigint,text)', 'jsonb', false, true, null),
  ('public.titan_feature_flags_v1()', 'jsonb', true, true, null),
  ('public.titan_admin_feature_flags_v1()', 'jsonb', false, true, null),
  ('public.titan_admin_feature_flag_set_v1(text,boolean,integer,text,timestamp with time zone,boolean)', 'jsonb', false, true, null)
),
rpc_state as (
  select e.*, p.oid, p.proacl, p.proowner, p.proconfig, p.prorettype, p.proretset, p.prokind
  from expected_rpc e left join pg_proc p on p.oid = to_regprocedure(e.signature)
),
checks(check_name, blocking, ok, detail) as (
  select 'ledger:base 20261005230000', true,
    exists(select 1 from supabase_migrations.schema_migrations where version = '20261005230000'),
    'version de base exacte présente'
  union all
  select 'ledger:29 migrations', true,
    (select count(*) = 29 from expected_migrations)
      and not exists(select 1 from expected_migrations e
        where not exists(select 1 from supabase_migrations.schema_migrations m where m.version = e.version)),
    'versions manquantes : ' || (select count(*) from expected_migrations e
      where not exists(select 1 from supabase_migrations.schema_migrations m where m.version = e.version))
  union all
  select 'ledger:unexpected migration', true,
    not exists(select 1 from supabase_migrations.schema_migrations m
      where m.version > '20261005230000' and not exists(select 1 from expected_migrations e where e.version = m.version)),
    'versions hors du lot après la base : ' || (select count(*) from supabase_migrations.schema_migrations m
      where m.version > '20261005230000' and not exists(select 1 from expected_migrations e where e.version = m.version))
  union all
  select 'roles:API', true,
    anon_oid is not null and authenticated_oid is not null and service_oid is not null,
    'anon, authenticated et service_role doivent exister'
  from api_roles
  union all
  select 'table:' || relation || ':RLS', true,
    coalesce(relkind in ('r','p') and relrowsecurity, false),
    'table présente avec row level security activée'
  from table_state
  union all
  select 'table:' || t.relation || ':API grants', true,
    t.oid is not null and coalesce(
      not has_table_privilege(r.anon_oid, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_table_privilege(r.authenticated_oid, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_any_column_privilege(r.anon_oid, t.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_any_column_privilege(r.authenticated_oid, t.oid, 'SELECT,INSERT,UPDATE,REFERENCES'), false),
    'aucun privilège de table ou colonne pour anon/authenticated, y compris hérité de PUBLIC'
  from table_state t cross join api_roles r
  union all
  select 'rpc:' || p.signature || ':signature', true,
    coalesce(p.prokind = 'f' and not p.proretset and p.prorettype = to_regtype(p.result_type), false),
    'signature exacte, résultat scalaire de type ' || p.result_type
  from rpc_state p
  union all
  select 'rpc:' || p.signature || ':grants', true,
    p.oid is not null and coalesce(
      has_function_privilege(r.anon_oid, p.oid, 'EXECUTE') = p.anon_execute
      and has_function_privilege(r.authenticated_oid, p.oid, 'EXECUTE') = p.authenticated_execute
      and (p.service_execute is null or has_function_privilege(r.service_oid, p.oid, 'EXECUTE') = p.service_execute)
      and not exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'), false),
    'signature exacte et droits EXECUTE attendus ; aucun EXECUTE pour PUBLIC'
  from rpc_state p cross join api_roles r
  union all
  select 'rpc:' || p.signature || ':search_path', true,
    p.oid is not null and exists(select 1 from unnest(p.proconfig) setting
      where setting in ('search_path=', 'search_path=""')),
    'search_path explicitement vide'
  from rpc_state p
  union all
  select 'serializer:search_path', true,
    exists(select 1 from pg_proc p
      where p.oid = to_regprocedure('private.titan_card_settings_json(public.titan_public_cards)')
        and exists(select 1 from unnest(p.proconfig) setting where setting in ('search_path=', 'search_path=""'))),
    'private.titan_card_settings_json(public.titan_public_cards) : search_path explicitement vide'
  union all
  select 'cron:separate target check', false, true,
    case when exists(select 1 from pg_extension where extname = 'pg_cron')
      then 'pg_cron présent : vérifier séparément le job de purge actif, sa base, son horaire et sa commande'
      else 'pg_cron absent ici ; contrôle du job obligatoire sur la cible de production' end
)
select check_name as "check", blocking, ok, detail from checks order by blocking desc, ok, check_name;

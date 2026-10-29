-- Contrôle APRÈS les migrations V1.1 (20261028010000 → 20261029090000), à lancer sur la copie restaurée puis en production.
-- LECTURE SEULE : un SELECT, uniquement historique et catalogues, aucune donnée de compte.
-- Toutes les lignes blocking=true doivent avoir ok=true. Les 29 migrations de la V1 doivent déjà être appliquées.
with
expected_migrations(version) as (values
  ('20261028010000'), ('20261028020000'), ('20261028030000'), ('20261028040000'), ('20261028050000'),
  ('20261028060000'), ('20261028070000'), ('20261028080000'), ('20261028090000'), ('20261028100000'),
  ('20261028110000'), ('20261028120000'), ('20261029090000')
),
api_roles as (
  select (select oid from pg_roles where rolname = 'anon') as anon_oid,
         (select oid from pg_roles where rolname = 'authenticated') as authenticated_oid,
         (select oid from pg_roles where rolname = 'service_role') as service_oid
),
expected_tables(relation) as (values
  ('private.titan_periodic_quest_claims'), ('private.titan_source_consents'),
  ('private.titan_imported_activities'), ('private.titan_daily_activity'), ('private.titan_garmin_links'), ('private.titan_garmin_tokens'),
  ('private.titan_polls'), ('private.titan_poll_options'), ('private.titan_poll_votes'), ('private.titan_roadmap_items'), ('private.titan_roadmap_votes')
),
table_state as (
  select t.relation, c.oid, c.relkind, c.relrowsecurity
  from expected_tables t left join pg_class c on c.oid = to_regclass(t.relation)
),
-- anon_execute, authenticated_execute : droits attendus. Aucune fonction V1.1 n'est ouverte à PUBLIC.
expected_rpc(signature, anon_execute, authenticated_execute, service_execute) as (values
  ('public.titan_periodic_quests_v1()', false, true, null),
  ('public.titan_periodic_quest_claim_v1(text)', false, true, null),
  ('public.titan_set_source_consent_v1(text,boolean)', false, true, null),
  ('public.titan_import_activity_v1(text,text,text,timestamp with time zone,numeric,numeric)', false, true, null),
  ('public.titan_archive_imported_v1(text)', false, true, null),
  ('public.titan_sources_v1()', false, true, null),
  ('public.titan_set_showcase_v1(text[])', false, true, null),
  ('public.titan_showcase_v1()', false, true, null),
  ('public.titan_public_card_showcase(text)', true, true, null),
  ('public.titan_import_daily_activity_v1(text,date,integer)', false, true, null),
  ('public.titan_daily_activity_v1(date,date)', false, true, null),
  ('public.export_own_data()', false, true, null),
  ('public.titan_garmin_link_v1(uuid,text)', false, false, true),
  ('public.titan_garmin_deregister_v1(text)', false, false, true),
  ('public.titan_garmin_ingest_v1(text,jsonb)', false, false, true),
  ('public.titan_garmin_tokens_set_v1(uuid,text,text,timestamp with time zone)', false, false, true),
  ('public.titan_garmin_tokens_get_v1(uuid)', false, false, true),
  ('public.titan_garmin_unlink_for_v1(uuid)', false, false, true),
  ('public.titan_garmin_unlink_v1()', false, true, null),
  ('public.titan_garmin_status_v1()', false, true, null),
  ('public.titan_polls_v1()', false, true, null),
  ('public.titan_poll_vote_v1(uuid,smallint)', false, true, null),
  ('public.titan_poll_admin_save_v1(text,text,text[],timestamp with time zone,timestamp with time zone)', false, true, null),
  ('public.titan_poll_admin_close_v1(uuid)', false, true, null),
  ('public.titan_roadmap_v1()', false, true, null),
  ('public.titan_roadmap_vote_v1(uuid,boolean)', false, true, null),
  ('public.titan_roadmap_admin_save_v1(uuid,text,text,text,integer,boolean)', false, true, null),
  ('public.titan_poll_admin_list_v1()', false, true, null),
  ('public.titan_roadmap_admin_list_v1()', false, true, null)
),
rpc_state as (
  select e.*, p.oid, p.proacl, p.proowner, p.proconfig, p.prosecdef
  from expected_rpc e left join pg_proc p on p.oid = to_regprocedure(e.signature)
),
expected_indexes(relation, col) as (values
  ('public.adventure_quest_rewards', 'world_id'), ('public.titan_challenges', 'creator_id'),
  ('public.titan_expedition_members', 'user_id'), ('public.titan_moment_cheers', 'user_id'),
  ('public.titan_moments', 'log_id')
),
checks(check_name, blocking, ok, detail) as (
  select 'ledger:13 migrations V1.1', true,
    not exists(select 1 from expected_migrations e where not exists(select 1 from supabase_migrations.schema_migrations m where m.version = e.version)),
    'versions manquantes : ' || (select count(*) from expected_migrations e
      where not exists(select 1 from supabase_migrations.schema_migrations m where m.version = e.version))
  union all
  select 'ledger:unexpected migration', true,
    not exists(select 1 from supabase_migrations.schema_migrations m
      where m.version > '20261021020000' and not exists(select 1 from expected_migrations e where e.version = m.version)),
    'versions après la V1 hors du lot V1.1 : ' || (select count(*) from supabase_migrations.schema_migrations m
      where m.version > '20261021020000' and not exists(select 1 from expected_migrations e where e.version = m.version))
  union all
  select 'roles:API', true, anon_oid is not null and authenticated_oid is not null, 'anon et authenticated doivent exister' from api_roles
  union all
  select 'table:' || relation || ':RLS', true, coalesce(relkind in ('r','p') and relrowsecurity, false),
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
  select 'rpc:' || p.signature || ':grants', true,
    p.oid is not null and coalesce(
      has_function_privilege(r.anon_oid, p.oid, 'EXECUTE') = p.anon_execute
      and has_function_privilege(r.authenticated_oid, p.oid, 'EXECUTE') = p.authenticated_execute
      and (p.service_execute is null or has_function_privilege(r.service_oid, p.oid, 'EXECUTE') = p.service_execute)
      and not exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'), false),
    'fonction présente, droits EXECUTE attendus, aucun EXECUTE pour PUBLIC'
  from rpc_state p cross join api_roles r
  union all
  select 'rpc:' || p.signature || ':security definer + search_path', true,
    p.oid is not null and p.prosecdef and exists(select 1 from unnest(p.proconfig) setting where setting like 'search_path=%'),
    'SECURITY DEFINER avec search_path fixé'
  from rpc_state p
  union all
  select 'index:' || i.relation || '(' || i.col || ')', true,
    exists(select 1 from pg_index x join pg_class c on c.oid = x.indrelid
             join pg_attribute a on a.attrelid = c.oid and a.attnum = x.indkey[0]
            where c.oid = to_regclass(i.relation) and a.attname = i.col and x.indisvalid),
    'index valide dont la première colonne est la clé étrangère'
  from expected_indexes i
  union all
  select 'export:clés V1.1', true,
    pg_get_functiondef(to_regprocedure('public.export_own_data()')) like '%dailyActivity%'
      and pg_get_functiondef(to_regprocedure('public.export_own_data()')) like '%titan_export_extras_v1%'
      and pg_get_functiondef(to_regprocedure('public.export_own_data()')) like '%importedActivities%'
      and pg_get_functiondef(to_regprocedure('public.export_own_data()')) like '%adventureRewards%',
    'la définition d''export contient les clés ajoutées'
  union all
  select 'trigger:jetons Garmin effacés avec le lien', true,
    exists(select 1 from pg_trigger t where t.tgrelid = to_regclass('private.titan_garmin_links') and t.tgname = 'titan_garmin_links_erase_tokens' and not t.tgisinternal),
    'le déclencheur qui efface les jetons à la fin du lien est présent'
  union all
  select 'trigger:vitrine hors compteur d''apparence', true,
    pg_get_functiondef(to_regprocedure('private.titan_rate_limit_surface_trigger()')) like '%''showcase''%',
    'le déclencheur de limite ignore la clé showcase'
)
select check_name as "check", blocking, ok, detail from checks order by blocking desc, ok, check_name;

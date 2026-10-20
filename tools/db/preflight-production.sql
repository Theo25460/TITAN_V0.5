-- Contrôle préalable à la mise en production des migrations 20261008110220 → 20261019180000.
-- LECTURE SEULE : un seul SELECT, aucune écriture, aucun identifiant ni valeur personnelle (comptages uniquement).
-- À exécuter sur la base cible AVANT d'appliquer quoi que ce soit. Chaque ligne : check, blocking (true = ne pas migrer),
-- ok, detail. Lecture : toutes les lignes blocking=true doivent avoir ok=true. Voir docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md.
with
prof as (select to_regclass('public.profiles') is not null as present),
checks(check_name, blocking, ok, detail) as (
  select 'profiles présent', true, (select present from prof), 'table public.profiles'
  union all
  select 'migration de base appliquée (20261005230000)', true,
    coalesce((select count(*) from supabase_migrations.schema_migrations where version >= '20261005230000') > 0, false),
    'dernière version attendue côté production avant ce lot'
  union all
  select 'aucune des 24 migrations du lot déjà appliquée (sinon : reprise partielle à étudier)', false,
    (select count(*) = 0 from supabase_migrations.schema_migrations where version in (
      '20261008110220',
      '20261008113411',
      '20261008120931',
      '20261008180429',
      '20261009205151',
      '20261009212850',
      '20261010163122',
      '20261011061707',
      '20261011213600',
      '20261013074320',
      '20261019053123',
      '20261019062757',
      '20261019090000',
      '20261019120000',
      '20261019122259',
      '20261019150000',
      '20261019180000',
      '20261019200000',
      '20261019210000',
      '20261019220000','20261019230000','20261020000000','20261020010000','20261020020000')),
    'nombre déjà appliquées : ' || (select count(*) from supabase_migrations.schema_migrations where version in (
      '20261008110220',
      '20261008113411',
      '20261008120931',
      '20261008180429',
      '20261009205151',
      '20261009212850',
      '20261010163122',
      '20261011061707',
      '20261011213600',
      '20261013074320',
      '20261019053123',
      '20261019062757',
      '20261019090000',
      '20261019120000',
      '20261019122259',
      '20261019150000',
      '20261019180000',
      '20261019200000',
      '20261019210000',
      '20261019220000','20261019230000','20261020000000','20261020010000','20261020020000'))
  union all
  -- 20261008120931 : le catalogue doit contenir les 4 cosmétiques
  select 'catalogue : 4 cosmétiques attendus (20261008120931)', true,
    (select count(*) = 4 from public.shop_items where type = 'cosmetic'
       and id in ('cos_frame_aegis','cos_frame_frost','cos_map_aurora','cos_card_obsidian')),
    'trouvés : ' || (select count(*) from public.shop_items where type = 'cosmetic'
       and id in ('cos_frame_aegis','cos_frame_frost','cos_map_aurora','cos_card_obsidian'))
  union all
  -- 20261008113411 / 20261019090000 : contraintes validées sur les lignes existantes
  select 'profiles.credits >= 0', true, (select count(*) = 0 from public.profiles where credits < 0),
    'lignes en violation : ' || (select count(*) from public.profiles where credits < 0)
  union all
  select 'profiles.xp >= 0', true, (select count(*) = 0 from public.profiles where xp < 0),
    'lignes en violation : ' || (select count(*) from public.profiles where xp < 0)
  union all
  select 'profiles.level >= 1', true, (select count(*) = 0 from public.profiles where level < 1),
    'lignes en violation : ' || (select count(*) from public.profiles where level < 1)
  union all
  select 'shop_history montants >= 0', true,
    (select count(*) = 0 from public.shop_history where coalesce(cost_credits, 0) < 0 or coalesce(reward_credits, 0) < 0),
    'lignes en violation : ' || (select count(*) from public.shop_history where coalesce(cost_credits, 0) < 0 or coalesce(reward_credits, 0) < 0)
  union all
  -- 20261019090000 valide aussi ces deux contraintes si elles existent déjà non validées
  select 'profiles.role dans les valeurs permises (validé par 20261019090000)', true,
    (select count(*) = 0 from public.profiles where role is not null and role <> all (array['user','premium','moderator','admin','super_admin'])),
    'lignes en violation : ' || (select count(*) from public.profiles where role is not null and role <> all (array['user','premium','moderator','admin','super_admin']))
  union all
  select 'profiles.status dans les valeurs permises (validé par 20261019090000)', true,
    (select count(*) = 0 from public.profiles where status is not null and status <> all (array['active','suspended','banned','deleted'])),
    'lignes en violation : ' || (select count(*) from public.profiles where status is not null and status <> all (array['active','suspended','banned','deleted']))
  union all
  select 'contraintes de profiles non validées (informatif)', false, true,
    'contraintes non validées : ' || (select count(*) from pg_constraint c where c.conrelid = 'public.profiles'::regclass and not c.convalidated)
  union all
  -- 20261019120000 : un achat de cosmétique ne peut exister qu'une fois par joueur (index unique partiel)
  select 'shop_history : doublons d''achat cosmétique (index unique 20261019120000)', true,
    (select count(*) = 0 from (select user_id, item_id from public.shop_history where item_id like 'cos\_%'
       group by 1, 2 having count(*) > 1) d),
    'paires (joueur, cosmétique) en double : ' || (select count(*) from (select user_id, item_id from public.shop_history
       where item_id like 'cos\_%' group by 1, 2 having count(*) > 1) d)
  union all
  -- 20261019053123 : réécrit adventure_worlds.tier et quest_profile (données modifiées → à sauvegarder)
  select 'adventure_worlds : lignes dont tier <> free (seront remises à free)', false,
    true, 'lignes concernées : ' || coalesce((select count(*) from public.adventure_worlds where tier <> 'free'), 0)
  union all
  select 'adventure_progress : campagnes (chapitres 1 à 9) dont quest_profile sera complété', false,
    true, 'lignes concernées : ' || coalesce((select count(*) from public.adventure_progress where chapter between 1 and 9), 0)
  union all
  -- 20261019062757 : contrats principaux figés, anciennes conditions conservées
  select 'adventure_progress : contrats principaux actifs à figer (20261019062757)', false,
    true, 'chapitres actifs : ' || (select count(*) from public.adventure_progress where chapter between 1 and 9)
  union all
  -- 20261011061707 : suppression de compte, tables et clés étrangères visées
  select 'admin_messages / titan_admins présents (20261011061707)', false,
    to_regclass('public.admin_messages') is not null and to_regclass('public.titan_admins') is not null,
    'admin_messages=' || (to_regclass('public.admin_messages') is not null) || ' titan_admins=' || (to_regclass('public.titan_admins') is not null)
  union all
  -- 20261010163122 / 20261013074320 : contrat des événements d'analyse
  select 'analytics_events présent', true, to_regclass('public.analytics_events') is not null, 'table public.analytics_events'
  union all
  select 'analytics_events : taille', false, true,
    'lignes (estimation) : ' || coalesce((select reltuples::bigint from pg_class where oid = to_regclass('public.analytics_events')), 0)
  union all
  -- 20261019150000 : suspicious_actions utilisée par la file de modération
  select 'titan_suspicious_actions présent (20261019150000)', true, to_regclass('public.titan_suspicious_actions') is not null,
    'table public.titan_suspicious_actions'
  union all
  select 'profiles : taille', false, true, 'lignes : ' || (select count(*) from public.profiles)
  union all
  select 'extensions et rôles API présents (anon, authenticated, service_role)', true,
    (select count(*) = 3 from pg_roles where rolname in ('anon','authenticated','service_role')), 'rôles trouvés'
  union all
  select 'schéma private présent', true, exists (select 1 from pg_namespace where nspname = 'private'), 'schéma private'
  union all
  select 'transactions longues en cours (> 5 min)', false,
    (select count(*) = 0 from pg_stat_activity where state <> 'idle' and xact_start < now() - interval '5 minutes' and pid <> pg_backend_pid()),
    'en cours : ' || (select count(*) from pg_stat_activity where state <> 'idle' and xact_start < now() - interval '5 minutes' and pid <> pg_backend_pid())
)
select check_name as "check", blocking, ok, detail from checks order by blocking desc, ok, check_name;

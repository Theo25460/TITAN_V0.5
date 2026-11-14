# Lot 1 · Sécurité Supabase (hors couche sociale)

Périmètre : fonctions exposées, RLS, récompenses, coach, suppression et export, limites de débit, stockage, configuration Auth, concurrence, performance.
La couche sociale (amitiés, blocages, défis) est couverte par la migration `20261114160000` et n'est pas reprise ici.

**État du document : version de travail (première passe), mise à jour au fil de l'audit.** Les lignes « Non terminé » ne valent pas conformité.

## 0. Méthode et fidélité du banc

- Production `oubmftfufwwzwpgvrcag` : lecture seule (requêtes `SELECT` sur les catalogues et agrégats). Aucune écriture, aucune migration, aucune ligne personnelle lue.
- Banc local jetable : PostgreSQL 16, répertoire `/var/lib/postgresql/titan-pg-sec`, port 54341, structure de production + migrations rejouées, attaques sous les rôles `anon` et `authenticated` avec revendications JWT.
- **Le banc est-il une copie fidèle de la production ?** Vérifié par empreintes (requêtes dans `tools/db/rehearsal/structure-fingerprint.sql`, tri `collate "C"`) entre la production et le banc rejoué jusqu'à `20261104085851` :

| Catégorie | Production | Banc | Verdict |
|---|---|---|---|
| Fonctions `public` + `private` (nombre, `SECURITY DEFINER`, droits `anon`/`authenticated`, `search_path`) | 361 | 361 | Identiques (empreintes par seau égales) |
| Corps des fonctions, après normalisation (casse, blancs, commentaires) | 361 | 361 | 360 identiques, **1 divergence réelle** (D1 ci-dessous) ; 2 divergences de parenthésage sans effet (`handle_audit_log`, `titan_session_exclusion_v1`) |
| Politiques RLS, déclencheurs, index | 118 / 48 / 336 | idem | Identiques |
| Droits de table `anon`/`authenticated` | 139 tables | 139 | Identiques (`afdba815`) |
| Colonnes, RLS activée | 1 132 / 140 | 1 127 / 139 | Une table en plus en production : `private.titan_rpc_backup_20261104` (D3) |
| Contraintes | 547 | 547 | 1 écart d'affichage PG 17 / PG 16 (`daily_quests_difficulty_check`), sans effet |

Les corps de production ont été **ressaisis** à l'application (commentaires retirés, mots-clés en majuscules, 91 fonctions en `\r\n`) : ils ne sont pas octet pour octet ceux du dépôt. La comparaison normalisée ci-dessus est donc la seule preuve d'équivalence.

- Les privilèges par défaut de production (`ALTER DEFAULT PRIVILEGES` : toute fonction créée dans `public` par `postgres` reçoit `EXECUTE` pour `anon` et `authenticated`) **n'existent pas dans le banc**. Contrôle fait : migrations en attente rejouées sur une copie munie de ces privilèges par défaut → exposition finale identique à celle du banc (`diff` vide). Aucune fonction nouvelle n'est donc ouverte par oubli.

## 1. Défauts trouvés (synthèse)

| # | Défaut | Gravité | Preuve | Correction |
|---|---|---|---|---|
| D1 | **Export RGPD cassé en production pour tout compte lié à Garmin ou ayant un binôme.** `private.titan_export_extras_before_rpg_v1` en production a perdu deux clés à la ressaisie : `jsonb_build_object(…, 'revoked_at', g.revoked_at, g.last_event_at)` et `(…, 'ends_on', b.ends_on, b.ended_at)` — nombre impair d'arguments, donc erreur `22023` dès qu'une ligne existe. Aujourd'hui 0 lien Garmin et 0 binôme en production : défaut latent, déclenché à la première liaison Garmin (objet de la V1.3.1). Aucune migration en attente ne le répare (`20261102140000` ne renomme la fonction que si elle n'existe pas). | P1 | Production : `position('g.revoked_at, g.last_event_at)' in prosrc) > 0` = vrai, idem `b.ends_on, b.ended_at)` ; dépôt : `20261102120000_routes.sql:183` correct | Migration `20261114170000` : corps du dépôt réinstallé (voir § 6) |
| D2 | `private.titan_intent_day_ok(date)` : `search_path` modifiable et déclarée `IMMUTABLE` alors qu'elle lit `current_date`. | P2 | Catalogue production et banc ; conseiller Supabase | Migration `20261114170000` : `search_path = ''`, `STABLE`, corps inchangé |
| D3 | Table `private.titan_rpc_backup_20261104` présente en production, absente du dépôt (sauvegarde de 5 définitions de fonctions prise lors du correctif `PT409`). RLS activée, aucun droit API. | P2 | Production : 5 lignes, colonnes `function_signature, original_definition, original_owner, original_grants, backup_date` | Aucune (ne rien supprimer) ; à consigner, décision humaine pour le retrait |
| D4 | `20261104085851` appliquée en production hors registre. | P1 (processus) | Registre s'arrêtant à `20261102150000` ; 6 fonctions portent `PT409`, aucune ne lève `40001` | Runbook § 5 : la rejouer (sans effet, prouvé) pour l'inscrire |

Les sections 2 à 4 (matrice, classification, attaques) sont complétées ci-dessous au fil de l'audit.

## 2. Écart de droits production ↔ dépôt (avant / après les migrations en attente)

Production = banc rejoué jusqu'à `20261104085851` (empreintes égales). Écart avec l'état final du dépôt (`20261114160000`) :

| Objet | Production aujourd'hui | Après migrations | Fermé par |
|---|---|---|---|
| `public.friendships` | `authenticated` : `SELECT, INSERT, DELETE` + politique `friendships_insert_own` | `SELECT, DELETE`, plus de politique d'insertion | `20261110142656` |
| `private.titan_coach_plan(uuid)`, `titan_coach_capacity(uuid)`, `titan_coach_seat_write(uuid,uuid,boolean,timestamptz)`, `titan_coach_sync_seats(uuid)`, `titan_coach_seats_sweep()`, `titan_entitlements_coach_hook()`, `titan_entitlement_refresh_profile(uuid)` | `EXECUTE` pour `PUBLIC`, `anon`, `authenticated` (`SECURITY DEFINER`) | Aucun rôle API | `20261110142656` |
| 6 tables `private.titan_journey_*`, `private.titan_garmin_oauth_attempts` | absentes | RLS activée, aucun droit API | `20261105213712`, `20261110140000` |
| 20 fonctions nouvelles (parcours, OAuth Garmin, pas vérifiés, Play) | absentes | seules `public.titan_journey_snapshot_v1()` et `titan_journey_sync_v1()` (et leurs corps `private`) sont ouvertes à `authenticated` ; le reste est réservé à `service_role` | `20261105213712` … `20261110152900` |

Portée réelle de l'exposition `private.titan_coach_seat_write` en production : le schéma `private` a `USAGE` pour `authenticated` mais **n'est pas servi par l'API** — indices concordants : le conseiller compte 169 / 5 fonctions `SECURITY DEFINER` exposées, soit exactement celles de `public` ; `pg_stat_statements` ne contient aucune requête `"private".…` pour `anon`, `authenticated` ou `service_role` ; `pg_graphql` n'est pas installé. La liste exacte des schémas exposés (réglage API du projet) n'est pas lisible en SQL : **non vérifié directement**.

## 5. Runbook de production (ordre exact)

À rédiger complètement en fin d'audit ; ordre arrêté : `20261104085851` (rejeu sans effet, inscription au registre) → `20261105213712` → `20261110130137` → `20261110140000` → `20261110142656` → `20261110152700` → `20261110152800` → `20261110152900` → `20261114160000` → `20261114170000`.

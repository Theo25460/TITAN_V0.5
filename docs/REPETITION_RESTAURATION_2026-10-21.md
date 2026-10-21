# Sauvegarde, restauration et répétition des 29 migrations — 21/10/2026

Exécutée en **lecture seule sur la production** (projet `oubmftfufwwzwpgvrcag`), puis entièrement sur une copie
locale isolée (PostgreSQL 16, aucun service tiers, aucune donnée envoyée hors de la session). **Rien n'a été
appliqué à la production, rien n'a été déployé.** Outils : [`tools/db/rehearsal/`](../tools/db/rehearsal/).

## Résultat en une ligne

La production se sauvegarde, se restaure fidèlement sur une cible distincte, et les 29 migrations s'y appliquent
sans perte de donnée. **La décision de mise en ligne reste NO-GO** : plusieurs portes de
[`FINAL_WEB_REPORT_2026-10-21.md`](FINAL_WEB_REPORT_2026-10-21.md) §6 ne dépendent pas du code (voir §5).

## 1. Contrôle préalable (production, un seul `SELECT`)

`tools/db/preflight-production.sql` : **21 contrôles bloquants sur 21 favorables** (aucune migration du lot déjà
appliquée ni étrangère, 0 ligne en violation des contraintes que le lot valide, 0 doublon d'achat, 0 collision
TITAN+, 4 cosmétiques présents, aucune transaction longue).
Données concernées par le lot : 1 campagne d'aventure, 2 mondes (`forge`, `aurores`), 2 droits TITAN+ manuels,
216–253 événements d'analyse (le trafic continue).

## 2. Sauvegarde logique (21/10/2026 19:29:02 UTC, instantané unique)

Une seule requête (`export-production.sql`) : un instantané cohérent de **40 tables, 1 634 lignes** (toutes les
tables de `public` qui contiennent des lignes, `auth.users`, `auth.identities`, métadonnées `storage`, historique
`supabase_migrations`), avec, pour chaque table, le nombre de lignes et une empreinte du contenu calculés **dans le
même instantané**. Chiffrée (AES-256, PBKDF2) hors dépôt.

**Exclusions voulues** : `auth.sessions`, `auth.refresh_tokens`, `auth.one_time_tokens`, `auth.mfa_amr_claims` (jetons
actifs : inutiles à une restauration, et les copier serait un risque) ; `cron.job_run_details` (journal d'exécution).

**Limites à connaître, non masquées**
- Ce n'est **pas** un `pg_dump` : pas de rôles, d'extensions, de définitions `cron.job`, ni les **fichiers** de Storage
  (1 bucket, 1 objet : seules ses métadonnées sont sauvegardées). Aucune connexion base directe n'était disponible.
- Le canal d'export (API → JSON) renvoie `1.0` sous la forme `1` : **valeur identique, forme du nombre différente**.
- Le compte Supabase est en offre Free : aucune sauvegarde ni restauration à un point dans le temps fournisseur
  n'est à supposer.

## 3. Restauration sur cible distincte et fidélité

Cible : base locale reconstruite à partir de la structure de production, puis chargée avec la sauvegarde
(déclencheurs désactivés pendant le chargement, comme `pg_restore --disable-triggers`).

| Contrôle | Résultat |
|---|---|
| Colonnes (753), index (213), politiques RLS (114), RLS activée (80), déclencheurs | identiques à la production |
| Fonctions (167) | identiques (empreinte `345aa0fd…` des deux côtés, fins de ligne `\r\n` de la production normalisées) |
| Droits `anon`/`authenticated`/`service_role` (80 tables) | identiques, après alignement de 7 tables (droits par défaut de Supabase absents d'un PostgreSQL nu) |
| Contraintes (263) | identiques ; 1 contrainte (`daily_quests_difficulty_check`) écrite différemment par PG16/PG17, même logique |
| Données : lignes restaurées | **1 634 / 1 634** |
| Données : contenu | **38 tables identiques octet pour octet** ; 2 tables (`game_settings`, `training_logs`) identiques **en valeur** (empreinte normalisée des zéros de fin = empreinte de la production : `5e03da21…`, `3d9f6383…`) |

Écarts de la copie par rapport à la production, sans effet sur ces conclusions : PostgreSQL 16 au lieu de 17.6,
séquences `*_seq1` en plus (artefact du banc), pas de `pg_cron`, `auth` et `storage` reconstruits au plus juste.

## 4. Répétition des 29 migrations sur la copie restaurée

Un fichier à la fois, **version exacte inscrite dans la même transaction**, arrêt à la première erreur.

- **29/29 appliquées sans erreur** ; historique `20261005230000` → `20261021020000` (46 + 29 = 75 versions).
- `postflight-production.sql` : **49 contrôles bloquants sur 49 favorables** ; seule ligne non bloquante : `pg_cron`
  absent du banc (à contrôler sur la vraie base, voir §5).
- **Conservation** : 82 tables photographiées avant/après. **79 identiques, 3 modifiées exactement comme annoncé
  (`shop_items` 4 lignes, `adventure_worlds` tier, `adventure_progress` colonnes ajoutées), 0 ligne perdue.**
  14 tables nouvelles (`private.titan_entitlements` : 2 lignes = les 2 droits manuels préservés).
- Effets sur les données, tels qu'ils seraient en production :
  - 4 cosmétiques : de « TITAN+ seulement, prix 0 » à « achetables avec des crédits » (800 à 1 400), accès TITAN+
    conservé ;
  - mondes `forge` et `aurores` : `plus` → `free` ;
  - campagne existante : aucune colonne modifiée, `quest_profile` (version 1, `legacy`) et `main_objective` ajoutés.
- **Purge de rétention à blanc** (`private.titan_purge_expired_data_v1()` sur un clone, avec les données de
  production) : **0 ligne supprimée dans les 18 règles**, aucun échec. Plus ancienne ligne concernée : journal d'audit
  du 08/12/2025 (règle 12 mois) : **le premier effacement réel aurait lieu début décembre 2026**.
- Tests du dépôt sur la copie migrée : **66 suites SQL, contrôles de mise en ligne, 9 contrats de concurrence à deux
  connexions : 0 échec** (PostgreSQL 16 ; la CI du dépôt rejoue sur 17.6).

## 5. Ce qui bloque encore (non franchissable par le code)

Grille : `FINAL_WEB_REPORT_2026-10-21.md` §6.

| Porte | État | Qui |
|---|---|---|
| Conservation | restauration distincte faite (cette page) ; **procédure de compensation des récompenses retenues non répétée** | à répéter sur préproduction |
| Exploitation | **4 tâches `pg_cron`** (`titan_purge_expired_data` 04:20, `titan_run_risk_analysis` 04:35, `titan_release_reward_holds`, `titan_purge_training_rate_state`) à vérifier sur une base qui a `pg_cron`, première exécution sans erreur ; support réellement reçu ; retour arrière exercé | humain, base réelle ou préproduction |
| Métier et isolation | recette réelle (compte neuf / ancien / Elite manuel / multisport, deux appareils, e-mails de confirmation, récupération et assistance, réseau incertain) | humain |
| UX / accessibilité | lecteur d'écran, clavier, Safari/iOS/Firefox, installation PWA | humain |
| Performance | cibles p75 (LCP ≤ 2,5 s) à mesurer sur hébergement stable ; QG ≈ 5,7 s en local (voir `FINITION_WEB_2026-10-21.md`) | humain / préproduction |
| Vérité et décisions | **validation juridique, identité de l'éditeur, âge, conservation (Q-002), reports acceptés par écrit** | **fondateur** |
| Sécurité | protection contre les mots de passe compromis désactivée (réglage Auth) ; avis `SECURITY DEFINER` à qualifier | fondateur (tableau de bord) |

La migration 25 installe une suppression **quotidienne** des données expirées. Rien n'est effacé à l'installation
(§4), mais les durées de `private.titan_retention_rules` deviennent une règle exécutée : **elles doivent être
validées (Q-002) avant l'application.**

## 6. Séquence de mise en ligne, prête le jour du GO

1. Nouvelle sauvegarde (`export-production.sql`) juste avant, comparaison avec celle-ci (nombre de lignes par table).
2. `preflight-production.sql` : tous les `blocking` à `ok`.
3. Fenêtre courte, trafic neutralisé : les 29 fichiers **un par un**, version inscrite dans la même transaction,
   arrêt à la première erreur, vérification de la version lue après chacun.
4. `postflight-production.sql`, contrôle des 4 tâches `cron`, comparaison de l'empreinte de structure
   (`structure-fingerprint.sql`) avec celle de la copie répétée : elles doivent coïncider (détecte toute erreur de
   transcription).
5. Déploiement Netlify du **même lot** juste après (le site ancien affiche des XP « retenus » comme crédités).
6. Recette §5 du plan avec un compte de test ; au moindre écart : arrêt, retour arrière du dernier fichier seulement.

## 7. Journal de l'application en production (21/10/2026, 20:00–21:30 UTC) — INTERROMPU À 5/29

Feu vert du fondateur reçu à 19:45 (âge 13 ans avec accord d'un adulte pour les mineurs ; effets produit validés ;
reste reporté en V1.1). Texte légal mis à jour (`c035968`). Sauvegarde fraîche à 20:00:34 UTC, préflight 21/21,
photo de 82 tables (1 586 lignes) prises juste avant.

Méthode : chaque fichier est exécuté par un bloc qui **vérifie d'abord son empreinte md5**, l'exécute, puis inscrit sa
version exacte et son texte dans `supabase_migrations.schema_migrations` dans la même transaction (validé sur le banc
local : 29/29, empreinte de structure identique à la répétition).

| # | Fichier | État en production |
|---|---|---|
| 1 | `20261008110220_web_security_contracts` | **appliqué** |
| 2 | `20261008113411_web_economy_bounds` | **appliqué** (contraintes NOT VALID) |
| 3 | `20261008120931_web_cosmetic_fairness` | **appliqué** : les 4 cosmétiques sont achetables avec des crédits (800–1 400) |
| 4 | `20261008180429_advanced_comparisons_v300` | **appliqué** |
| 5 | `20261009205151_practice_reports_v300` | **appliqué** |
| 6 à 29 | `20261009212850_analysis_views_v300` … `20261021020000_abuse_limits_profile_surface` | **non appliqués** |

Historique en production : 51 versions, tête `20261009205151`. Aucune table ni fonction résiduelle (vérifié).

**Cause de l'arrêt.** Le fichier 6 fait expirer l'outil d'exécution SQL à 60 s, sans aucune activité visible côté base
(aucune session, aucun verrou). Isolé par essais à blanc : le blocage apparaît dès que la fonction
`titan_mutate_analysis_view` contient son bloc `delete from private.titan_analysis_views` ; la même instruction dans une
autre fonction ou dans une chaîne passe. Les descriptions des outils `execute_sql` et `apply_migration` précisent que
« les instructions destructrices peuvent exiger la confirmation de l'utilisateur » : c'est l'explication la plus
cohérente, **non prouvée**. Aucun contournement n'a été tenté (encodage, découpage) : la confirmation est une décision
du fondateur.

**État sûr.** Les fichiers 1 à 5 sont additifs ou ciblés ; l'ancien site fonctionne avec cet état (aucune fonction
remplacée n'est utilisée par lui, sauf `titan_atelier` qui renvoie désormais les cosmétiques au prix de crédits).
Retour arrière des fichiers 1 à 5 : tableau du §2 du plan de publication ; les 4 lignes de `shop_items` d'avant sont dans
la sauvegarde de 20:00.

**Suite.** Appliquer les fichiers 6 à 29, dans l'ordre, avec la même garde, puis `postflight-production.sql`, l'empreinte
de structure (`structure-fingerprint.sql`, doit coïncider avec la copie répétée), la vérification des 4 tâches `pg_cron`,
puis le déploiement du site. Le déploiement Netlify n'est pas exécutable depuis la session de l'agent (politique réseau :
`api.netlify.com`, `netlify-mcp.netlify.app` et `titan-app.fr` refusés).

**Test instable (hors lot).** `smoke.e2e.mjs` › « public card actions: bearer stays A during SDK rollover » échoue de
façon intermittente : 3/42 sur la candidate #115 d'origine, 7/42 sur la branche de finition (écart non significatif).
Attente de 3 s de l'écriture, déjà présente avant le lot.

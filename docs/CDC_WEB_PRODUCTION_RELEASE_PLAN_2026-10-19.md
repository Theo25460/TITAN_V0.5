# Plan de mise en production — 17 migrations en attente (A09, A10, A11)

Document de préparation. **Rien n'est appliqué par ce document.** Production lue en lecture seule le 19/10/2026 (comptages uniquement) : dernière migration appliquée `20261005230000`, 17 migrations du dépôt jamais appliquées.

## 1. Portes à passer, dans l'ordre

1. **CI verte** sur le commit à publier (tests, E2E, banc de migrations deux voies).
2. **Contrôle préalable** : exécuter `tools/db/preflight-production.sql` (un seul `SELECT`, aucune écriture) sur la base cible. Toute ligne `blocking = true` doit avoir `ok = true`, sinon **ne rien appliquer**. Résultat du 19/10/2026 sur la production : 22 lignes après correction de la revue (role/status ajoutés, vérifiés à 0 violation), tous les contrôles bloquants OK (4 cosmétiques présents, 0 solde/XP/niveau négatif, 0 montant négatif, 0 doublon d'achat cosmétique, 0 transaction longue, 0 migration du lot déjà appliquée).
3. **Sauvegarde vérifiée (A11)** : point de restauration Supabase du jour visible dans le tableau de bord, **et** restauration réellement essayée sur un projet ou une branche jetable (jamais sur la production) ; relancer le contrôle préalable sur cette copie et appliquer le lot dessus (étape 4). Une sauvegarde jamais restaurée n'est pas une sauvegarde.
4. **Répétition sur la copie restaurée** : appliquer les 17 migrations dans l'ordre, relancer les suites `sql/tests/` (`pnpm run test:db` sur banc local ; sur la copie, au minimum le contrôle préalable puis un parcours achat/suppression/modération à la main).
5. **Capture des données qui seront réécrites** (voir §3), enregistrée hors de la base.
6. **Fenêtre calme** (aucune transaction longue), puis application **un fichier à la fois, dans l'ordre du §2**, en s'arrêtant à la première erreur. Les fichiers 2, 3, 8, 12, 13, 14 et 16 posent eux-mêmes un `lock_timeout` de 5 s ; avant les fichiers 1, 7, 10 et 11 (qui modifient une fonction, une politique de `analytics_events` ou `adventure_progress` sans `lock_timeout`), exécuter dans la même session `SET lock_timeout = '5s';`. Les fichiers 4, 5, 6 et 9 ne créent que des objets nouveaux.
7. Après chaque fichier : `select version from supabase_migrations.schema_migrations order by version desc limit 3;`. Après le dernier : refaire le contrôle préalable (les lignes de prérequis doivent rester vraies) et un parcours de recette (§5).

Aucune migration n'est destructive pour les données des joueurs ; la seule réécriture de données est décrite au §3.

## 2. Ordre et retour arrière

| # | Migration | Effet | Données réécrites | Retour arrière |
|---|---|---|---|---|
| 1 | `20261008110220_web_security_contracts` | `search_path` figé d'une fonction | non | `ALTER FUNCTION private.titan_card_settings_json(public.titan_public_cards) RESET search_path;` |
| 2 | `20261008113411_web_economy_bounds` | contraintes `credits/xp/level` **NOT VALID** | non | `ALTER TABLE public.profiles DROP CONSTRAINT profiles_credits_minimum_check, DROP CONSTRAINT profiles_xp_minimum_check, DROP CONSTRAINT profiles_level_minimum_check;` |
| 3 | `20261008120931_web_cosmetic_fairness` | prix/déblocage de 4 cosmétiques, fonctions `private.titan_cosmetic_owned` et `public.titan_atelier` remplacées | **oui : 4 lignes de `shop_items`** | remettre les 4 lignes capturées au §3 ; rejouer les deux fonctions depuis `20261005210000_ascension_atelier.sql` |
| 4 | `20261008180429_advanced_comparisons_v300` | fonction `titan_compare_periods` | non | `DROP FUNCTION public.titan_compare_periods(integer,text,text);` |
| 5 | `20261009205151_practice_reports_v300` | fonction `titan_practice_report` | non | `DROP FUNCTION public.titan_practice_report(text,integer,text);` |
| 6 | `20261009212850_analysis_views_v300` | table privée + fonctions de vues | non (nouvelle table) | `DROP FUNCTION public.titan_analysis_views(uuid); DROP FUNCTION public.titan_mutate_analysis_view(text,uuid,integer,text,text,jsonb);`, puis `DROP TABLE private.titan_analysis_views;` (efface les vues enregistrées depuis l'application : seulement en connaissance de cause) |
| 7 | `20261010163122_analytics_payload_contract_v300` | politique **restrictive** d'insertion sur `analytics_events` | non | `DROP POLICY analytics_events_contract_insert_v300 ON public.analytics_events;` |
| 8 | `20261011061707_account_deletion_integrity` | clés étrangères de suppression, déclencheur de transmission de guilde | non | voir `docs/CDC_WEB_ACCOUNT_DELETION_HANDOFF_2026-10-11.md` |
| 9 | `20261011213600_support_requests_v300` | table privée + fonctions d'assistance | non (nouvelle table) | `DROP FUNCTION public.titan_support_accept_v300(uuid,uuid,text,text,boolean); DROP FUNCTION public.titan_support_claim_v300(uuid,uuid,uuid,text); DROP FUNCTION public.titan_support_finish_v300(uuid,uuid,uuid,boolean,text);` puis `DROP TABLE private.titan_support_requests;` (efface les demandes reçues) |
| 10 | `20261013074320_analytics_support_metadata_v300` | politique `analytics_events_support_anonymous_v300` | non | `DROP POLICY analytics_events_support_anonymous_v300 ON public.analytics_events;` (la fonction `private.titan_analytics_payload_valid_v300` reste dans sa nouvelle version ; la rejouer depuis le fichier 7 pour un retour total) |
| 11 | `20261019053123_adventure_quests_v3` | colonne `quest_profile`, table de récompenses, `tier` des mondes | **oui : `adventure_progress.quest_profile`, `adventure_worlds.tier`** | remettre `tier` capturé au §3 ; `DROP TRIGGER titan_freeze_adventure_quests ON public.adventure_progress;` ; rejouer `titan_adventure_snapshot()` et `private.titan_adventure_action(text,text,text,text,integer,integer,text)` depuis `20261005160000_ascension_progression_v300.sql` ; `adventure_quest_rewards` et la colonne `quest_profile` (additives) peuvent rester ; `quest_profile` des campagnes 1 à 9 a été complété, à restaurer depuis une capture si nécessaire |
| 12 | `20261019090000_economy_audit_journal` | **valide** les contraintes, journal privé append-only, RPC admin | non (validation seule) | `docs/CDC_WEB_ECONOMY_SECURITY_HANDOFF_2026-10-19.md` ; le journal est immuable par conception |
| 13 | `20261019120000_purchase_integrity_admin_moderation` | garde de profil, RPC admin, index unique des achats cosmétiques | non | `docs/CDC_WEB_PURCHASE_MODERATION_HANDOFF_2026-10-19.md` |
| 14 | `20261019150000_moderation_queue` | file et décisions de modération | non (nouvelle table) | `docs/CDC_WEB_MODERATION_QUEUE_HANDOFF_2026-10-19.md` |
| 15 | `20261019180000_session_risk` | fonction privée + RPC admin de risque par séance, lecture seule | non | `DROP FUNCTION public.titan_session_risk_v1(uuid,integer); DROP FUNCTION private.titan_session_risk(uuid,integer);` |
| 16 | `20261019200000_rate_limits` | table privée d'événements, limiteur et 3 déclencheurs (`guild_members`, `shop_history`, `training_logs` en modification) | non | `DROP TRIGGER titan_rate_limit_guild_members ON public.guild_members; DROP TRIGGER titan_rate_limit_shop_history ON public.shop_history; DROP TRIGGER titan_rate_limit_training_logs ON public.training_logs; DROP FUNCTION private.titan_rate_limit_trigger(); DROP FUNCTION private.titan_rate_limit(uuid,text,integer,interval); DROP TABLE private.titan_rate_events;` |
| 17 | `20261019210000_session_exclusion` | remplace `titan_guard_training_log` (exemption étroite pour une revue administrateur) et ajoute `titan_session_exclusion_v1` | non (aucune ligne) | rejouer le corps de `titan_guard_training_log` de `20261005160000_ascension_progression_v300.sql` ; `DROP FUNCTION public.titan_session_exclusion_v1(uuid,boolean,text);` |

Chaque fichier laisse la transaction à l'appelant (aucun `BEGIN/COMMIT`) : ne pas les concaténer sans transaction englobante. Si le lot entier doit s'appliquer en un geste, le faire dans **une** transaction, sur la copie d'abord.

## 3. Données réécrites : à capturer avant (lecture seule)

Seulement ces deux jeux, minuscules (production le 19/10 : 2 mondes concernés, 1 progression) :

```sql
select * from public.shop_items where id in ('cos_frame_aegis','cos_frame_frost','cos_map_aurora','cos_card_obsidian');
select id, tier from public.adventure_worlds order by id;
```

Conserver le résultat hors de la base (fichier chiffré ou coffre) : c'est l'unique source pour un retour arrière des lignes 3 et 11. Si un monde d'aventure payant doit le rester, **ne pas appliquer le fichier 11** sans décision (il force `tier = 'free'`).

## 4. Compatibilité site / base

- L'ordre sûr est **base d'abord, site ensuite** pour les fichiers additifs (4, 5, 6, 9, 14, 15, 16, 17) : le site ancien ignore les nouvelles fonctions.
- Fichier 7 : la politique restrictive refuse les événements d'analyse hors contrat. Un ancien site continue de fonctionner, ses événements non conformes sont rejetés (perte de mesure, pas d'erreur bloquante pour le joueur). Publier le site du même lot juste après.
- Fichiers 2 et 12 : une écriture qui violerait `credits >= 0`, `xp >= 0`, `level >= 1`, `role` ou `status` dans leurs valeurs permises échouerait désormais, et le fichier 12 **valide** ces règles sur les lignes existantes : une seule ligne en violation le ferait échouer. Le contrôle préalable vérifie chacune d'elles.
- Fichier 13 : un second achat d'un même cosmétique est refusé par l'index unique ; le contrôle préalable confirme 0 doublon.

## 5. Recette après application (compte de test, pas de donnée réelle)

Connexion, lecture du profil, achat d'un cosmétique crédit puis tentative de second achat (refus attendu), séance enregistrée, vue Analyse, formulaire d'assistance, suppression d'un compte de test, onglet Modération du centre de contrôle (admin).

## 6. Si quelque chose tourne mal

Arrêt immédiat, ne pas enchaîner. Retour arrière du **dernier fichier appliqué seulement** (§2), jamais une restauration complète sans cible et sauvegarde vérifiées (`docs/DEPLOYMENT.md`). Restauration de la base : décision humaine, avec l'horodatage du dernier état sain.

## 7. Ce qui reste hors de ce plan

Aucune migration n'a été appliquée ici. Variables d'environnement, déploiement du site, Paddle, Android et rotation des clés (SEC08) ne sont pas traités. La répétition sur une copie restaurée (§1.3-1.4) est à faire par une personne ayant accès au tableau de bord.

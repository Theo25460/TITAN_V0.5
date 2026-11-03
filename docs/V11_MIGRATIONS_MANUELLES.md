# Procédure manuelle — appliquer les 33 migrations V1.1 en production

À exécuter **par le propriétaire** (rien n'a été appliqué en production par l'assistant). La base de production s'arrête à `20261021020000` (75 migrations). Les migrations sont additives ; chaque fichier se joue tel quel, **dans cet ordre**, un par un, en s'arrêtant à la première erreur.

## Avant
1. Supabase › Database › Backups : vérifier une sauvegarde de moins de 24 h (ou en créer une). Noter son identifiant.
2. Le site V1.1 publié tolère l'absence de ces migrations : chaque lecture de fonction V1.1 absente reçoit `PGRST202`, l'écran concerné reste masqué (drapeau absent). Rien n'est cassé tant que les migrations ne sont pas appliquées.

## Les 33 fichiers (dossier `supabase/migrations/`)
 1. `20261028010000_sport_limits_more.sql`
 2. `20261028020000_sport_specific_measures.sql`
 3. `20261028030000_ultra_distance_bounds.sql`
 4. `20261028040000_periodic_quests.sql`
 5. `20261028050000_activity_import.sql`
 6. `20261028060000_export_complete.sql`
 7. `20261028070000_profile_showcase.sql`
 8. `20261028080000_sources_status.sql`
 9. `20261028090000_fk_indexes.sql`
10. `20261028100000_daily_activity.sql`
11. `20261028110000_garmin_link.sql`
12. `20261028120000_garmin_tokens.sql`
13. `20261029090000_community_consultations.sql`
14. `20261029100000_pioneer_badge.sql`
15. `20261029110000_daily_intents.sql`
16. `20261029120000_common_quest.sql`
17. `20261029130000_buddies.sql`
18. `20261029140000_seasons.sql`
19. `20261029150000_fair_ranking.sql`
20. `20261029160000_duel_links.sql`
21. `20261029160655_sport_metrics_260.sql`
22. `20261029170000_world_goal.sql`
23. `20261030090000_clubs.sql`
24. `20261030100000_club_reports.sql`
25. `20261030110000_factions_pantheon_trophies.sql`
26. `20261030120000_club_season_trophies.sql`
27. `20261102090000_coach_seats.sql`
28. `20261102100000_coach_tools.sql`
29. `20261102110000_play_reconcile.sql`
30. `20261102120000_routes.sql`
31. `20261102130000_legacy_social_privacy.sql`
32. `20261102140000_adventure_encounters.sql`
33. `20261102150000_session_hold_edits.sql`

Méthode : Supabase › SQL Editor › coller le contenu du fichier › Run, ou `supabase db push` depuis un dépôt lié à la production sur la branche `codex/v11-finalization-20261102` (le CLI applique alors seulement les fichiers absents du registre, dans l'ordre).

## Après
1. Exécuter `tools/db/postflight-v11.sql` (lecture seule) : aucune ligne « KO » attendue.
2. Optionnel, depuis un poste avec accès : `python3 tools/db/test-v11-gates.py` (attend exactement 33 migrations V1.1 dans le registre).
3. Créer les drapeaux dans Centre de contrôle › Drapeaux (liste dans `docs/V11_RELEASE_RUNBOOK_2026-11-03.md`, étape 4 bis), un par un, à 0 % puis par paliers ; `screens.garmin` reste éteint tant que `GARMIN_ENABLED` n'est pas configuré ; jamais `ads.web`.
4. Retour arrière : couper les drapeaux. Aucun retour SQL destructif n'est prévu ; ne pas rétablir d'ancienne fonction sociale.

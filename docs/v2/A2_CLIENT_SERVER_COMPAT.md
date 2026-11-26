# TITAN V2.0 — Compatibilité client / serveur (mission A2)

Relevé le 26/11/2026 sur la tête candidate. Deux sens :

## 1. Ancien client / nouveau serveur — **testé automatiquement**

Sur la réplique synthétique (`tools/db/v2-replica-rehearsal.sh`), avant et après les 8 paquets : **chaque fonction `public` existant à la
tête de production garde exactement** ses arguments, son type de retour, son mode `SECURITY DEFINER` et ses droits `anon` /
`authenticated`. Aucune fonction n'est supprimée ni renommée ; aucune colonne n'est retirée ; aucune ligne existante n'est modifiée ;
l'export de compte d'un ancien compte garde toutes ses clés et valeurs. Un client publié aujourd'hui (Web `6afec02`, Android 1.4.0)
continue donc de fonctionner contre le serveur consolidé. Résultat : PASS.

## 2. Nouveau client / ancien serveur, drapeaux fermés — **analyse statique seulement, à rejouer en A3**

48 fonctions publiques sont nouvelles (absentes à la tête `20261122090000`) ; 46 sont appelées par un client (2 quotas ne le sont que par
les fonctions Netlify). Si le nouveau client était publié **avant** les paquets SQL, ces appels échoueraient (fonction introuvable).
Le tableau relève, par fichier appelant, les drapeaux cités dans le fichier et la présence d'un chemin d'erreur près de l'appel. Ce relevé
est une heuristique : il ne remplace pas un essai réel contre un serveur à la tête de production, qu'A3 doit mener.

Règle de publication qui en découle (pour A3 et le propriétaire) : **appliquer les paquets SQL avant de publier un client qui les
appelle**, puis ouvrir les drapeaux pilotes. Exception connue des lots : V1.8.2 et V1.8.3 (règles actives dès la migration, sans drapeau)
exigent l'inverse — publier d'abord les clients qui savent les afficher (rapports des lots, A1 P1).

| Fonction nouvelle | Appels (fichier, drapeaux, chemin d'erreur) |
|---|---|
| `titan_adventure_branch_action_v1` | `js/app/aventure-rpg.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureRpg.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_branch_snapshot_v1` | `js/app/aventure-rpg.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureRpg.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_campaign_action_v1` | `js/app/aventure-rpg.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureRpg.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_campaign_snapshot_v1` | `js/app/aventure-rpg.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureRpg.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_chronicle_action_v1` | `js/app/aventure-chroniques.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureChronicles.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_chronicles_v1` | `js/app/aventure-chroniques.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureChronicles.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_consequence_action_v1` | `js/app/aventure-retour.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureConsequence.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_consequences_v1` | `js/app/aventure-retour.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureConsequence.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_guardian_action_v1` | `js/app/aventure-rpg.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureRpg.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_guardian_snapshot_v1` | `js/app/aventure-rpg.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureRpg.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_quest_action_v1` | `js/app/aventure-indices.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureQuests.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_adventure_quests_v1` | `js/app/aventure-indices.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/adventureQuests.ts` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui) |
| `titan_club_agenda_act_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : oui) |
| `titan_club_agenda_invite_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : oui) |
| `titan_club_agenda_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : oui) |
| `titan_club_match_act_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_club_match_preview_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : oui) |
| `titan_club_match_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_club_season_act_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_club_season_v1` | `js/app/clubs.js` (drapeaux : screens.club_agenda, screens.club_match, screens.club_season, screens.clubs, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_coach_cycle_v1` | `js/app/coach-cycle.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_coach_feedback_v1` | `js/app/coaching.js` (drapeaux : screens.coach_cycle_report, screens.coach_feedback, screens.coach_followup, screens.coach_groups, screens.coach_programs, screens.coach_review, screens.coachanalysis, screens.coachcalendar, screens.coachexport, screens.coachtools, screens.coachworkspace, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_coach_followup_v1` | `js/app/coaching.js` (drapeaux : screens.coach_cycle_report, screens.coach_feedback, screens.coach_followup, screens.coach_groups, screens.coach_programs, screens.coach_review, screens.coachanalysis, screens.coachcalendar, screens.coachexport, screens.coachtools, screens.coachworkspace, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_coach_group_v1` | `js/app/coach-groups.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_coach_program_v1` | `js/app/coach-groups.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `js/app/coach-programs.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_coach_review_v1` | `js/app/coaching.js` (drapeaux : screens.coach_cycle_report, screens.coach_feedback, screens.coach_followup, screens.coach_groups, screens.coach_programs, screens.coach_review, screens.coachanalysis, screens.coachcalendar, screens.coachexport, screens.coachtools, screens.coachworkspace, chemin d'erreur près de l'appel : oui) |
| `titan_cordee_relay_turn_v1` | `js/app/cordee.js` (drapeaux : screens.cordee, screens.cordee_suite, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_cordee_relay_v1` | `js/app/cordee.js` (drapeaux : screens.cordee, screens.cordee_suite, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_cordee_suite_v1` | `js/app/cordee.js` (drapeaux : screens.cordee, screens.cordee_suite, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_import_batch_open_v1` | `js/app/migration.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_import_batch_rows_v1` | `js/app/migration.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_import_batch_v1` | `js/app/migration.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_import_batch_withdraw_v1` | `js/app/migration.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_import_batches_v1` | `js/app/migration.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_place_delete_v1` | `js/app/lieux.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_place_save_v1` | `js/app/lieux.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_places_v1` | `js/app/lieux.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_resolve_session_match_v1` | `js/app/matches.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : **à vérifier**); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_route_get_v2` | `js/app/parcours.js` (drapeaux : screens.gps, screens.routes, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_route_rename_v1` | `js/app/parcours.js` (drapeaux : screens.gps, screens.routes, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_route_save_v2` | `js/app/parcours.js` (drapeaux : screens.gps, screens.routes, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_routes_v2` | `js/app/parcours.js` (drapeaux : screens.gps, screens.routes, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_session_changes_v1` | `js/app/journal.js` (drapeaux : screens.activityhub, screens.routes, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_session_matches_v1` | `js/app/matches.js` (aucun drapeau dans le fichier, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_source_center_v1` | `js/app/profil.js` (drapeaux : screens.garmin, screens.garmin_dailies, chemin d'erreur près de l'appel : oui); `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
| `titan_source_run_v1` | `mobile/src/data/api.ts` (drapeaux : screens.buddy, chemin d'erreur près de l'appel : **à vérifier**) |
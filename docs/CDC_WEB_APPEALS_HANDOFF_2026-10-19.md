# Handoff — procédure de recours (CHEAT19, Claude, 19/10/2026)

Migration `20261019230000_appeals.sql` (21e du lot, non appliquée) : table privée `private.titan_appeals` (aucun droit pour les rôles API, suppression en cascade avec le compte) et quatre RPC `authenticated` :

| RPC | Qui | Effet |
|---|---|---|
| `titan_appeal_submit_v1(kind, session, message)` | joueur | recours `session` (séance lui appartenant et exclue) ou `account` (compte suspendu ou banni) ; message 10–500 caractères |
| `titan_my_appeals_v1()` | joueur | ses 50 derniers recours, statut et note de décision |
| `titan_appeal_list_v1(status, limit)` | administrateur | file par statut, avec message et résumé de la séance |
| `titan_appeal_decide_v1(id, accept, note)` | administrateur | accepter lève l'exclusion (`titan_session_exclusion_v1`) ou la suspension (`titan_moderation_decide_v1` « restore »), avec audit ; refuser garde l'état ; note de 3 à 500 caractères lisible par le joueur |

Règles : un recours ouvert par objet, 5 ouverts au plus par joueur (verrou consultatif par joueur), 7 jours avant de redéposer après un refus, séance d'autrui indiscernable d'une séance absente (`SESSION_NOT_FOUND`), aucune décision sur son propre recours, un bannissement ne se lève pas depuis la file (`USE_ADMIN_PROFILE_TOOL`), aucun effet automatique.

Tests : `sql/tests/300_appeals.sql` (autorisations, validation, plafond, cooldown, acceptation/refus, aucune autre ligne modifiée) et `300_z_appeals_migration.sql` (rejeu idempotent, droits, transaction de l'appelant). Sensibilité vérifiée (plafond 5→6 : test rouge).

## BLOQUANT À CORRIGER MAINTENANT
Aucun connu. Revue indépendante faite : un compte supprimé pouvait déposer puis obtenir une réactivation (corrigé : refusé au dépôt et à l'acceptation) ; une acceptation sans effet est maintenant refusée (`STATE_CHANGED`, le recours reste refusable) ; tests ajoutés (compte supprimé, état changé, décision de son propre recours, fin du délai de 7 jours, anonyme sur chaque RPC, bornes, cascade à la suppression de compte). Concurrence sur deux connexions réelles : testée le 20/10 (`tools/db/test-reward-appeal-concurrency.py` : deux administrateurs sur le même recours, un seul décide ; cinquième et sixième recours simultanés, un seul passe ; sensibilité vérifiée en retirant `for update`).
## NON BLOQUANT – BACKLOG FINITION
Formulaire joueur (Profil, fichier réservé à Codex : non touché) ; l'onglet « Recours » de l'administration est livré (`js/admin.js` v300.6, 2 tests e2e : liste échappée, note obligatoire, refus du serveur expliqués) ; information du joueur au moment de l'exclusion ; rétention des recours décidés (à fixer avec Q-002) ; notification à l'administrateur.
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
CHEAT15 strict (retenue des récompenses avant attribution), interfaces de recours, premier build Android.

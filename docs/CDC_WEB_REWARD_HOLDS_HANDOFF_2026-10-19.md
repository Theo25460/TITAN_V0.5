# Handoff — retenue des récompenses à risque élevé (CHEAT15, CHEAT14, Claude, 19/10/2026)

Décision de Théo (Q-004) : retenue bornée des seules séances à risque élevé, déblocage automatique, jamais de reprise.

Migration `20261020000000_reward_holds.sql` (22e du lot, non appliquée) :
- `titan_submit_training_session` : après l'enregistrement, le score de risque de la séance (`private.titan_session_risk`, 100 séances récentes) est lu ; à 8 ou plus (« à examiner »), l'XP et les crédits sont **retenus** (table privée `private.titan_reward_holds`) pour 24 h au plus. La séance compte pour les plafonds du jour et de la semaine (non remboursés si la retenue est annulée) ; le solde n'est pas touché. La fonction gagne quatre colonnes (`reward_held`, `held_xp`, `held_credits`, `release_at`) : elle est supprimée et recréée avec les mêmes droits ; les clients existants ignorent les colonnes en plus.
- Issues d'une retenue : (1) tâche `private.titan_release_due_reward_holds()` (pg_cron, toutes les heures à :17, si l'extension existe) : crédite à l'échéance, une seule fois, jamais pour un compte suspendu ou banni (la retenue attend) ; (2) `titan_session_exclusion_v1(…, true)` : retenue annulée, rien crédité, rien repris ; (3) `titan_session_exclusion_v1(…, false)` (rétablissement ou recours accepté) : récompense créditée tout de suite, une seule fois, même si la retenue avait été annulée.
- Joueur informé : réponse de l'RPC, message dans le récap de séance (`js/app/moment.js` v300.2) et dans le détail du journal (`js/app/journal.js` v300.4).
- Supprimer la séance supprime la retenue (la récompense n'est jamais créditée) ; supprimer le compte aussi.

Tests : `sql/tests/300_reward_holds.sql` (séance normale créditée aussitôt ; saut de vitesse retenu, solde intact, délai borné, rejeu du reçu sans seconde retenue ; exclusion annule ; rétablissement crédite une fois ; échéance via la tâche, jamais deux fois, jamais pour compte suspendu ; tables et tâche fermées aux rôles API), `300_z_reward_holds_migration.sql` (rejeu idempotent), e2e du récap retenu. Sensibilité vérifiée : seuil 8→9 et double crédit rendent le test rouge. Bancs deux voies verts, verify 254.

Revue indépendante : 2 défauts moyens corrigés — (1) la tâche horaire ne peut plus créditer une retenue annulée par une exclusion concurrente (`p_only_held`) ; (2) une séance antidatée hors des 100 séances notées est retenue par prudence au lieu d'être créditée sans contrôle. Tests ajoutés et mutations vérifiées. Défaut faible (message de retenue périmé en cache local) au backlog. Remarque : `sql/tests/300_social.sql` (existant) échoue pendant les 20 premières minutes qui suivent minuit à Paris (22:00–22:20 UTC), y compris sur la base d'avant ce lot ; à rendre indépendant de l'heure.

Limites assumées : le score est calculé à chaque enregistrement (fenêtre 120 jours, 100 séances) ; une séance antidatée hors des 100 plus récentes est retenue par prudence (24 h) ; la valeur affichée en local (XP de la séance) reste 0 jusqu'au prochain rechargement du journal après libération ; les 8 profils légitimes du test CHEAT20 n'atteignent jamais le seuil.

## BLOQUANT À CORRIGER MAINTENANT
Aucun connu.
## NON BLOQUANT – BACKLOG FINITION
Rafraîchir l'XP locale à la libération ; notification au joueur à la libération ; seuil et durée réglables ; indicateur de retenues en cours dans le dossier de modération ; test de concurrence à deux connexions (exclusion pendant la libération).
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
Vérifier la tâche pg_cron après application réelle (BOT01 et ici) ; premier build Android après stabilisation web.

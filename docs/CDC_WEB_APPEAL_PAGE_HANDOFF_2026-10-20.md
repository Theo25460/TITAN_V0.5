# Handoff — page de recours du joueur (CHEAT19, CHEAT14, Claude, 20/10/2026)

Livré :
- **Serveur** (migration `20261019230000_appeals.sql`, toujours non appliquée, donc modifiée en place) : nouvelle lecture `titan_my_review_state_v1()` : état du compte du joueur (suspendu, bloqué) et ses propres séances exclues avec l'indication d'un recours déjà ouvert ; rien sur d'autres comptes, ni motif écrit par l'équipe, ni score. Testée dans `sql/tests/300_appeals.sql` (autres comptes non exposés, anonyme refusé).
- **Page `/recours`** (`recours.html`, `js/app/recours.js`, noindex, redirections et en-têtes dans `netlify.toml`) : le joueur voit son compte, ses séances exclues, dépose un recours motivé (10 à 500 caractères, validé avant envoi, bouton verrouillé pendant l'envoi, texte conservé en cas d'erreur, erreurs du serveur traduites : délai de 7 jours, 5 recours maximum, déjà en cours, etc.) et lit ses recours avec la note de réponse de l'équipe (échappée). Un invité est invité à se connecter ; un changement de compte annule les chargements en cours.
- **Entrée** : question de la page Assistance (`service.html`, « Une de mes séances est exclue, ou mon compte est suspendu, à tort ») avec lien vers `/recours`. Profil n'a pas été touché (claim Codex).
- Tests : `tests/e2e/recours.e2e.mjs` (5 : invité, affichage échappé, validation et envoi unique, refus expliqué, compte suspendu et ancien serveur).

Limites : pas de lien direct depuis le journal (le client ne connaît pas l'exclusion d'une séance) ; pas de notification quand l'équipe répond (la réponse se lit sur la page).

Vérifications : e2e complet 710 tests, un seul échec — le test existant « every shell consumer » comptait 14 pages à coque commune et la nouvelle page porte le compte à 15 (attendu mis à jour, la page elle-même y passe). Revue indépendante : aucun défaut grave ; corrigés (mineurs) : verrou d'envoi remis à zéro seulement par l'envoi qui l'a posé, confirmation insérée seulement si le rechargement a réussi et pour le même compte, focus (confirmation, erreur, retour au bouton à l'annulation), `aria-describedby` vers l'erreur, un seul chargement au démarrage. Non traité : après un délai dépassé, la requête a pu aboutir (un nouvel essai renvoie « déjà en cours »).

## BLOQUANT À CORRIGER MAINTENANT
Aucun.
## NON BLOQUANT – BACKLOG FINITION
Lien depuis Profil une fois sa revendication levée ; notification de réponse ; lien depuis le journal pour une séance exclue.
## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE
BOT06 après Q-005 ; premier build Android.

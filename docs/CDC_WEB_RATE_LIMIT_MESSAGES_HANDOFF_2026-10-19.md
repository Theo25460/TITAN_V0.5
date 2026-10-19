# Handoff — message lisible pour les limites de débit (CHEAT17, CHEAT16, SEC10)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `7297a1b`. Aucune fusion, aucun déploiement, aucune migration, aucun SQL modifié, aucun nouvel appel serveur.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| CHEAT17 — rate limits adaptés aux endpoints sensibles | `[~]` | Le refus `RATE_LIMITED` (HTTP 429, SQLSTATE `PT429`) posé par la migration `20261019200000` est maintenant compris par le joueur : modification de séance (`js/app/sessions.js`), changement de guilde (`js/app/communaute.js`), achat à l'Atelier (`js/app/atelier.js`) et achat boutique (`js/main.js`). |
| CHEAT16 — spam de séances | `[~]` | Même message pour une modification refusée ; le motif « créer-effacer-recréer » n'est toujours pas détecté en tant que tel. |
| SEC10 — attaques logiques | `[~]` | Le refus d'abus de cadence n'est plus confondu avec une autre erreur. |

## Défaut corrigé

Dans `js/main.js`, un refus d'achat contenant `RATE_LIMITED` tombait dans la branche `msg.includes('LIMIT')` et s'affichait « STOCK — Limite atteinte », ce qui était faux. Il est désormais testé avant cette branche (`TROP_RAPIDE`) avec son propre titre et son texte, et remonte jusqu'à la boîte de dialogue au lieu d'être avalé comme « serveur indisponible ».

## Fichiers

`js/app/sessions.js`, `js/app/communaute.js`, `js/app/atelier.js`, `js/main.js` (une ligne de message chacun, une branche pour l'achat), versions des scripts dans 17 pages HTML (sessions 300.3, communaute 300.5, atelier 300.10, main 300.3), `tests/rate-limit-messages.test.mjs` (ajouté à `pnpm test`). Aucun fichier réservé (`onboarding.js`, `qg.js`, `moment.js`, Profil, RPG, `smoke.e2e.mjs`) modifié.

## Vérifications

- RED avant : 3 tests en échec. Après : `sessions.js` chargé dans un contexte isolé produit la phrase attendue ; les deux autres écrans et l'ordre des branches de l'achat sont verrouillés par un contrat de source.
- `pnpm run verify` 238/238 ; suite E2E complète 698/698 (avant revue).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert. Rappel : les limites n'existent pas en production tant que `20261019200000_rate_limits.sql` n'est pas appliquée ; les messages sont inoffensifs sans elle.

## NON BLOQUANT / BACKLOG FINITION

- Test de contrat de source pour `atelier.js`, `communaute.js` et `main.js` (leurs fonctions ne sont pas exportées) : aucun parcours navigateur ne simule un 429.
- Les versions de scripts dans les pages peuvent entrer en conflit avec le lot WORK en cours : garder les deux incréments.
- Autres refus potentiels (carte publique, apparence) n'ont pas de limite donc pas de message.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Journal persistant des refus (CHEAT18, demande un mécanisme hors de la transaction annulée) ; CHEAT14/15 après décision humaine sur le moment d'exclusion ; Q-001, Q-002.

## Retour arrière

Retirer la ligne `RATE_LIMITED` des trois fichiers de messages, la branche `TROP_RAPIDE` de `js/main.js`, remettre les versions de scripts des pages et supprimer `tests/rate-limit-messages.test.mjs` avec son entrée de `package.json`. Aucune donnée concernée.

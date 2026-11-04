# Handoff — effacement local à la suppression de compte et proposition de conservation (LEG10, LEG31, LEG03)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `4621461`. Aucune fusion, aucun déploiement, aucune purge, aucune page publique, aucun texte légal modifié.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| LEG10 — suppression de compte (volet appareil) | reste `[~]` | Fuite réelle corrigée : l'ancien lot `titan_pending_training_logs_v1` (conservé par `titanSafeClearCache`) gardait les séances en attente d'un compte supprimé, qu'une migration ultérieure pouvait réimporter. `titanForgetOwnerDrafts` filtre maintenant ses entrées (3 cas testés : entrées du compte retirées, bloc vidé supprimé, contenu illisible laissé intact). |
| LEG31 — matrice de conservation | `[~]` | `docs/DATA_RETENTION_PROPOSAL.md` : durées **proposées**, non appliquées, à valider (LEG13). |
| LEG03 — durées | `[~]` inchangé | Les durées restent à décider ; la proposition les formule. |

## Corrections de mes propres affirmations

L'inventaire des tiers (`docs/PRIVACY_TECHNICAL_INVENTORY.md`) et sa passation disaient que plusieurs clés liées au compte restaient sur l'appareil après suppression : **faux**. Le parcours (`js/app/profil.js`) appelle `titanSafeClearCache`, qui supprime toutes les clés sauf brouillons, file d'envoi et clés invité, et vide `sessionStorage`. Les deux documents sont corrigés.

## Décision sur Q-002

Appliquée comme proposition seulement : le cahier prévoit « aucune nouvelle purge ni page publique » faute de réponse ; Théo m'a demandé de décider, mais publier des durées légales non validées serait inventer des données légales. La matrice est donc prête pour la revue finale.

## Fichiers

`js/training-store.js` (+ version 300.2 dans 14 pages, **dont `profile.html`**, dernière page restée en 300.0 : sans ce changement, la page où la suppression a lieu n'exécutait pas la version corrigée ; un seul jeton modifié dans une page réservée au lot Profil de Codex, conflit de fusion trivial), `tests/training-integrity.test.mjs`, `docs/DATA_RETENTION_PROPOSAL.md`, `docs/PRIVACY_TECHNICAL_INVENTORY.md`, passations.

## Vérifications

RED puis GREEN sur le nouveau test (15 tests du fichier). `pnpm run verify` : voir clôture.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

Purges planifiées (aucun planificateur vérifié) ; décision sur la purge du journal d'économie immuable ; page publique de suppression ; le cache du service worker n'est pas vidé à la suppression (pages publiques seulement).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Revue humaine de la matrice ; ensuite écriture des purges.

## Retour arrière

Rétablir `js/training-store.js` et les versions des pages à `4621461`, retirer le test ajouté, supprimer `docs/DATA_RETENTION_PROPOSAL.md`.

# Handoff — CI : recherche de secrets dans l'historique, marge du job navigateur (A08, SEC07, QA12)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `7ebc484`. Aucun changement de produit ; un seul fichier de flux de travail modifié, aucun déploiement.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| A08 — CI renforcée avant les modifications risquées | reste `[~]` | `.github/workflows/ci.yml` : le job `verify` clone l'historique complet (`fetch-depth: 0`) et lance `pnpm run history-scan` après `pnpm run verify` ; le job navigateur passe de 15 à 25 minutes. `tests/ci-config.test.mjs` (dans `pnpm test`) verrouille ces deux réglages. |
| SEC07 — pas de secret livré | reste `[x]` | La recherche dans tout l'historique n'est plus manuelle : elle tourne à chaque pull request et à chaque envoi sur `main`. |
| QA12 — revue de sécurité avant production | reste `[~]` | Une étape automatique de plus ; la revue humaine reste à faire. |

## Pourquoi 25 minutes

La suite navigateur compte 700 tests (avec la CSP rejouée sur 44 pages) ; en local elle approche la limite précédente de 15 minutes. Un dépassement ferait échouer la CI sans raison de fond.

## Limites

Je n'ai pas pu exécuter le flux de travail (pas de GitHub Actions ici) : le YAML est valide et le test de contrat passe, mais la première exécution réelle reste à surveiller. Le scan parcourt toutes les branches et étiquettes clonées : un secret dans une branche d'un autre intervenant ferait échouer la CI (voulu). La base de CI est en PostgreSQL 16 alors que la production annonce 17.6 : à aligner (le banc installe la version de la distribution).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

Aligner la version de PostgreSQL de la CI sur la production ; mesurer la durée réelle des jobs après la première exécution.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Audit des images de contenu (`img-src`) ; consentement (LEG41/CMP) ; nonces CSP.

## Retour arrière

Retirer l'étape `history-scan` et le `with: fetch-depth: 0` de `ci.yml`, remettre `timeout-minutes: 15` au job navigateur, supprimer `tests/ci-config.test.mjs` et son entrée de `package.json`.

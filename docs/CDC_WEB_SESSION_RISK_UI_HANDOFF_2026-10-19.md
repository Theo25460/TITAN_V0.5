# Handoff — séances à examiner dans le dossier de modération (BOT03, CHEAT12, CHEAT13)

Chantier AUTRE — Claude Code, 19/10/2026, suite de `docs/CDC_WEB_SESSION_RISK_HANDOFF_2026-10-19.md`. Branche `claude/titan-cahier-charges-0k7cdn` au-dessus de `55670b7`. Aucune fusion, aucun déploiement, aucune migration, aucune donnée réelle. Aucun SQL modifié, aucune action nouvelle.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| BOT03 — file de comptes/séances à examiner | `[~]` | Le dossier d'un compte liste maintenant ses **séances** à examiner ou surveiller. La file reste une file de comptes : pas de liste transversale de séances. |
| CHEAT13 — états de séance | `[~]` | « À examiner », « À surveiller » (et « Urgent » pour critique) sont visibles par séance, avec l'exclusion existante (« Exclue des classements ») ; toujours aucune exclusion automatique ni lien état → exclusion. |
| CHEAT12 — score de risque explicable | `[~]` | Chaque séance affiche son score et ses signaux en clair (chevauchement en minutes et part de la plus courte, vitesse contre la médiane du joueur, minutes du jour) ; le texte de règle vient du serveur. |

## Comportement

- Le dossier appelle `titan_moderation_case_v1` et `titan_session_risk_v1` en parallèle. Les séances normales ne sont pas listées mais comptées (« N séances analysées »).
- Un serveur sans la migration `20261019180000_session_risk.sql` ou un refus d'accès : le dossier s'ouvre, la section l'explique, décisions et signaux restent disponibles.
- Tout texte venant du serveur (sport, règle, codes) est échappé. Aucun appel d'écriture.

## Fichiers

`js/admin.js` (+ version 300.2 dans `admin.html`), `tests/e2e/admin-moderation.e2e.mjs` (2 parcours ajoutés, serveur simulé étendu). Aucun fichier réservé modifié.

## Vérifications

- RED avant implémentation (2 parcours en échec). 12 parcours de l'écran de modération verts ; mutations détectées : état « normal » listé, exclusion non affichée, texte non échappé. À 360 px, le dossier tient dans l'écran (parcours existant, maintenant avec la section).
- `pnpm run verify` vert (229/229, build, audit, contrôle de publication) ; suite E2E complète 697/697 ; mutation sans échappement du nom de sport détectée (2 parcours en échec).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert. La migration `20261019180000` n'est pas appliquée en production : sans elle la section affiche « indisponible ».

## NON BLOQUANT / BACKLOG FINITION

- Aucune action sur une séance (exclure, rétablir, annoter) : c'est CHEAT14/15, à décider (quand exclure ?).
- Pas de lien depuis une séance vers ses signaux bruts ; pas de pagination au-delà de 50 séances.
- Les seuils restent à calibrer sur données réelles ; recette réelle après déploiement.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

CHEAT14/15 après décision humaine sur le moment d'exclusion ; SEC08 (plan de rotation des clés, documentaire) ; Android après Q-001 ; monétisation. RPG réservé à Codex.

## Retour arrière

Rétablir `js/admin.js` et `admin.html` à `55670b7` et retirer les deux parcours ajoutés de `tests/e2e/admin-moderation.e2e.mjs`. Aucune donnée concernée.

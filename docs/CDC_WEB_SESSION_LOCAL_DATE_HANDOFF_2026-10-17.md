# UX06 / UX10 / QA05 — Hier et minuit dans les séances — 17 octobre 2026

## Correction

Le choix « Hier » retirait 24 heures à l'instant présent. À Paris le 25 octobre 2026 à 23 h 30, une séance « Hier à 12 h 15 » était enregistrée le 25 au lieu du 24. Le 30 mars à 00 h 30, elle était enregistrée le 28 au lieu du 29. Le défaut existe également à New York aux changements d'heure.

En parallèle, `hh || 18` remplaçait l'heure valide zéro par 18 : « Hier à 00 h 00 » devenait 18 h. La veille utilise désormais `TitanFormat.addDays` pour reculer d'une date locale ; l'heure est ensuite appliquée sans remplacer zéro. Une heure effacée conserve le repli existant à 18 h. « Maintenant » et les dates explicites gardent leur comportement.

Base : PR #70, commit `dd749002202c49d77a8b6e50dacc544c45fffa07`. La correction porte uniquement sur la construction locale de performedAt. Aucun changement du stockage, de la queue, des appels SDK, des règles XP ou du traitement des données déjà enregistrées. Les anciens enregistrements ne sont pas corrigés automatiquement.

## Trois points du cahier

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX06 | « Hier » désigne la veille locale et respecte 00 h, 00 h 15 et les minutes nulles. | Cohérence transversale encore ouverte. Les heures inexistantes/ambiguës d'un changement d'heure conservent la résolution native de Date. |
| UX10 | Enregistrement réel en découverte vérifié, historique lu et conservé après rechargement ; Maintenant, Autre jour et heure effacée vérifiés. | Autres parcours et synchronisation de comptes connectés non couverts par ce lot. |
| QA05 | Chromium à 360/1280 px ; printemps/automne de Paris et New York, témoin UTC. | Pas d'appareil Android, de cycle PWA installé ou de validation multi-moteurs. |

Les trois exigences globales restent `[~]`.

## Validation

- Baseline et vérification finale `pnpm verify` : 188/188 tests réussis, build et audit sans erreur ; mêmes 16 avertissements préexistants.
- RED avant correction : 4 échecs attendus sur 6 nouveaux tests ; les scénarios Maintenant/Autre jour et heure effacée passent déjà. Les timestamps erronés sont observés dans le payload et dans l'historique réellement écrit.
- GREEN : 12/12 tests navigateur ciblés, dont 6 nouveaux et les 6 tests calendaires des Objectifs.
- Revue indépendante : 6/6 nouveaux tests rejoués en copie isolée ; aucun constat Critical/Important/Minor. Les attentes UTC littérales, le repli à 18 h et les voies inchangées ont été contrôlés.
- Non-régression de l'enregistrement : 11/11 tests existants « session save » réussis, couvrant double activation, contrôles en attente, échec de stockage/retry, abandon réel IndexedDB, chrono et GPX. Total de ce lot : 23 tests navigateur ciblés réussis.
- Version du module Séance : 300.1 vers 300.2. Aucun test supprimé ou désactivé.

Les tests chargent le vrai formulaire, `logActivity` et la queue découverte IndexedDB. L'espion de soumission délègue à la fonction réelle. Ils isolent chaque contexte et bloquent les requêtes externes. Aucun compte ou donnée de production, transport SDK ou serveur distant n'est validé.

## Reprise

`js/app/seance.js`, `training.html`, `tests/e2e/session-local-date.e2e.mjs`, ajout au script test:e2e dans `package.json`, ce handoff. Profil et smoke partagé restent intacts.

PR empilée sur #70 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale ou test SQL revendiqué. Aucun merge, déploiement ou changement de production.

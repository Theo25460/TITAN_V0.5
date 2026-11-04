# UX06 / QA05 / QA13 — dates des objectifs — 17 octobre 2026

## Défaut et correction

Les périodes proposées ajoutaient des blocs de 24 heures. En heure de Paris le 24 octobre 2026 à 00 h 30, « 1 semaine » donnait une fin au 29 octobre au lieu du 30. Le 28 mars à 23 h 30, elle finissait le 4 avril au lieu du 3. Les périodes initiales de 28 jours et les modèles de 28/30 jours étaient également concernés.

L'éditeur utilise maintenant le helper existant `TitanFormat.addDays`, qui avance le calendrier local. Les dates initiales partagent le même instant de départ. Les durées inclusives restent de 7, 28 et 90 jours pour les raccourcis ; ce lot ne redéfinit pas le raccourci historique « 3 mois » de 90 jours en trois mois calendaires. « Ce mois » conserve les bornes réelles du mois. Les dates existantes ou saisies manuellement ne sont pas recalculées lors de l'édition.

Base : PR #69, commit `b45f2d4c951ad694603dc26db72ab10dee6682cb`. Branche isolée. Aucun changement du calcul de progression, du stockage, des droits, de l'XP ou des appels serveur.

## Les trois points

| Exigence | Résultat du lot | Limites |
| --- | --- | --- |
| UX06 | Les dates des raccourcis et modèles restent cohérentes avec leur durée, même au changement d'heure. | Cohérence globale et sens calendaire du libellé historique « 3 mois » restent ouverts. |
| QA05 | Tests navigateur à 360 et 1280 px, horloges locales Paris/New York/UTC, printemps/automne et février bissextile. | Chromium local ; aucun appareil Android, cycle PWA installé, compte réel ou autre moteur testé. |
| QA13 | Parcours Objectifs vérifié : nouveau, quatre modèles, raccourcis, création, rechargement, ajustement manuel et réouverture. | Revue transversale des autres parcours encore ouverte. |

Les trois exigences restent `[~]` dans leur périmètre global.

## Validation

- Baseline `pnpm verify` : 188 tests passent, build et audit réussis ; 16 avertissements préexistants.
- RED sur le parent : 5 échecs attendus sur les 6 nouveaux tests ; le test des bornes du mois passe. Les échecs montrent les dates erronées dans le vrai formulaire et dans l'objectif relu.
- GREEN : 12/12 tests navigateur ciblés, dont les 6 nouveaux et les 6 de pagination des bilans. Les scénarios comportent des attentes littérales, indépendantes de l'algorithme corrigé.
- `pnpm verify` final : 188/188 tests, build/audit réussis, mêmes 16 avertissements. Aucun test supprimé ou désactivé.
- Aucun débordement horizontal global dans le parcours des raccourcis aux deux largeurs ; pas d'erreur JavaScript dans les six nouveaux scénarios.
- Version du script Objectifs : 300.0 vers 300.1. Pas de recette complète de migration de cache PWA revendiquée.
- Revue indépendante : 6/6 nouveaux tests rejoués dans une copie isolée ; aucun constat Critical/Important/Minor. Helper, attentes inclusives, stockage découverte et préservation des dates manuelles contrôlés.

Les tests utilisent le vrai écran et le stockage découverte du navigateur, des horloges figées et des contextes isolés. Les requêtes externes sont bloquées. Ils ne valident pas le transport SDK, les comptes connectés, la base distante ni des données réelles.

## Reprise

Fichiers : `js/app/objectifs.js`, `objectifs.html`, `tests/e2e/goals-calendar.e2e.mjs`, raccordement au script test:e2e de `package.json`, ce handoff. Profil et smoke partagé intacts.

La PR cible sa branche parente pour isoler le diff. La chaîne reste à valider avant intégration. Aucune suite E2E entière, CI distante finale ou validation SQL revendiquée. Aucun merge, déploiement ou changement de production.

# UX06 / UX10 / QA13 — filtres du calendrier Journal — 17 octobre 2026

## Défaut et correction

Le calendrier construisait ses cases depuis toutes les séances de la famille choisie. Il ignorait la recherche et la période, tandis que la liste du jour et l'export les appliquaient. Sur la fixture de quatre séances en octobre, chercher « fractionne » laissait donc quatre séances et trois jours actifs au calendrier, alors que seules deux séances sur un jour correspondaient. La période choisie en Liste restait active en Calendrier, mais sa commande était masquée.

Les cases, points d'activité, intensités et compteurs mensuels utilisent désormais le même filtre de recherche, famille, période et source active/archives que la liste. Pour l'aperçu mensuel seulement, la restriction au jour sélectionné est ignorée : ouvrir le 16 ne fait pas disparaître les autres jours du mois. La liste du jour et l'export gardent cette restriction. La période est visible et modifiable dans les deux vues avec la commande existante.

Base : PR #71, commit `3fe0e0878540ce724e3128273bcc30fb06ea1853`. Les règles existantes de période glissante, recherche normalisée et mots combinés sont réutilisées. Aucun changement des séances, du stockage, du SDK, des droits, des calculs XP ou de l'exporteur CSV réel.

## Trois points

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX06 | Calendrier et résultats décrivent la même sélection ; le filtre de période actif reste visible. | Cohérence de toute l'application encore partielle. |
| UX10 | Parcours Journal Liste/Calendrier, recherche/famille/période combinées, sélection de jour, archives et transmission de la sélection à l'export vérifiés. | Historique synthétique ; pas de serveur réel ou de validation de tous les autres parcours principaux. |
| QA13 | Recette à 360/1280 px : compteurs, intensités, points, absence de résultat, effacement de recherche, mois ancien et conservation du focus de recherche. | Chromium local ; pas de lecteur d'écran physique ni de cycle PWA/Android. |

Les trois exigences globales restent `[~]`.

## Preuves

- Baseline et `pnpm verify` final : 188/188 tests réussis, build et audit sans erreur ; mêmes 16 avertissements préexistants.
- RED avant correction : 7/7 nouveaux tests échouent sur les compteurs non filtrés ou la période masquée. Les voies CSV et détail fonctionnaient déjà ; leur désaccord avec l'aperçu est observé.
- GREEN : 13/13 tests navigateur ciblés, dont 7 nouveaux Journal et 6 tests des dates de séances.
- Les sept nouveaux scénarios contrôlent que les historiques actifs et archivés restent strictement identiques à leur instantané initial.
- Pas de débordement horizontal global dans les parcours recherche/période à 360/1280 px. La recherche garde son focus et la sélection du jour ne restreint pas l'aperçu mensuel.
- Non-régression Journal existant : 4/4 tests réussis sur la lecture propriétaire, la fermeture des détails/confirmations au changement de compte et l'impossibilité de sauvegarder une note depuis un ancien formulaire. Total : 17 tests navigateur ciblés réussis.
- Revue indépendante : 7/7 nouveaux tests rejoués en copie isolée, aucun constat Critical/Important/Minor. Filtrage mensuel sans restriction au jour, archives, focus, non-mutation et portée du test CSV contrôlés.
- Cache du script Journal : 300.2 vers 300.3. Pas de recette de migration de cache PWA revendiquée.

Le vrai Journal utilise des historiques synthétiques en mémoire ; les requêtes externes sont bloquées. Le test CSV observe la sélection transmise à l'exporteur sans fabriquer un fichier ni changer le code de l'exporteur. Aucun compte ou donnée de production utilisé.

## Reprise

`js/app/journal.js`, `journal.html`, `tests/e2e/journal-calendar-filters.e2e.mjs`, ajout au script test:e2e dans `package.json`, ce handoff. Profil et smoke partagé intacts.

PR empilée sur #71 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale ou test SQL revendiqué. Aucun merge, déploiement ou changement de production.

# UX06 / UX09 / QA13 — focus du bilan hebdomadaire — 17 octobre 2026

## Défaut et correction

Changer de semaine remplaçait le bouton actif puis appelait focus sur un h2 non focalisable. Le focus revenait au document. Les rafraîchissements d'historique ou de progression supprimaient également le titre ou le bouton actif sans le restituer.

Le titre accepte maintenant le focus programmatique avec tabindex -1, sans ajouter un arrêt à la tabulation normale. La navigation existante y place réellement le focus après un changement de semaine. Lors d'un rafraîchissement, le module mémorise uniquement l'un des trois éléments ciblés : titre, Semaine précédente ou Semaine suivante. Il restitue cet élément ; si le bouton devient désactivé, il utilise le titre. Aucun déplacement n'est demandé si le focus était ailleurs.

Base : PR #72, commit `67b8e70bc98e98ebf63c6fb5c8958ed120630719`. Les bornes, dates, statistiques, calculs de progression et événements existants restent inchangés. Le module ne modifie ni l'historique ni les objectifs.

## Trois points

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX06 | Changement de semaine et états désactivés gardent une destination de focus utilisable. | Cohérence transversale encore ouverte. |
| UX09 | Titre focalisable sans arrêt Tab supplémentaire ; Shift Tab rejoint la commande disponible ; focus du titre et des deux boutons conservé aux rafraîchissements. | Pas de lecteur d'écran physique ; aucune certification d'accessibilité complète. |
| QA13 | Parcours clavier jusqu'à la semaine la plus ancienne puis retour à la semaine courante, aux formats 360/1280 px ; rafraîchissements d'historique/progression et commande devenue indisponible. | Historique synthétique, Chromium local, sans compte réel/PWA installée/Android. |

Les exigences globales restent `[~]`.

## Validation

- Baseline et `pnpm verify` final : 188/188 tests réussis, build/audit sans erreur ; mêmes 16 avertissements préexistants.
- RED : 5 échecs attendus et un témoin positif sur les six nouveaux tests. Focus vide ou label absent sur la version parente, au lieu du titre/de la commande attendue.
- GREEN : 12/12 tests navigateur ciblés : six nouveaux et six tests de pagination des bilans. Aucun test supprimé ou désactivé.
- Les scénarios sans modification de fixture contrôlent l'absence de mutation de l'historique ; pas d'erreur JavaScript. Aucun débordement horizontal global dans le parcours de navigation aux deux largeurs.
- Un lien statique d'évitement hors du bilan garde son focus pendant les deux événements.
- Revue indépendante : 6/6 nouveaux tests rejoués en copie isolée, aucun constat Critical/Important/Minor. Restauration limitée aux trois éléments du module, bornes et repli désactivé contrôlés.
- Version du script Semaine : 300.1 vers 300.2. Pas de migration de cache PWA complète revendiquée.

La première sonde de focus extérieur utilisait le lien Records de la sous-navigation. Ce lien est lui-même remplacé par shell.js lors des mêmes événements ; sa perte de focus préexistante est hors périmètre de ce correctif. Le témoin a été déplacé vers le lien statique d'évitement pour tester que Semaine ne vole pas un focus extérieur stable. Ce lot ne résout pas la conservation de focus de la navigation partagée, du bouton de création d'image ou de toutes les autres surfaces ; poursuivre UX09 sur ces périmètres séparément.

Les tests emploient le vrai écran Progrès et les vrais calculs, avec un historique synthétique en mémoire et une horloge fixe ; les requêtes externes sont bloquées. Ils ne valident pas la synchronisation serveur ni un compte réel.

## Reprise

`js/app/semaine.js`, `stats.html`, `tests/e2e/week-focus.e2e.mjs`, raccordement au script test:e2e de `package.json`, ce handoff. Profil, shell partagé et smoke partagé intacts.

PR empilée sur #72 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale ou test SQL revendiqué. Aucun merge, déploiement ou changement de production.

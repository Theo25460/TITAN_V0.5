# UX06 / UX09 / QA13 — focus de la navigation partagée — 17 octobre 2026

## Défaut et correction

Les événements d'historique, progression, file de synchronisation et réseau remplacent les éléments du shell. Un lien actif dans la sous-navigation, le rail ou la barre mobile, comme le bouton Plus, était supprimé et le focus revenait au document. Ce défaut avait été observé lors du lot #73.

Avant le rendu, le shell repère uniquement le lien ou bouton actif dans l'une de ses quatre zones. Il conserve sa destination et son occurrence dans cette zone : le lien Profil du bas du rail ne devient donc pas l'autre lien Profil. Après le remplacement, il restitue cet élément sans faire défiler la page, uniquement si l'ancien nœud a disparu, si le focus est revenu au body et si aucun dialogue n'est ouvert. Une destination absente ne déclenche aucun repli vers une autre destination. Les libellés, routes, états courants et calculs restent inchangés.

Base : PR #73, commit `5ef2f100aeac59cc5bbfb8a2a6f53b1a0147690d`. Aucun changement de compte, de stockage, de données ou de règles métier. Le correctif de focus hebdomadaire #73 reste vérifié.

## Trois points du cahier

| Exigence | Résultat du lot | Limites |
| --- | --- | --- |
| UX06 | Le même lien ou bouton reste actif après un rafraîchissement du shell ; aucun changement de destination ni d'état courant. | Cohérence transversale encore partielle. |
| UX09 | Sous-navigation, rail, en-tête mobile et barre mobile vérifiés ; recherche et dialogue externes ne perdent pas leur focus à cause du shell. | Pas de lecteur d'écran physique, recette Android ou audit WCAG complet. |
| QA13 | Parcours 360/1280 px, cinq événements, deux liens Profil dupliqués, Plus activé au clavier, destination supprimée et ancienne ressource simulée. | Chromium local, sessions découverte ; aucun compte ni serveur réel. |

Les trois exigences restent `[~]` à l'échelle du projet.

## Validation

- `pnpm verify` baseline et final : 188/188 tests réussis, build/audit sans erreur ; mêmes 16 avertissements préexistants.
- RED : cinq échecs attendus sur les huit tests fonctionnels initiaux ; trois témoins positifs (champ externe, dialogue, destination retirée). Les cinq échecs correspondent au focus perdu des zones de navigation.
- GREEN : 15/15 tests navigateur ciblés, dont neuf nouveaux et les six du bilan hebdomadaire. Le neuvième test de versionnement a été ajouté après la reproduction fonctionnelle.
- Revue indépendante : build rejoué et 9/9 nouveaux tests réussis ; aucun constat Critical/Important/Minor. Zones, doublons Profil, absence de vol de focus et exclusion de Profil contrôlés.
- Recette de la navigation existante : 4/4 tests passent (Assistance dans le rail/Plus, liens publics/authentification, anciennes ressources et expiration des styles empruntés). Total : 19 tests navigateur ciblés réussis.
- Aucun débordement horizontal global dans les parcours sous-navigation 360/1280 px ; aucune erreur JavaScript dans les nouveaux scénarios fonctionnels. Aucun test supprimé ou désactivé.

Le module passe de 300.4 à 300.5 dans ses 13 pages consommatrices hors Profil. Le test navigateur intercepte l'ancienne URL sur Progrès et confirme qu'elle n'est pas exécutée ; les 13 références HTML sont contrôlées. Les tests bloquent les requêtes externes et les service workers. Ils ne prouvent pas une mise à jour complète d'une PWA installée.

## Coordination et reprise

`profile.html` et `js/app/profil.js` restent réservés à l'autre chantier et intacts. **La référence shell de profile.html reste en 300.4 : coordonner son passage à 300.5 avant intégration**, sinon une ancienne ressource déjà cachée peut encore y retarder le correctif. Ne pas annoncer une migration de cache complète sur Profil.

Les champs du dialogue restent focalisés pendant un rafraîchissement. La restauration vers le bouton d'ouverture à la fermeture d'un dialogue dont le déclencheur a été remplacé n'est pas traitée dans ce lot. Aucun comportement global de fermeture de dialogue n'est changé.

Fichiers : `js/app/shell.js`, 13 références HTML hors Profil, nouveau `tests/e2e/shell-focus.e2e.mjs`, raccordement au script test:e2e de `package.json`, ce handoff. `smoke.e2e.mjs` reste intact.

PR empilée sur #73 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale ou test SQL revendiqué. Aucun merge, déploiement ou changement de production.

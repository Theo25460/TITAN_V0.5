# UX06 / QA08 / QA13 — dernière prévisualisation QR — 17 octobre 2026

## Défaut et correction

Les rendus de l'image pouvaient terminer dans un ordre différent des changements de la case QR. Un ancien rendu avec QR remplaçait alors le dernier aperçu sans QR, tandis que la case restait décochée. Les boutons d'export restaient utilisables pendant le nouveau rendu et pouvaient enregistrer l'image ou le fichier précédent. Les exceptions d'un changement d'aperçu n'avaient pas de reprise dédiée.

Chaque rendu reçoit maintenant une génération. Seul le dernier demandé peut installer son canvas et sa prévisualisation, ou afficher une erreur. Un changement invalide immédiatement le canvas, le fichier et l'ancien aperçu. L'export reste indisponible tant que le dernier rendu n'a pas réussi ; la case QR reste modifiable pendant le dessin, et les rendus obsolètes ne bloquent pas le résultat courant.

Un échec courant laisse l'export bloqué et propose Réessayer l'aperçu. Un échec initial peut aussi se reprendre sans fermer la fenêtre. Les résultats et contrôles retenus après fermeture sont ignorés. Les actions sont branchées avant le premier rendu asynchrone : un choix plus récent peut donc être exporté même si le tout premier rendu reste suspendu.

Base : PR #76, commit `bfc3d2e9703f385d53233a3456cdbcd828c2f3d8`. Les styles, le dessin et l'encodeur QR, les règles de profil public et le transport serveur ne changent pas.

## Trois points du cahier

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX06 | Case QR, dernier aperçu et fichier exporté restent cohérents ; états prêt/en cours/échec et reprise explicite. | Cohérence globale toujours partielle. |
| QA08 | Échec de sérialisation courant ou obsolète, premier rendu en erreur, reprise et fermeture pendant un rendu vérifiés. | Échecs locaux simulés ; pas de panne réseau/backend réelle. |
| QA13 | Changements rapides à 360/1280 px, terminaisons inversées, export du dernier rendu et refus d'un ancien fichier ; démarrage initial concurrent. | Chromium local, identité et contrat RPC en mémoire ; pas de compte authentifié réel, partage OS ou appareil Android testé. |

Ces exigences restent `[~]` dans leur périmètre global.

## Validation

- Baseline et `pnpm verify` final : 188/188 tests réussis, build/audit sans erreur ; mêmes 16 avertissements préexistants.
- RED sur le module parent : sept échecs attendus et deux positifs sur les neuf premiers scénarios ; le dixième, échec initial et reprise, échoue aussi sur le parent.
- La revue a identifié et reproduit un cas supplémentaire : premier rendu suspendu, dernier choix prêt mais actions non encore branchées. Ce cas a été ajouté comme onzième test, reproduit en échec avant correction de l'ordre d'initialisation.
- GREEN final : 21/21 tests navigateur ciblés (11 nouveaux et les 10 exports/reprises de #76), sans suppression ou désactivation de tests.
- Les comparaisons utilisent le vrai canvas, l'encodeur QR local et les données PNG complètes, avec et sans QR. Le fichier transmis à l'export est comparé au rendu choisi, pas uniquement à sa signature ou son nom.
- Une requête de rendu obsolète ne peut ni réinstaller une image, ni débloquer l'export du rendu courant, ni effacer son succès avec une ancienne erreur.
- Revue indépendante finale : 21/21 tests rejoués et scénario initial reproduit séparément après correction ; aucun constat Critical/Important/Minor restant. Source et fichier servi identiques, versions et exclusion de Profil contrôlées.

Les tests contrôlent l'ordre de résolution de document.fonts.load et simulent le contrat de lecture d'un lien public, une identité en mémoire et les exceptions locales. Aucun compte réel n'est authentifié. Les demandes externes et les service workers sont bloqués. L'ancre de téléchargement est neutralisée et les octets préparés sont lus ; aucune écriture dans Téléchargements ou publication réelle n'est revendiquée.

## Coordination et reprise

card.js passe de 300.1 à 300.2 sur Progrès et Records ; la recette de versionnement de #76 est mise à jour et passe dans les dix tests voisins. **profile.html réservé reste card300.0 : coordonner son passage à card300.2 avant intégration, ainsi que shell300.6.** Aucune migration complète de cache PWA n'est validée.

Les autorisations du profil public, la validité de sa réponse serveur, la révocation de partage et les transitions de compte restent hors de ce lot. Le lien public utilisé en test est entièrement synthétique ; le changement porte sur la sélection locale du rendu et du fichier.

Fichiers : `js/app/card.js`, `stats.html`, `records.html`, nouveau `tests/e2e/card-preview-sequence.e2e.mjs`, versions de ressource dans `tests/e2e/card-export-recovery.e2e.mjs`, ajout à `package.json`, ce handoff. Profil et smoke partagé intacts.

PR empilée sur #76 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale ou test SQL revendiqué. Aucun merge, déploiement ou changement de production.

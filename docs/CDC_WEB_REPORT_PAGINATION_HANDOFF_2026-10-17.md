# UX06 / UX09 / QA13 — pagination clavier des bilans — 17 octobre 2026

## Correction

Dans un bilan de 200 sports, activer Suivante au clavier jusqu'à la dernière page désactivait le bouton en cours de focus et renvoyait le focus au document. Le même défaut existait en revenant à la première page avec Précédente. La perte a été reproduite dans Chromium sur le module parent.

Le rendu mémorise maintenant l'élément actif avant de modifier l'état des boutons. Si ce bouton précis devient indisponible, il rend le focus à l'autre bouton utilisable ; si les deux sont indisponibles, il utilise la recherche. Il ne déplace pas le focus lorsque la personne saisit déjà dans la recherche.

Les boutons conservent leurs textes visibles et leurs styles. Leurs noms accessibles indiquent maintenant « Page précédente des sports » et « Page suivante des sports » ; `aria-controls` les relie aux lignes du tableau, comme le champ de recherche. Le compteur existant garde son rôle status.

Base : PR #68, commit `f470e1e3b5692a6909477711b389463806469790`. Branche isolée. Aucun changement des agrégats, calculs, paramètres de RPC, accès, export CSV, analytics, serveur ou données réelles. Le module Profil et le smoke partagé restent intacts.

## Les trois points

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX06 | Commandes de pagination contextualisées et reliées au tableau ; états désactivés cohérents aux bornes. | Ce lot concerne uniquement les sports du bilan, pas toute la navigation de Titan. |
| UX09 | Focus clavier maintenu dans une commande utilisable ; aucun déplacement pendant la recherche ; repli vers la recherche si tous les boutons sont désactivés. | Pas de lecteur d'écran physique ni d'audit WCAG complet. |
| QA13 | Parcours vérifié avec 200 sports à 360/1280 px : deux bornes, retour immédiat au clavier, recherche, état vide et effacement du filtre. | Recette sur comptes/appareils réels et revue transversale ouvertes. |

Ces exigences restent `[~]` pour leur périmètre global.

## Validation

- Baseline `pnpm verify` :188/188 tests, build/audit sans erreur,16 avertissements existants.
- Sonde initiale sur le parent : Page10sur10 et Page1sur10 avec `activeElement.id` vide après activation clavier des boutons.
- RED : cinq échecs attendus et un positif sur les six nouveaux tests. Premier lancement effectué avant la création de dist : échec du hook serveur, explicitement exclu des preuves RED ; la reproduction produit a été rejouée après le build.
- GREEN :16/16 tests navigateur ciblés, dont six nouveaux et dix voisins existants. Le CSV est recalculé sur un état frais et contient toujours les200sports au-delà de la page affichée ; droits, expiration, absence de réponse, filtres obsolètes, déconnexion et transitions existantes restent verts.
- `pnpm verify` final :188/188 tests, build/audit réussis,16 avertissements préexistants. Aucun test supprimé ou désactivé.
- Revue indépendante :6/6 nouveaux tests rejoués, aucun Critical/Important/Minor relevé. Le garde de focus ne concerne que le bouton exact précédemment actif ; la recherche conserve son focus.
- Seulement20lignes rendues par page, filtre sans nouvel appel RPC, compteur réinitialisé et recherche vide explicite. Pas de débordement horizontal global dans les parcours clavier aux deux formats.
- Script rapports300.2→300.3 ; nouvelle page vérifiée sans exécuter une ancienne ressource300.2 servie par la fixture. Aucune installation ou mise à jour complète de PWA hors ligne revendiquée.

Les tests chargent le vrai écran Progrès, le shell, le module et le validateur de bilan, avec des agrégats synthétiques. Ils ne constituent pas une validation de transport SDK, backend, base ou compte réel.

## Fichiers et reprise

`js/app/rapports.js`, version dans `stats.html`, nouveau `tests/e2e/report-pagination.e2e.mjs`, raccordement au script test:e2e dans package.json et ce handoff. Aucun changement du fichier partagé smoke.e2e.mjs ou des autres modules.

Pas de nouvelle suite E2E entière, de test SQL ni de CI distante finale revendiqués. La PR cible sa branche parente pour isoler le diff ; reprendre et valider la chaîne avant intégration. Aucun merge, déploiement ou changement de production.

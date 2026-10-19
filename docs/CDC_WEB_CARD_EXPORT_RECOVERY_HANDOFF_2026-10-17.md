# UX09 / QA08 / QA13 — export d'images et reprise — 17 octobre 2026

## Défauts et correction

Plusieurs activations d'Enregistrer et Partager pouvaient lancer plusieurs conversions et téléchargements en parallèle. Une conversion retournant null produisait un fichier contenant « null » déclaré PNG. Les exceptions d'encodage ou de préparation du téléchargement n'avaient pas de reprise explicite, et les erreurs du partage natif étaient toutes ignorées. Fermer la fenêtre pendant une conversion n'arrêtait pas le téléchargement ultérieur.

Un verrou partagé couvre maintenant les deux actions, avec contrôles désactivés, état busy et message de préparation. Le statut et l'alerte sont hors de la zone busy. Le résultat PNG null est refusé ; les erreurs de conversion, de préparation du téléchargement ou de partage sont visibles et permettent de réessayer. L'annulation native AbortError reste silencieuse. Un partage non pris en charge conserve le téléchargement en secours.

La fermeture reste possible pendant la conversion et empêche le téléchargement tardif. Les anciens boutons retenus ne peuvent pas rejouer l'action après fermeture. Les états des contrôles sont restaurés ; le focus revient au bouton d'origine uniquement s'il était actif et si aucun autre contrôle n'a pris le focus.

Base : PR #75, commit `5fb4ae40aa678753d73df4e9197ed12c8711f51f`. Aucun changement du dessin, des styles de carte, du calcul des statistiques, des règles de profil public ou d'un appel serveur.

## Trois points

| Exigence | Résultat | Limites |
| --- | --- | --- |
| UX09 | Commandes indisponibles pendant l'action, état busy, statut et erreur annoncés hors zone busy ; focus repris sans voler celui d'un autre contrôle. | Pas de lecteur d'écran physique ou d'audit WCAG complet. |
| QA08 | PNG null, exception synchrone d'encodeur, échec de téléchargement et erreur de partage simulés ; nouvelle tentative et solution Enregistrer vérifiées. | Limites navigateur simulées, aucune panne réseau/backend réelle. |
| QA13 | Vraie carte de semaine et vrais handlers vérifiés à 360/1280 px ; doubles clics croisés, fermeture, annulation et octets PNG 1080 × 1350. | Mode découverte local ; pas de compte connecté, fiche OS native de partage ou appareil Android testé. |

Les trois exigences globales restent `[~]`.

## Validation

- Baseline et `pnpm verify` final : 188/188 tests réussis, build/audit sans erreur, mêmes 16 avertissements préexistants.
- RED sur la version parente : 8 échecs attendus sur les 9 tests fonctionnels ; le téléchargement de secours d'un vrai PNG passe déjà.
- GREEN : 19/19 tests navigateur dans une exécution (9 exports et 10 retours de dialogues), puis le nouveau test de versionnement passe séparément : total de 20 tests ciblés.
- Les vrais octets transmis au téléchargement ont la signature PNG, le nom titan-semaine.png et les dimensions 1080 × 1350. Pas de faux fichier déclaré image/png après conversion nulle.
- Revue indépendante : 9/9 tests fonctionnels et le test de versionnement rejoués, soit 10/10 ; aucun constat Critical/Important/Minor. Scope, protections en attente, annulation, reprise et focus contrôlés.
- Aucun débordement horizontal global dans le parcours en attente à 360/1280 px ; aucune erreur JavaScript dans les nouveaux scénarios fonctionnels. Aucun test supprimé ou désactivé.

Les tests ouvrent la vraie image depuis le bouton hebdomadaire, utilisent le vrai canvas et ses octets PNG, puis contrôlent les frontières toBlob, navigator.share et createObjectURL. Le clic natif de l'ancre de téléchargement est neutralisé : ni une écriture réelle dans le dossier Téléchargements ni un partage OS effectif ne sont revendiqués. Les requêtes externes et les service workers sont bloqués.

## Coordination et reprise

card.js passe de 300.0 à 300.1 sur Progrès et Records ; le test navigateur intercepte l'ancienne ressource et confirme qu'elle n'est pas exécutée. **profile.html reste réservé et inchangé en card300.0 : coordonner son passage à card300.1 avant intégration.** La coordination shell300.6 de Profil reste également ouverte.

Le moteur de dessin et les changements successifs de l'option QR, le lien public et les transitions de compte ne sont pas modifiés ni validés par ce lot. Le verrou désactive aussi les éventuels contrôles de la fenêtre pendant l'export, mais la recette fonctionnelle utilise le mode découverte sans QR public.

Fichiers : `js/app/card.js`, `stats.html`, `records.html`, `tests/e2e/card-export-recovery.e2e.mjs`, raccordement dans `package.json`, ce handoff. Profil et smoke partagé restent intacts.

PR empilée sur #75 pour isoler le diff ; valider la chaîne avant intégration. Pas de suite E2E entière, CI distante finale ou test SQL revendiqué. Aucun merge, déploiement ou changement de production.

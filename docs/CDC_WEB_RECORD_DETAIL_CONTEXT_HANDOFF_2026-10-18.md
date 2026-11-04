# Records — contexte et actualisation du détail — 18 octobre 2026

Lot limité à SEC03, UX09 et QA13, toutes encore partielles dans le cahier des charges.
Branche `codex/web-record-detail-context-cdc`, dépendance PR #86 (`codex/web-atelier-retry-cdc`, commit `c8fc9b68a0dd77c383933ce902292425a49e0ea0`). Sans fusion ni déploiement.

## Comportement livré

- SEC03 : la surface Records et chaque fiche retiennent propriétaire, instance du client et époque. Une transition retire immédiatement l’ancienne surface et les fiches Records. Les anciens boutons ne peuvent ni rouvrir leur contenu ni effacer une surface valide du compte suivant. La surface attend l’événement d’historique après le changement de compte, car `state.js` annonce `account-changed` avant d’avoir récupéré le nouveau journal. Une erreur de synchronisation laisse les anciennes données retirées et affiche un statut explicite.
- UX09 : après une correction du journal, la fiche conserve le focus sur l’action courante ; un dialogue plus récent conserve la priorité. Après fermeture d’une fiche dont le déclencheur a été remplacé, le focus rejoint le déclencheur actuel ou la recherche. Les retours des fenêtres d’image/partage utilisent les contrôles vivants de la fiche.
- QA13 : la fiche reprend les nouvelles valeurs, progression et séance source. Archiver une source montre le record de remplacement ; l’absence de record ferme la fiche. Une actualisation sans changement conserve la fiche et l’image ouvertes. Les parcours sont contrôlés à 360 et 1280 px.

Le moteur d’image conserve le même contexte avant/après l’attente du lien public, le dessin et l’encodage. Une transition ferme ses fenêtres et empêche un ancien encodage de lancer un téléchargement ou un partage. Le cache du lien public est séparé par propriétaire/client/époque ; une ancienne réponse ne remplace pas le cache suivant. Records transmet en plus une garde de validité de la fiche et de sa révision ; modifier la source retire son ancienne image. Aucun changement du rendu ou format d’image.

Un brouillon de partage amis déjà ouvert reste un texte éditable indépendant : il n’est ni réécrit ni retiré après correction/archivage sous le même compte. Les nouvelles actions de la fiche utilisent les valeurs courantes ; les gardes de compte du moteur amis sont inchangées.

Ces contrôles sont des gardes client, pas une preuve d’autorisation serveur ni un audit IDOR/RLS. Une feuille de partage du système déjà ouverte ne peut pas être rappelée par l’application. Le lot n’atteste pas l’isolation des données fournies par tous les autres appelants du moteur d’image.

## Périmètre et coordination

`js/app/records.js`, `js/app/card.js`, `records.html`, `stats.html`, `tests/e2e/records-detail-context.e2e.mjs`, `tests/e2e/card-export-recovery.e2e.mjs` (assertion de version seulement), `package.json`, ce document.
Records300.2 ; Card300.4 sur Records et Stats. Le Profil réservé garde Card300.0 et son code intact : coordonner sa version de ressource à l’intégration du chantier Profil, sans certifier ici son parcours.
Aucun calcul/règle de records, progression, XP, moteur de partage amis, SQL/RLS/backend réel ou Android modifié. Aucun partage réel, compte réel, fusion ou déploiement. Les nouvelles données reposent sur les événements canoniques d’historique de l’application.

## Vérification

Chromium local, vrais calculs Records, fiches, dialogues d’image/partage et dessin PNG ; historiques et lecture du lien de profil synthétiques. Requêtes externes bloquées. Partages et téléchargements système interceptés, encodage réel différé pour le test de transition. Le cas initial de parcours normal est conservé.
RED initial : 13 échecs sur 14 ; un test supplémentaire expose la fermeture inutile d’une image après événement d’historique inchangé. Les autres cas ajoutés couvrent la fermeture de source pendant l’attente, le retour au déclencheur remplacé et la reprise après erreur de synchronisation.

```sh
node --test --test-concurrency=1 tests/e2e/records-detail-context.e2e.mjs tests/e2e/card-export-recovery.e2e.mjs tests/e2e/card-preview-sequence.e2e.mjs tests/e2e/card-qr-recovery.e2e.mjs
node --test --test-name-pattern='^records:' tests/e2e/smoke.e2e.mjs
pnpm verify
git diff --check
```

Résultats : 19/19 nouveaux tests, 29/29 tests existants d’image et 1/1 test Records avec 200 sports ; 188/188 tests de base, 62 scripts analysés, build de 103 fichiers hors ligne et audit sans erreur (16 avertissements préexistants). Contrôle visuel de la fiche et de sa correction à 360/1280 px, sans nouveau CSS.

La revue indépendante a relevé une perte de focus du lien source lorsque son URL changeait après archivage. Un test a reproduit le problème ; un marqueur sémantique stable conserve désormais le focus vers la séance de remplacement. Correction relue, sans constat restant.

Les tests de cartes existants couvrent les échecs d’export, la sélection des aperçus, le QR et les nouvelles tentatives. La suite E2E entière, la CI distante, d’autres moteurs, un lecteur d’écran réel et PWA/Android restent non certifiés.

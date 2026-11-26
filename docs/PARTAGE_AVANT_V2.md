# « Avant V2 — Partage & communauté » : premier lot (26 novembre 2026)

Une séance ou un succès devient une image story 9:16 (1080 × 1920), prévisualisée avant tout envoi, dans un des trois styles
proposés, partagée par le sélecteur natif d'Android ou par le partage de fichiers du navigateur, sinon téléchargée. Livrable
avant la V2.0, sans dépendre de la V1.8.

## 1. Point de départ

- Branche de travail `claude/stoic-meitner-ubw09b`, partie de `main` à `0dae9af` (identique à `origin/main`). Aucune branche
  V1.5 à V1.9.x n'est supposée fusionnée : tout le code s'appuie sur `main`.
- Déjà présent sur `main` et réutilisé :
  - Android : `ShareCard` + `shareCardImage` (AUD-21) ouvraient le sélecteur **sans aperçu ni choix** (fin de séance, jalon du QG) ;
    `react-native-view-shot`, `expo-sharing` déjà installés ; `sessionMetrics`, `sessionRecords` ; bibliothèque de parcours GPS
    (`lib/gpsTrack.ts` : `decodeTrack`, `trimEnds` 300 m ; `lib/routeSync.ts` : file d'envoi locale) ; invitations par code, lien
    personnel et défi.
  - Web : `TitanCard` (images 4:5, sans carte de séance) ; `TitanMoment.metrics/reward` ; `TitanShare` (Moments entre amis) ;
    `TitanRoutes` (parcours, garde `screens.routes`) ; `TitanProgram` (« le programme ») ; collecteur `TitanAnalytics`.
  - Écrans réels : fin de séance (Android `SessionResultScreen`, Web `TitanMoment`), détail du journal, succès = records (Android
    `RecordsScreen`, Web détail d'un record) et jalons de vie (Android, carte du QG).
- Écarts de plateformes : Android n'a pas de collecteur d'analyse (aucun événement) ; le Web n'a pas de jalons de vie ; seules les
  séances enregistrées au GPS dans l'app Android ont un tracé (un GPX importé sur le site n'en conserve pas).

## 2. Ce qui a été construit

Première version jugée laide par le propriétaire : refondue. Trois directions lui ont été soumises en maquettes ; décision :
**proposer les trois styles au choix de l'utilisateur** et **afficher le tracé par défaut**. Plus aucune donnée RPG (XP, niveau)
sur la carte.

| Style | Idée | Contenu |
| --- | --- | --- |
| **Champ** (par défaut) | Le champ de couleur à plat de l'app (lime « Séance », ambre pour un record, cyan pour un jalon) avec « le relief » de la marque (lignes de niveau, `assets/ascension/contours.svg`) et « la coupe » à 45° | Tracé et chiffre vedette à l'encre sur le champ ; mesures, record et « Ma semaine » (le programme de TITAN) sur le fond nuit |
| **Feuille** | Une feuille de résultats officielle sur le fond nuit | Nom du sport en très grand, tracé dans un cadre, tableau des mesures, record en ambre, semaine si la place le permet |
| **Carnet** | Un carnet d'entraînement ligné, à la craie | Texte posé sur les lignes, tracé à l'encre, record surligné en ambre |

| Élément | Fichier(s) | Rôle |
| --- | --- | --- |
| Règles et mise en page partagées | `js/core/share-story.js` (copie identique `mobile/src/core/web/share-story.js`) | Contenu (liste blanche des mesures, mesures propres à chaque discipline du catalogue, score et sets regroupés, record, tracé normalisé, semaine), options, et `layout()` : la liste des opérations de dessin des trois styles sur la grille 1080 × 1920, textes coupés et ajustés à partir des largeurs mesurées d'Archivo. Les deux plateformes dessinent les mêmes opérations |
| Rendu Android | `mobile/src/components/StoryCard.tsx` | Opérations en SVG et en `Text` aux coupes Archivo de l'app, relief teinté (`assets/brand/relief.png`, rendu depuis le SVG de la marque), sans mise à l'échelle des polices système |
| Aperçu Android | `mobile/src/screens/share/ShareStoryScreen.tsx` (route modale `ShareStory`) | Choix du style, options selon le style, tracé chargé puis redessiné, « Partager » / « Enregistrer » fixés en bas, erreur et réessai, lien titan-app.fr à part, « Inviter un ami » |
| Tracé Android | `mobile/src/lib/storyRoute.ts` | File d'envoi locale puis bibliothèque du compte ; `trimEnds` 300 m (aucun tracé si trop court pour masquer les deux bouts) ; seulement des décalages en mètres depuis le coin sud-ouest |
| Export Android | `mobile/src/lib/storyExport.ts` | PNG 1080 × 1920, `expo-sharing` en `image/png` ; enregistrement par le sélecteur de dossier (SAF) : **aucune permission** ajoutée |
| Rendu et aperçu Web | `js/app/story.js`, `TitanRoutes.shapeForSession` (`js/app/parcours.js`) | Mêmes opérations sur canvas ; `navigator.share({ files })` seulement si `canShare` l'accepte, sinon téléchargement ; annulation ≠ erreur |
| Entrées | Android : fin de séance, détail du journal, Records, jalon du QG. Web : fin de séance, feuille du journal, détail d'un record | « Partager » / « Partager en story » |
| Analytics Web | `js/app/analytics.js`, doc, snapshot, migration `20261126120000_analytics_share_story.sql`, paquet `supabase/release-partage/` | 4 événements, seule propriété `kind` ; non appliqué en production |

Choix de contenu :

- Séance : discipline, une valeur vedette (score, distance, meilleure cotation, volume, répétitions, durée…), jusqu'à six autres
  mesures dont celles propres au sport (buts, passes, vagues, sets, trous, postures, % de premières balles…), record battu par la
  séance (« avant … »), semaine (le programme de TITAN, jour et sport de la séance encadrés), tracé.
- Jamais : coordonnées, fond de carte, lieu (« Salle », plan d'eau en texte libre), adresse, note, fréquence cardiaque, douleur,
  poids du corps, auto-évaluations (qualité, intensité), ressenti, heure, XP ou niveau. Nom de fichier neutre.
- Tracé : affiché par défaut (décision du propriétaire, 26 novembre 2026, contraire à la première consigne), désactivable avant
  partage ; 300 m retirés au départ et à l'arrivée ; aucun tracé si la sortie fait moins de 750 m.
- Nom : désactivé par défaut. Date : affichée, désactivable. Semaine : Champ et Feuille, désactivable ; quand la place manque à
  côté d'un tracé, elle se réduit à la ligne du sport de la séance, puis disparaît.
- Marges : haut 250 px, bas 340 px, côtés 96 px ; un test vérifie pour chaque style et chaque cas qu'aucun texte n'en sort, ne
  déborde de sa boîte ni n'en recouvre un autre.
- Le partage ne modifie rien côté serveur. « Aux amis » (Moments) reste une action distincte. `ShareStory` n'est pas exposée en lien
  profond. TITAN Rétro garde l'ancienne `ShareCard` (hors périmètre).

## 3. Vérifications exécutées (conteneur, 26 novembre 2026)

| Commande | Résultat |
| --- | --- |
| `pnpm run verify` (typecheck, 798 tests Node dont `tests/share-story.test.mjs` 14 tests, build, audit, release-check) | OK |
| `cd mobile && npm run typecheck` | OK |
| `cd mobile && npx jest --ci` | 115 suites, 1 028 tests OK |
| `npx expo export:embed --platform android --dev false --entry-file index.ts …` | Bundle produit, `relief.png` embarqué |
| `bash tools/db/test-migrations.sh` (PostgreSQL 16 jetable) | OK (première version du lot ; la migration n'a pas changé) |
| `node --test --import ./tests/e2e/_no-consent-banner.mjs tests/e2e/share-story.e2e.mjs` + moment, records, cartes 4:5, journal, Séance/Progrès, CSP, parcours, social, viewports | 89 / 89 |

Parité Android / Web vérifiée visuellement : les cartes rendues par l'aperçu Web de l'app Android (`mobile/preview/StoryCases.tsx`,
`#Story?case=gps&style=feuille`) et par le canvas du site sont quasi identiques. Ce ne sont pas des captures d'appareil.

## 4. Non vérifié — à tester à la main sur S23

Aucun appareil, émulateur ni compte Instagram n'était disponible : **rien n'a été testé sur téléphone, aucune publication de story
n'est revendiquée.** Recette (build interne de `.github/workflows/android-native.yml`) :

1. Séance manuelle (Yoga 45 min, avec style et postures) → « Partager » : discipline, durée, mesures du yoga ; essayer les trois styles.
2. Sortie GPS enregistrée dans l'app (≥ 1 km) → « Partager » juste après, en mode avion puis en ligne : le tracé apparaît (file
   locale puis serveur), sans fond de carte ; vérifier que le départ et l'arrivée (300 m) ne sont pas dessinés ; décocher « Afficher
   le tracé ».
3. Match de football ou de tennis avec score : le score est la valeur vedette ; aucune fréquence cardiaque.
4. Records → « Partager » ; QG → jalon « Partager ce moment ».
5. « Partager » → sélecteur Android : Instagram (story ou publication selon Instagram), WhatsApp, Messages ; annuler : pas d'erreur.
6. « Enregistrer » → dossier « Pictures » ; PNG 1080 × 1920 dans Galerie ; deuxième enregistrement sans redemander le dossier.
7. Taille de police système maximale : l'image exportée reste identique (police de l'app chargée, rendu des lignes de niveau teintées).
8. Sur l'image publiée, vérifier que le logo et titan-app.fr ne sont pas masqués par l'interface Instagram.
9. Vérifier qu'aucune séance, XP, visibilité de profil ou réglage n'a changé.

Web (Chrome Android, Safari iOS, Firefox bureau) : « Partager » ouvre le partage de fichiers si le navigateur le permet, sinon
télécharge `titan-seance.png` ; le tracé n'apparaît que si la fonction `screens.routes` est active pour le compte.

## 5. Données et autorisations

- Aucune nouvelle dépendance, aucune permission Android. Un fichier d'image ajouté (`mobile/assets/brand/relief.png`, déclaré dans
  `docs/V13_ASSET_REGISTRY.json`).
- Les tracés restent privés : lus seulement par le propriétaire (fonctions existantes), transformés sur l'appareil en forme sans
  coordonnées ; aucun serveur de cartes contacté.
- Migration SQL additive **non appliquée** (`supabase/release-partage/README.md`).

## 6. Interactions et conflits à réconcilier à la fusion V2.0 (après V1.9)

| Chantier | Zone commune | Risque / action |
| --- | --- | --- |
| V1.6.1 / V1.6.2 (journal, sources) | `SessionDetailScreen.tsx` (bloc d'actions) ; `js/app/journal.js` (`detailHtml`, clics) | Conflits textuels probables : garder « Partager » à côté du bloc « Sources ». Si V1.6 fusionne des séances importées, revoir `routeEventId` / `client_event_id` utilisé pour retrouver le tracé |
| Parcours GPS (tout lot qui touche `routeSync`, `gpsTrack`, `parcours.js`) | `storyRoute.ts`, `TitanRoutes.shapeForSession` | Garder `trimEnds` 300 m et la sortie en décalages planaires |
| V1.8 (coopération, récap social, `/defi?t=`) | `CommunityScreen.tsx` (paramètre `sheet: "invite"`), `navigation/types.ts` | Conserver le paramètre |
| V1.9.5 (bilans de cycle partageables) | Sélecteur Android (`exportFile.ts`, non modifié) | Pas de conflit de code |
| Paquets SQL V1.9.x (v191 → v195) | `tools/db/build-production-bundle.mjs`, `private.titan_analytics_payload_valid_v300` | Réenchaîner les paquets, remesurer `before` ; fusionner les listes de noms si un autre lot touche le validateur |
| Catalogue des sports / contrats de mesures | `extraFields`, `TitanSportContracts.entryFields` | Une nouvelle mesure de santé doit rejoindre la liste `PRIVATE` de `share-story.js` (test : « every discipline brings its own measures ») |
| Modules partagés Web → Android | `sync-web-core.mjs`, `manifest.json`, `icons.generated.ts` | Relancer `node scripts/sync-web-core.mjs .. <sha>` après fusion |
| Inventaire des fichiers graphiques | `docs/V13_ASSET_REGISTRY.json` | Si un autre lot régénère l'inventaire, vérifier que `relief.png` y reste |

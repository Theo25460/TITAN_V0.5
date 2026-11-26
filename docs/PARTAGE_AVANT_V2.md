# « Avant V2 — Partage & communauté » : premier lot (26 novembre 2026)

Une séance ou un succès devient une image story 9:16 (1080 × 1920), prévisualisée avant tout envoi, partagée par le sélecteur
natif d'Android ou par le partage de fichiers du navigateur, sinon téléchargée. Livrable avant la V2.0, sans dépendre de la V1.8.

## 1. Point de départ

- Branche de travail `claude/stoic-meitner-ubw09b`, partie de `main` à `0dae9af` (identique à `origin/main`). Aucune branche
  V1.5 à V1.9.x n'est supposée fusionnée : tout le code s'appuie sur `main`.
- Déjà présent sur `main` et réutilisé :
  - Android : `ShareCard` + `shareCardImage` (AUD-21) ouvraient le sélecteur **sans aperçu ni choix**, depuis la fin de séance
    (« En image ») et le jalon du QG ; dépendances `react-native-view-shot` et `expo-sharing` déjà installées ; `sessionMetrics`,
    `sessionRecords` (`src/core/moment.ts`) ; invitations par code, lien personnel et défi (`src/lib/invite.ts`, Communauté).
  - Web : `TitanCard` (`js/app/card.js`) produit des images 4:5 (1080 × 1350) avec aperçu, partage/enregistrement, sans carte de
    séance ; `TitanMoment.metrics/reward` ; `TitanShare` (Moments entre amis, interne) ; collecteur `TitanAnalytics` avec
    consentement et contrat SQL.
  - Écrans réels : fin de séance (Android `SessionResultScreen`, Web `TitanMoment`), détail du journal (Android
    `SessionDetailScreen`, Web feuille du journal), succès = records (Android `RecordsScreen`, Web détail d'un record) et jalons
    de vie (Android, carte du QG). Il n'existe pas d'écran « succès » distinct, ni de jalons côté Web.
- Écarts de plateformes notés : Android n'a pas de collecteur d'analyse (aucun événement émis) ; le Web n'a pas de jalons de vie.

## 2. Ce qui a été construit

| Élément | Fichier(s) | Rôle |
| --- | --- | --- |
| Règles partagées | `js/core/share-story.js` (copie identique `mobile/src/core/web/share-story.js`, synchronisée par `scripts/sync-web-core.mjs`) | Modèle de carte séance / succès, liste blanche des mesures, options (nom **désactivé** par défaut, date et XP masquables), coupe des textes longs, format 1080 × 1920 et marges sûres, noms des événements |
| Carte Android | `mobile/src/components/StoryCard.tsx` | Rendu sur la grille 1080, mis à l'échelle ; vraie marque (`assets/brand/mark.png`), noir profond, un seul accent (cyan progression, ambre record), « la coupe » du DESIGN.md, aucun halo ni dégradé ; `allowFontScaling={false}` pour une image identique pour tous |
| Aperçu Android | `mobile/src/screens/share/ShareStoryScreen.tsx` (route modale `ShareStory`) | Aperçu exact, choix, « Partager » / « Enregistrer » fixés en bas, états génération / erreur / réessai, lien titan-app.fr envoyé à part, « Inviter un ami » (ouvre la feuille d'invitation existante) |
| Export Android | `mobile/src/lib/storyExport.ts` | PNG 1080 × 1920 dans le cache, `expo-sharing` en `image/png` (URI `content://` à lecture temporaire) ; enregistrement via le sélecteur de dossier Android (Storage Access Framework) : **aucune permission** stockage/média ajoutée |
| Carte et aperçu Web | `js/app/story.js` | Même mise en page sur canvas 1080 × 1920, feuille d'aperçu, `navigator.share({ files })` seulement si `navigator.canShare` l'accepte, sinon téléchargement ; annulation du sélecteur ≠ erreur |
| Entrées | Android : fin de séance, détail du journal, Records, jalon du QG. Web : fin de séance (moment), feuille du journal, détail d'un record | Bouton « Partager » / « Partager en story » |
| Analytics Web | `js/app/analytics.js`, `docs/ANALYTICS_EVENTS_V300.md`, snapshot, migration `20261126120000_analytics_share_story.sql`, paquet `supabase/release-partage/` | `share_preview_opened`, `share_export_succeeded`, `share_export_failed`, `share_sheet_opened` ; seule propriété `kind` (`session` / `achievement`), jamais de source UTM, sport ou valeur |

Choix de contenu (règles partagées) :

- Séance : discipline, une valeur vedette (distance, sinon meilleure cotation, volume, répétitions, durée…), jusqu'à trois autres
  mesures, record battu par la séance (ambre, « avant : … »), XP **confirmée par le serveur** et niveau du reçu de cette séance.
  Pas d'XP pour une séance en attente, refusée, en vérification ou historique. « Ressenti » n'est jamais dessiné.
- Succès : record (titre, valeur, « avant : … » tiré de son propre historique, sinon « Premier repère ») ou jalon (titre, valeur,
  progression).
- Jamais : tracé GPS, coordonnées, lieu (ex. « Salle »), adresse, note, fréquence cardiaque, poids, heure de la journée. Le nom de
  fichier est neutre (`titan-seance.png`, `titan-succes.png`).
- Une valeur absente ou de remplacement (« — », `NaN`, 0) n'est pas affichée ; une séance sans mesure garde une carte sobre.
- Marges : haut 250 px, bas 340 px, côtés 96 px sur 1080 × 1920 (interfaces des stories) ; vérifié sur les captures.
- Le partage ne modifie rien : aucun appel serveur, aucune visibilité de séance ou de profil, aucune XP. Le partage « Aux amis »
  (Moments) existant reste une action distincte.
- Une URL imprimée n'est pas cliquable : l'aperçu propose d'envoyer le lien à part (Android : texte via le sélecteur ; Web :
  copie dans le presse-papiers). Aucun lien profond nouveau ; `ShareStory` n'est pas exposée dans `linking.ts`.
- Remplacé : le bouton Android « En image » (partage direct sans aperçu) et le partage direct du jalon. `ShareCard` reste utilisé
  par TITAN Rétro (hors périmètre ; il porte encore un halo).

## 3. Vérifications exécutées (conteneur, 26 novembre 2026)

| Commande | Résultat |
| --- | --- |
| `pnpm run verify` (typecheck, 795 tests Node dont `tests/share-story.test.mjs`, build, audit, release-check) | OK |
| `cd mobile && npm run typecheck` | OK |
| `cd mobile && npx jest` | 115 suites, 1 027 tests OK (dont `__tests__/shareStory.test.tsx`, `communityInvite.test.tsx`) |
| `npx expo export:embed --platform android --dev false --entry-file index.ts …` | Bundle Android produit |
| `bash tools/db/test-migrations.sh` (PostgreSQL 16 jetable) | OK, dont la migration et `sql/tests/300_analytics_share_story.sql` |
| `node --test tests/production-bundle.test.mjs` | OK (paquet `partage` régénéré à l'identique) |
| `node --test --import ./tests/e2e/_no-consent-banner.mjs tests/e2e/share-story.e2e.mjs …` (+ moment, records, cartes 4:5, journal, Séance/Progrès, CSP, smoke, social, viewports) | 454 / 456 ; les 2 échecs (`assistance: Profile gives a direct visible entry…`, `public card actions: stale preflight…`) échouent **à l'identique sur `0dae9af` sans ce lot** |

Les tests couvrent : séance GPS (aucune donnée de trace, lieu, note, FC, ressenti), séance manuelle sans distance, musculation,
escalade, séance en attente ou en vérification (pas d'XP), historique, absence de mesure, textes longs, nom masqué par défaut
puis affiché, options, format 1080 × 1920 et `image/png`, absence d'application cible, enregistrement et annulation du sélecteur
de dossier, erreur de capture puis réessai, repli téléchargement Web, Web Share annulé / refusé / réessayé, contrat analytics
(seulement `kind`), invitation séparée, absence de débordement à 320 px.

Captures produites dans l'environnement de travail (non versionnées) : cartes Android rendues par la prévisualisation Web de
l'app (`mobile/preview/StoryCases.tsx`, `#Story?case=gps|manual|strength|long|climbing|pending|empty|record|milestone`, et l'écran
`#ShareStory?case=gps` au format 360 × 780 dp), cartes canvas du site et sa feuille d'aperçu. Ce ne sont pas des captures
d'appareil.

## 4. Non vérifié — à tester à la main sur S23

Aucun appareil, émulateur ni compte Instagram n'était disponible dans le conteneur : **rien n'a été testé sur téléphone, et aucune
publication de story n'est revendiquée.** Recette proposée (build interne issu de `.github/workflows/android-native.yml`) :

1. Enregistrer une séance manuelle (ex. Yoga 45 min) → fin de séance → « Partager » : l'aperçu montre discipline et durée, sans XP
   tant que la séance n'est pas confirmée ; après confirmation, rouvrir depuis le journal : XP présente.
2. Séance GPS (course) → « Partager » : distance, durée, allure, dénivelé ; aucun tracé, lieu ni coordonnées. Cocher / décocher
   « Afficher mon nom », « la date », « l'XP ».
3. Records → « Partager » sur un record ; QG → jalon « Partager ce moment ».
4. « Partager » → le sélecteur Android s'ouvre : choisir Instagram, vérifier si l'image arrive en story ou en publication
   (comportement d'Instagram, non maîtrisé par TITAN), puis WhatsApp et Messages ; annuler le sélecteur : aucun message d'erreur.
5. « Enregistrer » → choisir « Pictures » la première fois ; vérifier le PNG 1080 × 1920 dans Galerie / Fichiers ; deuxième
   enregistrement sans redemander le dossier ; refuser le sélecteur : rien n'est écrit.
6. Mode avion : l'aperçu et le partage d'image fonctionnent (tout est local).
7. Taille de police système maximale : l'image exportée reste identique.
8. Contrôler sur l'image publiée que le logo et titan-app.fr ne sont pas masqués par l'interface Instagram.
9. Vérifier qu'aucune séance, XP, visibilité de profil ou réglage « Partager mes séances automatiquement » n'a changé.

Web (Chrome Android, Safari iOS, Firefox bureau) : « Partager » ouvre le partage de fichiers si le navigateur le permet, sinon
télécharge `titan-seance.png`.

## 5. Données et autorisations

- Aucune nouvelle dépendance, aucune permission Android ajoutée (SAF ne demande pas de permission ; `expo-sharing` utilise un
  `FileProvider`). Pas de lecture de la médiathèque (politique Play « Photos et vidéos » non concernée).
- Migration SQL additive, **non appliquée** : sans elle, le serveur refuse les quatre événements et le client les abandonne sans
  effet visible. Application : `supabase/release-partage/README.md`.

## 6. Interactions et conflits à réconcilier à la fusion V2.0 (après V1.9)

| Chantier | Zone commune | Risque / action |
| --- | --- | --- |
| V1.6.1 / V1.6.2 (journal, sources) | `SessionDetailScreen.tsx` (bloc d'actions) ; `js/app/journal.js` (`detailHtml`, gestionnaire de clics) | Conflits textuels probables : garder le bouton « Partager » à côté du bloc « Sources ». Si V1.6 change `syncStatus` ou ajoute des séances fusionnées/importées, revoir la règle « XP seulement si confirmée » de `sessionStory` / `TitanStory.sessionInput` |
| V1.8 (coopération, récap social, `/defi?t=`) | `CommunityScreen.tsx` (nouveau paramètre `sheet: "invite"`), `navigation/types.ts`, `invite.ts` | Conserver le paramètre ; si V1.8 ajoute un intent filter `/defi`, aucune incidence ; l'action « Inviter un ami » pourra viser une cordée/un défi quand ces liens seront vérifiés |
| V1.9.5 (bilans de cycle partageables) | Export de fichiers, sélecteur Android (`exportFile.ts`, non modifié) | Pas de conflit de code ; harmoniser le vocabulaire « lien révocable / fichier déjà téléchargé » |
| Paquets SQL V1.9.x (v191 → v195) | `tools/db/build-production-bundle.mjs` (`BUNDLES`) ; `private.titan_analytics_payload_valid_v300` | Le paquet `partage` part de `20261122090000` comme possiblement les paquets V1.9.x : réenchaîner les paquets et remesurer l'empreinte `before`. Si un autre lot remplace aussi le validateur analytics, fusionner les deux listes de noms |
| Contrat analytics | `js/app/analytics.js`, snapshot, doc | Ajouts seulement ; un autre lot qui ajoute des événements entre en conflit textuel simple (listes) |
| Modules partagés Web → Android | `mobile/scripts/sync-web-core.mjs`, `mobile/src/core/web/manifest.json`, `icons.generated.ts` | Relancer `node scripts/sync-web-core.mjs .. <sha>` après fusion plutôt que résoudre le manifeste à la main |
| V2.0 Simplification (SIM-10, SIM-13) | Fiche de séance, « montrer audience et contenu exacts » | L'aperçu montre déjà le contenu exact ; l'audience est choisie dans l'application cible |

Fin de séance Android : `SessionResultScreen.tsx` n'a plus `ShareCard` ni `shareCardImage` ; un lot qui modifierait l'ancien bouton
« En image » doit être rebasé sur « Partager » (`openStory`).

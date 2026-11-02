# TITAN — application Android native

Client Android natif de TITAN (`fr.titanapp.app`) : React Native + TypeScript, Expo SDK 57 en génération native
(`expo prebuild` → Gradle). Même compte, mêmes données et mêmes règles que https://titan-app.fr. Décision et
alternatives : [docs/ADR-002-android-natif.md](docs/ADR-002-android-natif.md). Publication : [docs/RELEASE.md](docs/RELEASE.md).

## Structure

| Dossier | Rôle |
|---|---|
| `src/core/web/` | Modules métier du site copiés à l'identique (effort/XP, sports, progression, records, aventure, GPX) |
| `src/core/` | Façade typée, construction des séances (`session.ts`), cosmétiques, images RPG |
| `src/data/` | Supabase (API), authentification, file d'envoi hors ligne, cache, hooks React Query |
| `src/components/` | Design system Ascension natif (texte, boutons, cartes, graphiques, feuilles, toasts…) |
| `src/screens/` | Écrans : accès, QG, séance, progrès, aventure, profil, communauté, réglages |
| `src/navigation/` | Pile native, onglets, liens `titan://` |
| `e2e/` | Parcours Maestro sur émulateur + réplique locale du backend (CI) |
| `plugins/` | Plugin de configuration : signature release par variables d'environnement |

## Commandes

```bash
npm ci
npm run typecheck        # TypeScript strict
npm test                 # Jest : contrat des séances, parité XP avec la production, file hors ligne, rendu des écrans
npx expo export:embed --platform android --dev false --entry-file index.ts --bundle-output /tmp/b.js --assets-dest /tmp/a
npx expo prebuild --platform android --clean && (cd android && ./gradlew assembleRelease bundleRelease)
node scripts/sync-web-core.mjs <checkout du site> <sha>   # resynchroniser les règles métier
node scripts/render-brand.mjs                            # régénérer icônes et splash depuis le logo
```

Le SDK Android n'étant pas disponible dans l'environnement cloud de développement, la compilation Gradle, les contrôles du
paquet et le parcours sur émulateur s'exécutent dans `.github/workflows/android-native.yml` (le lancement manuel accepte
`e2e_post_migrations` pour rejouer les parcours sur une base où les migrations de la candidate Web sont déjà appliquées).

## Voir les écrans sans appareil

`TITAN_PREVIEW=1` (jamais dans le build Android) fait afficher les vrais écrans React Native dans Chromium avec des données
fictives (`preview/`) : l'adresse `#World?id=aube`, `#QG&state=empty`, `#Onboarding&state=new`… choisit l'écran et l'état.

```bash
TITAN_PREVIEW=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir /tmp/preview
node scripts/preview-shots.mjs /tmp/preview /tmp/shots QG "World?id=aube" "Progress|click=Tendances"
PLAY_STORE=1 node scripts/preview-shots.mjs ...   # captures 1080×2160 pour la fiche Play
```

Ce n'est pas un appareil : polices, ombres et gestes diffèrent légèrement, et rien ne remplace un essai sur téléphone.

## Publier

`docs/PUBLIER_PLAY_CONSOLE.md` (marche à suivre pas à pas), `docs/RELEASE.md` (clé et build), `docs/INVENTAIRE.md` (ce qui est
fait, partiel ou absent), `docs/avant-apres/` (finition visuelle), `docs/play-store/` (captures de la fiche).

## Principes

- Le serveur fait foi : XP, crédits, achats, apparence, chapitres et défis passent par les fonctions `SECURITY DEFINER`
  du projet Supabase. L'application ne fait qu'afficher, prévisualiser et expliquer.
- Une séance est d'abord écrite sur le téléphone, puis envoyée ; un nouvel essai renvoie exactement la même requête et le
  reçu serveur empêche tout doublon.
- Toutes les données locales portent l'identifiant du compte ; changer de compte efface les vues de l'ancien.
- Aucune publicité, aucun suivi d'usage, aucun paiement : TITAN+ est annoncé « bientôt disponible ».

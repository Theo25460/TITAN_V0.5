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
paquet et le parcours sur émulateur s'exécutent dans `.github/workflows/android-native.yml`.

## Principes

- Le serveur fait foi : XP, crédits, achats, apparence, chapitres et défis passent par les fonctions `SECURITY DEFINER`
  du projet Supabase. L'application ne fait qu'afficher, prévisualiser et expliquer.
- Une séance est d'abord écrite sur le téléphone, puis envoyée ; un nouvel essai renvoie exactement la même requête et le
  reçu serveur empêche tout doublon.
- Toutes les données locales portent l'identifiant du compte ; changer de compte efface les vues de l'ancien.
- Aucune publicité, aucun suivi d'usage, aucun paiement : TITAN+ est annoncé « bientôt disponible ».

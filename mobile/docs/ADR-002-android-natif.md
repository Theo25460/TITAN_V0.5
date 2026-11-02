# ADR-002 — Application Android native (React Native + Expo prebuild)

- Statut : accepté (décision fondateur du 21/10/2026 : « véritable application Android », fin de la TWA comme produit final).
- Remplace : ADR-001 (TWA puis Capacitor) pour la cible Android. La TWA de la piste de test interne reste un prototype.

## Contexte

Le site (titan-app.fr) est une application multipage sans framework. Il fallait une application Android dont les écrans
sont natifs, qui fonctionne hors ligne, qui garde les mêmes comptes et données Supabase que le site et dont les règles
métier (effort, XP, niveaux, records, aventure) donnent exactement les mêmes résultats.

## Décision

- **React Native + TypeScript sur Expo SDK 57**, en génération native (`expo prebuild`) : le dossier `android/` est produit
  à chaque build et compilé par **Gradle** (APK + AAB). Aucun service EAS n'est requis.
- Expo apporte des modules natifs maintenus (Keystore via `expo-secure-store`, notifications locales, haptique, splash,
  sélecteur de documents, partage) et des plugins de configuration versionnés dans `app.config.ts`. Le choix « React Native
  CLI pur » aurait imposé de maintenir à la main le projet Gradle et ces intégrations, sans gain fonctionnel.
- **Navigation** : React Navigation (pile native `react-native-screens` + barre d'onglets). Expo Router a été écarté : il
  importait des versions incompatibles de `react-dom`, `reanimated` et `worklets`.
- **Données** : `@supabase/supabase-js` vers le projet de production, session dans le Keystore, TanStack Query (cache
  persistant par compte), file d'envoi durable et idempotente pour les séances (`client_event_id` + reçu serveur).
- **Règles métier partagées** : les modules purs du site (`js/core/*`, `sport-insights`, `renaissance-*`, `training-store`)
  sont copiés **sans modification** dans `src/core/web/` par `scripts/sync-web-core.mjs`, avec un manifeste d'empreintes
  vérifié par les tests. Le serveur reste l'unique autorité pour l'XP, les crédits, la possession et la progression.
- **UI** : composants natifs propres à l'application (design system Ascension du site : couleurs, Archivo/Manrope, icônes).
  Aucune page web n'est affichée dans l'application ; seuls les textes légaux et le centre d'aide s'ouvrent dans le
  navigateur.

## Conséquences

- Le site n'est pas modifié : l'application vit dans `mobile/` et le build public du site ne copie pas ce dossier.
- Toute évolution des règles côté site doit être resynchronisée (`sync-web-core.mjs`) puis testée (parité avec
  `titan_effort_v300` de production incluse).
- Les fonctions dont les migrations ne sont pas encore appliquées en production (comparaisons avancées, bilans, vues
  d'analyse, assistance serveur, recours, nouvelles quêtes) ne sont pas appelées : l'application cible le schéma réellement
  déployé (`20261005230000`).

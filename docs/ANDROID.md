# Android — TITAN sur le Play Store (Trusted Web Activity)

TITAN est publié sur Android comme **Trusted Web Activity** : une coque Android minimale qui ouvre `https://titan-app.fr` en plein écran dans Chrome, avec le même compte, le même hors ligne et les mêmes mises à jour que le site. Aucun code métier n'est dupliqué. Choix fait plutôt que Capacitor : rien à maintenir côté natif tant qu'aucune API native (capteurs, notifications locales, Health Connect) n'est nécessaire.

## Ce qui est prêt dans le dépôt

- `android/twa-manifest.json` : identifiant `fr.titanapp.twa`, couleurs Ascension, icônes 512 px (maskable), raccourcis Séance et Semaine, version 300.
- `tools/build-public.mjs` : écrit `/.well-known/assetlinks.json` quand la variable `TWA_SHA256_FINGERPRINTS` est définie (sinon rien : aucune empreinte inventée).
- `.github/workflows/android-twa.yml` : workflow manuel qui construit et signe l'App Bundle (`.aab`) et un APK de test, en artefacts.

## Une seule fois

1. **Clé d'envoi** (à garder hors du dépôt, sauvegardée en lieu sûr) :
   ```bash
   keytool -genkeypair -v -keystore android.keystore -alias titan -keyalg RSA -keysize 2048 -validity 10000
   keytool -list -v -keystore android.keystore -alias titan | grep SHA256
   ```
2. **Secrets GitHub** (Settings › Secrets and variables › Actions) :
   - `ANDROID_KEYSTORE_BASE64` : `base64 -w0 android.keystore`
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`
3. **Play Console** : créer l'application, activer *Play App Signing*, récupérer l'empreinte SHA-256 de la clé de signature de l'application (Intégrité de l'application).
4. **Netlify** : variable d'environnement `TWA_SHA256_FINGERPRINTS` = les deux empreintes (clé d'envoi et clé Play), séparées par une virgule, puis redéployer. Vérifier :
   `https://titan-app.fr/.well-known/assetlinks.json` et l'outil *Statement List Tester* de Google.

## À chaque version

1. Actions › **Android (TWA)** › *Run workflow* avec un `version_code` croissant.
2. Télécharger l'artefact, tester l'APK sur un téléphone (la barre d'adresse ne doit pas apparaître : sinon, les empreintes ne correspondent pas).
3. Envoyer le `.aab` en test interne, puis en production.

## Fiche Play Store (repères)

- Catégorie : Santé et remise en forme. Contenu : tout public, pas de publicité.
- Règles de confidentialité : `https://titan-app.fr/legal_privacy`.
- Sécurité des données : e-mail et identifiant (compte), activité sportive saisie (fonction de l'app), statistiques d'usage seulement avec accord ; aucune donnée vendue ni partagée à des fins publicitaires ; suppression du compte depuis l'application.
- Achats : TITAN+ est vendu sur le web par Paddle. Dans l'application Android (lancée avec `?source=twa`), l'Atelier n'affiche pas le bouton d'achat et renvoie vers le site. Vérifier les règles de facturation Google Play en vigueur avant la publication.

## Non vérifié ici

Le workflow n'a pas pu être exécuté depuis l'environnement de développement (pas de SDK Android ni de clé). Le premier lancement doit être surveillé ; Bubblewrap peut demander une mise à jour de version (`--skipVersionUpgrade` est déjà passé).

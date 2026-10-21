# Android — TITAN sur le Play Store (Trusted Web Activity)

TITAN est publié sur Android comme **Trusted Web Activity** : une coque Android minimale qui ouvre `https://titan-app.fr` en plein écran dans Chrome, avec le même compte, le même hors ligne et les mêmes mises à jour que le site. Aucun code métier n'est dupliqué. Choix fait plutôt que Capacitor : rien à maintenir côté natif tant qu'aucune API native (capteurs, notifications locales, Health Connect) n'est nécessaire.

## Ce qui est prêt dans le dépôt

- `android/twa-manifest.json` : identifiant `fr.titanapp.app` (décision du 19/10/2026 : c'est le paquet déjà créé dans Play Console, il ne change plus), couleurs Ascension, icônes 512 px (maskable), raccourcis Séance et Semaine, version 300.
- `tools/build-public.mjs` : écrit `/.well-known/assetlinks.json` quand la variable `TWA_SHA256_FINGERPRINTS` est définie (sinon rien : aucune empreinte inventée).
- `.github/workflows/android-twa.yml` : workflow manuel qui construit et signe l'App Bundle (`.aab`) et un APK de test, en artefacts.

## Essai sans aucun secret (AND03)

Actions › **Android (TWA, essai sans secret)** › *Run workflow* : construit un APK de test avec une clé jetable et mot de passe tirés au hasard sur le moteur d’exécution (aucun secret du dépôt), pour vérifier que le projet Bubblewrap se construit à partir de `android/twa-manifest.json` et essayer la coque sur un téléphone. Le fichier produit est étiqueté « NE-PAS-PUBLIER » et conservé 3 jours ; la barre d'adresse y apparaîtra tant que les empreintes de la vraie clé ne sont pas dans `assetlinks.json`. **Jamais exécuté depuis l'environnement de développement** (le SDK Android n'est pas téléchargeable ici) : le premier lancement est à surveiller. Les deux workflows utilisent les mêmes versions (Bubblewrap épinglé, Java 17, Node 22), vérifié par `tests/android-workflows.test.mjs`.

## Une seule fois

1. **Clé d'envoi** (à garder hors du dépôt, sauvegardée en lieu sûr). **Générée le 21/10/2026** depuis l'environnement cloud, sans aucun fichier dans le dépôt : alias `titan`, format PKCS12, RSA 4096, valable jusqu'au 13/10/2056, mot de passe aléatoire de 40 caractères (le même pour le magasin et la clé, ce que PKCS12 impose). Empreinte SHA-256 de la clé d'envoi (publique, à mettre dans `TWA_SHA256_FINGERPRINTS` et à comparer dans Play Console) :
   `8E:35:9E:DE:A7:2E:48:F0:76:0D:1B:7F:F6:64:94:43:9B:BA:4B:5F:73:85:DE:44:C7:CF:A5:92:9D:EC:20:5C`
   C'est la **clé d'envoi** : avec *Play App Signing*, Google garde la clé de signature de l'application et ne vérifie ici que celle-ci. Si elle est perdue ou compromise, Play Console permet de **réinitialiser la clé d'envoi** (demande au support) : l'application et ses abonnés ne sont pas perdus. Si aucune clé n'est retrouvée, la régénérer (même commande, `-keysize 4096 -storetype PKCS12 -validity 10950`), puis refaire l'étape 2 et mettre à jour l'empreinte.
   ```bash
   keytool -genkeypair -noprompt -keystore titan-upload.keystore -storetype PKCS12 -alias titan -keyalg RSA -keysize 4096 -validity 10950 \
     -dname "CN=TITAN, OU=Android upload key, O=TITAN, C=FR"    # le mot de passe est demandé, jamais écrit en clair dans une commande partagée
   keytool -list -v -keystore titan-upload.keystore -alias titan | grep SHA256
   ```
2. **Secrets GitHub** (Settings › Secrets and variables › Actions › New repository secret ; l'API des secrets n'est pas accessible depuis l'environnement cloud, ils se créent à la main) :
   - `ANDROID_KEYSTORE_BASE64` : le contenu de `base64 -w0 titan-upload.keystore` (une seule ligne)
   - `ANDROID_KEYSTORE_PASSWORD` et `ANDROID_KEY_PASSWORD` : le même mot de passe
   - Ne jamais les écrire dans un commit, une issue, une PR, un journal ou une conversation. Le workflow masque les valeurs ; un secret mal collé se corrige en le recréant.
   - **Sauvegarde** : le keystore et ses mots de passe sont à conserver hors du dépôt et hors de GitHub (un gestionnaire de mots de passe, plus une copie du keystore ailleurs), dans deux emplacements différents. Test de restauration : `keytool -list -keystore titan-upload.keystore` avec le mot de passe sauvegardé doit afficher l'alias `titan` et l'empreinte ci-dessus.
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
- Achats : décision du 21/10/2026 — Paddle est désactivé et aucun paiement n'est proposé sur le web. TITAN+ est « bientôt disponible » ; à son ouverture il s'achètera uniquement dans l'application Android, via Google Play Billing (intégration native activée dans le bundle, achats encore coupés côté application : `TITAN_PLAY_BILLING.enabled` à `false`). Vérifier les règles de facturation Google Play en vigueur avant l'ouverture.

## Non vérifié ici

Le workflow n'a pas pu être exécuté depuis l'environnement de développement (pas de SDK Android ni de clé). Le premier lancement doit être surveillé ; Bubblewrap peut demander une mise à jour de version (`--skipVersionUpgrade` est déjà passé).

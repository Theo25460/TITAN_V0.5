# Publier TITAN Android sur Google Play

> **Marche à suivre détaillée et à jour : [`PUBLIER_PLAY_CONSOLE.md`](PUBLIER_PLAY_CONSOLE.md).** Cette page reste la référence technique de la clé et du build.

Application : **fr.titanapp.app** (fiche Play existante). La TWA de test interne utilisait `versionCode 300` : l'application
native part de **1000** et chaque build CI augmente (`1000 + numéro d'exécution`, ou valeur saisie au lancement manuel).

## 1. Clé d'envoi (une seule fois)

La clé d'envoi décrite dans `docs/ANDROID.md` (alias `titan`, PKCS12, empreinte SHA-256
`8E:35:9E:DE:A7:2E:48:F0:76:0D:1B:7F:F6:64:94:43:9B:BA:4B:5F:73:85:DE:44:C7:CF:A5:92:9D:EC:20:5C`) sert aussi à l'application
native : avec Play App Signing, Google re-signe l'application, seule la clé d'envoi doit correspondre.

Secrets GitHub (Settings › Secrets and variables › Actions), à créer à la main, jamais dans le dépôt :

| Secret | Contenu |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 titan-upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du magasin |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé (identique en PKCS12) |

## 2. Construire le bundle signé

Actions › **Android natif (React Native)** › *Run workflow* :

- `signing` = **upload** (refuse de démarrer si les secrets manquent) ;
- `version_code` = un entier supérieur au dernier code signé (`docs/last-version-code.txt` : 1304 au 18/11/2026) ; **obligatoire** avec `signing=upload` (vide = `1000 + numéro d'exécution`, réservé aux essais) ;
- `version_name` = x.y.z explicite (`1.0.0` refusé avec `signing=upload`).

Le job vérifie l'identifiant, le `versionCode`, la cible SDK (≥ 35, actuellement 36), les permissions (liste fermée),
la signature, l'adresse Supabase de production et l'absence de trafic HTTP en clair, puis publie l'artefact
`titan-android-<code>-upload` : `titan-<version>-<code>-upload.aab` (Play Console) et `.apk` (installation directe).

Sans `signing = upload`, les builds sont signés avec une **clé jetable** et marqués `essai-NE-PAS-PUBLIER` :
installables pour tester, refusés par Play Console.

## 3. Play Console (actions humaines)

1. Test interne › Créer une release › importer le `.aab` signé avec la clé d'envoi.
2. Notes de version : « Nouvelle application Android native : séances hors ligne, progrès, aventure, communauté. »
3. **Sécurité des données** (l'application n'ajoute aucune collecte par rapport au site) :
   - collectées : adresse e-mail et identifiant de compte (gestion du compte) ; activité sportive saisie, notes, traces GPX
     importées (fonctionnalité de l'application) ; nom affiché et contenus partagés volontairement avec des amis ;
   - **périmé** : voir `PUBLIER_PLAY_CONSOLE.md` § 4 et § 4 bis. La permission `AD_ID` est dans tous les builds ; les données AdMob ne sont partagées qu'avec `ads=live`
     (`AD_ID` présent pour AdMob, sous consentement ; attribution et sujets Privacy Sandbox retirés), aucune statistique d'usage côté application Android ;
   - chiffrement en transit (HTTPS) ; suppression du compte possible dans l'application (Profil › Compte › Supprimer)
     ou par e-mail à titanteam.app@gmail.com (URL publique de suppression du site à renseigner quand elle sera déployée).
4. **Contient des publicités** et **achats intégrés** : selon les options du build, table `PUBLIER_PLAY_CONSOLE.md` § 4 bis (release 1.4.0 : annonces Non, achats Oui, la vente n'ouvrant qu'avec le feu vert du serveur).
5. Classification du contenu : questionnaire IARC (pas de contenu sensible ; fonctions sociales entre amis avec
   blocage et signalement côté serveur).
6. Catégorie : Santé et remise en forme. Politique de confidentialité : https://titan-app.fr/legal_privacy.
7. Permissions déclarées : `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` (rappels facultatifs, demandés
   seulement quand l'utilisateur les active), `VIBRATE`, `RECEIVE_BOOT_COMPLETED` (reprogrammer les rappels après
   redémarrage), `WAKE_LOCK`, plus localisation précise et `FOREGROUND_SERVICE_LOCATION` (GPS), `ACTIVITY_RECOGNITION` (pas), Santé Connect (`READ_STEPS`, `READ_EXERCISE`), `BILLING`, `AD_ID`. Aucune localisation en arrière-plan, caméra, contacts ou stockage.
8. Tester sur un téléphone via le lien de test interne, puis promouvoir en test fermé (exigence Google pour les comptes
   personnels : 12 testeurs pendant 14 jours), puis production. **Aucune publication automatique.**

## 4. Liens d'application (facultatif)

L'application n'intercepte pas les liens `https://titan-app.fr` (le site reste le site). Les liens `titan://` ouvrent
les écrans de l'application (rappels).

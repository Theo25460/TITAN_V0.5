# Publier TITAN Android sur Google Play — marche à suivre

Rédigé le 21/10/2026 pour l'application native `fr.titanapp.app`, **mis à jour le 18/11/2026 (release TITAN ONE 1.4.0)**.
Les déclarations dépendent des options du build (`ads`, `billing`) : la table du § 4 bis dit quoi répondre pour chaque combinaison.
Ce que le paquet contient **toujours**, quelles que soient les options : la permission `AD_ID` (le contrôle du paquet l'exige, kit AdMob),
la permission `BILLING` (Play Billing 9.1.0), la localisation précise avec service de premier plan « localisation » (GPS), le compteur de
pas (`ACTIVITY_RECOGNITION`) et Santé Connect en lecture (`READ_STEPS`, `READ_EXERCISE`). Référence juridique : `docs/v131/lot6-textes-juridique.md` § 6.

Ce qui est établi par le dépôt est écrit tel quel. Ce qui dépend de la console Google est marqué **(à vérifier dans la
console)** : ses intitulés et ses règles changent, relis la page d'aide au moment de la saisie. **Rien n'est publié
automatiquement** : chaque envoi est une action que tu fais.

## 0. Ce qui est déjà prêt

| Élément | État |
|---|---|
| Identifiant et clé | `fr.titanapp.app`, même clé d'envoi que la TWA (empreinte SHA-256 `8E:35:9E:DE:…:20:5C`) : Play verra une mise à jour, pas une nouvelle application |
| Numéro de version | Registre : `1301` (1.2.1) distribué en test fermé ; `1302`, `1303` (deux fois), `1304` (1.3.2, 17/11) signés mais non distribués — à confirmer dans l'explorateur d'App Bundles. Dernier code signé : `mobile/docs/last-version-code.txt`. Un build `upload` **refuse** un `version_code` vide ou inférieur ou égal, et un `version_name` vide ou `1.0.0` |
| Secrets GitHub | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` sont créés : le build signé avec la vraie clé a déjà réussi (artefact `titan-android-1011-upload`) et le workflow **refuse** une clé dont l'empreinte n'est pas la bonne |
| Contrôles du paquet | identifiant, `versionCode`, cible API ≥ 36, permissions en liste fermée, Play Billing 9.1.0 unique, `AD_ID` présent, signature de l'APK **et de l'AAB** par la clé d'envoi, adresse Supabase de production, aucun trafic en clair ; l'AAB signé n'est publié que si le parcours émulateur a réussi (job « AAB signé pour Play ») |
| Visuels | 6 captures 1080 × 2160 dans `mobile/docs/play-store/` ; icône `image/logo-512.png` et image 1024 × 500 `docs/play-store/feature-graphic-1024x500.png` (PR #115) |

## 1. Construire le bundle final signé

1. GitHub › Actions › **Android natif (React Native)** › *Run workflow*.
2. Branche : `main` (le commit publié sur le Web).
3. `signing` = **upload** ; `version_code` = le suivant de `mobile/docs/last-version-code.txt` ; `version_name` explicite (x.y.z) ;
   `ads`, `billing`, `google_signin`, `partial_release` selon le § 4 bis ; `e2e` et `e2e_post_migrations` cochés.
4. À la fin, télécharge l'artefact `titan-android-<code>-upload` (produit par le job « AAB signé pour Play », seulement si tout est vert) :
   il contient le `.aab` (pour Play Console), un `.apk` (installation directe), `SHA256SUMS.txt` (`sha256sum -c SHA256SUMS.txt` dans le
   dossier décompressé), `badging.txt`, `permissions.txt`, `signature.txt` et `aab-signature.txt`. Après l'envoi, mets à jour
   `mobile/docs/last-version-code.txt`.
5. Vérifie `signature.txt` : le SHA-256 du certificat doit être celui de ta clé d'envoi. Un fichier `essai-NE-PAS-PUBLIER`
   est signé avec une clé jetable : **ne l'envoie jamais** à Play.

## 2. Compte et application dans la console

1. Compte développeur validé (identité, frais). **Note s'il est « personnel » ou « organisation »** : cela décide du
   test fermé obligatoire (§6) **(à vérifier dans la console, page « Accès à la production »)**.
2. L'application `fr.titanapp.app` existe déjà (test interne TWA). Ne la recrée pas.
3. Play App Signing est actif (Google signe l'application ; seule la clé d'envoi doit correspondre).

## 3. Fiche de l'application

Textes prêts à coller (ils ne promettent rien qui ne soit pas dans l'application). **« Sans publicité » n'est vrai qu'avec `ads=off`** ; avec `ads=live`, prendre les textes de `docs/play-store/README.md`. « Gratuit » reste vrai : les offres TITAN+, Coach et Coach Ultra sont facultatives et Play affiche « Achats intégrés » :

- **Nom** (30 max) : `TITAN — Ton sport réel` (22)
- **Description courte** (80 max) : `Ton sport réel devient une progression qui dure. Gratuit, sans publicité.` (73)
- **Description longue** :

  > TITAN transforme ton sport réel en progression. Tu fais du sport, TITAN le comprend et le met en valeur.
  >
  > • Enregistre une séance en moins d'une minute, même sans réseau : course, vélo, natation, musculation, escalade… plus de 260 sports.
  > • Comprends ta progression : ta semaine, tes records, ta maîtrise de chaque sport, et des réponses à de vraies questions (est-ce que je m'entraîne plus qu'avant ? où va mon temps ?).
  > • Vis une aventure : tes jours actifs allument les balises de quatre mondes illustrés, avec leurs obstacles et leurs gardiens. Aucun effort n'est inventé : l'aventure avance avec tes vraies séances.
  > • Fixe tes objectifs, planifie ta semaine, importe tes traces GPX.
  > • Personnalise ton personnage avec des cosmétiques gagnés avec tes séances. Rien ne s'achète avec de l'argent.
  > • Défie tes amis, rejoins une guilde, partage un moment si tu le veux. Tu choisis ce qui est visible.
  >
  > Gratuit, sans publicité. Même compte que sur titan-app.fr : tes séances et ta progression te suivent. Tu peux exporter tes données et supprimer ton compte depuis l'application.

- **Catégorie** : Santé et remise en forme.
- **E-mail de contact public** : celui de ton choix (le site utilise `titanteam.app@gmail.com`). Site : `https://titan-app.fr`.
- **Politique de confidentialité** : `https://titan-app.fr/legal_privacy` (publique, sans connexion).
- **Icône** 512 × 512 : `image/logo-512.png`. **Image de présentation** 1024 × 500 : celle de la PR #115.
- **Captures téléphone** : les 6 fichiers de `mobile/docs/play-store/`. Ce sont les vrais écrans avec des données fictives.

## 4. Déclarations de l'application (« Contenu de l'application »)

| Formulaire | Réponse | Pourquoi |
|---|---|---|
| Publicités | selon `ads` : **Non** avec `ads=off`, **Oui** avec `ads=live` (§ 4 bis) | kit AdMob présent dans tous les builds ; il n'affiche rien avec `ads=off` |
| Identifiant publicitaire | **Oui** (finalité publicité) dans **tous** les builds | la permission `AD_ID` est toujours dans le paquet ; répondre « Non » bloque la release dans la console |
| Achats intégrés / abonnements | **Oui** avec `billing=true` (`titan01`, `titan02`, `titan03`) | la feuille de paiement ne s'ouvre qu'après le feu vert du serveur (`GET play-billing` = 204) ; sans `PLAY_BILLING_ENABLED=true` sur Netlify, aucun achat n'est possible |
| Accès à l'application | Compte nécessaire. **Fournis un compte de test** | crée un compte dédié (pas un vrai) sur titan-app.fr, confirme son e-mail, finis son accueil, et saisis l'identifiant et le mot de passe dans le formulaire |
| Public cible | **à décider** : 13+ ou 18+ ; éviter « moins de 13 ans » | fonctions sociales entre amis, pseudos, messages de guilde |
| Classification (IARC) | utilitaire / santé et forme ; **contenu généré par les utilisateurs : oui** (pseudos, messages de guilde) ; violence, sexe, jeux d'argent, substances : non | blocage et signalement existent côté serveur |
| Application de santé | Suivi de forme physique ; pas un dispositif médical, aucun conseil médical **(à vérifier dans la console : le formulaire « Applications de santé »)** | le texte de l'application le dit dans la charge d'entraînement |
| Suppression de compte | Dans l'application : Profil › Compte et sécurité › Supprimer. **URL web exigée par Google** : `https://titan-app.fr/supprimer-mon-compte` | **cette page n'est en ligne qu'avec la version Web de la PR #115** : voir §7, c'est un prérequis de la production |

### Sécurité des données

Principe : décris ce que l'application collecte ; tout est **chiffré en transit** (HTTPS) ; la **suppression** est possible.

| Donnée | Collectée | Partagée | Obligatoire | Finalité |
|---|---|---|---|---|
| Adresse e-mail | Oui | Non | Oui (compte) | gestion du compte, connexion |
| Identifiant d'utilisateur | Oui | Non | Oui | compte, fonctions sociales |
| Nom / pseudo | Oui | Non (visible des amis choisis) | Oui | fonctionnement de l'application |
| Informations de forme physique (séances, durées, distances, notes) | Oui | Non | Non | fonctionnement de l'application |
| **Localisation précise** | **Oui** | Non | Non (seulement si tu utilises le suivi GPS) | fonctionnement de l'application : pendant un enregistrement GPS (permission `ACCESS_FINE_LOCATION`, service de premier plan « localisation »), la trace est envoyée sur le compte (`titan_route_save_v1`, bibliothèque privée « Mes parcours ») ; elle n'est jamais partagée et se supprime une par une ou avec le compte. Corrigé le 15/11/2026 (AUD-02) : l'ancienne ligne « Non » était fausse depuis l'ajout du GPS natif |
| Santé et remise en forme : pas et séances lus dans Santé Connect | Oui | Non | Non (consentement par source, révocable) | fonctionnement de l'application : import des séances et des pas du jour (`READ_EXERCISE`, `READ_STEPS`) |
| Messages (guilde) | Oui | Non | Non | fonctionnement de l'application |
| Photos, contacts, appareil photo, stockage | **Non** | — | — | aucune permission correspondante |
| Activité dans l'application, journaux d'erreurs | **Non** | — | — | aucune mesure d'audience ni envoi automatique de plantage dans l'application Android |
| Historique d'achats (jeton d'achat, statut) | **Oui** avec `billing=true` | Non | Oui | gestion de l'abonnement (`functions/play-billing.mjs`, table privée) |
| Identifiant publicitaire, interactions, diagnostics, position approximative (IP) | **Oui, par le kit AdMob**, seulement avec `ads=live` | **Oui** (Google) | selon le consentement | publicité — reprendre la déclaration type de Google pour son kit (`docs/v131/lot6-textes-juridique.md` § 6) |

Prestataires de traitement à indiquer si le formulaire le demande : Supabase (hébergement des données, région
`eu-west-1`). Les durées de conservation ne sont **pas fixées** dans le cahier (décision Q-002) : ne rien affirmer de
précis tant qu'elle n'est pas prise.

## 4 bis. Options du build et déclarations correspondantes

| Options | « Contient des annonces » | Identifiant publicitaire | Achats intégrés | Sécurité des données en plus |
|---|---|---|---|---|
| `ads=off`, `billing=true`, `partial_release=true` (**release 1.4.0**) | Non | Oui (permission présente) | Oui | historique d'achats |
| `ads=live`, `billing=true` | **Oui** | Oui, publicité | Oui | lignes AdMob (identifiant, interactions, diagnostics, position approximative) partagées avec Google |
| `ads=off`, `billing=false`, `partial_release=true` | Non | Oui (permission présente) | Non | — |
| `ads=test` | **interdit** pour un build `upload` (bannières « Test Ad » chez de vrais utilisateurs) | | | |

## 5. Test interne (l'étape qui prouve que tout marche)

1. Tests › **Test interne** › *Créer une release* › envoie le `.aab` signé `upload`.
2. Notes de version : « Nouvelle application Android native : séances hors ligne, progrès, aventure, communauté. »
3. Ajoute tes adresses de testeurs, installe via le lien de test.
4. **Sur ton téléphone, vérifie** : connexion avec ton vrai compte, ta dernière séance présente, saisie d'une séance,
   « +XP » confirmés, séance en mode avion puis retour du réseau, retour arrière du système, déconnexion/reconnexion,
   changement de compte. **N'essaie pas la suppression de compte sur un vrai compte.**
5. Lis le **rapport de pré-lancement** de Play Console et corrige ce qu'il relève avant d'élargir.

## 6. Test fermé, puis production

- Si le compte est **personnel** et récent, Google exige un test fermé avec **12 testeurs au moins pendant 14 jours**
  avant d'ouvrir la production **(à vérifier dans la console)**. Lance-le dès que le test interne est bon : ce délai ne
  dépend pas du code.
- Ensuite : *Production* › *Créer une release* avec le **même** `.aab` ou un plus récent, pays, déploiement progressif
  conseillé (par ex. 20 %), puis *Envoyer pour examen*. L'examen de Google peut prendre plusieurs jours.

## 7. Ce qui doit être fait côté site avant la production (prérequis de la fiche)

L'application native fonctionne **avec la base de production actuelle** (parcours prouvés sur une réplique de sa
structure). Mais :

1. La **page de suppression de compte** `https://titan-app.fr/supprimer-mon-compte` n'existe que dans la candidate Web
   (PR #115) : la version en ligne aujourd'hui date du 05/10/2026. Sans elle, le formulaire « suppression de compte » de
   la console n'a pas d'URL valide. → déployer la version Web (voir `docs/FINITION_WEB_2026-10-21.md`, PR #117) **après**
   les étapes de sécurité ci-dessous.
2. Les mondes **Forge** et **Aurores** s'affichent « accès gratuit à venir » tant que la migration qui les ouvre n'est
   pas appliquée en production. Rien à changer dans l'application ensuite.
3. **Migrations de production** (29 fichiers après `20261005230000`) : à n'appliquer **qu'après** sauvegarde
   restaurée et vérifiée sur une copie isolée (procédure : `docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md`). L'une
   d'elles purge des données. Je n'y ai pas touché et je ne le ferai pas sans ton accord explicite.

## 8. Après la publication

Mettre l'adresse publique de la fiche dans `tools/data/play-store.json` (procédure : `docs/PLAY_CONSOLE.md` §10, PR
#115) pour afficher le lien « Télécharger sur Google Play » sur le site. Jamais avant que la fiche soit publique.

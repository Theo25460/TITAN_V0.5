# Play Console — dossier prêt à copier (GP02, GP05, GP06, GP07, GP08, GP09)

Préparé le 20/10/2026. **Rien n'a été saisi dans la Play Console** : le compte, l'identité, les frais d'inscription et les clés restent chez Théo. Ce document donne les textes et réponses à coller, tirés du comportement réel du code (`docs/PRIVACY_TECHNICAL_INVENTORY.md`, `docs/ANDROID.md`). Les règles Google changent : **relire les pages d'aide Play Console au moment de la saisie** (GP01) ; tout ce qui est marqué « à confirmer » n'est pas établi par le dépôt.

## 1. Avant de commencer

| Étape | Qui | Détail |
|---|---|---|
| Compte développeur | Théo | Inscription (frais uniques), vérification d'identité, coordonnées publiques. Type de compte (personnel / organisation) à confirmer : il décide du test fermé obligatoire (§7). |
| Application | Théo | Déjà créée avec le paquet `fr.titanapp.app` (décision 19/10/2026) ; il ne change plus. |
| Clé d'envoi + secrets GitHub | Théo | Procédure dans `docs/ANDROID.md` (« Une seule fois »). Ne jamais coller le mot de passe ou le keystore dans une conversation, un ticket ou le dépôt. |
| Play App Signing | Théo | Activer, puis relever l'empreinte SHA-256 de la clé de signature (Intégrité de l'application) et la mettre avec celle de la clé d'envoi dans `TWA_SHA256_FINGERPRINTS` (Netlify). |

## 2. Fiche de l'application (GP02)

- **Nom** (30 caractères max) : `TITAN — Ton sport réel`
- **Description courte** (80 max) : `Enregistre ton sport réel, progresse comme dans un RPG, sans pub ni achat de puissance.` (87 caractères : à raccourcir si le champ refuse, par ex. `Ton sport réel devient une progression RPG. Sans pub, sans pay-to-win.`)
- **Description longue** (à ajuster au produit livré au moment de la publication) :

  > TITAN transforme ton sport réel en progression. Enregistre tes séances (course, marche, natation, musculation…), regarde ta semaine, tes records et tes objectifs, et fais avancer ton personnage dans une aventure qui récompense la régularité.
  >
  > • Un journal clair de tes séances, avec bilans et comparaisons.
  > • Objectifs personnels et quêtes liés à ce que tu fais vraiment.
  > • Aventure, boutique cosmétique et social (amis, guildes) : aucune puissance à acheter.
  > • Une modération explicable : les résultats suspects sont examinés, tu peux faire un recours.
  > • TITAN+ (abonnement optionnel) : analyses avancées. Il se gère sur le site titan-app.fr.
  > • Ton compte et tes données t'appartiennent : tu peux supprimer ton compte depuis l'application.

  Ne rien promettre qui n'est pas livré en production (TITAN+, social, aventure) : retirer les lignes correspondantes si une fonction n'est pas encore active le jour de la publication.
- **Catégorie** : Santé et remise en forme. **Étiquettes** : à choisir dans la console.
- **Coordonnées** : e-mail de contact public (à fournir par Théo), site `https://titan-app.fr`.
- **Politique de confidentialité** : `https://titan-app.fr/legal_privacy` — doit être publique, sans connexion, et cohérente avec la section Sécurité des données ci-dessous.
- **Suppression de compte** (formulaire « Suppression de compte » de la console) : suppression depuis l'application (Profil › Supprimer mon compte) ; URL web à renseigner : `https://titan-app.fr/supprimer-mon-compte` (page publique créée le 20/10/2026 : marche à suivre dans l'application, demande par e-mail depuis l'adresse du compte si l'accès est perdu, ce qui est effacé et conservé avec ses durées). **Elle n'est vraie qu'une fois la migration 25 appliquée en production** : ne la soumettre à Google qu'après.
- **Visuels** (GP03) : générés depuis l'application réelle, avec des données synthétiques, dans `docs/play-store/` (6 captures téléphone 1080×1920 et l'image de présentation 1024×500, détail dans `docs/play-store/README.md`). Régénérer : `node tools/build-public.mjs && node tools/play-screenshots.mjs`. Icône 512×512 : `image/logo-512.png`. **Reste à faire par Théo** : les téléverser dans la Play Console (fiche principale) ; produire des captures tablette seulement si la fiche tablette est voulue (non générées).

## 3. Déclarations de l'application

| Question | Réponse proposée | Source |
|---|---|---|
| Contient des publicités (GP04) | **Non** | `adsEnabled` est faux, aucune régie chargée, CSP sans hôte publicitaire. À repasser sur **Oui** avant toute activation (ADS03). |
| Application gratuite / payante | Gratuite | — |
| Achats via l'application | **Oui, une fois la phase 5 d'`docs/adr/ADR-004-google-play-billing-titan-plus.md` réussie** : décision de Théo du 20/10/2026, TITAN+ s'achète dans l'application par Google Play Billing (abonnement). Tant que le drapeau `TITAN_PLAY_BILLING.enabled` est faux, l'application n'affiche aucun achat (prouvé par `tests/e2e/twa-no-checkout.e2e.mjs`) : ne déclarer « oui » qu'au moment d'envoyer la version qui l'active. Cosmétiques : jamais contre de l'argent réel (`tests/no-currency-purchase.test.mjs`). | Atelier |
| Accès à l'application | Compte nécessaire pour la plupart des fonctions ; fournir à Google un compte de test si la revue le demande (créer un compte dédié, ne pas réutiliser un vrai compte). | — |
| Public cible | 13+ ou 18+ : **décision à prendre** (modération, social, messages). Éviter « moins de 13 ans » (règles familles). | à décider |
| Application d'actualités / de santé | Non à « actualités ». Santé : l'application n'est pas un dispositif médical et ne donne pas de conseil médical ; déclarer « suivi de forme physique » si le formulaire le propose. | à confirmer |

## 4. Sécurité des données (GP05)

Principes : décrire ce que **l'application et ses services** collectent ; chaque donnée collectée est **chiffrée en transit** (HTTPS) ; l'utilisateur peut demander la **suppression** (dans l'application). Aucune donnée n'est vendue ni partagée à des fins publicitaires.

| Catégorie Google | Type | Collectée | Partagée | Obligatoire / facultative | Finalité |
|---|---|---|---|---|---|
| Informations personnelles | Adresse e-mail | Oui | Non | Obligatoire (compte) | Gestion du compte, authentification |
| Informations personnelles | Identifiants utilisateur | Oui | Non | Obligatoire | Compte, fonctions sociales |
| Informations personnelles | Nom / pseudo | Oui | Non (visible des autres joueurs si le profil est public) | Obligatoire | Fonctionnalité de l'application |
| Santé et forme physique | Informations sur la forme physique (séances, distance, durée…) | Oui | Non | Facultative pour l'usage, mais c'est la fonction principale | Fonctionnalité de l'application |
| Localisation | Localisation approximative / précise | **Seulement si un tracé GPS est importé ou enregistré** (`gpxPath`) : à confirmer avec le produit livré | Non | Facultative | Fonctionnalité de l'application |
| Messages | Autres messages dans l'application (guildes, messages) | Oui | Non | Facultative | Fonctionnalité de l'application |
| Photos et vidéos | Photos (avatar) | Oui si l'utilisateur en ajoute | Non | Facultative | Personnalisation |
| Activité dans l'application | Interactions, pages vues | **Uniquement avec accord** (mesure d'audience) | Non | Facultative | Analyses |
| Infos et performances | Journaux d'erreurs | **Restent sur l'appareil** (aucun envoi automatique relevé) | — | — | — |
| Infos financières | Historique d'achats | Côté site via Paddle (identifiants d'événement, d'offre, d'abonnement) ; pas dans l'application Android | Partagé avec Paddle pour le paiement sur le site | — | à confirmer selon la réponse « achats » ci-dessus |

Tiers à déclarer comme prestataires de traitement : Supabase (hébergement des données, région `eu-west-1`), Netlify (hébergement), Paddle (paiement sur le site), Resend (e-mails d'assistance). Les durées de conservation ne sont **pas fixées** (Q-002) : ne rien affirmer de précis dans la politique tant que la décision n'est pas prise. Toute modification de collecte impose de remettre ce formulaire à jour **avant** la version concernée.

## 5. Classification du contenu (GP06)

Questionnaire IARC : catégorie utilitaire / santé et forme. Réponses probables : pas de violence réaliste, pas de contenu sexuel, pas de jeux d'argent, pas de substances ; **fonctions sociales avec contenu généré par les utilisateurs et interaction entre utilisateurs : Oui** (messages de guilde, pseudos) ; partage de la localisation : seulement avec tracé importé (à confirmer) ; achats numériques : selon la décision du §3. Répondre au vu de la version réellement publiée, pas de cette liste.

## 6. Étapes techniques (GP08, GP09)

1. Construire un `.aab` signé : Actions › **Android (TWA)** (secrets en place). Version de code croissante (`version_code`).
2. Play Console › Tests › **Test interne** : créer la piste, ajouter les adresses des testeurs, envoyer le `.aab`.
3. Vérifier sur téléphone : pas de barre d'adresse (sinon les empreintes de `assetlinks.json` ne correspondent pas), démarrage, connexion, saisie d'une séance, hors ligne, suppression de compte.
4. Rapport de pré-lancement (GP10) : corriger ce qu'il relève avant d'élargir.
5. Test fermé (§7), puis production seulement quand tout est stable (GP11).
6. Une fois la fiche publique : lien Google Play traçable sur le site (GP12), jamais avant que l'URL soit active (GP13) ; pas de bouton « Télécharger » dans l'application installée (GP14).

## 7. Test fermé obligatoire (GP07 — à vérifier)

Pour les comptes **personnels créés après le 13 novembre 2023**, l'aide Google exige un test fermé avec **au moins 12 testeurs inscrits en continu pendant au moins 14 jours** avant de pouvoir demander l'accès à la production (page d'aide Play Console « 14151465 », consultée le 20/10/2026 ; des guides tiers ajoutent que le compteur repart de zéro si le nombre de testeurs passe sous 12 : non confirmé par Google, à surveiller). Production et pré-enregistrement restent désactivés tant que la condition n'est pas remplie. Les comptes d'organisation n'y sont pas soumis. Conséquence pratique : recruter les testeurs et lancer le test fermé le plus tôt possible, car cela ne dépend pas du code.

## 8. Ce qui reste humain

Création/vérification du compte, frais, e-mail public, choix du public cible (§3), validation de la politique de confidentialité et des durées (Q-002, LEG), décision sur les achats dans l'application Android, captures d'écran, clé d'envoi et secrets, soumission de chaque formulaire.

## 9. Ordre exact des actions humaines (checklist)

Chaque ligne dépend de la précédente. Les parties techniques sont déjà dans le dépôt ; ce qui suit ne peut pas être fait par Claude.

1. **Compte développeur** Play Console (identité, frais, e-mail public). Noter si le compte est personnel ou d'organisation (§7).
2. **Clé d'envoi** et secrets GitHub `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` (`docs/ANDROID.md`, « Une seule fois »). Ne jamais les écrire dans une conversation.
3. **Play App Signing** activé ; relever l'empreinte SHA-256 de la clé de signature ; variable Netlify `TWA_SHA256_FINGERPRINTS` (clé d'envoi + clé Play) ; redéployer ; vérifier `https://titan-app.fr/.well-known/assetlinks.json`.
4. **Actions › Android (TWA)** avec un `version_code` croissant ; télécharger le `.aab` et l'APK.
5. **Fiche** : coller §2, §3 (Sécurité des données §4, classification §5), politique de confidentialité, suppression de compte, captures (à faire sur l'application installée).
6. **Test interne** : envoyer le `.aab`, ajouter des testeurs, essayer sur téléphone (icônes, démarrage, clavier, bouton retour, session, hors ligne, suppression de compte).
7. **Si compte personnel : test fermé** avec au moins 12 testeurs pendant 14 jours (§7). À lancer le plus tôt possible.
8. **TITAN+ par Google Play** (ADR-004 phase 5), dans l'ordre : créer le produit d'abonnement ; créer le compte de service et lui donner l'accès aux abonnements ; secrets Netlify `PLAY_PRODUCT_IDS`, `PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_RTDN_TOKEN`, `PLAY_PACKAGE_NAME` si différent ; sujet Pub/Sub et abonnement « push » vers `https://titan-app.fr/.netlify/functions/play-notifications?token=<PLAY_RTDN_TOKEN>` ; **appliquer la migration 24 selon le plan de production** ; relire les pages Google officielles (chemins et champs de l'API écrits de mémoire) ; passer `PLAY_BILLING_ENABLED` à `true` et `TITAN_PLAY_BILLING.enabled` à `true` ; essayer avec un compte testeur de licence ; seulement ensuite déclarer les achats dans l'application.
9. **Production** : demander l'accès (si exigé), publier, puis ajouter le lien Google Play dans Titan et sur le site (GP12, GP13).


## 10. Activer le lien Google Play sur le site (GP12 à GP15, SEO09)

Le code est prêt et **éteint** : tant que `tools/data/play-store.json` contient `"url": ""`, aucune page ne contient de lien, de balise ni de script Google Play (un bouton cassé ne peut donc pas partir en ligne, GP13).

Quand la fiche est **publique** et que l'adresse fonctionne :

1. Mettre dans `tools/data/play-store.json` l'adresse exacte `https://play.google.com/store/apps/details?id=fr.titanapp.app` (rien d'autre n'est accepté : ni autre application, ni paramètre).
2. `node tools/build-public-site.mjs && node tools/build-public-docs.mjs`, relire `git diff`, lancer `pnpm run verify` puis `pnpm run test:e2e`.
3. Résultat : un lien « Télécharger sur Google Play » dans le pied de page de toutes les pages publiques, la déclaration `MobileApplication` (sans note, avis ni prix inventés) sur l'accueil, et sur un téléphone Android dans un navigateur une fine bande « TITAN existe aussi sur Android » que l'on peut fermer (mémorisé 14 jours). Rien n'apparaît dans l'application Android ni dans une PWA installée (GP14).
4. Le lien porte `referrer=utm_source=titan-site&utm_medium=web&utm_campaign=<page>` : les installations par page se lisent dans Play Console (acquisition), sans aucune donnée personnelle.
5. Après la mise en ligne, demander une réindexation dans la Search Console ; Google ne change pas son aperçu instantanément (SEO11).
6. Le logo officiel « Disponible sur Google Play » est volontairement remplacé par un lien texte : si tu veux le badge, prends-le dans le kit officiel de Google et respecte ses règles d'usage.

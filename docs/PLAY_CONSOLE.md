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
- **Suppression de compte** (formulaire « Suppression de compte » de la console) : suppression depuis l'application (Profil › Supprimer mon compte) ; une URL web de demande de suppression est à renseigner : page d'assistance `https://titan-app.fr/service` (à confirmer qu'elle accepte une demande sans être connecté, sinon créer la page avant la soumission).
- **Visuels** (GP03, à produire à partir de l'application réelle) : icône 512×512 (`image/logo-512.png`), image de présentation 1024×500, captures téléphone (2 à 8, 16:9 ou 9:16, côté 320–3 840 px). Le dépôt ne contient pas encore de captures Play : à faire sur l'appli installée.

## 3. Déclarations de l'application

| Question | Réponse proposée | Source |
|---|---|---|
| Contient des publicités (GP04) | **Non** | `adsEnabled` est faux, aucune régie chargée, CSP sans hôte publicitaire. À repasser sur **Oui** avant toute activation (ADS03). |
| Application gratuite / payante | Gratuite | — |
| Achats via l'application | **Non** dans l'application Android (la coque `?source=twa` masque le bouton et renvoie vers le site ; prouvé par `tests/e2e/twa-no-checkout.e2e.mjs`). **Risque à trancher avant publication** : TITAN+ est un abonnement numérique. Les règles Google sur les paiements changent en 2026 et varient selon la région (programmes « Alternative Billing » et « External Content Links » aux États-Unis, régimes distincts dans l'EEE et au Royaume-Uni, frais et déclarations en évolution selon des sources tierces contradictoires). Inviter à payer sur le site depuis l'application peut relever de ces règles. Options : (1) ne rien mentionner du paiement dans l'application Android (aucune note, aucun lien) ; (2) s'inscrire au programme de liens externes de la région ; (3) intégrer Google Play Billing. Décision de Théo, après lecture de la page Google « Payments » à jour (PREM12). | Atelier |
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

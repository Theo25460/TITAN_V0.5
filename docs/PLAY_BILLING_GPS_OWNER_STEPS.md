# Billing et GPS — ce que seul le propriétaire peut faire (02/11/2026)

Rien ici n'est automatique ni déployé. Chaque étape dit où cliquer et quelle valeur saisir. Aucun secret ne doit entrer dans GitHub, un commit, un journal ou le cahier.

## A. Obtenir un AAB que Play accepte (déblocage des abonnements)
1. GitHub › Actions › **Android natif (React Native)** › Run workflow › branche `claude/titan-cahier-charges-0k7cdn`, `signing` = `upload`, `version_code` = un nombre **supérieur à tous les versionCode déjà envoyés** (vide = 1000 + numéro d'exécution).
2. Télécharger l'artefact `titan-android-<code>-upload` (pas « essai-NE-PAS-PUBLIER ») : le fichier `.aab`.
3. Play Console › TITAN (`fr.titanapp.app`) › Tests › **Test interne** › Créer une version › envoyer l'AAB. Ne pas toucher à Production.
   Lien : https://play.google.com/console › TITAN › Tests et publication › Tests › Test interne.
4. À l'envoi, la console demande la **déclaration des services de premier plan** (GPS) : type « Localisation », description : « Enregistre la trace GPS d'une séance de sport que l'utilisateur démarre et peut arrêter à tout moment ; une notification reste visible pendant l'enregistrement. » Joindre une courte vidéo (démarrer, verrouiller l'écran, rouvrir, terminer) : à tourner sur un vrai téléphone.
5. Déclaration des **autorisations sensibles** : seulement « Position précise (au premier plan) ». **Ne pas** déclarer la position en arrière-plan (l'application ne la demande pas).

## B. Créer les abonnements (après A)
Play Console › TITAN › **Monétiser avec Play › Produits › Abonnements** › Créer un abonnement :
| Identifiant produit | Nom | Forfait de base | Prix |
|---|---|---|---|
| `titan_plus` | TITAN+ | `mensuel`, renouvelable chaque mois | **à décider par Théo** |
| `coach` | Coach | `mensuel`, renouvelable | 20 € |
| `coach_pro` | Coach Pro | `mensuel`, renouvelable | 40 € |
Ces identifiants sont ceux du code (`mobile/src/lib/playBilling.ts` et la liste du serveur). S'ils diffèrent, dis-le-moi : un seul fichier à changer. Un profil de paiement marchand peut être demandé.

## C. Accès du serveur à l'API Google Play (compte de service)
1. Google Cloud (projet lié à la Play Console) › IAM et administration › Comptes de service › Créer (nom : `titan-play-billing`), puis Clés › Ajouter une clé › JSON. **Le fichier ne quitte jamais ta machine, sauf pour la variable Netlify ci-dessous.**
2. Play Console › Utilisateurs et autorisations › Inviter l'adresse e-mail du compte de service › autorisations de l'application TITAN : « Afficher les informations financières », « Gérer les commandes et les abonnements ».
3. Netlify › Variables d'environnement (contexte Production seulement quand tu décides d'ouvrir) :
   - `PLAY_SERVICE_ACCOUNT_JSON` = le contenu du fichier JSON
   - `PLAY_PRODUCT_IDS` = `titan_plus,coach,coach_pro`
   - `PLAY_PACKAGE_NAME` = `fr.titanapp.app` (facultatif, valeur par défaut)
   - `PLAY_BILLING_ENABLED` = `false` pour l'instant (`true` seulement pendant l'essai testeur puis à l'ouverture)
   - `PLAY_ALLOW_TEST_PURCHASES` = `true` **pendant l'essai seulement**, puis supprimer
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` : déjà utilisées par les autres fonctions.

## D. Notifications en temps réel (Pub/Sub)
1. Google Cloud › Pub/Sub › Sujets › Créer `play-rtdn`. Donner le rôle **Éditeur Pub/Sub** à `google-play-developer-notifications@system.gserviceaccount.com` sur ce sujet.
2. Play Console › TITAN › Monétiser avec Play › **Configuration de la monétisation** › Notifications en temps réel › Nom du sujet : `projects/<ton-projet>/topics/play-rtdn` › Types : abonnements **et** achats annulés.
3. Pub/Sub › Abonnements › Créer, type **Push**, point de terminaison `https://titan-app.fr/.netlify/functions/play-notifications`, **Activer l'authentification** avec un compte de service Pub/Sub dédié (`titan-rtdn-push`) et pour audience la même adresse.
4. Netlify : `PLAY_RTDN_AUDIENCE` = `https://titan-app.fr/.netlify/functions/play-notifications` et `PLAY_RTDN_SERVICE_ACCOUNT` = l'e-mail de `titan-rtdn-push`. (Sans OIDC, repli : `PLAY_RTDN_TOKEN` = une longue chaîne aléatoire ajoutée `?token=` à l'adresse.)
5. Play Console › Envoyer une notification de test : doit répondre 200.

## E. Base de données (après ton accord, jamais sans)
Appliquer sur une COPIE d'abord, puis en production seulement avec ton « oui » : migrations V1.1 dont `20261102090000_coach_seats` et `20261102110000_play_reconcile`. Puis rattacher les produits aux offres (une fois). La fonction exige un compte **administrateur** : dans l'éditeur SQL de Supabase, remplace `<ID-ADMIN>` par l'identifiant (uuid) de ton compte TITAN administrateur et exécute le tout d'un bloc :
```sql
select set_config('request.jwt.claims', json_build_object('sub', '<ID-ADMIN>', 'role', 'authenticated')::text, true);
select public.titan_plan_product_set_v1('titan_plus', 'titan_plus');
select public.titan_plan_product_set_v1('coach', 'coach');
select public.titan_plan_product_set_v1('coach_pro', 'coach_pro');
select * from public.titan_plan_product_list_v1();
```
(Signature lue dans `supabase/migrations/20261102090000_coach_seats.sql` : `(p_product text, p_plan text)`. À faire d'abord sur la copie.)

## F. Essai réel avec un testeur de licence
1. Play Console › Paramètres › **Test de licence** › ajouter ton compte Google de test.
2. Test interne › Testeurs › liste incluant ce compte ; ouvrir le lien d'opt-in sur le téléphone, installer.
3. Build d'essai avec `EXPO_PUBLIC_TITAN_BILLING=1` (me le demander : je prépare le workflow) et `PLAY_BILLING_ENABLED=true` côté Netlify (préproduction).
4. Dérouler : voir les prix, acheter, refuser, paiement en attente, restaurer, résilier dans Play, rembourser depuis la console, vérifier l'accès côté web ET Android.

## G. GPS : sortie réelle (aucun émulateur ne remplace cela)
Téléphone Android 14 ou plus récent : démarrer une course ou un trajet à vélo, verrouiller l'écran 10 minutes, mettre en pause 2 minutes, reprendre, terminer, exporter le GPX, enregistrer la séance. Vérifier : distance cohérente avec une application de référence, notification visible pendant l'enregistrement, aucune demande de « position en arrière-plan ».

## H. Secret OAuth Web de Google : à faire pivoter (sans couper la connexion Google)
Le cahier (Google Doc, privé : seul ton compte y a accès) contenait le secret du client Web en clair ; je l'ai retiré de la version courante le 02/11/2026, mais l'**historique des versions du Doc le garde** et il est passé par des outils de travail. Par prudence, remplace-le :
1. Google Cloud › Google Auth Platform › Clients › client **Web** › section « Secrets du client » › **Ajouter un secret** (l'ancien reste valable : la connexion ne coupe pas).
2. Supabase › Authentication › Providers › Google › colle le **nouveau** secret › Enregistrer. Tester une connexion Google.
3. Retour dans Google Cloud : **Désactiver** l'ancien secret (puis le supprimer après quelques jours sans incident).
4. Ne recolle le nouveau secret nulle part ailleurs (ni cahier, ni GitHub, ni discussion).
Facultatif : Google Docs › Fichier › Historique des versions › supprimer les anciennes versions qui contiennent l'ancien secret (inutile une fois l'ancien secret désactivé).

## I. AdMob (publicités Android) — ce qui reste à faire de ton côté
Identifiant d'application `ca-app-pub-8126986266950187~1902494129` et les quatre blocs sont déjà dans le code. **Rien n'est allumé** : les builds de production n'affichent aucune publicité tant que tu ne lances pas un build avec `ads`.
1. **Essai sans risque** : Actions › Android natif › Run workflow › `ads = test` (annonces de TEST de Google, sans revenu) › installer l'APK, parcourir QG, Journal, Statistiques, finir 4 séances.
2. **Consentement (Europe)** : AdMob › Confidentialité et messagerie › **Messages européens sur la réglementation** › créer et publier le message de consentement (il se rattache à l'application une fois publiée dans Play ou ajoutée par son identifiant). Sans message publié, aucune annonce n'est servie dans l'EEE. Active aussi le message « Choix de confidentialité » (bouton de modification).
3. **Liaison Play** : AdMob › Applications › TITAN › Paramètres › lier à la fiche Google Play `fr.titanapp.app` (requis pour la validation et `app-ads.txt`).
4. **app-ads.txt** : le fichier est dans le dépôt (`app-ads.txt` : `google.com, pub-8126986266950187, DIRECT, f08c47fec0942fa0`) et sera servi à `https://titan-app.fr/app-ads.txt` **au prochain déploiement du site (que tu décides)**. Play Console › Présence sur le Store › Coordonnées › **Site web** : doit être `https://titan-app.fr` (même domaine). Ensuite AdMob › Applications › TITAN › Vérifier `app-ads.txt` (jusqu'à 24 h).
5. **Play Console › Contenu de l'application** : Annonces = **Oui, l'application contient des annonces** ; Sécurité des données : cocher « Identifiants d'appareil ou autres » partagés pour la publicité (Google AdMob) ; Public cible **13 ans et plus**, pas « enfants » ; ID de publicité : réponse cohérente avec le manifeste (TITAN **retire** `AD_ID` : les annonces sont alors contextuelles, moins rémunératrices ; si tu préfères le revenu maximum, dis-le-moi : une ligne à changer + la déclaration « Utilise l'ID de publicité »).
6. **Réel** : seulement après 1 à 5 et ton feu vert : Run workflow › `ads = live` et `signing = upload`. Les mêmes plafonds s'appliquent.
Rappel : n'utilise jamais ton appareil personnel pour cliquer sur de vraies annonces (invalide le compte AdMob). Les builds `test` et le développement utilisent uniquement les annonces de test.

## J. Fond de carte des parcours (facultatif, ta décision)
Sans fournisseur, les parcours s'affichent sur un fond neutre, sans aucune requête de carte : c'est le plus privé. Pour un vrai fond de carte :
1. Choisis un fournisseur de tuiles dont les conditions autorisent une application mobile (MapTiler, Stadia Maps, Mapbox, Thunderforest…). Le serveur de tuiles public d'OpenStreetMap n'est PAS fait pour cet usage : ne l'utilise pas.
2. Crée une clé et **restreins-la au paquet `fr.titanapp.app`** (et à l'empreinte de signature) chez le fournisseur : une clé de tuiles est visible dans toute application, la restriction est sa protection.
3. GitHub › Settings › Secrets and variables › Actions › **Variables** : `TITAN_TILES_URL` = l'adresse du fournisseur avec `{z}/{x}/{y}` et la clé, `TITAN_TILES_ATTRIBUTION` = le texte d'attribution exigé (ex. « © MapTiler © OpenStreetMap »).
4. Relance un build : l'interrupteur « Afficher le fond de carte » apparaît dans le détail d'un parcours (désactivé par défaut). Mets à jour la politique de confidentialité : le fournisseur voit la zone consultée.

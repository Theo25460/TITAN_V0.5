# TITAN V1.2 — finalisation (4 novembre 2026)

Ce document est la trace vérifiable de la phase finale. Il distingue ce qui est **prouvé** (par un test, une requête en lecture seule ou une CI) de ce qui **reste à prouver sur un téléphone ou chez un tiers**. Rien n'est écrit comme validé sans preuve.

## 1. Supabase : état de production réconcilié, rien rejoué

Lecture seule le 4 novembre 2026 (projet `oubmftfufwwzwpgvrcag`) :

| Contrôle | Résultat |
|---|---|
| Cinq implémentations de conflit (`titan_save_profile_state`, `titan_update_training_session`, `titan_transition_social_challenge`, `titan_adventure_action`, `titan_mutate_analysis_view`) | `PT409` dans le corps ; aucune clause `40001` (les enveloppes publiques `titan_adventure_action` et `titan_update_training_session` ne contiennent pas le `RAISE`, c'est normal) |
| Connexions | 9 sessions, aucune requête bloquée ; trois connexions PostgREST neuves (14:49 UTC), les anciennes ont disparu |
| Journaux Postgres | `PROFILE_VERSION_CONFLICT` : ~60 par minute jusqu'à 14:47 UTC, **0 après 14:51 UTC** ; une seule occurrence de `40001` dans la fenêtre |
| Historique de migrations de production | se termine à `20261102150000_session_hold_edits` : la correction PT409 y est **absente** (appliquée à la main) |
| RLS | les 80 tables du schéma `public` ont la RLS activée (80 sur 80) |
| Advisories sécurité | 5 avertissements (RPC `SECURITY DEFINER` appelables par design, un `search_path` mutable, protection des mots de passe compromis désactivée dans le tableau de bord Auth) ; aucun nouveau |

Décision : la migration `20261104085851_business_conflicts_no_transaction_retry.sql` (PR #133) est **conservée dans le dépôt, non rejouée**. Elle est idempotente : sur une base déjà corrigée, `patched = definition` et le corps contient déjà `errcode = 'PT409'`, donc elle ne change rien ; elle échoue (volontairement) si une clause inattendue apparaît. Si l'historique de production doit la porter, l'inscription se fait avec `supabase migration repair --status applied 20261104085851`, jamais en rejouant le SQL.

Intégration : la branche contient `#128 → première passe → #131 → #132` et la fusion de `#133` (corrections client : conservation des préférences si la synchronisation échoue, reprise explicite des conflits, anti-boucle), plus `main` (documents Play du 4 novembre). `#129` (branche `fix/v1-profile-conflict-storm-20261102`) n'est pas un ancêtre : ses écritures client réduites sont couvertes par les correctifs de #133 ; la PR #133 elle-même le dit.

## 2. Garmin : audit de bout en bout

**Preuves** (lecture seule) :
- Netlify (production) : `GARMIN_ENABLED=true` depuis le 3 novembre 12:47 UTC, et les onze variables nécessaires sont posées (identifiant client, secret, URL d'autorisation `connect.garmin.com/oauth2Confirm`, URL de jeton `connectapi.garmin.com/di-oauth2-service/oauth/token`, identifiant utilisateur, permissions, désinscription, adresse de retour `https://titan-app.fr/auth/garmin/callback`, jeton push, clés d'état et de chiffrement). L'URL de jeton est celle de la spécification officielle Garmin (OAuth2 PKCE).
- Drapeau serveur `screens.garmin` : activé à 100 % depuis le 3 novembre 13:58 UTC.
- Base : `private.titan_garmin_links` 0 ligne, `private.titan_garmin_tokens` 0 ligne, 1 consentement `garmin` actif. Trois appels `titan_set_source_consent_v1` le 3 novembre (14:33 et 14:52 sur Safari, 14:47 sur l'application Android) : le consentement a été donné trois fois, **la liaison n'a jamais abouti**.
- Journaux Netlify (24 h conservées, depuis le 3 novembre 15:07 UTC) : **aucune requête** vers `/auth/garmin/callback` ni vers la fonction `garmin`. Les tentatives de 14:33–14:52 sont antérieures à la fenêtre : on ne peut pas dire si `start` avait répondu.
- Code serveur relu : `start` (PKCE S256, `state` chiffré AES-GCM, 10 min), `callback` (échange du code, lecture de l'identifiant Garmin, contrôle des permissions `ACTIVITY`, `titan_garmin_link_v1`, jetons chiffrés liés au compte), `push` (jeton comparé en temps constant, 100 éléments max, accusé seulement si la base a pris), `disconnect` (retrait chez Garmin au mieux, puis liaison et jetons effacés). Fonctions SQL : exécution réservée à `service_role` sauf `titan_garmin_status_v1` et `titan_garmin_unlink_v1` (compte connecté). Import : `titan_garmin_ingest_v1` → `titan_import_core` : verrou par activité, doublon exact (`g-<summaryId>`) refusé, séance déjà dans le journal (même sport, chevauchement ≥ 50 %, toutes sources) **rattachée sans XP**, sinon créée par la **même fonction qu'une séance manuelle** (un seul gain d'XP et de crédits).

**Ce qui est corrigé** : l'écran Android distingue maintenant *autorisé* / *connecté* / *dernière activité reçue* / *activité intégrée* (un consentement sans liaison s'affiche « À terminer », jamais « Connecté ») ; 5 tests.

**Ce qui n'est PAS validé et ne peut pas l'être depuis ici** (le bac à sable n'atteint ni `titan-app.fr` ni Garmin) :
1. une vraie liaison (callback reçu, une ligne dans `titan_garmin_links`) ;
2. une vraie activité reçue par le push et intégrée une seule fois ;
3. la configuration du **portail développeur Garmin** : adresse de retour exacte enregistrée, et **point de terminaison de push des résumés d'activité** (`https://titan-app.fr/.netlify/functions/garmin?action=push&token=<GARMIN_PUSH_TOKEN>`) activé pour le type « Activités ». Sans cela, aucune activité n'arrive même après une liaison réussie. Vérifier aussi que la clé n'est pas une clé d'évaluation limitée.
Garmin reste donc **non validé**. Protocole : se connecter depuis l'application, terminer sur Garmin, puis `select * from private.titan_garmin_links` doit montrer une ligne ; faire une activité synchronisée sur Garmin Connect ; elle doit apparaître une fois dans `private.titan_imported_activities` (statut `imported`).

## 3. Billing

Identifiants Play déclarés par le propriétaire (`docs/PLAY_CONSOLE_SUBSCRIPTIONS_2026-11-04.md`, sur `main`) : TITAN+ `titan01` 4,99 €, Coach `titan02` 19,99 € (tag `titan-coach`), Coach Ultra `titan03` 39,99 € (tag `coach-ultra`), 18 ans et plus.

Fait : le client utilise `titan01` / `titan02` / `titan03` (aucun prix dans l'application : Google Play les fournit) ; « Coach Pro » est remplacé par **Coach Ultra** partout où il s'affiche (application, pages publiques, CGU, interface Coach web) ; la clé interne du serveur reste `coach_pro` (contrainte SQL et RPC inchangées, aucune migration) ; en production, `private.titan_plan_products` contient `titan02 → coach` et `titan03 → coach_pro` (données de configuration, inertes tant que la facturation est éteinte) ; les pages publiques affichent 19,99 € et 39,99 € (le prix de TITAN+ reste « affiché par Google Play » sur le site, règle du test `launch-decision`).

**Facturation laissée éteinte**, car rien n'a été validé avec un vrai achat :
- aucune variable `PLAY_*` n'existe dans Netlify (donc `PLAY_BILLING_ENABLED` est faux) ; `PLAY_PRODUCT_IDS=titan01,titan02,titan03` n'a pas pu être posée (l'API Netlify a refusé l'écriture : 403) ;
- les passages horaires de `play-reconcile` répondent 503 « désactivé » (29 « erreurs » Netlify en 24 h, attendues) ;
- le client a `EXPO_PUBLIC_TITAN_BILLING` éteint dans l'AAB de test fermé.
Les tests simulés (Google simulé) couvrent achat, renouvellement, annulation, remboursement, restauration, changement de compte, expiration, places Coach et consentements : ils prouvent la logique, **pas** Google Play. Le test réel exige les actions manuelles listées dans `docs/PLAY_BILLING_GPS_OWNER_STEPS.md` (compte de service, Pub/Sub RTDN, testeur de licence).

## 4. Ma carrière sportive

Module partagé `js/core/career.js` (Web et Android, synchronisé dans `mobile/src/core/web/`), écran Android `CareerScreen` (accès depuis Progrès, premier raccourci) et page Web `/carriere` (sous-navigation de Progrès). Filtres 7 jours / 30 jours / année / depuis le début. 16 tests de règles + 4 tests d'écran.
Règles tenues par test : aucune calorie ; distance seulement si la séance l'a mesurée (à pied / à vélo / à la nage séparés) ; une vitesse impossible ne donne aucune distance ; allure calculée sur la course seulement ; dénivelé par discipline ; pas toujours à part (un nombre par jour, jamais additionnés entre capteurs, kilomètres estimés étiquetés « estimés » et jamais ajoutés) ; séances suspectes/rejetées/en vérification exclues ; jalons (« premier 10 km », « première sortie de 100 km », caps de séances, heures, dénivelé) prouvés par de vraies séances, jamais par une somme de petites ; aucune requête de séances en plus (le journal est déjà chargé), une seule lecture d'historique de pas à l'ouverture de la page.
Limite connue : le Web ne lit que les pas du serveur (Santé Connect) alors qu'Android y ajoute son compteur local : les deux écrans l'indiquent.

## 5. Juridique

`legal_privacy.html` (version 10) décrit désormais le compteur de pas (reste sur le téléphone), Santé Connect (un nombre par jour), Garmin (jetons chiffrés, résumés d'activité, retrait), la position GPS (au premier plan, notification visible) et la bibliothèque de parcours **privée** (le tracé enregistré *est* conservé : la phrase « le tracé GPS n'est pas conservé » ne vaut plus que pour un GPX importé). À faire relire par un juriste et à rapprocher des déclarations de la Play Console (sécurité des données, permission « activité physique », services de premier plan).
Constat : le générateur `tools/build-public-docs.mjs` est en retard sur les pages publiées (version 7 contre 9, section GA4 absente, CGU 4.2 bis absente) ; il ne doit pas être relancé en l'état.

## 6. Secrets mal classés (à traiter par le propriétaire)

En listant les variables Netlify, trois valeurs sensibles sont enregistrées **comme non secrètes**, donc lisibles en clair par toute personne ayant accès au projet Netlify ou à ses journaux de build : la clé `SUPABASE_SERVICE_ROLE_KEY` (rôle `service_role`, contexte production), l'URL de base Neon `NETLIFY_DATABASE_URL` / `NETLIFY_DATABASE_URL_UNPOOLED` (mot de passe inclus) et `LEMONSQUEEZY_WEBHOOK_SECRET`. À faire : les marquer « secret », puis **les renouveler** (elles ont transité par cette session). La fonction Garmin lit `SUPABASE_SECRET_KEY` (bien marquée secrète) ; `SUPABASE_SERVICE_ROLE_KEY` n'est pas utilisée par les fonctions Garmin/Play du dépôt : vérifier si elle sert encore.

## 7. Publication du 4 novembre 2026 (soir) — état réel

**Incident de production (matin → après-midi).** Netlify, lié à `main` en Git, a publié un `main` qui avait 583 commits de retard sur V1.1 : 1 seule fonction (`webhook`) et plus de bouton Google. Correction en avant (PR #134, `62e476d`) : base V1.1 + `main` + #133, offres Coach / Coach Ultra, et **garde de publication** `tools/check-release-guard.mjs` exécutée avant chaque build Netlify (bouton Google, drapeau `auth.google`, OAuth, connexion e-mail, SDK, 6 fonctions : sinon la build échoue et l'ancien déploiement reste en ligne). Sonde de production bloquante toutes les six heures (#135).

**Audit du site publié** (`tools/audit-live.mjs`, `.github/workflows/audit-live.yml`, lecture seule, exécuté depuis GitHub dans un navigateur réel à 360 / 768 / 1280 px) : après la publication V1.2, **110 contrôles réussis, 0 échec**. Couvre 36 pages, le sitemap (25 adresses toutes en 200), robots, `sw.js`, `manifest.json`, `ads.txt`, redirections, 404 réel, surface de connexion (bouton Google rendu, formulaire e-mail, client Supabase initialisé), redirection OAuth vers Google (Web et Android), les 6 fonctions.

**Publication V1.2.** PR #132 fusionnée dans `main` (`e5e5790`). Déploiement Netlify `6aeb933f57f7d72c0e941009`, `ready`, 6 fonctions, 133 redirections, 71 règles d'en-têtes. Contenu Web : « Ma carrière sportive » (`/carriere`), confidentialité v10, Coach / Coach Ultra 19,99 € / 39,99 €, pluriel « jours actifs ».

**Corrections de la revue.**
- `/login` : l'ordre de chargement d'origine est rétabli (formulaire d'abord, SDK ensuite : LCP mobile mesuré 2,7 s → 1,7 s, PR #117) ; une première version de cette séance l'avait inversé sans bug à l'appui, c'était une régression de performance. Garde, audit et sonde sont alignés sur cet ordre.
- Après un mot de passe refusé, le formulaire suggère « Continuer avec Google » (un compte Google n'a pas de mot de passe).
- `play-reconcile` : désactivé volontairement = 200 `{disabled:true}` (plus de 503 horaire attendu) ; activé mais mal configuré = 503 (vraie alerte).
- Test mobile des écrans : délai porté à 60 s (43 s observés sur un runner chargé : échec de délai sans rapport avec le code, rejeu vert sur le même commit).

**AAB signé.** Workflow `android-native.yml` sur `main` : signature « upload », versionCode 1300, versionName 1.2.0, publicités éteintes, achats éteints, connexion Google activée. Aucun compte de service Play n'est dans les secrets GitHub : **le dépôt dans la piste de test fermé est manuel**.

**Ce qui n'est pas prouvé.** Clic réel « Continuer avec Google » (le retour Web exige que `https://titan-app.fr/login` soit dans les URL de redirection Supabase : non lisible depuis ici), connexion e-mail, création de compte, séance enregistrée, Garmin (aucune liaison réelle), achats Google Play (aucun produit rattaché côté application tant que la facturation est éteinte).

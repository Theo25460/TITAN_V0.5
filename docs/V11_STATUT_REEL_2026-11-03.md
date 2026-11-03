# TITAN V1.1 — statut réel (3 novembre 2026, soir)

Ce document fait foi. Il remplace tout statut contraire dans les autres documents (migrations « non appliquées », drapeaux « non créés », « GARMIN_ENABLED faux »).

## Supabase (production `oubmftfufwwzwpgvrcag`)
- **Migrations V1.1 : 33 sur 33 présentes**, appliquées par le propriétaire. Vérification par l'assistant, en lecture seule : 146 fonctions du dépôt comparées par empreinte au corps réel (144 identiques à l'octet, 2 identiques aux commentaires et espaces près : `titan_guard_training_log`, `titan_periodic_quests`), 33 tables privées avec RLS et sans droit d'API, 30 index, 2 déclencheurs, 1 contrainte, données des migrations 1 et 2 (8 plafonds de vitesse, 277 sports avec mesures spécifiques).
- **Registre** `supabase_migrations.schema_migrations` : les 33 versions ont été inscrites (même forme que les 75 précédentes : version + nom) après cette vérification, sans rejouer aucun script. Total 108. Les deux contrôles de registre du postflight passent : 328 sur 328.
- **Drapeaux (mise à jour du 3 novembre 2026, 13:58 UTC)** : les **21 drapeaux Supabase sont activés pour 100 % des utilisateurs**. `auth.google` et `screens.garmin` ont été déverrouillés explicitement à la demande du propriétaire (`enabled=true`, `rollout=100`), et `screens.clubs`, `screens.factions`, `screens.pantheon` sont également passés à 100 %. Le RPC `public.titan_feature_flags_v1()` renvoie `true` pour Google, Garmin et les autres écrans, y compris pour les visiteurs non authentifiés ; total contrôlé : 21/21, zéro restriction. Le bouton Google et l'écran Garmin ne seront visibles qu'une fois le **code Web V1.1** publié sur Netlify. Les parcours OAuth réels ne pourront être attestés qu'après un test réel avec un compte, indépendamment de l'activation des drapeaux. `ads.web` n'est pas créé.
- Conflits `PROFILE_VERSION_CONFLICT` : environ 3 560 par heure, constants (1 par seconde, jour et nuit), jusqu'à 13 h UTC le 3 novembre. Ce débit régulier vient de clients restés ouverts qui rejouent une version périmée ; il ne baissera qu'une fois le correctif publié et les scripts renouvelés.

## Netlify (`titano-app`)
- Production servie : déploiement `6ad9c1f1a3cb26a466c44bc5` (V1). Verrouillé : Netlify ne publie pas seul un nouveau déploiement.
- Déploiement V1.1 prêt : `6ae9d867825addaae90ff75d` (commit `9520e3d`, build avec `GARMIN_ENABLED=true`). Pour le publier : Deploys › ce déploiement › Publish deploy.
- Variables Garmin présentes (identifiant client, secrets masqués, adresses OAuth, redirection `https://titan-app.fr/auth/garmin/callback`, jeton de push, clés d'état et de jetons). `GARMIN_ENABLED=true`. Aucune variable `PLAY_*` : les achats restent éteints (voulu).

## Garmin
- Code complet et testé (13 tests serveur) ; **non validé en conditions réelles** : aucun compte Garmin n'a autorisé TITAN. L'import des pas Garmin n'existe pas (décision GAR-13 : seules les activités sont collectées ; les pas viennent de Health Connect sur Android).

## Android
- AAB signé (clé d'envoi), versionCode 1200, versionName 1.1.0, `ads=live`, `billing=true`, `google_signin=true` : artefact GitHub `titan-android-1200-upload` (run 41606702981). Non envoyé à Google Play : aucun secret de compte de service Play dans GitHub ; envoi à faire dans la Play Console.

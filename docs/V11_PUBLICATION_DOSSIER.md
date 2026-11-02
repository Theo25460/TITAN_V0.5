# Dossier de publication TITAN V1.1 (préparé, rien publié)

Ce document ne déclenche rien. Chaque étape ci-dessous exige l'accord explicite du propriétaire.

## 1. Base de données (Supabase)
1. Copie isolée de la production (branche Supabase ou projet de test) ; jamais la production en premier.
2. Appliquer les migrations 30 à 60 dans l'ordre (`docs/V11_RELEASE_PLAN.md`, une ligne par migration, vérifiée par `tests/production-plan.test.mjs`).
3. Banc : `bash tools/db/test-migrations.sh`, puis `tools/db/postflight-v11.sql` et `tools/db/test-v11-gates.py` (attend 33 migrations dans le registre).
4. Sauvegarde avant production, puis application, puis postflight. Retour arrière : les migrations sont additives ; les fonctionnalités se coupent par drapeaux (`titan_feature_flags_v1`), sans supprimer de données.

## 2. Web (Netlify) — après accord
Fusion de la PR #105 → déploiement Netlify (inclut `app-ads.txt`). Drapeaux à activer un par un : `screens.routes`, `screens.coachtools`, `auth.google` (voir `docs/V11_ACTIVATION_MATRIX.md`). `GARMIN_ENABLED` reste faux ; Paddle reste désactivé ; aucune publicité Web.

## 3. Android — build signé
Workflow « Android natif » en lancement manuel : `signing=upload`, `version_code` supérieur au dernier publié, `billing` activé, `ads=test` pour la recette puis `ads=live` seulement après accord, `google_signin` selon la recette. Récupérer l'AAB signé dans les artefacts. Aucun secret dans le dépôt : la clé d'envoi est dans les secrets GitHub.

## 4. Play Console (à faire par le propriétaire)
- Services au premier plan : type « location » (enregistrement GPS d'une séance, notification visible).
- Autorisations : localisation précise **au premier plan uniquement** (pas d'arrière-plan), Health Connect (pas, lecture seule), notifications.
- Sécurité des données : localisation (parcours, privé, supprimable), activité physique (pas, séances), identifiants d'appareil/publicité (AdMob), achats.
- Annonces : l'application contient des annonces ; public cible 13 ans et plus ; `app-ads.txt` déployé.
- Produits d'abonnement `titan_plus`, `coach`, `coach_pro` (identifiants à confirmer dans la console) ; testeurs de licence ; compte de service API lié ; notifications temps réel (RTDN) vers l'URL de la fonction.
- Politique de confidentialité : texte de l'application (écran Confidentialité) + page Web à jour (mentions AdMob et GPS).
- Notes de version : voir `docs/play-store`.

## 5. Variables et paramètres (valeurs hors dépôt)
PLAY_BILLING_ENABLED, PLAY_SERVICE_ACCOUNT_JSON, PLAY_PRODUCT_IDS, PLAY_RTDN_AUDIENCE / SERVICE_ACCOUNT / TOKEN, TITAN_TILES_URL / TITAN_TILES_ATTRIBUTION (fond de carte, optionnel), identifiant client Google. Étapes détaillées : `docs/PLAY_BILLING_GPS_OWNER_STEPS.md`.

## 6. Recette physique (téléphone Android du propriétaire)
1. GPS : installer l'APK de test, lancer un parcours de marche de 10 min écran verrouillé ; vérifier notification visible, tracé continu, distance plausible, pas de D+ inventé ; terminer, vérifier le lien automatique avec la séance, le GPX exporté, la suppression.
2. Course puis vélo/gravel : même contrôle, plus consommation de batterie sur 1 h.
3. Hors ligne : enregistrer en mode avion, rouvrir en ligne : parcours envoyé une seule fois.
4. Health Connect : accorder les pas, vérifier la carte « Pas du jour », l'âge affiché, aucun XP pour les pas, révocation.
5. Visite guidée : parcours complet, ignorer, relancer.
6. Annonces (build `ads=test`) : bannières QG/Journal/Stats seulement, aucune pendant séance ; interstitiel selon plafonds ; aucune en compte Premium.
7. Achat (testeur de licence) : acheter, restaurer, annuler ; droits côté serveur ; retrait des annonces.
8. Connexion Google (si activée) et compte supprimé.

## 7. Cohérence Web / Android
Mêmes parcours (table privée unique), mêmes pas, mêmes droits (registre d'entitlements), mêmes drapeaux. Vérifié par les bancs SQL et les tests e2e Web ; la cohérence sur appareil réel reste à confirmer par la recette ci-dessus.

## 8. Ce qui dépend de Google Play / d'un appareil réel
Achats réels, annonces réelles et consentement, Health Connect sur téléphone, GPS en conditions réelles, validation de la déclaration du service au premier plan.

# TITAN V1.1 — dossier de lancement et audits finaux (3 novembre 2026)

Tête de référence : `codex/v11-finalization-20261102` à `fc58569` (PR #128). Hotfix V1 : PR #129, tête `939ee0d`, base `claude/titan-finition-web` (V1 publiée `8102c17`). Rien de ce document n'a été exécuté en production. Chaque étape marquée **FEU VERT** exige l'accord explicite du propriétaire.

## 1. État réel mesuré

| Sujet | Mesure |
|---|---|
| Incident Supabase | `PROFILE_VERSION_CONFLICT` : **85 436 occurrences sur 24 h**, soit environ 3 550 par heure, **constant jour et nuit** (lecture seule des journaux, 3 novembre). Un débit nocturne identique signale des clients restés ouverts ou en cache qui rejouent une version périmée : le correctif doit donc aussi forcer leurs scripts à se renouveler (voir §3). |
| Migrations en production | La base s'arrête à `20261021020000` (75 migrations). **33 migrations V1.1 (du 28 octobre au 2 novembre) ne sont pas appliquées.** |
| CI du hotfix V1 (#129, `939ee0d`) | Qualité vert. |
| CI de la V1.1 (#128, `fc58569`) | Qualité, TWA et Android natif **tous verts** (types, 516 tests, APK + AAB release, parcours émulateur 01 à 04 et GPS, vérification serveur). |
| Local, même tête | `pnpm run verify` vert ; banc SQL complet (migrations 30 à 62 sur réplique propre) vert. |

## 2. Ordre de lancement

### Étape 1 — Sauvegarde et restauration (FEU VERT pour toute action sur le projet de production)
1. Supabase › projet `oubmftfufwwzwpgvrcag` › Database › Backups : vérifier qu'une sauvegarde de moins de 24 h existe ; sinon en demander une (Point-in-Time si le plan le permet). Noter l'identifiant.
2. Restaurer cette sauvegarde dans un projet **temporaire** ou une branche de test (peut entraîner un coût : à valider par le propriétaire) et y rejouer l'étape 4. Tant que cela n'est pas fait, « migrations testées sur une copie de production » reste **non prouvé** : le banc actuel part d'une structure de production reconstruite (`tools/db/baseline`), pas d'une copie des données.
3. Netlify : noter l'identifiant du déploiement de production actuel (`6ad9c1f1a3cb26a466c44bc5` d'après Work) : c'est le retour arrière du Web.

### Étape 2 — Hotfix V1 seul (FEU VERT)
1. Construire depuis la branche de la PR #129 (checkout V1 complet avec `netlify.toml` et les fonctions ; le dossier `dist` seul n'est pas une livraison complète). `node tools/build-public.mjs`.
2. Déployer ce build sur Netlify en production (déploiement CLI contrôlé, comme aujourd'hui). **Jamais** le bundle V1.1 pour cette étape.
3. Aucune migration SQL n'est nécessaire pour le hotfix.
4. Retour arrière : republier le déploiement Netlify précédent (la boucle reviendrait). Ne jamais vider les données locales des utilisateurs.

### Étape 3 — Vérifier la fin de l'incident
Mesures avant (référence ci-dessus) puis après, en lecture seule :
- Journaux : nombre de `PROFILE_VERSION_CONFLICT` par heure (requête de l'annexe A). Attendu : baisse nette dans les heures qui suivent la mise en ligne, puis décroissance au fil du renouvellement des clients (le `Service Worker` change d'espace de noms et les scripts changent d'adresse). **Ne pas annoncer « résolu » avant d'avoir mesuré** ; si un débit résiduel persiste de nuit, ce sont des clients qui n'ont pas rechargé : les compter, ne pas le masquer.
- Supabase › Reports : CPU et Disk I/O sur 24 h avant/après. Aucun gain n'est revendiqué avant cette mesure.
- Critère de retour arrière : augmentation d'erreurs 5xx ou plaintes de profils non enregistrés.

### Étape 4 — Migrations V1.1 (FEU VERT, après l'étape 1.2)
1. Appliquer dans l'ordre les 33 fichiers de `supabase/migrations/` postérieurs à `20261021020000` (jamais les 75 premiers). Chaque migration est additive ; l'appelant gère la transaction.
2. Exécuter `tools/db/postflight-v11.sql` puis `python3 tools/db/test-v11-gates.py` (le contrôle attend exactement 33 migrations V1.1 dans le registre : vérifié dans le script).
3. Retour arrière : fonctions et tables nouvelles se coupent par les drapeaux `titan_feature_flags_v1` ; aucun retour SQL destructif n'est prévu. Ne pas rétablir d'ancienne fonction sociale (deux défauts de confidentialité ont été corrigés par `20261102130000`).

### Étape 4 bis — Drapeaux à créer et activer (rien ne s'allume tout seul)
Après les migrations, ces fonctions V1.1 restent **invisibles** tant que leur drapeau n'existe pas ou est éteint (Centre de contrôle › Drapeaux, `titan_admin_feature_flag_set_v1`). Liste complète à relire avec `docs/V11_ACTIVATION_MATRIX.md` :
`screens.coachtools`, `screens.coachworkspace`, `screens.coachcalendar`, `screens.coachexport`, `screens.coachanalysis`, `screens.consultations`, `screens.intents`, `screens.commonquest`, `screens.buddy`, `screens.seasons`, `screens.ranking`, `screens.duels`, `screens.worldgoal`, `screens.clubs`, `screens.factions`, `screens.pantheon`, `screens.garmin` (avec `GARMIN_ENABLED` côté serveur), `screens.routes`, `screens.gpxterrain`, `screens.activityhub`, `auth.google`. **Jamais** `ads.web`.
Activer par paliers (pourcentage de déploiement du drapeau), en commençant par un compte de test. Les trois derniers (clubs publics, factions, panthéon) demandent qu'une personne soit désignée pour traiter les signalements.

### Étape 5 — Candidate finale
Build Android signé : GitHub › Actions › Android natif › Run workflow › branche `codex/v11-finalization-20261102`, `signing=upload`, `billing` coché, `ads=live` (après l'étape 6) ou `partial_release` pour un premier envoi en test interne ; `google_signin` coché si Google est configuré. Détails : `docs/PLAY_BILLING_GPS_OWNER_STEPS.md`.

### Étape 6 — Configurations à vérifier (propriétaire)
- AdMob : message de consentement européen publié ; application liée à la fiche Play ; `app-ads.txt` servi (404 en production aujourd'hui, il sera servi au déploiement du site) ; Play Console : « utilise l'ID de publicité » = Oui.
- Billing : 3 produits (`titan_plus`, `coach` 20 €, `coach_pro` 40 €), **prix de TITAN+ à fixer**, compte de service, Pub/Sub, testeurs de licence ; variables Netlify listées dans `docs/PLAY_BILLING_GPS_OWNER_STEPS.md` (sections C et D), `PLAY_BILLING_ENABLED` à `true` seulement à l'ouverture.
- Google : fournisseur Google activé dans Supabase Auth, URL de retour `titan://auth-callback` et `https://titan-app.fr/**`, drapeau `auth.google`, build avec `EXPO_PUBLIC_TITAN_GOOGLE=1`.

### Étape 7 — Publication Web et Android (FEU VERT)
Netlify : publier le build de la branche V1.1 **après** les étapes 2 à 4. Les pages d'offre disent « pas encore en vente » : au moment d'ouvrir Google Play Billing, retirer cette mention (prix de TITAN+ compris) dans la même publication. Play Console : envoyer l'AAB signé, déclarations (service de premier plan localisation, ID de publicité, sécurité des données, public 13 ans et plus).

### Étape 8 — Contrôles après mise en production
Parcours inscription, première séance, journal, aventure, achat testeur, annonce de test puis réelle, connexion Google ; journaux d'erreurs ; CPU et I/O ; retour sur le compteur de conflits.

## 3. Audits finaux (résultats mesurés sur `fc58569`)

### Sécurité
- Dépendances Web : `pnpm audit --prod` → aucune vulnérabilité connue.
- Dépendances Android : `npm audit --omit=dev` → 24 signalements (1 faible, 20 modérés, 3 élevés, 0 critique), tous des dépendances transitives de l'outillage Expo (`@expo/cli`, `node-forge`, `zod`), non embarquées dans l'APK ; correctif = montée de version d'Expo, à planifier après la sortie.
- Secrets : le test de scan (fichiers suivis, `dist/`, historique) fait partie de `pnpm run verify` : vert.
- SQL : banc complet vert ; revue de Work (68 fonctions, 71 autorisations ; deux défauts de confidentialité corrigés) ; contrôle par script des fonctions des migrations 56 à 59 (`SECURITY DEFINER` avec `search_path` vide, RLS, aucun droit d'API).
- Paiements : vérification serveur Google, rattachement au compte, notifications authentifiées, dernier événement gagnant ; tests avec services simulés uniquement.
- **Non fait** : test d'intrusion sur la production, revue des variables d'environnement réelles de Netlify (inaccessibles), relecture indépendante des 33 migrations sur une copie de production.

### Anti-triche
- Un parcours GPS, les pas, les annonces et les achats ne créent ni XP, ni crédits, ni récompenses ; la séance garde le chemin serveur habituel (XP inchangé, moteur expérimental désactivé).
- Gardes serveur existantes et testées : récompenses en attente de vérification, risque de séance, exclusion, limites de débit, plafonds de création, classement équitable (régularité et progression, séances suspectes ignorées).
- **Limite assumée** : une position simulée sur le téléphone ne peut pas être détectée côté serveur ; elle ne rapporte rien en soi.

### SEO
- `sitemap.xml`, `robots.txt`, `ads.txt` et `app-ads.txt` sont dans le build ; les tests de métadonnées, canoniques et d'indexation sont dans `pnpm run verify` (verts). Les pages d'application sont en `noindex`.
- L'Observatoire SEO n'est pas accessible depuis cette session ; la lecture et les corrections de Work sont dans `docs/V11_SEO_FINAL_2026-11-02.md`. Inspection d'URL dans Search Console et mesure après publication : à faire par le propriétaire.

## Annexe A — requête de mesure de l'incident (lecture seule)
Journaux Supabase › `postgres_logs` : compter par heure les lignes dont le message contient `PROFILE_VERSION_CONFLICT`. Mesure de référence avant correctif : environ 3 550 par heure (85 436 sur 24 h).

# Audit de reprise TITAN — octobre 2026

Audit réalisé le 5 octobre 2026 sur `main` (`461c737`, Renaissance 200), avant toute nouvelle fonctionnalité. Il distingue ce qui a été **vérifié**, ce qui a été **déduit du code** et ce qui **n'a pas pu être testé**. Aucune donnée de production n'a été modifiée : les requêtes Supabase étaient en lecture seule (catalogue, policies, définitions de fonctions, agrégats anonymes).

## 1. Résumé

- **La base est saine** : `pnpm run verify` passe (44/44 tests, build, audit statique sans constat). Le parcours cœur en mode découverte fonctionne hors ligne : séance → IndexedDB → journal → rechargement. L'enregistrement serveur est idempotent (`training_receipts`).
- **Le produit n'a pas encore d'utilisateurs** : 5 comptes au total, 0 connexion sur 30 jours, 9 séances depuis l'origine, 0 objectif, 0 profil aventure. Renaissance 200 n'a jamais été utilisée par un vrai sportif en production. C'est le moment le moins coûteux pour corriger l'équilibrage et les parcours.
- **Quatre bugs de fiabilité concrets** (section 3) : séances de plus de 30 jours bloquées à vie sur l'appareil, catalogue hors ligne sans course à pied ni musculation, séances invitées rendues orphelines, boutique sans styles.
- **Une faille d'équité côté base** : les tables `guilds` et `guild_members` acceptent des écritures directes qui contournent la RPC payante (3000 crédits), la modération du nom et les compteurs de guilde.
- **L'équilibrage est inversé par rapport à l'intention** : l'XP est très lente (un régulier atteint le niveau 6 en un an, le rang « Titan » en environ 27 ans), alors que l'aventure s'épuise en 3 à 6 mois. Le barème donne aussi plus d'XP pour 100 m de natation (579) que pour 10 km de course (353).
- **La chaîne de livraison n'est pas fiable** : Netlify publie par CLI sans SHA, `main` n'est pas protégée, et les migrations du dépôt ne correspondent pas à l'historique réel de Supabase.

## 2. Méthode et périmètre

| Étape | Réalisé | Résultat |
|---|---|---|
| `pnpm install` puis `pnpm run verify` | Oui | 44 tests OK, 67 scripts analysés, build `dist/`, audit : 53 HTML, 19 CSS, 75 JS, 0 constat |
| Lecture du code critique | Oui | Sync (`js/main.js`, `js/training-store.js`, `js/state.js`), saisie, PWA, profil, social |
| Navigateur local (Chromium/Playwright) | Oui, sur `dist/` | 19 pages × 360/390/768/1440 px, backend volontairement injoignable |
| Parcours découverte (invité) | Oui | Séance, journal, rechargement, objectifs, aventure, retour en mode observateur |
| Supabase en lecture seule (MCP) | Oui | Advisors sécurité/performance, migrations, policies, grants, triggers, définitions de RPC, agrégats |
| Netlify en lecture seule (MCP) | Oui | Déploiement courant |
| Parcours connecté réel | **Non** | La politique réseau de l'environnement d'audit bloque `oubmftfufwwzwpgvrcag.supabase.co`, `titan-app.fr` et `cdn.jsdelivr.net` |
| Service Worker hors ligne | **Non** | `js/pwa.js:59` désinscrit volontairement le SW sur `localhost`/`127.0.0.1` |
| iPhone/Android réels, Paddle, Lighthouse/CWV | **Non** | Hors de portée d'un conteneur ; restent des priorités de QA |

Pour débloquer le parcours connecté depuis un environnement cloud, il faut autoriser ces trois domaines dans la politique réseau de l'environnement.

## 3. Bugs

| ID | Prio | Constat | Preuve | Impact |
|---|---|---|---|---|
| B1 | **P0** | Une séance datée de plus de 30 jours est acceptée et annoncée « Séance conservée », puis refusée **définitivement** par le serveur. | Le champ date n'a qu'un `max` (`js/training-page.js:64`) et le contrôle ne porte que sur le futur (`js/training-page.js:1942-1951`). La RPC rejette `p_date < now() - 30 days` en `22023`. Le client classe `22023` comme erreur permanente (`js/main.js:179`). `js/pending-ui.js:24` affiche `À corriger : TRAINING_DATE_OUT_OF_RANGE` sans action de correction possible. | La séance n'atteint jamais le cloud. Elle reste uniquement dans l'IndexedDB de l'appareil et disparaît si les données du site sont effacées. Même effet pour une séance restée plus de 30 jours dans la file hors ligne. |
| B2 | **P1** | Sans accès au catalogue Supabase et sans cache (première visite hors ligne, panne, données du site effacées), le catalogue de secours compte 180 sports **sans** Course à pied, Marche, Randonnée, Trail, Musculation, Yoga ni Tapis. | Vérifié dans Chromium : `running`, `walking`, `hiking`, `trail`, `muscu_*`, `yoga` absents. Le catalogue de secours vient de `js/titan_features.js` (sports olympiques et catalogue large). Les sports vedettes de `js/sport-discovery.js:71-103`, qui incluent `running`, ne sont pas fusionnés dans `SPORTS_CONFIG`. « course a pied » renvoie « Aucun sport trouvé ». | La promesse hors ligne échoue pour les sports prioritaires du produit. |
| B3 | **P1** | Revenir en « Mode observateur » depuis `/login` crée un nouvel identifiant invité. Les séances et objectifs du précédent invité deviennent invisibles. Rien n'importe les séances invitées lors de la création d'un compte. | `login.html:551-561` supprime `titan_os_v12_save`. `js/state.js:605/758` crée `guest_${Date.now()}`. Vérifié : la séance de l'ancien invité reste dans IndexedDB (`oldGuestIdbLogs: 1`) mais n'apparaît plus. | Perte apparente de données pour un utilisateur qui teste avant de s'inscrire, exactement la cible de l'onboarding. |
| B4 | P2 | Le haut de la boutique n'a aucun style : textes collés (« pour tous**XP** », « visuelle**Les** »), liens non mis en forme. | Les classes `shop-v89-hero/copy/kicker/actions/guarantee` (`boutique.html:385-400`) n'ont aucune règle CSS dans le dépôt. | Page de monétisation dégradée. |
| B5 | P3 | À 390 px, sur l'écran de fin de séance, la pastille boussole recouvre le titre « Le premier signal ». | Capture Playwright du parcours découverte. | Finition du moment clé de l'expérience. |
| B6 | P3 | Après la synchronisation d'un renvoi (reçu rejoué), `xp_after` et `level_after` du reçu d'origine écrasent l'état local et peuvent afficher une XP plus ancienne jusqu'au prochain snapshot. | `js/main.js:177` | Affichage temporairement incohérent, sans effet sur les données serveur. |

## 4. Sécurité

| ID | Prio | Constat | Preuve | Recommandation |
|---|---|---|---|---|
| S1 | **P0** | `guilds` et `guild_members` acceptent des écritures directes via PostgREST qui contournent les RPC : création d'une guilde sans payer 3000 crédits ni passer par `titan_clean_social_text`, réécriture de `xp`, `level`, `boss_hp`, `code`, `chat_history` par le propriétaire, et insertion de soi-même dans n'importe quelle guilde (sans code) avec le rôle `owner`. | Policies `guilds_owner_write` (`ALL`, `owner_id = auth.uid()`) et `guild_members_insert_self` (`user_id = auth.uid()` seulement). `authenticated` a `INSERT/UPDATE` sur toutes les colonnes. Aucun trigger de garde sur ces tables. `titan_create_guild` facture 3000 crédits. L'affichage échappe bien le HTML (`social.html:681-710`), donc pas de XSS. Constat issu du catalogue, non exploité. | Migration : retirer `INSERT/UPDATE` directs (ou limiter les policies à `SELECT`) et laisser les RPC seules en écriture. Ajouter un test SQL dans `sql/tests/`. |
| S2 | P1 | Des policies `FOR ALL` héritées sur `user_achievements`, `inventory`, `social_challenges`, `friends` ne sont neutralisées **que** par l'absence de `GRANT`. `anon` garde des droits `INSERT/UPDATE/DELETE` sur 14 tables (`premium_access`, `site_settings`, `dynamic_pages`, `referrals`…) protégées uniquement par RLS. | Advisor : 52 alertes « multiple permissive policies ». `information_schema.role_table_grants`. | Le moindre `GRANT` futur rouvrirait ces écritures. Supprimer les policies redondantes et révoquer les privilèges inutiles (moindre privilège). |
| S3 | P1 | 26 RPC `SECURITY DEFINER` exécutables par `authenticated`, dont plusieurs avec `search_path = 'public'` au lieu de `''` (ex. `titan_submit_training_session`, `titan_create_guild`). | Advisor `0029`, définitions lues. | Revue logique RPC par RPC (déjà documenté comme dette dans Renaissance 200), puis passer `search_path` à `''`. |
| S4 | P1 | La protection contre les mots de passe compromis est désactivée. | Advisor `auth_leaked_password_protection`. | Configuration Supabase Auth (dépend de l'offre). |
| S5 | P2 | Les fonctions admin du schéma `private` (`titan_admin_grant_premium_v1`…) ont `EXECUTE` pour `PUBLIC`. Ce n'est pas exploitable aujourd'hui : `anon` n'a pas `USAGE` sur `private`, le schéma n'est pas exposé et les fonctions appellent `titan_admin_assert()`. | `has_function_privilege` / `has_schema_privilege` | Défense en profondeur : `REVOKE EXECUTE … FROM PUBLIC`. |
| S6 | P2 | CSP avec `'unsafe-inline'` pour les scripts : 117 handlers `on*=` inline, 263 affectations `innerHTML` (170 dans `js/`, 93 dans les pages). | `netlify.toml`, comptages `grep` | Migration progressive vers des listeners et la création de nœuds DOM, page par page. |

Points vérifiés **sains** : `titan_apply_progression_reward` (qui accepte un `user_id`) n'est exécutable ni par `anon` ni par `authenticated`. `profiles`, `training_logs` et `sport_goals` sont protégés par des triggers de garde. L'idempotence de `titan_submit_training_session` est assurée par `training_receipts`, avec détection de conflit de contenu.

## 5. Dette technique

| ID | Prio | Constat | Preuve |
|---|---|---|---|
| D1 | **P1** | Les migrations du dépôt ne reflètent pas la base. La production a 37 migrations, le dépôt 4. Même les 4 migrations Renaissance ont des versions différentes (`20260912182314_renaissance_adventure` dans le dépôt, `20260912184050` en production). Un `supabase db push` tenterait de les rejouer. | `supabase/migrations/`, `list_migrations` |
| D2 | **P1** | Pas de livraison continue traçable : Netlify déploie par CLI (`deploy_source: cli`, `commit_ref: null`). La production actuelle s'intitule « Renaissance 200 - 461c737 » (14/09), mais son SHA n'est pas vérifiable. `main` n'est pas protégée. | API Netlify |
| D3 | P2 | Documentation périmée ou contradictoire : `docs/ARCHITECTURE.md` décrit la version 100 et affirme qu'il n'existe pas de `supabase/migrations/`. `docs/DEPLOYMENT.md` annonce une production v100. Le fichier racine `_redirects` n'est pas copié dans `dist/`, donc il est mort, et il contredit `netlify.toml` (`/algorithme`, `/guide`). Une dizaine d'anciens audits restent à la racine. | Fichiers cités |
| D4 | P2 | Aucun test navigateur de bout en bout, et les tests SQL ne tournent pas en CI. Les régressions B2 et B4 auraient été détectées par un simple balayage Playwright. | `package.json`, `.github/workflows/ci.yml` |
| D5 | P2 | Gros fichiers globaux : `titan_features.js` 218 Ko, `training-page.js` 98 Ko, `admin.js` 94 Ko, `ui.js` 67 Ko, `state.js` 60 Ko, `main.js` 58 Ko, `style.css` 121 Ko. | `ls -la js` |
| D6 | P3 | Le niveau « découverte » est calculé localement avec une formule différente de celle du serveur (`js/renaissance-engine.js:79-97` : durée × 10). Le niveau affiché à un invité ne correspond pas à celui qu'il aurait avec un compte. | Code |
| D7 | P3 | Restes externes : `preconnect` vers `cdn.jsdelivr.net` alors que le SDK est servi en local, polices Google héritées (Russo One, Outfit, Rajdhani, Inter), Leaflet chargé depuis unpkg. | `grep` |

## 6. Dette UX

| ID | Prio | Constat |
|---|---|---|
| U1 | **P1** | `/login` et `/onboarding` sont restés dans l'ancienne direction artistique « TITAN OS » : logo mécha noir et blanc, « IDENTIFIANT », « CODE D'ACCÈS », `agent@titan-os.com`, majuscules, textes sans accents (« DEMARRAGE », « premiere seance enregistree »). Ce sont les deux pages qui convertissent un visiteur en utilisateur. |
| U2 | P1 | Vocabulaire incohérent pour le même concept : « Mode observateur (invité) », « Découverte · sur cet appareil », « Recrue » ; « TITAN OS » et « TITAN ». La confirmation passe par un `confirm()` natif. |
| U3 | P1 | Les erreurs de synchronisation exposent des codes internes et ne proposent aucune correction (voir B1). |
| U4 | P2 | Début de progression trop lent (section 8) : un débutant reste niveau 2 entre 3 et 6 mois. |
| U5 | P2 | Recherche de sport : « course » ne propose pas la course à pied (vérifié hors ligne). Le classement en ligne avec « Course (Route) » reste à vérifier. |

Points positifs observés : aucun débordement horizontal sur 76 combinaisons pages × largeurs, aucune image cassée, aucun bouton sans nom accessible ni image sans `alt` détecté (un champ sans label sur `/social`), titres clairs sur les pages Renaissance.

## 7. Performance

Aucune mesure Lighthouse ni Core Web Vitals n'a été faite ; aucun score n'est avancé. Observations :

- Aucune image publiée ne dépasse 400 Ko (le build remplace les originaux par les WebP). `dist/` pèse 13 Mo.
- JS non minifié et non groupé : `/training` charge 24 scripts (≈ 800 Kio), `/journal` 20 (≈ 714 Kio), `/aujourdhui` 18 (≈ 677 Kio).
- `css/style.css` (121 Ko) est chargé partout, en plus des feuilles Renaissance.

À faire : mesure réelle (PageSpeed / CrUX une fois le trafic présent), puis minification au build et réduction des scripts globaux par page.

## 8. Simulation de progression

Reproductible avec `node tools/simulate-progression.mjs`. Formules **de production** lues le 05/10/2026 : `titan_submit_training_session` (v101), plafond hebdomadaire de 9600 XP et 1800 crédits, `titan_level_requirement = floor(2200 × L^1.18)`, bonus de niveau `max(150, 180 + 35 × L)`.

XP par séance type : course 5 km/30 min **176** ; course 10 km/60 min **353** ; marche 5 km/60 min **193** ; randonnée 12 km **420** ; vélo 30 km **631** ; musculation 6 t/60 min **288** ; sport collectif 60 min **279** ; yoga 45 min **139** ; natation 1500 m **820** ; natation 100 m **579**.

| Profil | 1 mois | 3 mois | 6 mois | 1 an | 2 ans |
|---|---|---|---|---|---|
| Débutant (1,5/sem) | niv 1 | niv 2 | niv 2 | niv 3 | niv 4 |
| Régulier (3/sem) | niv 2 | niv 3 | niv 4 | niv 6 | niv 8 |
| Actif (5/sem) | niv 3 | niv 4 | niv 6 | niv 8 | niv 11 |
| Multisport (7/sem) | niv 3 | niv 5 | niv 7 | niv 10 | niv 14 |

XP cumulée par rang : niv 3 = 7 184 ; niv 6 = 41 217 ; niv 10 = 136 293 ; niv 15 = 343 052 ; niv 25 = 1 077 001 ; niv 40 = 3 051 390.

Lecture :

1. **Trop lent, surtout au début.** Le 5ᵉ avatar (niveau 10) demande environ 3,5 ans à un régulier, le 6ᵉ (niveau 15) environ 9 ans. Le rang « Légende » est hors d'atteinte. Cela contredit `TITAN_ECONOMY.pacing.targetEndgameWeeks = 52` (`js/config.js`).
2. **L'aventure s'épuise bien plus vite que l'XP.** Chaque monde demande 21 jours actifs, soit 42 pour les deux mondes gratuits et 84 pour les quatre. Un régulier finit tout en environ 6 mois, un actif en environ 3 mois.
3. **Anomalies de barème.** Les sports mesurés en mètres (`unit = 'm'`, natation) tombent dans la branche générique à 6 XP par unité et atteignent presque toujours le plafond. La marche (`walking`) est classée `running` faute de correspondance avec `rando|hiking|marche` et rapporte plus que la course sur la même distance.
4. **Les crédits s'accumulent** (≈ 8 500 par an pour un régulier) face à des cosmétiques à 650 : il faudra des débouchés non pay-to-win.

Recommandation : rééquilibrer **maintenant** (aucun utilisateur actif à migrer). Il faut une courbe plus généreuse sur les 10 premiers niveaux, un barème par profil fondé sur la durée et l'intensité plutôt que sur l'unité brute, une correction des unités `m` et une classification explicite de la marche. Il faut aussi plus de contenu d'aventure récurrent (quêtes hebdomadaires, saisons) plutôt qu'un contenu fini. Toute modification doit passer par ce simulateur et par un test SQL.

## 9. Contradictions avec la passation et les documents

- La passation indique « 44 tests » et un `verify` vert : **confirmé**.
- `GAME_SETTINGS.version = "200.0"`, cache `titan-os-v200-renaissance-2`, `adsEnabled: false` : **confirmé**.
- GA4 et AdSense : **aucune intégration** (grep complet). Il existe en revanche une table `analytics_events` et une fonction `titanTrackEvent` (`js/content.js:148`), qui n'émettent qu'un seul événement (`dynamic_page_opened`).
- « Migrations Renaissance appliquées » : vrai en substance, mais sous **d'autres numéros de version** que les fichiers du dépôt (D1).
- APK Android : **absent**, confirmé.
- `docs/ARCHITECTURE.md` et `docs/DEPLOYMENT.md` sont antérieurs à Renaissance (D3).

## 10. Backlog proposé

Les issues GitHub reprennent ces constats avec un préfixe de priorité :

- **P0 — Fiabilité des données** : B1, séances de plus de 30 jours (#1) ; S1, écritures directes guildes (#2).
- **P1 — Fiabilité** : B2, catalogue hors ligne (#3) ; B3, invité orphelin et import invité → compte (#4).
- **P1 — Sécurité** : S2 et S5, policies héritées et grants `anon` (#5) ; S3 et S4, RPC `SECURITY DEFINER` et mots de passe compromis (#6).
- **P1 — Ops** : D1, rebasage des migrations (#7) ; D2, CD Netlify reliée à `main` et protection de branche (#8).
- **P1 — QA** : tests E2E Playwright en CI (#9) ; QA mobile réelle, iPhone Safari et Android Chrome (#10).
- **P1 — Analytics** : instrumentation produit respectueuse du consentement (#11).
- **P1 — Android** : choix TWA/Capacitor puis APK (#12).
- **P2 — UX** : login et onboarding en DA Renaissance, U1 à U3 (#13) ; boutique, B4 (#14).
- **P2 — Progression** : rééquilibrage XP/aventure appuyé sur la simulation, section 8 (#15).
- **P2 — Legacy** : documentation, `_redirects`, inline JS et `innerHTML`, poids des pages (#16).
- **P3** : B5, B6, U5 et petits défauts (#17). L'extension de l'aventure et les programmes coach restent dans `PLAN_TITAN_RENAISSANCE.md` jusqu'à ce que les fondations soient posées.

## 11. Proposition de prochaine release : « Fondations 201 »

Objectif : qu'un premier vrai utilisateur ne perde rien, comprenne en cinq minutes et revienne. Pas de nouvelle fonctionnalité visible majeure.

1. **Données sûres** : B1 (contrôle client des 30 jours, message clair, correction de date depuis la file), B2 (catalogue hors ligne complété avec les sports vedettes), B3 (invité stable et import des séances invitées vers le compte via la RPC existante, dans la limite des 30 jours ou sans récompense), S1.
2. **Livraison traçable** : rebasage des migrations, Netlify relié à `main` avec prévisualisations de PR, protection de `main` avec CI obligatoire, test E2E Playwright du parcours découverte en CI.
3. **Première impression** : login et onboarding en DA Renaissance, vocabulaire unifié (« Découverte »), boutique réparée.
4. **Mesure** : 10 à 13 événements produit first-party (inscription, première séance, J+7…) derrière le consentement, sans donnée de santé, de poids, de GPS ni de note.
5. **Équilibrage** : nouvelle courbe XP et nouveau barème validés par le simulateur, appliqués par migration avant l'arrivée des utilisateurs.

L'APK Android et la QA sur appareils réels se planifient juste après, sur une base stabilisée.

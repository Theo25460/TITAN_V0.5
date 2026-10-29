# Garmin — qualification, architecture préparée et ce qui reste à faire (V11-05, GAR-01, GAR-02)

Écrit le 29/10/2026. **Aucune clé Garmin n'a été lue, utilisée ni écrite** pour préparer ce chantier : le dépôt, le cahier et les tests ne contiennent que des valeurs fictives. La fonction est **désactivée par défaut** et rien n'est annoncé aux joueurs.

## 1. Où en est l'accès (à confirmer par Théo)

| Question | État |
|---|---|
| La clé remise le 28/10/2026 | **À considérer comme exposée** (elle a circulé dans une conversation) : le propriétaire a expressément décidé le 28/10 de ne pas exiger de régénération à ce stade. Avertir du risque d'exposition sans bloquer la préparation. Stocker tout secret uniquement dans Netlify. |
| Type d'accès | À identifier : une clé « personnelle » ne donne accès qu'aux données du titulaire, elle ne permet **pas** de proposer « Connecter Garmin » à tous les joueurs. Pour tous les joueurs, il faut un accès **programme Garmin Connect Developer** (Business / Starter). |
| État du programme | **À vérifier avant de planifier** : une source tierce indique que le programme pourrait être suspendu aux nouvelles inscriptions ; la page officielle le décrit comme ouvert. Se fier à la réponse de Garmin, pas à l'une ni à l'autre. |
| Ce qu'un accès Starter garantit | Modèle « push », pas d'historique garanti, capacité limitée (cahier GAR-02) : le premier envoi arrive quand l'appareil se synchronise, rien n'est rattrapé en arrière. |

Références : programme [developer.garmin.com/gc-developer-program](https://developer.garmin.com/gc-developer-program/overview/) ; activité [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/) ; OAuth 2.0 PKCE [OAuth2PKCE.pdf](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf) (le principe : redirection vers Garmin, code, échange avec vérificateur, lecture de l'identifiant utilisateur).

## 2. Architecture préparée (tout est côté serveur)

```
joueur ──(1) autorise « garmin » dans TITAN──▶ titan_set_source_consent_v1('garmin', true)
joueur ──(2) POST ?action=start (session) ───▶ fonction Netlify garmin : adresse de consentement Garmin (PKCE S256, état scellé)
Garmin ──(3) GET /auth/garmin/callback?code&state (ou &error) ─▶ réécriture 200 vers la fonction : échange du code, identifiant Garmin, permissions accordées, titan_garmin_link_v1, jetons scellés
Garmin ──(4) POST ?action=push&token=… ──────▶ titan_garmin_ingest_v1 (par activité) / titan_garmin_deregister_v1
joueur ──(5) POST ?action=disconnect (session) ▶ retrait de TITAN chez Garmin (DELETE user/registration), puis fin du lien, du consentement et des jetons
```

- **Les jetons Garmin ne sont jamais en clair** : la fonction les scelle (AES-256-GCM, clé `GARMIN_TOKEN_KEY` qui ne vit que chez Netlify, liés à l'identifiant du compte) avant de les écrire dans une table privée sans accès API ; ils ne servent qu'à renouveler l'accès et à retirer TITAN chez Garmin à la déconnexion. Toute fin de lien (déconnexion, notice Garmin, retrait du consentement, suppression du compte) les efface par un déclencheur unique.
- **Un client ne peut jamais dire « ceci vient de Garmin »** : `titan_import_activity_v1` et `titan_import_daily_activity_v1` refusent la source `garmin` ; seule `titan_garmin_ingest_v1` (rôle serveur) l'écrit, pour un compte qui a lié Garmin **et** autorisé la source. Pas de provenance dans les champs libres (ADR-003).
- **Un identifiant Garmin = un compte à la fois** (`GARMIN_ALREADY_LINKED`) : pas de second profil, pas d'historique coupé en deux.
- **Anti-doublon entre sources** : une activité qui recouvre une séance du même sport déjà au journal — saisie à la main, Health Connect ou Garmin — est rattachée, comptée une fois (pas d'XP, de crédits, de quêtes ni de records en double).
- **Mêmes règles qu'une séance manuelle** : plafonds de création, score de risque, plafonds d'XP, retenues. Une activité Garmin n'a aucun avantage.
- **Retrait** : depuis TITAN (Profil > Sources connectées : retirer l'accès, archiver ce que Garmin a apporté ; `titan_garmin_unlink_v1`) ou depuis Garmin (notice de désenregistrement -> `titan_garmin_deregister_v1`). Retirer le consentement coupe aussi le lien ; autoriser de nouveau ne le rétablit pas, il faut refaire la liaison.
- **Journalisation** : aucune donnée de santé ni identifiant dans les journaux ; la fonction ne journalise rien.
- **Types d'activité inconnus** : ignorés, jamais devinés (`private.titan_garmin_sport`) ; durées de moins d'une minute, dates futures, distances impossibles : acquittées et ignorées pour que Garmin cesse de réessayer.

Fichiers : migrations `20261028110000_garmin_link` et `20261028120000_garmin_tokens`, `functions/garmin.mjs` (+ `netlify/functions/garmin.mts`), réécriture `/auth/garmin/callback` dans `netlify.toml`, tests `sql/tests/300_garmin.sql`, `300_garmin_tokens.sql` et `tests/garmin.test.mjs`.

## 3. Secrets et variables Netlify (aucune valeur dans le dépôt)

| Nom | Rôle |
|---|---|
| `GARMIN_ENABLED` | interrupteur : tout reste à `503` tant que ce n'est pas `true` |
| `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` | identifiants de l'application chez Garmin (le secret ne quitte jamais le serveur) |
| `GARMIN_AUTH_URL`, `GARMIN_TOKEN_URL`, `GARMIN_USER_ID_URL` | URL officielles : https://connect.garmin.com/oauth2Confirm ; https://connectapi.garmin.com/di-oauth2-service/oauth/token ; https://apis.garmin.com/wellness-api/rest/user/id |
| `GARMIN_REDIRECT_URI` | `https://titan-app.fr/auth/garmin/callback` (DÉJÀ déclarée chez Garmin ; ajouter une réécriture 200 vers la fonction garmin avec action=callback ; transmettre code et state) |
| `GARMIN_PUSH_TOKEN` | jeton secret (24 caractères au moins) placé dans l'adresse de réception déclarée chez Garmin |
| `GARMIN_STATE_KEY` | clé (32 caractères au moins) qui scelle l'état OAuth |
| `GARMIN_TOKEN_KEY` | clé distincte (32 caractères au moins) qui scelle les jetons des joueurs avant l'écriture en base (la perdre force chaque joueur à relier Garmin) |
| `GARMIN_PERMISSIONS_URL` | https://apis.garmin.com/wellness-api/rest/user/permissions (facultatif : sans elle, les permissions ne sont pas contrôlées) |
| `GARMIN_REGISTRATION_URL` | https://apis.garmin.com/wellness-api/rest/user/registration (facultatif : sans elle, la déconnexion ne retire pas TITAN chez Garmin et le dit : `provider: skipped`) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` | déjà utilisés par les autres fonctions |

Rotation et révocation : voir `docs/SECRETS_ROTATION_PLAN.md`. Changer `GARMIN_STATE_KEY` n'invalide que les liaisons en cours (dix minutes).

## 4. À confirmer avec la documentation fournie par l'accès (écrit de mémoire, non vérifié)

- Adresses OAuth confirmées ci-dessus ; il reste à les configurer en variables serveur.
- Format exact du push : champs `userId`, `summaryId`, `activityType`, `startTimeInSeconds`, `durationInSeconds`, `distanceInMeters`, et forme des notices de désenregistrement.
- Liste des types d'activité et leur correspondance avec les sports de TITAN.
- Mécanisme d'authentification du push côté Garmin (ici : jeton secret dans l'adresse) et politique de nouvelle tentative.
- Restitution d'un fichier d'activité complet (FIT/GPX/TCX) : non utilisée ici, aucune trace GPS n'est récupérée.

## 5. Ce qui n'est pas fait (et pourquoi)

- **Aucun bouton « Connecter Garmin » dans l'application** : il ne doit apparaître qu'après accord de Garmin, essai sur de vrais comptes autorisés et nouvelle version (cahier V11-05). Quand ce sera le cas : appeler le consentement, puis `POST ?action=start` avec la session du joueur, puis ouvrir l'adresse reçue ; au retour, `/profile?garmin=ok|conflict|consent|error`.
- **Aucun essai sur un vrai compte Garmin** : impossible sans accès. Preuve technique (simulée) distincte de l'ouverture multi-utilisateur.
- **Aucune mention publique** (site, Play Store, politique de confidentialité) avant l'ouverture réelle ; le registre des traitements et l'inventaire technique sont déjà tenus à jour.

## 6. Complément du 29/10/2026 — 22 flux, « On Hold » et correctif OAuth (GAR-09 à GAR-14)

Le texte de la console Garmin montre deux colonnes « On Hold » et « Enabled », SANS montrer quelles cases sont cochées. Vérifier individuellement les deux valeurs, les URLs HTTPS de réception et le mode de livraison. Enabled coché = flux disponible ; On Hold coché = notifications mises en file d'attente, non expédiées, conservation pouvant aller jusqu'à 7 jours. On Hold n'est pas une preuve de refus fournisseur. Garmin a séparément annoncé une pause du traitement de nouvelles demandes d'accès API ; ne pas la confondre avec le réglage des notifications. Ne pas lever On Hold tant que le webhook n'est pas opérationnel.

ACTIVITY (5) : Activities ; Activity Details ; Activity Files ; Manually Updated Activities ; MoveIQ.
COMMON (2) : Deregistrations ; User Permissions Change.
HEALTH (15) : Blood Pressure ; Body Compositions ; Breathing Variations ; Dailies ; Epochs ; HRV Summary ; Health Snapshot ; Hydration ; Nutrition ; Pulse Ox ; Respiration ; Skin Temperature ; Sleeps ; Stress ; User Metrics.

BLOCAGE CODE CONCRET : la redirection de retour enregistrée chez Garmin est https://titan-app.fr/auth/garmin/callback mais la fonction Garmin de la branche et la version antérieure de ce fichier utilisent /.netlify/functions/garmin?action=callback. netlify.toml n'a pas de routage pour le chemin public. Corriger le routage côté Netlify en conservant exactement le callback inscrit chez Garmin, avec un rewrite 200 vers la fonction et un traitement du paramètre action=callback ainsi que code, state, error. Tester le succès OAuth, le refus, les state invalides/expirés et la redirection vers le profil. Le callback OAuth est DISTINCT de l'URL de réception des notifications Push.

Endpoints OAuth 2.0 PKCE officiels : GARMIN_AUTH_URL=https://connect.garmin.com/oauth2Confirm ; GARMIN_TOKEN_URL=https://connectapi.garmin.com/di-oauth2-service/oauth/token ; GARMIN_USER_ID_URL=https://apis.garmin.com/wellness-api/rest/user/id ; GARMIN_REDIRECT_URI=https://titan-app.fr/auth/garmin/callback . Après consentement, vérifier la permission individuelle via GET https://apis.garmin.com/wellness-api/rest/user/permissions . Lors de la déconnexion, Garmin prescrit DELETE https://apis.garmin.com/wellness-api/rest/user/registration . Le code actuel délie uniquement le compte local et ne conserve aucun jeton : prévoir une stratégie de révocation fournisseur conforme avant production ; ne pas marquer ce test terminé.

Priorités : Activities, éventuellement Activity Details, puis Deregistrations et User Permissions Change ; Health/Dailies pour les pas si le périmètre est autorisé. Les autres 15 flux santé sont recensés, pas à collecter par défaut. Pas de collecte de données médicales superflues ni de GPS/FIT inutile. Starter Business : Push uniquement et pas d'historique ; ne pas supposer Ping/Pull ni historique disponibles.

Reprise Claude (29/10/2026) — état au sens du cahier GAR-14 :

| | Contenu | État |
|---|---|---|
| **A. Code préparé et testé (simulation)** | réécriture `/auth/garmin/callback` -> fonction (code, state, error conservés) ; PKCE S256, état scellé ; succès, refus (`garmin=refused`), état expiré ou falsifié, code erroné, permission d'activité absente (`garmin=permission`), doublon de compte, consentement manquant ; permissions lues après consentement ; jetons scellés et effacés à chaque fin de lien ; déconnexion avec retrait chez Garmin (renouvellement par jeton d'actualisation si besoin) et fin locale quoi que réponde Garmin ; réception : activités et activités modifiées chez Garmin, notices de désenregistrement et de changement de permission ; autres flux acquittés et non collectés ; mapping des sports, idempotence, doublons entre sources | fait, `GARMIN_ENABLED` reste faux |
| **B. Secrets, déploiement, migrations** | variables Netlify (tableau §3), migrations 40 et 41 à appliquer dans l'ordre, déclaration chez Garmin de l'adresse de réception (`?action=push&token=…`, distincte du callback) | **non fait, à faire par le propriétaire**, sans que je voie le secret |
| **C. Garmin réel** | état réel des cases « Enabled » et « On Hold » par flux, réponse de Garmin sur l'accès (pause des nouvelles demandes), format exact des messages, essai avec une montre synchronisée sur deux comptes distincts, schéma des permissions et de la notice de changement | **attente Garmin / propriétaire** ; rien n'est présenté comme réussi |

Hypothèses de format à vérifier à la première réception réelle : noms de champs de l'activité, clés `manuallyUpdatedActivities` et `userPermissionsChange` (et la forme de `permissions`), nom des permissions (`ACTIVITY_EXPORT` attendu : la fonction accepte toute chaîne contenant « ACTIVITY »). Un format de permissions inconnu ne bloque pas la liaison.

La révocation chez le fournisseur est faite par la déconnexion (`provider` vaut `withdrawn`, `refused`, `unavailable` ou `skipped`) ; la suppression d'un compte TITAN ne l'appelle pas : Garmin continuera d'envoyer, ces envois sont ignorés (`not_linked`) et le joueur peut aussi retirer l'application depuis Garmin. À trancher avant la production : appeler la déconnexion au moment de la suppression du compte.

Texte à ajouter à la politique de confidentialité AVANT l'activation publique (GAR-05, brouillon à valider, non publié) : « Si tu relies Garmin, TITAN reçoit de Garmin les séances que ton appareil enregistre (sport, début, durée, distance) pour les ajouter à ton journal ; rien n'est repris sans ton accord, les mêmes règles de contrôle s'appliquent qu'à une séance saisie, tes données Garmin ne sont jamais vendues ni utilisées pour de la publicité. Tu peux retirer l'accès à tout moment depuis Profil (TITAN le retire aussi chez Garmin) ou depuis Garmin ; les séances reçues restent dans ton journal jusqu'à ce que tu les archives ou supprimes ton compte. » Destinataires : Supabase (base) et Netlify (fonctions), Garmin comme fournisseur de la donnée.

Documentation officielle OAuth : https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf ; programme : https://developer.garmin.com/gc-developer-program/overview/ ; état des demandes : https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-mobile-andriod/433735/is-the-garmin-connect-developer-program-down-i-can-t-submit-a-request/2035925 .

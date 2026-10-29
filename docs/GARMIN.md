# Garmin — qualification, architecture préparée et ce qui reste à faire (V11-05, GAR-01, GAR-02)

Écrit le 29/10/2026. **Aucune clé Garmin n'a été lue, utilisée ni écrite** pour préparer ce chantier : le dépôt, le cahier et les tests ne contiennent que des valeurs fictives. La fonction est **désactivée par défaut** et rien n'est annoncé aux joueurs.

## 1. Où en est l'accès (à confirmer par Théo)

| Question | État |
|---|---|
| La clé remise le 28/10/2026 | **À considérer comme exposée** (elle a circulé dans une conversation) : la révoquer chez Garmin et en générer une nouvelle avant tout usage. Le remplaçant ne vit que dans le gestionnaire de secrets de Netlify. |
| Type d'accès | À identifier : une clé « personnelle » ne donne accès qu'aux données du titulaire, elle ne permet **pas** de proposer « Connecter Garmin » à tous les joueurs. Pour tous les joueurs, il faut un accès **programme Garmin Connect Developer** (Business / Starter). |
| État du programme | **À vérifier avant de planifier** : une source tierce indique que le programme pourrait être suspendu aux nouvelles inscriptions ; la page officielle le décrit comme ouvert. Se fier à la réponse de Garmin, pas à l'une ni à l'autre. |
| Ce qu'un accès Starter garantit | Modèle « push », pas d'historique garanti, capacité limitée (cahier GAR-02) : le premier envoi arrive quand l'appareil se synchronise, rien n'est rattrapé en arrière. |

Références : programme [developer.garmin.com/gc-developer-program](https://developer.garmin.com/gc-developer-program/overview/) ; activité [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/) ; OAuth 2.0 PKCE [OAuth2PKCE.pdf](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf) (le principe : redirection vers Garmin, code, échange avec vérificateur, lecture de l'identifiant utilisateur).

## 2. Architecture préparée (tout est côté serveur)

```
joueur ──(1) autorise « garmin » dans TITAN──▶ titan_set_source_consent_v1('garmin', true)
joueur ──(2) POST ?action=start (session) ───▶ fonction Netlify garmin : adresse de consentement Garmin (PKCE S256, état scellé)
Garmin ──(3) GET ?action=callback&code&state ─▶ échange du code, lecture de l'identifiant Garmin, titan_garmin_link_v1(compte, garmin)
Garmin ──(4) POST ?action=push&token=… ──────▶ titan_garmin_ingest_v1 (par activité) / titan_garmin_deregister_v1
```

- **Aucun jeton Garmin n'est conservé** : le modèle « push » n'a besoin que de l'identifiant Garmin. Rien à voler, rien à faire tourner en base.
- **Un client ne peut jamais dire « ceci vient de Garmin »** : `titan_import_activity_v1` et `titan_import_daily_activity_v1` refusent la source `garmin` ; seule `titan_garmin_ingest_v1` (rôle serveur) l'écrit, pour un compte qui a lié Garmin **et** autorisé la source. Pas de provenance dans les champs libres (ADR-003).
- **Un identifiant Garmin = un compte à la fois** (`GARMIN_ALREADY_LINKED`) : pas de second profil, pas d'historique coupé en deux.
- **Anti-doublon entre sources** : une activité qui recouvre une séance du même sport déjà au journal — saisie à la main, Health Connect ou Garmin — est rattachée, comptée une fois (pas d'XP, de crédits, de quêtes ni de records en double).
- **Mêmes règles qu'une séance manuelle** : plafonds de création, score de risque, plafonds d'XP, retenues. Une activité Garmin n'a aucun avantage.
- **Retrait** : depuis TITAN (Profil > Sources connectées : retirer l'accès, archiver ce que Garmin a apporté ; `titan_garmin_unlink_v1`) ou depuis Garmin (notice de désenregistrement -> `titan_garmin_deregister_v1`). Retirer le consentement coupe aussi le lien ; autoriser de nouveau ne le rétablit pas, il faut refaire la liaison.
- **Journalisation** : aucune donnée de santé ni identifiant dans les journaux ; la fonction ne journalise rien.
- **Types d'activité inconnus** : ignorés, jamais devinés (`private.titan_garmin_sport`) ; durées de moins d'une minute, dates futures, distances impossibles : acquittées et ignorées pour que Garmin cesse de réessayer.

Fichiers : migration `20261028110000_garmin_link`, `functions/garmin.mjs` (+ `netlify/functions/garmin.mts`), tests `sql/tests/300_garmin.sql` et `tests/garmin.test.mjs`.

## 3. Secrets et variables Netlify (aucune valeur dans le dépôt)

| Nom | Rôle |
|---|---|
| `GARMIN_ENABLED` | interrupteur : tout reste à `503` tant que ce n'est pas `true` |
| `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` | identifiants de l'application chez Garmin (le secret ne quitte jamais le serveur) |
| `GARMIN_AUTH_URL`, `GARMIN_TOKEN_URL`, `GARMIN_USER_ID_URL` | adresses fournies par la documentation de l'accès (volontairement sans valeur par défaut) |
| `GARMIN_REDIRECT_URI` | `https://titan-app.fr/.netlify/functions/garmin?action=callback` (à déclarer chez Garmin) |
| `GARMIN_PUSH_TOKEN` | jeton secret (24 caractères au moins) placé dans l'adresse de réception déclarée chez Garmin |
| `GARMIN_STATE_KEY` | clé (32 caractères au moins) qui scelle l'état OAuth |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` | déjà utilisés par les autres fonctions |

Rotation et révocation : voir `docs/SECRETS_ROTATION_PLAN.md`. Changer `GARMIN_STATE_KEY` n'invalide que les liaisons en cours (dix minutes).

## 4. À confirmer avec la documentation fournie par l'accès (écrit de mémoire, non vérifié)

- Adresses d'autorisation, d'échange du code et de lecture de l'identifiant.
- Format exact du push : champs `userId`, `summaryId`, `activityType`, `startTimeInSeconds`, `durationInSeconds`, `distanceInMeters`, et forme des notices de désenregistrement.
- Liste des types d'activité et leur correspondance avec les sports de TITAN.
- Mécanisme d'authentification du push côté Garmin (ici : jeton secret dans l'adresse) et politique de nouvelle tentative.
- Restitution d'un fichier d'activité complet (FIT/GPX/TCX) : non utilisée ici, aucune trace GPS n'est récupérée.

## 5. Ce qui n'est pas fait (et pourquoi)

- **Aucun bouton « Connecter Garmin » dans l'application** : il ne doit apparaître qu'après accord de Garmin, essai sur de vrais comptes autorisés et nouvelle version (cahier V11-05). Quand ce sera le cas : appeler le consentement, puis `POST ?action=start` avec la session du joueur, puis ouvrir l'adresse reçue ; au retour, `/profile?garmin=ok|conflict|consent|error`.
- **Aucun essai sur un vrai compte Garmin** : impossible sans accès. Preuve technique (simulée) distincte de l'ouverture multi-utilisateur.
- **Aucune mention publique** (site, Play Store, politique de confidentialité) avant l'ouverture réelle ; le registre des traitements et l'inventaire technique sont déjà tenus à jour.

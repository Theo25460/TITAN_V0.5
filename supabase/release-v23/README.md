# Paquet de production v23 (généré) — NON APPLIQUÉ

V1.8.3 — Un groupe qui se retrouve (`docs/V183_GROUPE_CORDEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v23`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application, **après les paquets v21 et v22** (V1.8.1 et V1.8.2, pas encore appliqués non plus).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` suite de la cordée | Propositions d’un nouvel itinéraire privé après une cordée terminée (route existante, allure éprouvée, durée), réponses des membres, départ d’une nouvelle cordée avec les compteurs à zéro dès deux acceptations, proposition canonique (même route, allure et durée) et choix explicite entre propositions distinctes sous verrou de ligne ; histoire de la cordée terminée (`story`) et cordée suivie (`follows`) dans `titan_cordees_v1` ; « suites » dans `titan_social_digest_v1` ; les partenaires de lien d’une cordée restent nommés dans celles qui la suivent (`private.titan_member_named`) ; export `cordeeSuites` ; mesure `private.titan_cordee_suite_measure()` | Proposer et répondre : seulement quand `screens.cordee_suite` est ouvert (fermé par défaut, déploiement par compte), et `screens.cordee` pour proposer. L’histoire d’une cordée terminée et la règle de nommage étendue valent dès l’application |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261125090000` enregistrées (143) :
`00-check-before` à `ok = true` (private 131/f550f5ce5daf/0155cb43ef72, public 326/7e442a057127/95bff8a8e8a1, état de fin du paquet v22),
`01` appliqué, `99-check-after` à `ok = true` (private 141/681a79d6ef40/2800c4c153fe, public 327/5429983a73a6/a81da62357a0), second passage
de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. Les paquets v21 puis v22 doivent être appliqués (`20261125090000` enregistré).
2. Publier le Web et l’application Android qui contiennent V1.8.3 (les anciens clients ignorent simplement `story`, `follows`, `suite`
   et `suites` : rien ne casse s’ils restent en service).
3. `00-check-before.sql` : deux lignes `ok = true`.
4. `01-20261126090000_cordee_suite.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261125090000` manque).
5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
6. Ouvrir `screens.cordee_suite` pour les comptes pilotes seulement, déjà ouverts à `screens.cordee`.

Retour arrière : décrit dans l’en-tête de la migration (fonctions, déclencheur et tables nouvelles supprimés, fonctions re-créées depuis
`20261120100000`, `20261120120000` et `20261125090000`).

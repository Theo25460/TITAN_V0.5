# Paquet de production v24 (généré) — NON APPLIQUÉ

V1.8.4 — Saisons privées de club (`docs/V184_SAISONS_CLUB.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v24`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application, **après les paquets v21, v22 et v23** (V1.8.1 à V1.8.3, pas encore appliqués non plus).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` saison de club | Saison privée d’un club (titre, départ, 2 à 8 semaines, allure, trois étapes, clôture), organisée par les administrateurs du club ; participation explicite et révocable (rejoindre, pause, reprise, départ) ; jours actifs issus des séances confirmées avec part et plafond individuels ; agrégats à partir de 3 participants ; bilan privé figé ; report du départ et arrêt contrôlé ; déclencheur qui termine la participation quand on quitte le club ; export `clubSeasons` ; mesure `private.titan_club_season_measure()` | Créer, rejoindre, reprendre et reporter : seulement quand `screens.club_season` est ouvert (fermé par défaut). Pause, départ et arrêt restent toujours possibles |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261126090000` enregistrées (144) :
`00-check-before` à `ok = true` (private 141/681a79d6ef40/2800c4c153fe, public 327/5429983a73a6/a81da62357a0, état de fin du paquet v23),
`01` appliqué, `99-check-after` à `ok = true` (private 152/a12f5f1e2548/eee8973d517f, public 329/82c14f6e68a3/5ccabb51c604), second passage
de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. Les paquets v21, v22 puis v23 doivent être appliqués (`20261126090000` enregistré).
2. Publier le Web et l’application Android qui contiennent V1.8.4 (les anciens clients n’appellent pas `titan_club_season_v1` : rien ne
   casse s’ils restent en service).
3. `00-check-before.sql` : deux lignes `ok = true`.
4. `01-20261127090000_club_season.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261126090000` manque).
5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
6. Ouvrir `screens.club_season` pour les comptes des clubs pilotes seulement.

Retour arrière : décrit dans l’en-tête de la migration (déclencheur, fonctions et tables nouvelles supprimés,
`private.titan_social_export_v1` re-créée depuis `20261126090000`).

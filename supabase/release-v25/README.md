# Paquet de production v25 (généré) — NON APPLIQUÉ

V1.8.5 — Rencontres entre clubs (`docs/V185_RENCONTRES_CLUBS.md`, simulations `docs/V185_SIMULATIONS.md`). Généré par
`node tools/db/build-production-bundle.mjs --bundle v25` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application,
**après les paquets v21, v22, v23 et v24** (V1.8.1 à V1.8.4, pas encore appliqués non plus).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` rencontre entre clubs | Défi privé d’une ou deux semaines entre deux clubs : proposé par un administrateur, code à usage unique lu en aperçu (limité, jamais d’erreur) et accepté ou refusé par un administrateur d’un autre club et un autre compte, avant le départ ; participation explicite jusqu’à la fin du deuxième jour ; part plafonnée par personne, taux par club à partir de 3 participants, scores arrêtés à minuit ; coopération (score commun = moyenne des deux taux, seuil 60 %) ; format comparatif (égalité sous 5 points, deux semaines) derrière son propre drapeau ; annulation, abandon, récapitulatif figé, avis des participants ; déclencheur qui retire de la rencontre quand on quitte le club ; export `clubMatches` ; mesure `private.titan_club_match_measure()` | Proposer, accepter et participer : seulement quand `screens.club_match` est ouvert (fermé par défaut). Format comparatif : seulement avec `screens.club_match_versus` (fermé, à laisser fermé pendant le pilote). Refuser, quitter, arrêter et répondre restent toujours possibles |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261127090000` enregistrées (145) :
`00-check-before` à `ok = true` (private 152/a12f5f1e2548/eee8973d517f, public 329/82c14f6e68a3/5ccabb51c604, état de fin du paquet v24),
`01` appliqué, `99-check-after` à `ok = true` (private 166/550d46c5de65/3f3e1401b571, public 332/44ce47c36337/978b18a6a81f), second passage
de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. Les paquets v21, v22, v23 puis v24 doivent être appliqués (`20261127090000` enregistré).
2. Publier le Web et l’application Android qui contiennent V1.8.5 (les anciens clients n’appellent pas `titan_club_match_v1` : rien ne
   casse s’ils restent en service).
3. `00-check-before.sql` : deux lignes `ok = true`.
4. `01-20261128090000_club_match.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261127090000` manque).
5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
6. Ouvrir `screens.club_match` pour les comptes de deux clubs pilotes seulement. Laisser `screens.club_match_versus` fermé tant que
   `private.titan_club_match_measure()` ne rend pas `explainable = true` (5 rencontres en coopération terminées, 10 avis, au plus 1 sur 5
   « pas clair »).

Retour arrière : décrit dans l’en-tête de la migration (déclencheur, fonctions et tables nouvelles supprimés,
`private.titan_social_export_v1` re-créée depuis `20261127090000`).

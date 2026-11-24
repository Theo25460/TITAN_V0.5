# Paquet de production v22 (généré) — NON APPLIQUÉ

V1.8.2 — Reprise et relais facultatifs (`docs/V182_REPRISE_CORDEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v22`
depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
Décision du propriétaire requise avant application, **après le paquet v21** (V1.8.1, qui n’est pas encore appliqué non plus).

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` reprise de la cordée | Prise en charge facultative du relais (72 h), passation volontaire à un membre ou à la cordée (48 h, une seule acceptation retenue), offre jamais acceptée qui libère le relais, départ, blocage et suspension qui annulent la prise en charge ; colonne `left_at` sur `titan_challenge_members` (déclencheur) : les longueurs apportées avant un départ restent acquises et la part du membre parti se referme à ce qu’il a apporté ; export `cordeeRelayTurns` ; mesure `private.titan_cordee_reprise_measure()` | Prise en charge et passation : seulement quand `screens.cordee_reprise` est ouvert (fermé par défaut, déploiement par compte). **Règle des départs : pour toutes les cordées dès l’application** (départs enregistrés après la migration uniquement) |

Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261124090000` enregistrées :
`00-check-before` à `ok = true` (private 124/d491e079008f/b971b4c8829d, public 325/a606edd67a11/65c91ba6d772, état de fin du paquet v21),
`01` appliqué, `99-check-after` à `ok = true` (private 131/f550f5ce5daf/0155cb43ef72, public 326/7e442a057127/95bff8a8e8a1), second passage
de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.

## Procédure

1. Le paquet v21 doit être appliqué (`20261124090000` enregistré).
2. Publier d’abord le Web et l’application Android qui contiennent V1.8.2 : la phrase de départ des anciens clients (« tes longueurs ne
   compteront plus ») devient inexacte dès l’application de la migration.
3. `00-check-before.sql` : deux lignes `ok = true`.
4. `01-20261125090000_cordee_reprise.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261124090000` manque).
5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
6. Ouvrir `screens.cordee_reprise` pour les comptes pilotes seulement, déjà ouverts à `screens.cordee_relay`.

Retour arrière : décrit dans l’en-tête de la migration (fonctions, déclencheur et table nouvelles supprimés, colonnes retirées, fonctions
re-créées depuis `20261124090000` et `20261120110000`).

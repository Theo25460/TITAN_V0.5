# Paquet de production v15 (généré) — NON APPLIQUÉ

Généré par `node tools/db/build-production-bundle.mjs --bundle v15` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application.

Contenu : une migration additive du chantier « Excellence sportive » (lot C, intégrations). Aucune ligne n'est lue, changée ou
supprimée ; aucun droit n'est élargi ; règles d'XP et de récompenses inchangées.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` imports | Un import Garmin / Santé Connect / Strava rejoint une séance déjà saisie sous un identifiant voisin (tapis ↔ course, VTT ↔ vélo, eau libre ↔ piscine…) au lieu de créer un doublon et une seconde récompense ; une nage venue d'une montre est enregistrée en mètres ; l'historique Strava peut être archivé d'un geste | Oui : moins de doublons à l'import ; nouveau bouton côté client déjà livré |

Corrections d'audit (18 novembre 2026, avant toute application) :

- Archiver une source importée de plus de 120 séances ne lève plus `TRAINING_RATE_LIMIT` : le déclencheur `private.titan_limit_training_mutation` (corps de `20261019122259` recopié, une ligne ajoutée) laisse passer l'archivage groupé annoncé par `titan_archive_imported_v1` (réglage local `titan.bulk_archive`) ; l'appel garde sa limite de 10 par heure.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v14 : `private 103 78dde17392e0 4f6481c4b912`,
   `public 309 5eb4c4873e06 95c0de5e6ce0`).
2. `01-…sql` (garde d'ordre : refusé si rejoué ou si v14 manque).
3. `99-check-after.sql` : deux lignes `ok = true` (`private 104 7772609c3673 ccca14f98fa2`, `public 309 5eb4c4873e06 b4dbcb08ceb1`),
   puis les postflights v11, v13 et v131.

Retour arrière : en-tête de `supabase/migrations/20261118090000_sport_excellence_imports.sql`.
Répétition : `pnpm run test:db` (réplique vierge, toutes migrations, `sql/tests/300_sport_excellence_imports.sql`) — vert le 18 novembre 2026.

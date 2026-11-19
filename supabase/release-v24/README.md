# Paquet de production v24 (généré) — V1.5.3 Quatre mondes, quatre mécaniques — NON APPLIQUÉ EN PRODUCTION

> **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations),
> v22 (V1.5.1 Gardiens) et v23 (V1.5.2 Camp et conséquences) déjà appliqués. L’application en production est une décision du
> propriétaire. Tant que ce paquet n’est pas appliqué, les Marées, la Forge et les Aurores gardent leur journal v1 (repli
> silencieux sur `PGRST202`) : rien ne casse.

Généré par `node tools/db/build-production-bundle.mjs --bundle v24` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` campagnes | Configuration commune versionnée `private.titan_adventure_campaign_config` (même JSON que `js/core/adventure-campaigns.js`) pour `marees-arc1`, `forge-arc1` et `aurores-arc1` v1. Les fonctions de contrat V1.5.0 et V1.5.1 (`titan_adventure_branch_config/current`, `titan_adventure_guardian_config/current`) sont redéclarées : littéraux de la Vallée inchangés, trois arcs dérivés de la configuration commune. Colonne `last_answer` dans `private.adventure_guardian_encounters`. Primitive commune `private.titan_adventure_mechanic_check`. `titan_adventure_campaign_snapshot_v1(world)` et `titan_adventure_campaign_action_v1(world, action, …, answer)` (action `solve`) pour les authentifiés | Oui, pour un compte qui ouvre le journal des rencontres d’un des trois mondes et entre volontairement dans le premier arc : un choix, une scène, un indice, puis la mécanique du monde (carte des courants, ordre des pièces, balises à relier) et une issue propre à la voie. XP, crédits, jours actifs, récompenses et effort : inchangés |

Un parcours des trois mondes qui avait déjà passé le choix (ordinal 2) avant ce paquet reste « legacy » : version, récompenses
et chapitres conservés. Un compte qui n’entre pas garde le journal v1. Une ancienne version de l’application affiche l’arc comme
« version inconnue » et ne peut ni y entrer ni sauter une étape (déclencheurs V1.5.0 et V1.5.1).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v23).
2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261125090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (aucune nouvelle couche d’export : la
   colonne `last_answer` apparaît dans la section `adventureGuardians` existante).

Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v23 attendu (identique, `private` 135,
`public` 330), après = `private` 142 fonctions, `public` 332 fonctions ; migration rejouée deux fois : empreintes identiques.
Répétitions : `sql/tests/300_adventure_campaigns.sql`, `tools/db/test-campaign-concurrency.py` (deux connexions réelles),
paquet rejoué refusé.

Retour arrière : en-tête de la migration (rejouer les quatre fonctions de contrat de 20261123090000 et 20261124090000, supprimer
les deux fonctions publiques et les fonctions privées de campagne). Les clients reviennent alors au journal v1 dans ces trois mondes.

# Paquet de production v26 (généré) — V1.5.5 Chroniques et aventures rejouables — NON APPLIQUÉ EN PRODUCTION

> **État au 23/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations),
> v22 (V1.5.1 Gardiens), v23 (V1.5.2 Camp et conséquences), v24 (V1.5.3 Quatre mondes, quatre mécaniques) et v25 (V1.5.4
> Quêtes entre les mondes) déjà appliqués. L’application en production est une décision du propriétaire. Tant que ce paquet
> n’est pas appliqué, le Web et Android n’affichent ni chroniques ni relance (repli silencieux sur `PGRST202`) : rien ne casse.

Généré par `node tools/db/build-production-bundle.mjs --bundle v26` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` chroniques | Table `private.adventure_arc_runs` (parties 2 à 100 d’un premier arc : version de l’arc et des règles figées, voie, étapes, essais de la mécanique, issue, abandon ; une seule partie active par compte et par arc, index unique partiel). Table `private.adventure_chronicle_events` (relecture, départ, résolution, abandon ; 2 000 par compte au plus). La partie 1 n’est pas recopiée : `private.titan_adventure_chronicle_original` la lit dans les faits des arcs (récompenses 1 à 6, entrée V1.5.0, gardien V1.5.1/V1.5.3, accès V1.5.2, pistes V1.5.4). Règles versionnées `private.titan_adventure_chronicle_config` (même JSON que `js/core/adventure-chronicles.js`). `titan_adventure_chronicles_v1()` et `titan_adventure_chronicle_action_v1(world, start\|choose\|advance\|solve\|resolve\|abandon\|read\|sync, …)` pour les authentifiés. Mesure agrégée `private.titan_adventure_chronicle_metrics_v1()` (propriétaire seulement). Sections d’export `adventureRuns` et `adventureChronicleEvents` | Oui, pour un compte qui a commencé un monde : les Chroniques dans la vue Carnet (Web) et sous la carte du monde (Android), puis, une fois le premier arc achevé, « Rejouer ». XP, crédits, jours actifs, balises, récompenses, effort et registre d’effort : inchangés |

Aucun déclencheur n’est ajouté et aucune table existante n’est écrite : l’issue active dans le monde reste celle de la première
partie (accès du camp, carnet d’indices, campagne). Une partie n’avance qu’avec les séances confirmées créées et datées après son
choix, dans le registre de ce monde ; elle ne rapporte rien.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v25).
2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261127090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (ils suivent la nouvelle couche
   d’export `titan_export_extras_before_chronicles_v1`).

Empreintes mesurées sur une réplique vierge le 23 novembre 2026 : avant = état v25 attendu (identique, `private` 149,
`public` 334), après = `private` 159 fonctions, `public` 336 fonctions ; migration rejouée deux fois : empreintes identiques.
Répétitions : `sql/tests/300_adventure_chronicles.sql`, `tools/db/test-chronicle-concurrency.py` (deux connexions réelles),
paquet rejoué refusé (« migration 20261128090000 is already registered »).

Retour arrière : en-tête de la migration (supprimer les deux fonctions publiques ; restaurer `private.titan_export_extras_v1`
depuis `titan_export_extras_before_chronicles_v1`). Les clients masquent alors les chroniques sans erreur.

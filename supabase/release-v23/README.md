# Paquet de production v23 (généré) — V1.5.2 Camp et conséquences — NON APPLIQUÉ EN PRODUCTION

> **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations)
> et v22 (V1.5.1 Gardiens) déjà appliqués. L’application en production est une décision du propriétaire. Tant que ce paquet
> n’est pas appliqué, le Camp de base et la Vallée n’affichent aucun accès (repli silencieux sur `PGRST202`) : rien ne casse.

Généré par `node tools/db/build-production-bundle.mjs --bundle v23` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` conséquences | Tables privées `private.adventure_consequences` et `private.adventure_consequence_events` (RLS, aucun accès API) : découverte, tentatives, passages, versionnés. Contrat versionné `private.titan_adventure_consequence_config` (même JSON que `js/core/adventure-consequence.js`). `titan_adventure_consequences_v1()` (lecture, authentifiés) et `titan_adventure_consequence_action_v1(world, discover \| visit, marks)` sous le verrou de profil. `private.titan_adventure_consequence_metrics_v1(14)` : comptes agrégés sans identité, pour le propriétaire. Export de compte : sections `adventureConsequences` et `adventureConsequenceEvents` | Oui, pour un compte qui a résolu le Veilleur : une carte « Retour de la Vallée de l’Aube » dans le Camp de base, qui mène au belvédère (corniche : aligner deux repères du croquis, raccourci entre la clairière des lucioles et le passage du Veilleur) ou à l’archive des passeurs (ruines : rapprocher le fragment d’une gravure, salle annexe). XP, crédits, récompenses, effort, ressources et bâtiments LIVE : inchangés |

L’accès naît de l’issue canonique écrite une seule fois par la V1.5.1. Un compte sans arc pilote, un compte pilote qui n’a pas
résolu le Veilleur et un compte « legacy » (mini-boss obtenu avant la V1.5.1) ne voient aucun accès : aucune issue n’est inventée.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v22).
2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261124090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (la couche d’export V1.5.2 y est suivie).

Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v22 attendu (identique, `private` 130,
`public` 328), après = `private` 135 fonctions, `public` 330 fonctions ; migration rejouée deux fois : empreintes identiques.
Répétitions : `sql/tests/300_adventure_consequence.sql`, `tools/db/test-consequence-concurrency.py` (deux connexions réelles),
paquet rejoué refusé.

Mesure à 14 jours : `select * from private.titan_adventure_consequence_metrics_v1(14);` (SQL editor, rôle propriétaire) donne,
par issue, les comptes ayant résolu le Veilleur, ceux qui ont découvert l’accès, ceux qui l’ont emprunté, le nombre d’essais et
de passages dans les 14 jours suivant la résolution.

Retour arrière : en-tête de la migration (suppression des deux fonctions publiques, restauration de
`private.titan_export_extras_v1` depuis `titan_export_extras_before_consequence_v1`). Les clients masquent alors l’accès.

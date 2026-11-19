# Paquet de production v25 (généré) — V1.5.4 Quêtes entre les mondes — NON APPLIQUÉ EN PRODUCTION

> **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose les paquets v21 (V1.5.0 Bifurcations),
> v22 (V1.5.1 Gardiens), v23 (V1.5.2 Camp et conséquences) et v24 (V1.5.3 Quatre mondes, quatre mécaniques) déjà appliqués.
> L’application en production est une décision du propriétaire. Tant que ce paquet n’est pas appliqué, le Web et Android
> n’affichent ni carnet d’indices ni accès depuis la carte (repli silencieux sur `PGRST202`) : rien ne casse.

Généré par `node tools/db/build-production-bundle.mjs --bundle v25` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` chaînes de quêtes | Table `private.adventure_quests` (une ligne par compte et par chaîne, version figée, indice d’entrée, essais, manière, issue). Contrat versionné `private.titan_adventure_quest_config` (même JSON que `js/core/adventure-quests.js`) pour `atelier-oublie` et `feux-cote` v1. Les indices ne sont pas stockés : `private.titan_adventure_quest_fact` les lit dans l’état canonique des arcs (issue de gardien V1.5.1/V1.5.3, accès découvert V1.5.2). `titan_adventure_quests_v1()` et `titan_adventure_quest_action_v1(chain, start|link|choose|resolve, answer, manner)` pour les authentifiés. Mesure agrégée `private.titan_adventure_quest_metrics_v1()` (propriétaire seulement). Section d’export `adventureQuests` | Oui, pour un compte qui détient un indice : un carnet d’indices (origine, état, destination) dans la vue Carnet, un bouton sur la carte du monde, puis une piste facultative en quatre étapes. XP, crédits, jours actifs, balises, récompenses et effort : inchangés |

Aucun déclencheur n’est ajouté : aucune étape d’une campagne principale n’attend une chaîne. Une chaîne commencée garde sa
version et son indice d’entrée ; une version ultérieure ne peut qu’ajouter des indices (contrôle `audit()`).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v24).
2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261126090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (ils suivent la nouvelle couche
   d’export `titan_export_extras_before_quests_v1`).

Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v24 attendu (identique, `private` 142,
`public` 332), après = `private` 149 fonctions, `public` 334 fonctions ; migration rejouée deux fois : empreintes identiques.
Répétitions : `sql/tests/300_adventure_quest_chains.sql`, `tools/db/test-quest-concurrency.py` (deux connexions réelles),
paquet rejoué refusé.

Retour arrière : en-tête de la migration (supprimer les deux fonctions publiques ; restaurer `private.titan_export_extras_v1`
depuis `titan_export_extras_before_quests_v1`). Les clients masquent alors le carnet sans erreur.

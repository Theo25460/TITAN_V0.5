# Paquet de production v21 (généré) — V1.5.0 Bifurcations, arc pilote de la Vallée de l’Aube — NON APPLIQUÉ EN PRODUCTION

> **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. L’application en production est une décision du
> propriétaire (même procédure que v20). Tant que ce paquet n’est pas appliqué, le Web et Android restent sur le contrat v1 des
> rencontres (repli automatique sur `PGRST202`) et l’arc pilote ne s’affiche pas : rien ne casse.

Généré par `node tools/db/build-production-bundle.mjs --bundle v21` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` bifurcations | Table privée `private.adventure_branch_entries` (RLS, aucun accès API) : entrée explicite dans l’arc pilote `aube-arc1`, horodatée et versionnée. Contrat versionné `private.titan_adventure_branch_config` (même JSON que `js/core/adventure-branches.js`). `titan_adventure_branch_snapshot_v1` / `titan_adventure_branch_action_v1` (authentifiés) : instantané v1 + bloc `branch`, actions `enter` et `confirm` ; `start`/`sync`/`claim` délèguent à `titan_adventure_rpg_action_v1`. Déclencheur `adventure_branch_gate` : une étape d’une voie confirmée ne s’obtient que si sa condition est remplie, quel que soit le client. Export de compte : section `adventureBranches` ajoutée | Oui, dans « Rencontres secondaires » de la Vallée de l’Aube : au jalon 2, deux voies (corniche, ruines), une confirmation, puis une scène, une interaction et un indice propres à la voie. XP, crédits, jours actifs, objectifs de campagne : inchangés |

La décision réutilise le choix canonique existant (`private.adventure_encounter_rewards`, ordinal 2, choix 0 = corniche,
1 = ruines), écrit une seule fois par compte sous le verrou de profil : stable après confirmation, relu par tout autre appareil.
Une campagne qui avait déjà passé le jalon 2 garde sa version d’origine (`legacy`).

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v20, appliqué le 18 novembre 2026).
2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261122090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (la couche d’export V1.5.0 y est suivie).

Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v20 attendu (identique, `private` 120,
`public` 324), après = `private` 125 fonctions, `public` 326 fonctions.
Répétitions : `sql/tests/300_adventure_branches.sql`, `tools/db/test-branch-concurrency.py` (deux connexions réelles).

Retour arrière : en-tête de la migration (`drop trigger adventure_branch_gate`, suppression des deux fonctions publiques,
restauration de `private.titan_export_extras_v1` depuis `titan_export_extras_before_branches_v1`). Les clients repassent seuls
sur le contrat v1.

# Paquet de production v22 (généré) — V1.5.1 Gardiens, le Veilleur de pierre de l’arc pilote — NON APPLIQUÉ EN PRODUCTION

> **État au 19/11/2026** : préparé et répété sur une réplique vierge seulement. Il suppose le paquet v21 (V1.5.0 Bifurcations)
> déjà appliqué. L’application en production est une décision du propriétaire. Tant que ce paquet n’est pas appliqué, le Web et
> Android restent sur le contrat V1.5.0 (repli automatique sur `PGRST202`) et le Veilleur garde le parcours v1 : rien ne casse.

Généré par `node tools/db/build-production-bundle.mjs --bundle v22` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
`tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.

| Fichier | Effet | Visible pour les joueurs ? |
|---|---|---|
| `01` gardiens | Table privée `private.adventure_guardian_encounters` (RLS, aucun accès API) : préparation, tentatives, issue, versionnées. Contrat versionné `private.titan_adventure_guardian_config` (même JSON que `js/core/adventure-guardian.js`). `titan_adventure_guardian_snapshot_v1` / `titan_adventure_guardian_action_v1` (authentifiés) : instantané V1.5.0 + bloc `guardian`, actions `prepare` et `resolve` ; les autres actions délèguent à `titan_adventure_branch_action_v1`. Déclencheur `adventure_guardian_gate` : la récompense du jalon 6 d’une voie pilote confirmée exige une issue enregistrée, quel que soit le client. Export de compte : section `adventureGuardians` ajoutée | Oui, dans « Rencontres secondaires » de la Vallée de l’Aube, après l’indice : observer le Veilleur (jalon 5), associer l’indice à un signe, puis rouvrir le passage (corniche) ou restituer le serment (ruines). XP, crédits, jours actifs, objectifs de campagne : inchangés |

Les transitions sportives sont les seuils figés du moteur des rencontres (jalon 5 : 5 × cible, 3 jours actifs, chapitre 3 ;
jalon 6 : 6 × cible, 3 jours, chapitre 3), identiques pour les deux voies. L’issue est écrite une seule fois par compte, sous le
verrou de profil, à partir de l’indice enregistré par le serveur.

## Procédure

1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v21).
2. `01-…` (garde d’ordre : refusé s’il est rejoué ou si `20261123090000` manque).
3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131 (la couche d’export V1.5.1 y est suivie).

Empreintes mesurées sur une réplique vierge le 19 novembre 2026 : avant = état v21 attendu (identique, `private` 125,
`public` 326), après = `private` 130 fonctions, `public` 328 fonctions. Répétitions : `sql/tests/300_adventure_guardian.sql`,
`tools/db/test-guardian-concurrency.py` (deux connexions réelles), paquet rejoué refusé.

Retour arrière : en-tête de la migration (`drop trigger adventure_guardian_gate`, suppression des deux fonctions publiques,
restauration de `private.titan_export_extras_v1` depuis `titan_export_extras_before_guardian_v1`). Les clients repassent seuls
sur le contrat V1.5.0.

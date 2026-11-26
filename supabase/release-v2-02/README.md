# Paquet canonique v2-02 — Centre des sources connectées (V1.6.5) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-02` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → **v2-02** → v2-03 → v2-04 → v2-05 → v2-06 → v2-07 → v2-08. Ce paquet suppose : private.titan_import_batches (V1.6.4); applied after V1.6.6 so that the two forks of the journal end in one state.

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130100500_source_center.sql` | V1.6.5 | `20261124090000_source_center.sql` (paquet release-v24 (fourche A)) | `29424d8f0ea0f73f2e9488ac0d949f3b5d37ff6e` | identique octet pour octet |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130100400`) : `private` 130 fonctions, droits `6588576b84de`, corps `263683b3f84f` ; `public` 332 fonctions, droits `fb59f2b689b9`, corps `dca2a744f579`.
2. Les fichiers `01-…` à `01-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 135 fonctions, droits `38ff555d0594`, corps `601edce5534a` ; `public` 334 fonctions, droits `17bc75638e34`, corps `78eb242f18ca`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### V1.6.5 — `supabase/release-v24/README.md` au SHA `29424d8f0ea0f73f2e9488ac0d949f3b5d37ff6e`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v24 (généré) — V1.6.5 Centre des sources connectées — NON APPLIQUÉ
>
> Généré par `node tools/db/build-production-bundle.mjs --bundle v24` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. **Décision du propriétaire requise avant application.**
> **Prérequis : les paquets v21 (V1.6.2), v22 (V1.6.3) et v23 (V1.6.4) appliqués.**
>
> Contenu : une migration additive. Une table privée (`private.titan_source_runs`), une colonne nullable sur
> `private.titan_source_consents` (`revoked_by`, remplie par un déclencheur), aucun droit sur une table, aucune ligne existante modifiée.
> Les règles d'import (une seule fois par source et identifiant, aucune séance du journal réécrite), d'XP et de récompense ne changent pas.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` centre des sources | `titan_source_run_v1` (le téléphone ouvre puis ferme une lecture Santé Connect ; refusée après un retrait, sauf l'enregistrement du refus), `titan_source_center_v1` (consentement et qui l'a retiré, compteurs, sports et champs reçus, liaison Garmin, 10 dernières lectures, dernier lot d'historique). `titan_garmin_ingest_v1` garde, par compte et par jour, ce que chaque envoi Garmin a importé, rattaché, trouvé déjà importé ou ignoré (avec le motif déjà rendu) ; `titan_garmin_deregister_v1` marque le retrait comme venant de Garmin | Oui : « Centre des sources » du profil Web et écran « Sources et capteurs » d'Android |
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true` (état de fin du paquet v23, tête `20261123150000`).
> 2. `01-…sql` (garde d'ordre : refusé s'il est rejoué ou si `20261123150000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true` (`private 134 a169f5d6f104 cab0356b841d`, `public 334 17bc75638e34 b7cb2e7aff2e`),
>    puis les postflights v11, v13 et v131.
>
> Empreintes mesurées le 23 novembre 2026 sur une réplique vierge construite depuis le dépôt jusqu'à `20261123150000` : avant = état v23
> attendu (identique) ; le fichier `01` appliqué sur cette réplique donne l'état « après » ; un second passage est refusé.
> Répétition : `pnpm run test:db` (toutes migrations, `sql/tests/300_source_center.sql`).
>
> Ordre de déploiement : appliquer ce paquet **avant** de publier le site et l'application qui appellent ces fonctions. Sans lui, le
> centre affiche l'état déjà connu (`titan_sources_v1`) avec « Le suivi des synchronisations n'est pas encore ouvert sur le serveur »,
> et rien d'autre ne change.
>
> Retour arrière : en-tête de `supabase/migrations/20261124090000_source_center.sql`.

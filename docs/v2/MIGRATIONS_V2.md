# TITAN V2.0 — Séquence canonique des migrations futures (mission A2)

Établie le 26/11/2026 sur la branche d'intégration. Source de vérité : [`tools/db/v2-canonical.mjs`](../../tools/db/v2-canonical.mjs) ;
registre généré : [`tools/db/v2-migration-map.json`](../../tools/db/v2-migration-map.json) ; empreintes :
[`tools/db/v2-fingerprints.json`](../../tools/db/v2-fingerprints.json). **Aucune de ces migrations n'est appliquée en production** ;
aucune ne doit l'être sans l'accord explicite du propriétaire, une sauvegarde préalable et la recette A3.

## 1. Point de départ réel (pas de supposition)

- Registre de production (lu en lecture seule par A1 le 26/11) : **141 migrations, tête `20261122090000`**, identique aux 141 fichiers de `main` `0dae9af`.
- Aucune migration des lots V1.5 à V1.9 ni du partage n'y figure. Le test `tests/v2-migration-map.test.mjs` vérifie qu'aucun des 141
  fichiers appliqués n'a changé (blob git identique à `main`, et dans l'arbre de travail).
- `tools/db/production-head.txt` reste `20261122090000` : A2 ne publie rien.

## 2. Collisions constatées et résolution

| Problème (constaté dans les branches) | Résolution A2 |
|---|---|
| `20261123090000` : V1.5.0 et V1.6.2 | V1.6.2 → `20261130100100`, V1.5.0 → `20261130103100` |
| `20261124090000` : V1.5.1, V1.6.5, V1.8.1 (triple) | `20261130103200`, `20261130100500`, `20261130104100` |
| `20261125090000` à `20261128090000` : V1.5.2–.5 et V1.8.2–.5 | RPG `20261130103300` à `20261130103600`, coopération `20261130104200` à `20261130104500` |
| Paquets `release-v21` à `v26` revendiqués par 2 ou 3 chaînes, `release-v24` en 4 variantes, `release-v191`–`196`, `release-partage` | remplacés par **8 paquets uniques** `release-v2-01` à `release-v2-08` |
| Chaque `00-check-before.sql` figé sur l'état v20 | empreintes chaînées remesurées sur réplique (le premier paquet attend exactement l'état v20) |
| `private.titan_export_extras_v1` : réécrite en entier par V1.7.7 et 5 fois par V1.9, enveloppée par V1.5 | ordre prouvé ci-dessous + V1.7.7 convertie en enveloppe ; garde finale v2-08 |

**Règle des versions.** Toutes les anciennes versions des lots finissent par `0000` (`HH0000`). Toutes les versions canoniques ont des
minutes non nulles (`20261130HHMM00`, `MM ≠ 00`) : une base où un paquet de lot aurait été essayé ne peut jamais prendre une ancienne
migration pour une migration canonique (le garde de chaque fichier refuserait). Les versions sont uniques, supérieures à la tête de
production et strictement croissantes dans l'ordre des paquets (test `v2-migration-map`).

**Corps des migrations.** Chaque fichier canonique est le fichier du lot **octet pour octet** (somme SHA-256 au SHA épinglé du lot),
sauf deux cas déclarés dans le registre : la section export de V1.7.7 (enveloppe au lieu de réécriture) et la migration de consolidation
écrite par A2. Les commentaires internes des migrations citent encore les **anciennes** versions : ils ne sont pas réécrits, pour
garder l'empreinte du lot ; la correspondance est dans le tableau du § 4.

## 3. Ordre prouvé (DAG des objets SQL)

La matrice objet × migration × branche d'A1 (`integration-manifest.json › migrations.cumulative_functions`, 37 fonctions) montre une
seule fonction redéfinie par plusieurs chaînes : `private.titan_export_extras_v1`. Toutes les autres redéfinitions restent internes à
une chaîne (journal, coopération, coaching, RPG) ou ne touchent que `main`. Contraintes :

1. **Journal** : `session_match_review` → `history_reconcile` → `history_migration` → `journal_long_duration` (ordre interne du lot).
2. **Centre des sources** (fourche A) : exige `private.titan_import_batches` (V1.6.4) ; placé après V1.6.6 pour que les deux fourches
   finissent dans un seul état (les 3 migrations communes sont identiques octet pour octet dans les deux fourches).
3. **Coaching** : chaque migration V1.9 **réécrit la couche haute** de l'export (clés de `main` + clés coach). Elle doit donc précéder
   toute enveloppe, sinon elle effacerait les sections enveloppées.
4. **GPS** : la réécriture complète du lot (clés de `main` + `routes` + `places`) aurait effacé les clés coach ; elle est convertie en
   enveloppe (`titan_export_extras_before_gps_v1`), mêmes clés et mêmes valeurs.
5. **RPG** : cinq enveloppes successives (`before_branches` … `before_chronicles`), après toutes les réécritures.
6. **Coopération** : `private.titan_social_export_v1`, `public.titan_cordees_v1`, `public.titan_social_digest_v1` sont propres à V1.8 ;
   la dernière définition de V1.8.6 contient toutes les sections de la dernière définition de `main` (`20261120110000_grande_cordee`) et
   ajoute les 7 sections V1.8 (vérifié par différence des clés puis sur la réplique).
7. **Partage** : `private.titan_analytics_payload_valid_v300` seul, sans dépendance aux lots.
8. **Consolidation** (A2) : enveloppe finale de l'export (lots d'import V1.6.4, synchronisations V1.6.5) et garde.

L'ordre Git des fusions (SEO, V1.7.7, V1.6.5, V1.9.6, V1.5.5, V1.8.6, partage, AdMob, assetlinks) n'impose rien à l'ordre SQL : la
séquence SQL est celle des paquets ci-dessous.

## 4. Correspondance ancien SHA / nom → nouveau fichier / version

| Paquet | Lot | Ancien fichier | Ancien paquet | SHA du lot | Nouveau fichier | Corps | SHA-256 (12) |
|---|---|---|---|---|---|---|---|
| v2-01 | V1.6.2 | `20261123090000_session_match_review.sql` | release-v21 | `18c062b0ce` | `20261130100100_session_match_review.sql` | identique | `a81dd7c8f619` |
| v2-01 | V1.6.3 | `20261123120000_history_reconcile.sql` | release-v22 | `1e684f1c3d` | `20261130100200_history_reconcile.sql` | identique | `ca9ff59454c7` |
| v2-01 | V1.6.4 | `20261123150000_history_migration.sql` | release-v23 | `0730d3c0fe` | `20261130100300_history_migration.sql` | identique | `a41ca91b01ba` |
| v2-01 | V1.6.6 | `20261123180000_journal_long_duration.sql` | release-v24 (fourche B) | `897b731620` | `20261130100400_journal_long_duration.sql` | identique | `03cd5e4ca2ff` |
| v2-02 | V1.6.5 | `20261124090000_source_center.sql` | release-v24 (fourche A) | `29424d8f0e` | `20261130100500_source_center.sql` | identique | `9358245a1512` |
| v2-03 | V1.9.1 | `20261201090000_coach_assignment_followup.sql` | release-v191 | `3b834eb479` | `20261130101100_coach_assignment_followup.sql` | identique | `0c1d581f65d3` |
| v2-03 | V1.9.2 | `20261202090000_coach_session_feedback.sql` | release-v192 | `88e7601fca` | `20261130101200_coach_session_feedback.sql` | identique | `fde9df0993f8` |
| v2-03 | V1.9.3 | `20261203090000_coach_weekly_review.sql` | release-v193 | `45c176ac69` | `20261130101300_coach_weekly_review.sql` | identique | `ad3ca66a09f8` |
| v2-03 | V1.9.4 | `20261204090000_coach_programs.sql` | release-v194 | `1cdfba736d` | `20261130101400_coach_programs.sql` | identique | `3bd4090ac8e8` |
| v2-03 | V1.9.5 | `20261205090000_coach_cycle_reports.sql` | release-v195 | `1d1ca059be` | `20261130101500_coach_cycle_reports.sql` | identique | `ff577f20bb56` |
| v2-03 | V1.9.6 | `20261206090000_coach_groups.sql` | release-v196 | `3229bdcecc` | `20261130101600_coach_groups.sql` | identique | `2ae5f9ef4d6c` |
| v2-04 | V1.7.7 | `20261125170000_gps_navigation.sql` | release-v25 | `52a209bdbb` | `20261130102100_gps_navigation.sql` | modifiée (déclarée) | `a6f0012e87e1` |
| v2-05 | V1.5.0 | `20261123090000_adventure_branches_v1.sql` | release-v21 | `1933f36dff` | `20261130103100_adventure_branches_v1.sql` | identique | `6ff7cb3a95eb` |
| v2-05 | V1.5.1 | `20261124090000_adventure_guardian_v1.sql` | release-v22 | `f27a635e7d` | `20261130103200_adventure_guardian_v1.sql` | identique | `5da164f151b6` |
| v2-05 | V1.5.2 | `20261125090000_adventure_consequence_v1.sql` | release-v23 | `e48cf1d6eb` | `20261130103300_adventure_consequence_v1.sql` | identique | `5f2f1e516ee8` |
| v2-05 | V1.5.3 | `20261126090000_adventure_campaigns_v1.sql` | release-v24 | `c9eed983c6` | `20261130103400_adventure_campaigns_v1.sql` | identique | `7160112924e0` |
| v2-05 | V1.5.4 | `20261127090000_adventure_quest_chains_v1.sql` | release-v25 | `721cc47ce9` | `20261130103500_adventure_quest_chains_v1.sql` | identique | `0608f2531a56` |
| v2-05 | V1.5.5 | `20261128090000_adventure_chronicles_v1.sql` | release-v26 | `52e83b2428` | `20261130103600_adventure_chronicles_v1.sql` | identique | `301467bec121` |
| v2-06 | V1.8.1 | `20261124090000_cordee_relay.sql` | release-v21 | `caaa302f86` | `20261130104100_cordee_relay.sql` | identique | `53258dceb7ac` |
| v2-06 | V1.8.2 | `20261125090000_cordee_reprise.sql` | release-v22 | `ade9ae1954` | `20261130104200_cordee_reprise.sql` | identique | `b7c9ab1066f7` |
| v2-06 | V1.8.3 | `20261126090000_cordee_suite.sql` | release-v23 | `a12beb4d88` | `20261130104300_cordee_suite.sql` | identique | `96efc3b62231` |
| v2-06 | V1.8.4 | `20261127090000_club_season.sql` | release-v24 | `f546cafc22` | `20261130104400_club_season.sql` | identique | `48b517ed3908` |
| v2-06 | V1.8.5 | `20261128090000_club_match.sql` | release-v25 | `a799bfe3a0` | `20261130104500_club_match.sql` | identique | `2e7754c2d5ab` |
| v2-06 | V1.8.6 | `20261129090000_club_agenda.sql` | release-v26 | `c7e0223ffa` | `20261130104600_club_agenda.sql` | identique | `b7c5e7a7fc6f` |
| v2-07 | T1 | `20261126120000_analytics_share_story.sql` | release-partage | `e767d523da` | `20261130105100_analytics_share_story.sql` | identique | `636fa5229110` |
| v2-08 | A2 | — (A2) | — | — | `20261130105900_v2_consolidation.sql` | nouvelle (A2) | `ed82821531f8` |
## 5. Paquets canoniques

Chaque paquet : `00-check-before.sql` (lecture seule, empreintes attendues), `01-…` à `NN-…` (une transaction gardée par migration :
refusée si rejouée ou si la précédente manque ; le corps du dépôt est inclus octet pour octet ; inscription au registre),
`99-check-after.sql`, puis les postflights historiques v11, v13, v131. README généré, avec le README d'origine de chaque paquet de lot
recopié sans modification (aucune note, effet ni retour arrière perdu).

| Paquet | Contenu | Migrations | Registre | Empreinte après (fonctions, droits/corps) |
|---|---|---|---|---|
| `release-v2-01` | Journal et imports (V1.6.2, V1.6.3, V1.6.4, V1.6.6) | 4 | `20261122090000` → `20261130100400` | private 130 `6588576b84de`/`263683b3f84f` · public 332 `fb59f2b689b9`/`dca2a744f579` |
| `release-v2-02` | Centre des sources connectées (V1.6.5) | 1 | `20261130100400` → `20261130100500` | private 135 `38ff555d0594`/`601edce5534a` · public 334 `17bc75638e34`/`78eb242f18ca` |
| `release-v2-03` | Coaching (V1.9.1 à V1.9.6) | 6 | `20261130100500` → `20261130101600` | private 169 `67dccdf1dcdb`/`a631bc6e97e4` · public 340 `ff46799cf702`/`14ca24343e11` |
| `release-v2-04` | GPS et navigation sportive (V1.7.7) | 1 | `20261130101600` → `20261130102100` | private 172 `b8688897b9d4`/`3ea4527e4347` · public 349 `83b7ea4975a1`/`6c770c056d27` |
| `release-v2-05` | Refonte RPG (V1.5.0 à V1.5.5) | 6 | `20261130102100` → `20261130103600` | private 211 `5fd34db4c64f`/`40ecab77ebf0` · public 361 `6c7c5a9dda1f`/`19863d8fcd1c` |
| `release-v2-06` | Coopération (V1.8.1 à V1.8.6) | 6 | `20261130103600` → `20261130104600` | private 266 `a9ee695b702f`/`780bbc26238b` · public 372 `1c3d2fef1a19`/`4cd6fcef9a64` |
| `release-v2-07` | Partage en image (Avant V2 — partage et communauté) | 1 | `20261130104600` → `20261130105100` | private 266 `a9ee695b702f`/`2c56e59a3be0` · public 372 `1c3d2fef1a19`/`4cd6fcef9a64` |
| `release-v2-08` | Consolidation V2.0 (export complet, hygiène des droits, garde finale) | 1 | `20261130105100` → `20261130105900` | private 267 `0aeffa8d0135`/`ebb8cdcf2f31` · public 372 `1c3d2fef1a19`/`4cd6fcef9a64` |
Validation de l'outil de mesure : à la tête de production, l'empreinte mesurée est **identique** à l'état attendu de v20
(`private` 120 `0c180d72fbc0`/`d8ef8377869f`, `public` 324 `39442f678587`/`81ad6534245e`) ; après v2-01, elle est identique à celle que
le lot V1.6.6 avait mesurée pour son propre paquet (`private` 130 `6588576b84de`, `public` 332 `fb59f2b689b9`).

## 6. Scripts et tests

| Commande | Rôle |
|---|---|
| `node tools/db/v2-canonical.mjs apply` | renomme les fichiers de lots présents et réécrit les références (tests, docs, commentaires JS), idempotent ; refuse une référence ambiguë |
| `bash tools/db/measure-v2-fingerprints.sh` | mesure les empreintes sur base jetable (tête de production puis fin de chaque paquet) |
| `node tools/db/v2-canonical.mjs build` | génère les paquets (`build-production-bundle.mjs`), les README et le registre |
| `pnpm run test:db` | base jetable **vierge** : toutes les migrations, tous les tests SQL `sql/tests/300_*`, les postflights, les contrats de concurrence (deux connexions réelles) |
| `bash tools/db/v2-replica-rehearsal.sh` | **réplique synthétique** de l'état actuel (voir § 7) |
| `node --test tests/v2-migration-map.test.mjs tests/production-bundle.test.mjs` | invariants du registre et des paquets |

## 7. Répétitions

- **Base vierge** (`test:db`) : verte après chaque fusion et sur la tête candidate.
- **Réplique synthétique de production** (`v2-replica-rehearsal.sh`) : base à la tête `20261122090000`, registre de 141 migrations,
  4 comptes synthétiques (dont un coach) semés dans 114 tables (877 lignes : journal, imports, sources, parcours, RPG, LIVE, économie,
  droits, coaching, amis, clubs, cordées, notes privées) + un lien coach accepté avec consentement par la vraie RPC. Puis : les 8 paquets
  fichier par fichier (00 tout vrai, 99 tout vrai), postflights v11 (toutes les lignes bloquantes vraies), v13 (42), v131 (54) ; rejeu de
  chaque fichier refusé sans aucun changement ; **aucune ligne perdue ni modifiée** dans les tables existantes (somme de contrôle sur
  les colonnes d'origine) ; **chaque clé et valeur d'export** des 4 comptes conservée, 22 nouvelles clés ; **chaque fonction publique
  existante** garde arguments, résultat, sécurité et droits (ancien client / nouveau serveur) ; nouvelles fonctions publiques fermées à
  `anon` ; toutes les fonctions `SECURITY DEFINER` fixent leur `search_path` ; 18 nouvelles tables avec RLS et sans droit direct ;
  refus IDOR d'un compte non lié et d'`anon` sur le lien coach ; aucun drapeau de lot ouvert. Résultat : **94 contrôles, 0 échec**.

Écarts trouvés par la réplique et corrigés :
- `postflight-v13` (« export:journey and predecessor ») et `postflight-v11` (« export:RPG conservé ») suivaient une liste figée de
  couches d'export : remplacés par un parcours récursif des couches réellement appelées (même invariant ; les cas de sabotage de
  `test-v11-gates.py` des lots et un nouveau cas GPS restent rouges comme attendu).
- `postflight-v131` (« import dedupe ») lisait le texte de `private.titan_import_core` ; V1.6.2 et V1.6.4 ont déplacé la même règle
  dans `private.titan_session_shared_minutes`, appelée par le cœur à huit arguments : le contrôle suit l'appel, avec les mêmes
  exigences (`search_path` vide, fermé aux rôles de l'API).
- La fonction trigger V1.6.5 gardait le droit `EXECUTE` par défaut : retiré par v2-08.
- Les lots d'import (V1.6.4) et les synchronisations des sources (V1.6.5) n'étaient pas dans l'export de compte : ajoutés par v2-08.

## 8. Retour arrière et points de restauration

- Tags locaux `a2/rp-00` (départ A1) à `a2/rp-10`, un par fusion (non poussés sans accord).
- Production Web inchangée (déploiement `6afec02`), base inchangée (`20261122090000`).
- Un retour arrière de migration se fait paquet par paquet, dans l'ordre inverse, avec l'en-tête « Rollback » de chaque fichier ; les
  enveloppes d'export se retirent dans l'ordre inverse.

## Annexe — Notes des définitions de paquets des lots (build-production-bundle.mjs)

Commentaires d'origine des entrées `BUNDLES` des lots, remplacées par les entrées canoniques ; recopiés pour ne perdre aucune
indication d'exploitation (drapeaux à ouvrir, prérequis, répétitions).

```js
// ---- J-GPS
  // V1.6.2 — Rapprochement des séances (23 November 2026): a link keeps what the source said, the rule and why it is uncertain; the
  // athlete's reversible decision (split / rejoin) is journaled on the import row; a replayed import keeps the decision. NOT APPLIED:
  // owner's approval required. Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_session_match_review.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.6.3 — Contrôle et réconciliation (23 November 2026): the owner reads what a correction, an archive or a restore changed
  // (titan_session_changes_v1, from training_revisions); the journal restore of a session a V1.6.2 rejoin archived is refused
  // (« Séparer » restores it), so the same effort never counts twice. NOT APPLIED: owner's approval required. Requires v21.
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_history_reconcile.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // row the server expects, a per-batch report, and the withdrawal of only the untouched sessions a batch added (preview first).
  // NOT APPLIED: owner's approval required. Requires v22. Additive, rehearsed on a replica (tools/db/test-migrations.sh,
  // sql/tests/300_history_migration.sql, tools/db/test-history-migration.mjs: 5 000 rows).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.6.6 — Journal longue durée (23 November 2026): the elevation of a session can be corrected (one revision, one snapshot) and the
  // change list names it. The long journal itself (paged reading by key, refresh by manifest, coverage) needs no schema change.
  // NOT APPLIED: owner's approval required. Requires v23. Rehearsed on a replica (tools/db/test-migrations.sh,
  // sql/tests/300_journal_long_duration.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.7.7 — GPS et navigation sportive (25 November 2026): the route library gains a name, an origin and the digest of the GPS
  // engine (titan_route_save_v2 through v1, titan_routes_v2, titan_route_get_v2, titan_route_rename_v1); personal points
  // (private.titan_places, 300 per account, private by construction); the per-account quotas of the route-plan and poi-nearby
  // Netlify functions; points and the new route columns in the account export. NOT APPLIED: owner's approval required. Requires v24.
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_gps_navigation.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
// ---- V1.6.5
  // V1.6.2 — Rapprochement des séances (23 November 2026): a link keeps what the source said, the rule and why it is uncertain; the
  // athlete's reversible decision (split / rejoin) is journaled on the import row; a replayed import keeps the decision. NOT APPLIED:
  // owner's approval required. Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_session_match_review.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.6.3 — Contrôle et réconciliation (23 November 2026): the owner reads what a correction, an archive or a restore changed
  // (titan_session_changes_v1, from training_revisions); the journal restore of a session a V1.6.2 rejoin archived is refused
  // (« Séparer » restores it), so the same effort never counts twice. NOT APPLIED: owner's approval required. Requires v21.
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_history_reconcile.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // row the server expects, a per-batch report, and the withdrawal of only the untouched sessions a batch added (preview first).
  // NOT APPLIED: owner's approval required. Requires v22. Additive, rehearsed on a replica (tools/db/test-migrations.sh,
  // sql/tests/300_history_migration.sql, tools/db/test-history-migration.mjs: 5 000 rows).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.6.5 — Centre des sources connectées (24 November 2026): who withdrew a consent (athlete or provider), one row per
  // synchronisation run (Santé Connect reported by the phone, Garmin push kept per day with its ignored reasons), a read after
  // withdrawal refused, and the center read by its owner. NOT APPLIED: owner's approval required. Requires v23. Additive, rehearsed
  // on a replica (tools/db/test-migrations.sh, sql/tests/300_source_center.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
// ---- V1.9
  // V1.9.1 — Une séance assignée (24 November 2026): coach proposals become followable (states, short queue, change kept beside the
  // accepted version, suggested match confirmed by the athlete, refused double links logged), behind screens.coach_followup (absent =
  // closed). NOT APPLIED: owner decision required. Built on main (head 20261122090000, end of v20): the V1.8 bundles v21 to v26 live on
  // their own branches; if they are applied first, regenerate this bundle after them (its guard and fingerprints change). Additive,
  // rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_coach_followup.sql, tools/db/test-coach-followup-concurrency.sh).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.coach_followup for the pilot accounts only.",
  // V1.9.2 — Retour sur la séance (24 November 2026): a coach feedback tied to the proposal and to the session it is about (observation in
  // the link's thread, measures projected at every read through the link's current contract, never copied), an adjustment the athlete
  // accepts or declines and that is carried into the next proposal, behind screens.coach_feedback (absent = closed). NOT APPLIED: owner
  // decision required. Needs v191 first (it extends the V1.9.1 follow-up and its history). Additive, rehearsed on a replica
  // (tools/db/test-migrations.sh, sql/tests/300_coach_feedback.sql).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.coach_feedback for the pilot accounts only, once screens.coach_followup is open for them.",
  // V1.9.3 — Revue de suivi (25 November 2026): the coach's weekly review (for each athlete the case, the next action and its source; the
  // next proposal prepared from a template, previewed, resumed after an interruption and sent once by the coach), behind
  // screens.coach_review (absent = closed). NOT APPLIED: owner decision required. Needs v191 and v192 first (it reads the V1.9.1 rows and
  // the V1.9.2 feedback). Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_coach_review.sql,
  // tools/db/test-coach-review-concurrency.sh).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.coach_review for the pilot accounts only, once screens.coach_followup and screens.coach_feedback are open for them.",
  // V1.9.4 — Programmation multi-semaines (25 November 2026): the coach's versioned multi-week templates, adapted for one athlete (draft
  // previewed against its starting point, duplicated from another athlete's programme), sent once as ordinary proposals, answered session by
  // session (accept, decline, to discuss), revised by occurrence, week or rest of the cycle with a preview and an op_id (done sessions kept,
  // accepted ones get a change beside the accepted version), closed with an immutable version, behind screens.coach_programs (absent =
  // closed). NOT APPLIED: owner decision required. Needs v191, v192 and v193 first (it re-applies the V1.9.1 row and the V1.9.3 export).
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_coach_programs.sql, tools/db/test-coach-program-concurrency.sh).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.coach_programs for the pilot accounts only, once screens.coach_followup, screens.coach_feedback and screens.coach_review are open for them.",
  // V1.9.5 — Bilans de cycle partageables (25 November 2026): the report of a V1.9.4 cycle (figures computed at every read with their period
  // and sources, observations tied to source sessions, decisions), a draft the athlete never sees, a dedicated validation by the athlete
  // (measures, notes and check-ins ticked one by one, decisions approved or not, a file allowed or not) that publishes an immutable version,
  // retractions deleted from every stored version, withdrawal of the hosted version, a new validation when the sharing scope changes, an
  // export of the authorised fields with its log, and the next cycle from the approved decisions with its origin, behind
  // screens.coach_cycle_report (absent = closed). NOT APPLIED: owner decision required. Needs v191 to v194 first (it reads the V1.9.4
  // programmes and re-applies their row and the V1.9.4 export). Additive, rehearsed on a replica (tools/db/test-migrations.sh,
  // sql/tests/300_coach_cycle_reports.sql, tools/db/test-coach-cycle-concurrency.sh).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.coach_cycle_report for the pilot accounts only, once screens.coach_followup, screens.coach_feedback, screens.coach_review and screens.coach_programs are open for them.",
  // V1.9.6 — Suivi collectif individualisé (26 November 2026): private groups of a coach's own links, a block prepared from a template with
  // a variant per athlete, the preview of who receives which version (and who does not, with the reason), a send that treats each
  // recipient in its own sub-transaction (paused and ended links refused separately), a resumption that never repeats a recipient already
  // served, a group review with the next action per athlete and the coach's load (counts only), the export of the coach's groups, behind
  // screens.coach_groups (absent = closed). NOT APPLIED: owner decision required. Needs v191 to v195 first (it creates V1.9.4 programmes and
  // wraps the V1.9.5 export). Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_coach_groups.sql,
  // tools/db/test-coach-group-concurrency.sh).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.coach_groups for the pilot accounts only, once screens.coach_followup, screens.coach_feedback, screens.coach_review, screens.coach_programs and screens.coach_cycle_report are open for them.",
// ---- V1.5
  // V1.5.1 Gardiens (19 November 2026): the Veilleur de pierre observed, prepared and resolved at the end of the V1.5.0 pilot arc.
  // NOT applied in production; needs v21 first. Additive, rehearsed on a replica (sql/tests/300_adventure_guardian.sql,
  // tools/db/test-guardian-concurrency.py).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.5.2 Camp et conséquences (19 November 2026): the Veilleur's canonical outcome becomes a lasting access in the Vallée, linked
  // from the Camp de base. NOT applied in production; needs v21 and v22 first. Additive, rehearsed on a replica
  // (sql/tests/300_adventure_consequence.sql, tools/db/test-consequence-concurrency.py).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.5.3 Quatre mondes, quatre mécaniques (19 November 2026): the common campaign configuration gives the Marées, the Forge and
  // the Aurores a first arc on the V1.5.0/V1.5.1 engine, each with its own mechanic. NOT applied in production; needs v21, v22 and
  // v23 first. Additive, rehearsed on a replica (sql/tests/300_adventure_campaigns.sql, tools/db/test-campaign-concurrency.py).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.5.4 Quêtes entre les mondes (19 November 2026): two optional chains between worlds opened by clues read from the canonical
  // state of the existing arcs, a notebook of clues. NOT applied in production; needs v21, v22, v23 and v24 first. Additive,
  // rehearsed on a replica (sql/tests/300_adventure_quest_chains.sql, tools/db/test-quest-concurrency.py).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
  // V1.5.5 Chroniques et aventures rejouables (23 November 2026): the chronicle of each world's first arc (run 1 read from the facts
  // of the arcs, nothing copied) and new runs of an arc already achieved, one active per arc, earning nothing. NOT applied in
  // production; needs v21 to v25 first. Additive, rehearsed on a replica (sql/tests/300_adventure_chronicles.sql,
  // tools/db/test-chronicle-concurrency.py).
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
// ---- V1.8
  // V1.8.1 — Relais de cordée (24 November 2026): one relay step on the pilot route « Les crêtes de l’Aube », behind the server flag
  // screens.cordee_relay (absent = closed). NOT APPLIED: owner decision required. Additive, rehearsed on a replica (tools/db/test-migrations.sh,
  // sql/tests/300_cordee_relay.sql, tools/db/test-cordee-relay-concurrency.sh). Fingerprints measured on a replica built from the repository.
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.cordee_relay for the pilot accounts only.",
  // V1.8.2 — Reprise et relais facultatifs (24 November 2026): optional hold and voluntary handover of the relay, departures that keep the
  // longueurs brought before leaving, behind the server flag screens.cordee_reprise (absent = closed). NOT APPLIED: owner decision required,
  // after v21. Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_cordee_reprise.sql,
  // tools/db/test-cordee-reprise-concurrency.sh). Fingerprints measured on a replica built from the repository.
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.cordee_reprise for the pilot accounts only, after screens.cordee_relay.",
  // V1.8.3 — Un groupe qui se retrouve (24 November 2026): a group that finished a cordée proposes a new private route and sets off again
  // with the members who accept, behind the server flag screens.cordee_suite (absent = closed). NOT APPLIED: owner decision required, after
  // v22. Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_cordee_suite.sql, tools/db/test-cordee-suite-concurrency.sh).
  // Fingerprints measured on a replica built from the repository.
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.cordee_suite for the pilot accounts only, where screens.cordee is open.",
  // V1.8.4 — Saisons privées de club (24 November 2026): a club administrator runs a private season with three stages, explicit and
  // revocable participation, active days from confirmed sessions with an individual cap, aggregates from 3 participants and a frozen
  // private report, behind the server flag screens.club_season (absent = closed). NOT APPLIED: owner decision required, after v23.
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_club_season.sql, tools/db/test-club-season-concurrency.sh).
  // Fingerprints measured on a replica built from the repository.
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.club_season for the pilot clubs' accounts only.",
  // V1.8.5 — Rencontres entre clubs (24 November 2026): a private one- or two-week meeting between two clubs, proposed by an organiser
  // and accepted by another club's organiser with a one-time code, explicit participation, a capped share per person, a rate per club
  // from 3 participants, scores as of the last midnight, cooperation first (screens.club_match) and the comparative format behind its
  // own closed flag (screens.club_match_versus). NOT APPLIED: owner decision required, after v24.
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_club_match.sql, tools/db/test-club-match-concurrency.sh).
  // Fingerprints measured on a replica built from the repository.
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.club_match for the pilot clubs' accounts only; leave screens.club_match_versus closed.",
  // V1.8.6 — Agenda et rendez-vous d’équipe (24 November 2026): a club's private agenda, one-off or weekly meetings kept at their Paris
  // time, a fallback plan, an optional capacity with a waiting list, answers, a clear history of moves and cancellations, an invitation
  // link that reveals nothing once expired or to a former member, and a finished card where each member may declare a presence and link
  // one of their own confirmed sessions (the journal is never written), behind the server flag screens.club_agenda (absent = closed).
  // NOT APPLIED: owner decision required, after v25.
  // Additive, rehearsed on a replica (tools/db/test-migrations.sh, sql/tests/300_club_agenda.sql, tools/db/test-club-agenda-concurrency.sh).
  // Fingerprints measured on a replica built from the repository.
    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true. Open screens.club_agenda for the pilot clubs' accounts only.",
// ---- T1
104-    afterNote: "Then run tools/db/postflight-v11.sql, postflight-v13.sql and postflight-v131.sql: every row true.",
```

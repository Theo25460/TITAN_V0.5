# Paquet canonique v2-03 — Coaching (V1.9.1 à V1.9.6) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-03` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → v2-02 → **v2-03** → v2-04 → v2-05 → v2-06 → v2-07 → v2-08. Ce paquet suppose : main only; placed BEFORE every wrapper of private.titan_export_extras_v1 because each V1.9 migration rewrites its top layer in full.

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130101100_coach_assignment_followup.sql` | V1.9.1 | `20261201090000_coach_assignment_followup.sql` (paquet release-v191) | `3b834eb479efde51664b81553c987871c60f68ae` | identique octet pour octet |
| `02-20261130101200_coach_session_feedback.sql` | V1.9.2 | `20261202090000_coach_session_feedback.sql` (paquet release-v192) | `88e7601fca8482977d75943037750d2bd4ca6afd` | identique octet pour octet |
| `03-20261130101300_coach_weekly_review.sql` | V1.9.3 | `20261203090000_coach_weekly_review.sql` (paquet release-v193) | `45c176ac696b2169e50cca6dc2f690576f067550` | identique octet pour octet |
| `04-20261130101400_coach_programs.sql` | V1.9.4 | `20261204090000_coach_programs.sql` (paquet release-v194) | `1cdfba736d7396b6ed57bbe10b5606990fe23b34` | identique octet pour octet |
| `05-20261130101500_coach_cycle_reports.sql` | V1.9.5 | `20261205090000_coach_cycle_reports.sql` (paquet release-v195) | `1d1ca059be0076c85067177e0bb4e2ffac8603bb` | identique octet pour octet |
| `06-20261130101600_coach_groups.sql` | V1.9.6 | `20261206090000_coach_groups.sql` (paquet release-v196) | `3229bdceccf29b0db9359763ee4d37b33fb24e2b` | identique octet pour octet |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130100500`) : `private` 135 fonctions, droits `38ff555d0594`, corps `601edce5534a` ; `public` 334 fonctions, droits `17bc75638e34`, corps `78eb242f18ca`.
2. Les fichiers `01-…` à `06-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 169 fonctions, droits `67dccdf1dcdb`, corps `a631bc6e97e4` ; `public` 340 fonctions, droits `ff46799cf702`, corps `14ca24343e11`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### V1.9.1 — `supabase/release-v191/README.md` au SHA `3b834eb479efde51664b81553c987871c60f68ae`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v191 (généré) — NON APPLIQUÉ
>
> V1.9.1 — Une séance assignée (`docs/V191_SEANCE_ASSIGNEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v191` depuis
> `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application.
>
> Construit sur `main` (fin du paquet v20, tête `20261122090000`). Les paquets v21 à v26 (V1.8.1 à V1.8.6) vivent sur leurs propres branches :
> si l’un d’eux est appliqué avant celui-ci, régénérer ce paquet après eux (garde d’ordre et empreintes changent).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` suivi des propositions | Six colonnes sur `public.coach_assignments` (version acceptée, changement proposé, date déplacée, « faite » déclarée, écart traité, historique borné à 50 entrées), un déclencheur qui journalise chaque changement d’état et de lien quel que soit le chemin, `public.titan_coach_followup_v1` (file du coach filtrable par action et par sportif, liste et dossier, changement proposé / retiré / accepté / décliné, déplacement, « faite » déclarée, lien confirmé par le sportif, lien retiré, écart traité), mesure `private.titan_coach_followup_measure()`. Le portail `titan_coach_portal` n’est pas modifié. Aucune écriture dans `public.training_logs` | Seulement quand `screens.coach_followup` est ouvert (fermé par défaut, déploiement par compte) |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026, PostgreSQL 16) : `00-check-before` à `ok = true` (état de fin du
> paquet v20), `01` appliqué, `99-check-after` à `ok = true`, second passage de `01` refusé (« already registered »).
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261201090000_coach_assignment_followup.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261122090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.coach_followup` pour les comptes pilotes seulement (deux coachs, quatre sportifs volontaires).
>
> Retour arrière : décrit dans l’en-tête de la migration (fonctions, déclencheur et colonnes ajoutés supprimés ; le portail n’ayant pas changé,
> rien n’est à recréer).

### V1.9.2 — `supabase/release-v192/README.md` au SHA `88e7601fca8482977d75943037750d2bd4ca6afd`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v192 (généré) — NON APPLIQUÉ
>
> V1.9.2 — Retour sur la séance (`docs/V192_RETOUR_SEANCE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v192` depuis
> `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application. **Prérequis : le paquet v191 appliqué** (tête `20261201090000`).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` retour sur la séance | `private.titan_coach_feedback` (proposition, message du fil, séance lue, empreinte par catégorie sans valeur, ajustement et statut), `public.titan_coach_feedback_v1` (compose, give, list, detail, athlete, answer, withdraw, read), `titan_coach_messages_v1` indique `feedback_id`, l’export du compte gagne `coachFeedback` (sans mesure), mesure `private.titan_coach_feedback_measure()`. Aucune écriture dans `public.training_logs` | Seulement quand `screens.coach_feedback` est ouvert (fermé par défaut) |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026, PostgreSQL 16) : `00-check-before` à `ok = true` (fin du paquet
> v191), `01` appliqué, `99-check-after` à `ok = true`, second passage refusé (« already registered »), postflights v11 (328/328) et v13
> (42/42) vrais ; v131 44/54, les mêmes 10 lignes « ledger » absentes de la réplique qu’avant le paquet.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261202090000_coach_session_feedback.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261201090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.coach_feedback` pour les comptes pilotes seulement, une fois `screens.coach_followup` ouvert pour eux.
>
> Retour arrière : décrit dans l’en-tête de la migration (table et fonctions supprimées, `titan_coach_messages_v1` de `20261121100000` et
> `private.titan_export_extras_v1` de `20261117160000` réappliqués).

### V1.9.3 — `supabase/release-v193/README.md` au SHA `45c176ac696b2169e50cca6dc2f690576f067550`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v193 (généré) — NON APPLIQUÉ
>
> V1.9.3 — Revue de suivi (`docs/V193_REVUE_SUIVI.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v193` depuis
> `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application. **Prérequis : les paquets v191 puis v192 appliqués** (tête `20261202090000`).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` revue de suivi | `private.titan_coach_review_drafts` (une proposition préparée par suivi et par semaine : brouillon, envoyée ou abandonnée), `public.titan_coach_review_v1` (week, prepare, send, discard), l’export du compte gagne `coachReviewDrafts` (brouillons du coach, aucune mesure du sportif), mesure `private.titan_coach_review_measure()`. Aucune écriture dans `public.training_logs`, les notes ou les check-ins | Seulement quand `screens.coach_review` est ouvert (fermé par défaut) |
>
> Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261202090000` (25 novembre 2026, PostgreSQL 16) :
> `00-check-before` à `ok = true` (private 132/f470df633887/8431bbe577ef, public 326/a50bf326388e/321fae833080), `01` appliqué,
> `99-check-after` à `ok = true` (private 135/46ef37ce6ad4/65b87c582f10, public 327/38f8cdbe16ff/e631f251f386), second passage refusé
> (« migration 20261203090000 is already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261203090000_coach_weekly_review.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261202090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.coach_review` pour les comptes pilotes seulement, une fois `screens.coach_followup` et `screens.coach_feedback` ouverts pour eux.
>
> Retour arrière : décrit dans l’en-tête de la migration (table et fonctions supprimées, `private.titan_export_extras_v1` de
> `20261202090000` réappliqué).

### V1.9.4 — `supabase/release-v194/README.md` au SHA `1cdfba736d7396b6ed57bbe10b5606990fe23b34`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v194 (généré) — NON APPLIQUÉ
>
> V1.9.4 — Programmation multi-semaines (`docs/V194_PROGRAMMATION.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v194`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application. **Prérequis : les paquets v191, v192 puis v193 appliqués** (tête `20261203090000`).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` programmation multi-semaines | `private.titan_coach_programs` et `_program_versions` (modèles du coach, versionnés), `private.titan_coach_plans` (programme adapté pour un suivi : brouillon, envoyé, clos, abandonné) et `private.titan_coach_plan_versions` (une version immuable par envoi, révision et clôture, avec l’instantané des séances, sans mesure) ; sur `public.coach_assignments` : `plan_id`, `plan_key`, `plan_week` (index unique par programme), `discuss_note`, `discuss_at` ; `public.titan_coach_program_v1` (library, program, save_program, archive_program, link, plan, athlete, adapt, edit, discard, send, revise, answer, close) ; `private.titan_coach_followup_row` réappliquée avec l’état « à discuter » et le programme de la proposition ; l’export gagne `coachPrograms` et `coachPlans` ; mesure `private.titan_coach_program_measure()`. Aucune écriture dans `public.training_logs`, les notes ou les check-ins | Seulement quand `screens.coach_programs` est ouvert (fermé par défaut) ; l’état « à discuter » n’apparaît que pour les propositions d’un programme |
>
> Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261203090000` (25 novembre 2026, PostgreSQL 16) :
> `00-check-before` à `ok = true` (private 135/46ef37ce6ad4/65b87c582f10, public 327/38f8cdbe16ff/e631f251f386), `01` appliqué,
> `99-check-after` à `ok = true` (private 142/7f7fdc02ec0d/e8547c9acb1c, public 328/7410ae198479/c98a08c50f3b), second passage refusé
> (« migration 20261204090000 is already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261204090000_coach_programs.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261203090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.coach_programs` pour les comptes pilotes seulement, une fois `screens.coach_followup`, `screens.coach_feedback` et
>    `screens.coach_review` ouverts pour eux.
>
> Retour arrière : décrit dans l’en-tête de la migration (fonctions et tables supprimées, colonnes retirées de `public.coach_assignments`,
> `private.titan_coach_followup_row` de `20261201090000` et `private.titan_export_extras_v1` de `20261203090000` réappliqués).

### V1.9.5 — `supabase/release-v195/README.md` au SHA `1d1ca059be0076c85067177e0bb4e2ffac8603bb`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v195 (généré) — NON APPLIQUÉ
>
> V1.9.5 — Bilans de cycle partageables (`docs/V195_BILANS_CYCLE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v195`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application. **Prérequis : les paquets v191, v192, v193 puis v194 appliqués** (tête `20261204090000`).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` bilans de cycle | `private.titan_coach_cycle_reports` (un bilan par programme V1.9.4 : copie de travail du coach, brouillon, proposé, publié), `private.titan_coach_cycle_report_versions` (une version par validation du sportif : ce qu’il a choisi de partager, le contrat du lien, le fichier autorisé ou non, les retraits), `private.titan_coach_cycle_report_exports` (journal des fichiers téléchargés, sans contenu) ; `private.titan_coach_plans.origin` (le bilan d’où vient un cycle suivant) ; `public.titan_coach_cycle_v1` ; `private.titan_coach_plan_row` et `private.titan_export_extras_v1` réappliquées avec un ajout chacune ; mesure `private.titan_coach_cycle_measure()` (équipe) | Non tant que `screens.coach_cycle_report` est fermé (le serveur refuse : `FEATURE_DISABLED`) |
>
> Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261204090000` (26 novembre 2026, PostgreSQL 16) : voir le
> compte rendu du lot (empreintes avant private 142/7f7fdc02ec0d/e8547c9acb1c, public 328/7410ae198479/c98a08c50f3b ; après private
> 150/586d38f8d971/4c7a807e390f, public 329/bac2a73985e2/8822db836a5a).
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261205090000_coach_cycle_reports.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261204090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.coach_cycle_report` pour les comptes pilotes seulement, une fois `screens.coach_followup`, `screens.coach_feedback`,
>    `screens.coach_review` et `screens.coach_programs` ouverts pour eux.
>
> Retour arrière : décrit dans l’en-tête de la migration (fonctions et tables supprimées, colonne `origin` retirée de `private.titan_coach_plans`,
> `private.titan_coach_plan_row` et `private.titan_export_extras_v1` de `20261204090000` réappliquées).

### V1.9.6 — `supabase/release-v196/README.md` au SHA `3229bdceccf29b0db9359763ee4d37b33fb24e2b`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v196 (généré) — NON APPLIQUÉ
>
> V1.9.6 — Suivi collectif individualisé (`docs/V196_SUIVI_COLLECTIF.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v196`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application. **Prérequis : les paquets v191, v192, v193, v194 puis v195 appliqués** (tête `20261205090000`).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` suivi collectif | `private.titan_coach_groups` et `_group_members` (groupes privés du coach, faits de ses propres liens), `private.titan_coach_dispatches` (un bloc à diffuser, version du modèle figée), `private.titan_coach_dispatch_recipients` (variante, exclusion, résultat et programme de chaque destinataire), `private.titan_coach_dispatch_sends` (résultats de chaque envoi, pour le rejeu) ; `public.titan_coach_group_v1` ; `private.titan_export_extras_v1` réappliquée avec un ajout (`coachGroups`) ; mesure `private.titan_coach_group_measure()` (équipe) | Non tant que `screens.coach_groups` est fermé (le serveur refuse : `FEATURE_DISABLED`) ; un sportif ne voit jamais un groupe |
>
> Répétition sur une réplique construite depuis le dépôt, registre complet jusqu’à `20261205090000` (146 migrations, 26 novembre 2026,
> PostgreSQL 16) : empreintes avant private 150/586d38f8d971/4c7a807e390f, public 329/bac2a73985e2/8822db836a5a ; après private
> 154/d54cf36d42af/7bd81dcf3a5b, public 330/211397ebafd6/73baa6ed9d95 ; second passage refusé ; postflights v11 (328/328), v13 (42/42) et
> v131 (54/54) vrais.
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261206090000_coach_groups.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261205090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.coach_groups` pour les comptes pilotes seulement, une fois `screens.coach_followup`, `screens.coach_feedback`,
>    `screens.coach_review`, `screens.coach_programs` et `screens.coach_cycle_report` ouverts pour eux.
>
> Retour arrière : décrit dans l’en-tête de la migration (fonctions et tables supprimées, `private.titan_export_extras_v1` de `20261205090000`
> réappliquée). Les programmes déjà reçus par les sportifs sont des programmes V1.9.4 ordinaires : ils restent.

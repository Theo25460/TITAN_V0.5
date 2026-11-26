# Paquet canonique v2-06 — Coopération (V1.8.1 à V1.8.6) — NON APPLIQUÉ

> **Statut au 26/11/2026** : préparé par la mission A2 (fusion V2.0) sur la branche d'intégration. **Aucune application en production**
> sans l'accord explicite du propriétaire, une sauvegarde préalable (PITR ou copie logique) et la recette A3.

Généré par `node tools/db/build-production-bundle.mjs --bundle v2-06` depuis `supabase/migrations/` (fichiers SQL) et par
`node tools/db/v2-canonical.mjs readmes` (ce texte). **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` et
`tests/v2-migration-map.test.mjs` échouent si un fichier diffère de sa source.

Ordre : v2-01 → v2-02 → v2-03 → v2-04 → v2-05 → **v2-06** → v2-07. Ce paquet suppose : main only (private.titan_social_export_v1, public.titan_cordees_v1, public.titan_social_digest_v1 are V1.8-only).

| Fichier | Lot | Origine (fichier et paquet du lot) | SHA du lot | Corps |
|---|---|---|---|---|
| `01-20261130104100_cordee_relay.sql` | V1.8.1 | `20261124090000_cordee_relay.sql` (paquet release-v21) | `caaa302f86297513b2e46f9e9f6010ef7dada4cd` | identique octet pour octet |
| `02-20261130104200_cordee_reprise.sql` | V1.8.2 | `20261125090000_cordee_reprise.sql` (paquet release-v22) | `ade9ae19546fbe0751b377b199bb0074bf3bf81b` | identique octet pour octet |
| `03-20261130104300_cordee_suite.sql` | V1.8.3 | `20261126090000_cordee_suite.sql` (paquet release-v23) | `a12beb4d8853ea5e3b0395cc91e86bc6a7a5d3dd` | identique octet pour octet |
| `04-20261130104400_club_season.sql` | V1.8.4 | `20261127090000_club_season.sql` (paquet release-v24) | `f546cafc229a2168405c3f4b150431b198ce4e68` | identique octet pour octet |
| `05-20261130104500_club_match.sql` | V1.8.5 | `20261128090000_club_match.sql` (paquet release-v25) | `a799bfe3a0bd0aaee61a8c812b3955bb575f28ac` | identique octet pour octet |
| `06-20261130104600_club_agenda.sql` | V1.8.6 | `20261129090000_club_agenda.sql` (paquet release-v26) | `c7e0223ffaf87fe7c78dc94905735e216da56b8d` | identique octet pour octet |

## Procédure

1. `00-check-before.sql` : chaque ligne `ok = true` (état attendu, registre à la version `20261130103600`) : `private` 211 fonctions, droits `5fd34db4c64f`, corps `40ecab77ebf0` ; `public` 361 fonctions, droits `6c7c5a9dda1f`, corps `19863d8fcd1c`.
2. Les fichiers `01-…` à `06-…` dans l'ordre, un appel par fichier. Chacun est une transaction gardée : refusé s'il est
   rejoué ou si la migration précédente manque ; un refus ne garde rien et le même fichier peut être rejoué.
3. `99-check-after.sql` : chaque ligne `ok = true` (`private` 266 fonctions, droits `a9ee695b702f`, corps `780bbc26238b` ; `public` 372 fonctions, droits `1c3d2fef1a19`, corps `4cd6fcef9a64`), puis `tools/db/postflight-v11.sql`, `postflight-v13.sql` et `postflight-v131.sql` : toutes vraies.

Empreintes mesurées sur une réplique vierge par `tools/db/measure-v2-fingerprints.sh` (`tools/db/v2-fingerprints.json`).
Répétition complète : `pnpm run test:db` (base jetable vierge) et `tools/db/v2-replica-rehearsal.sh` (réplique synthétique de l'état actuel).

## Retour arrière

Toujours dans l'ordre inverse des paquets (le dernier appliqué d'abord), migration par migration, avec les instructions « Rollback » de
l'en-tête de chaque fichier. Les en-têtes citent les **anciennes** versions des lots : se reporter au tableau de correspondance.
Les fonctions d'export `private.titan_export_extras_v1` sont des enveloppes successives : les retirer dans l'ordre inverse.

## Notes d'origine des paquets remplacés

### V1.8.1 — `supabase/release-v21/README.md` au SHA `caaa302f86297513b2e46f9e9f6010ef7dada4cd`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v21 (généré) — NON APPLIQUÉ
>
> V1.8.1 — Relais de cordée (`docs/V181_RELAIS_CORDEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v21` depuis
> `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application.
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` relais de cordée | Une étape « Le relais de la Sentinelle » sur la route pilote « Les crêtes de l’Aube » : un membre encordé transmet avec une séance confirmée, un autre membre confirme avec la sienne un autre jour ; une seule transmission et une seule confirmation par cordée ; aucune longueur, XP, crédit ou titre en plus ; export `cordeeRelays` ; mesure `private.titan_cordee_relay_measure()` | Seulement quand `screens.cordee_relay` est ouvert (fermé par défaut, déploiement par compte) |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026) : `00-check-before` à `ok = true` (état de fin du paquet v20),
> `01` appliqué, `99-check-after` à `ok = true`, second passage de `01` refusé (« already registered »).
>
> ## Procédure
>
> 1. `00-check-before.sql` : deux lignes `ok = true`.
> 2. `01-20261124090000_cordee_relay.sql` (garde d'ordre : refusé s'il est rejoué ou si `20261122090000` manque).
> 3. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 4. Ouvrir `screens.cordee_relay` pour les comptes pilotes seulement (`titan_admin_feature_flag_set_v1`, déploiement par compte).
>
> Retour arrière : décrit dans l'en-tête de la migration (fonctions et table nouvelles supprimées, `titan_cordees_v1` et
> `private.titan_social_export_v1` re-créées depuis `20261120110000`).

### V1.8.2 — `supabase/release-v22/README.md` au SHA `ade9ae19546fbe0751b377b199bb0074bf3bf81b`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v22 (généré) — NON APPLIQUÉ
>
> V1.8.2 — Reprise et relais facultatifs (`docs/V182_REPRISE_CORDEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v22`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application, **après le paquet v21** (V1.8.1, qui n’est pas encore appliqué non plus).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` reprise de la cordée | Prise en charge facultative du relais (72 h), passation volontaire à un membre ou à la cordée (48 h, une seule acceptation retenue), offre jamais acceptée qui libère le relais, départ, blocage et suspension qui annulent la prise en charge ; colonne `left_at` sur `titan_challenge_members` (déclencheur) : les longueurs apportées avant un départ restent acquises et la part du membre parti se referme à ce qu’il a apporté ; export `cordeeRelayTurns` ; mesure `private.titan_cordee_reprise_measure()` | Prise en charge et passation : seulement quand `screens.cordee_reprise` est ouvert (fermé par défaut, déploiement par compte). **Règle des départs : pour toutes les cordées dès l’application** (départs enregistrés après la migration uniquement) |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261124090000` enregistrées :
> `00-check-before` à `ok = true` (private 124/d491e079008f/b971b4c8829d, public 325/a606edd67a11/65c91ba6d772, état de fin du paquet v21),
> `01` appliqué, `99-check-after` à `ok = true` (private 131/f550f5ce5daf/0155cb43ef72, public 326/7e442a057127/95bff8a8e8a1), second passage
> de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. Le paquet v21 doit être appliqué (`20261124090000` enregistré).
> 2. Publier d’abord le Web et l’application Android qui contiennent V1.8.2 : la phrase de départ des anciens clients (« tes longueurs ne
>    compteront plus ») devient inexacte dès l’application de la migration.
> 3. `00-check-before.sql` : deux lignes `ok = true`.
> 4. `01-20261125090000_cordee_reprise.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261124090000` manque).
> 5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 6. Ouvrir `screens.cordee_reprise` pour les comptes pilotes seulement, déjà ouverts à `screens.cordee_relay`.
>
> Retour arrière : décrit dans l’en-tête de la migration (fonctions, déclencheur et table nouvelles supprimés, colonnes retirées, fonctions
> re-créées depuis `20261124090000` et `20261120110000`).

### V1.8.3 — `supabase/release-v23/README.md` au SHA `a12beb4d8853ea5e3b0395cc91e86bc6a7a5d3dd`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v23 (généré) — NON APPLIQUÉ
>
> V1.8.3 — Un groupe qui se retrouve (`docs/V183_GROUPE_CORDEE.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v23`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application, **après les paquets v21 et v22** (V1.8.1 et V1.8.2, pas encore appliqués non plus).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` suite de la cordée | Propositions d’un nouvel itinéraire privé après une cordée terminée (route existante, allure éprouvée, durée), réponses des membres, départ d’une nouvelle cordée avec les compteurs à zéro dès deux acceptations, proposition canonique (même route, allure et durée) et choix explicite entre propositions distinctes sous verrou de ligne ; histoire de la cordée terminée (`story`) et cordée suivie (`follows`) dans `titan_cordees_v1` ; « suites » dans `titan_social_digest_v1` ; les partenaires de lien d’une cordée restent nommés dans celles qui la suivent (`private.titan_member_named`) ; export `cordeeSuites` ; mesure `private.titan_cordee_suite_measure()` | Proposer et répondre : seulement quand `screens.cordee_suite` est ouvert (fermé par défaut, déploiement par compte), et `screens.cordee` pour proposer. L’histoire d’une cordée terminée et la règle de nommage étendue valent dès l’application |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261125090000` enregistrées (143) :
> `00-check-before` à `ok = true` (private 131/f550f5ce5daf/0155cb43ef72, public 326/7e442a057127/95bff8a8e8a1, état de fin du paquet v22),
> `01` appliqué, `99-check-after` à `ok = true` (private 141/681a79d6ef40/2800c4c153fe, public 327/5429983a73a6/a81da62357a0), second passage
> de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. Les paquets v21 puis v22 doivent être appliqués (`20261125090000` enregistré).
> 2. Publier le Web et l’application Android qui contiennent V1.8.3 (les anciens clients ignorent simplement `story`, `follows`, `suite`
>    et `suites` : rien ne casse s’ils restent en service).
> 3. `00-check-before.sql` : deux lignes `ok = true`.
> 4. `01-20261126090000_cordee_suite.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261125090000` manque).
> 5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 6. Ouvrir `screens.cordee_suite` pour les comptes pilotes seulement, déjà ouverts à `screens.cordee`.
>
> Retour arrière : décrit dans l’en-tête de la migration (fonctions, déclencheur et tables nouvelles supprimés, fonctions re-créées depuis
> `20261120100000`, `20261120120000` et `20261125090000`).

### V1.8.4 — `supabase/release-v24/README.md` au SHA `f546cafc229a2168405c3f4b150431b198ce4e68`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v24 (généré) — NON APPLIQUÉ
>
> V1.8.4 — Saisons privées de club (`docs/V184_SAISONS_CLUB.md`). Généré par `node tools/db/build-production-bundle.mjs --bundle v24`
> depuis `supabase/migrations/`. **Ne pas modifier à la main** : `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source.
> Décision du propriétaire requise avant application, **après les paquets v21, v22 et v23** (V1.8.1 à V1.8.3, pas encore appliqués non plus).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` saison de club | Saison privée d’un club (titre, départ, 2 à 8 semaines, allure, trois étapes, clôture), organisée par les administrateurs du club ; participation explicite et révocable (rejoindre, pause, reprise, départ) ; jours actifs issus des séances confirmées avec part et plafond individuels ; agrégats à partir de 3 participants ; bilan privé figé ; report du départ et arrêt contrôlé ; déclencheur qui termine la participation quand on quitte le club ; export `clubSeasons` ; mesure `private.titan_club_season_measure()` | Créer, rejoindre, reprendre et reporter : seulement quand `screens.club_season` est ouvert (fermé par défaut). Pause, départ et arrêt restent toujours possibles |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261126090000` enregistrées (144) :
> `00-check-before` à `ok = true` (private 141/681a79d6ef40/2800c4c153fe, public 327/5429983a73a6/a81da62357a0, état de fin du paquet v23),
> `01` appliqué, `99-check-after` à `ok = true` (private 152/a12f5f1e2548/eee8973d517f, public 329/82c14f6e68a3/5ccabb51c604), second passage
> de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. Les paquets v21, v22 puis v23 doivent être appliqués (`20261126090000` enregistré).
> 2. Publier le Web et l’application Android qui contiennent V1.8.4 (les anciens clients n’appellent pas `titan_club_season_v1` : rien ne
>    casse s’ils restent en service).
> 3. `00-check-before.sql` : deux lignes `ok = true`.
> 4. `01-20261127090000_club_season.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261126090000` manque).
> 5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 6. Ouvrir `screens.club_season` pour les comptes des clubs pilotes seulement.
>
> Retour arrière : décrit dans l’en-tête de la migration (déclencheur, fonctions et tables nouvelles supprimés,
> `private.titan_social_export_v1` re-créée depuis `20261126090000`).

### V1.8.5 — `supabase/release-v25/README.md` au SHA `a799bfe3a0bd0aaee61a8c812b3955bb575f28ac`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v25 (généré) — NON APPLIQUÉ
>
> V1.8.5 — Rencontres entre clubs (`docs/V185_RENCONTRES_CLUBS.md`, simulations `docs/V185_SIMULATIONS.md`). Généré par
> `node tools/db/build-production-bundle.mjs --bundle v25` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application,
> **après les paquets v21, v22, v23 et v24** (V1.8.1 à V1.8.4, pas encore appliqués non plus).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` rencontre entre clubs | Défi privé d’une ou deux semaines entre deux clubs : proposé par un administrateur, code à usage unique lu en aperçu (limité, jamais d’erreur) et accepté ou refusé par un administrateur d’un autre club et un autre compte, avant le départ ; participation explicite jusqu’à la fin du deuxième jour ; part plafonnée par personne, taux par club à partir de 3 participants, scores arrêtés à minuit ; coopération (score commun = moyenne des deux taux, seuil 60 %) ; format comparatif (égalité sous 5 points, deux semaines) derrière son propre drapeau ; annulation, abandon, récapitulatif figé, avis des participants ; déclencheur qui retire de la rencontre quand on quitte le club ; export `clubMatches` ; mesure `private.titan_club_match_measure()` | Proposer, accepter et participer : seulement quand `screens.club_match` est ouvert (fermé par défaut). Format comparatif : seulement avec `screens.club_match_versus` (fermé, à laisser fermé pendant le pilote). Refuser, quitter, arrêter et répondre restent toujours possibles |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261127090000` enregistrées (145) :
> `00-check-before` à `ok = true` (private 152/a12f5f1e2548/eee8973d517f, public 329/82c14f6e68a3/5ccabb51c604, état de fin du paquet v24),
> `01` appliqué, `99-check-after` à `ok = true` (private 166/550d46c5de65/3f3e1401b571, public 332/44ce47c36337/978b18a6a81f), second passage
> de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. Les paquets v21, v22, v23 puis v24 doivent être appliqués (`20261127090000` enregistré).
> 2. Publier le Web et l’application Android qui contiennent V1.8.5 (les anciens clients n’appellent pas `titan_club_match_v1` : rien ne
>    casse s’ils restent en service).
> 3. `00-check-before.sql` : deux lignes `ok = true`.
> 4. `01-20261128090000_club_match.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261127090000` manque).
> 5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 6. Ouvrir `screens.club_match` pour les comptes de deux clubs pilotes seulement. Laisser `screens.club_match_versus` fermé tant que
>    `private.titan_club_match_measure()` ne rend pas `explainable = true` (5 rencontres en coopération terminées, 10 avis, au plus 1 sur 5
>    « pas clair »).
>
> Retour arrière : décrit dans l’en-tête de la migration (déclencheur, fonctions et tables nouvelles supprimés,
> `private.titan_social_export_v1` re-créée depuis `20261127090000`).

### V1.8.6 — `supabase/release-v26/README.md` au SHA `c7e0223ffaf87fe7c78dc94905735e216da56b8d`

> Texte d'origine, recopié sans modification. Ses numéros de version, noms de paquets et contrôles « avant » sont ceux du lot isolé : ils sont remplacés par ceux de ce paquet (tableau ci-dessus, `tools/db/v2-migration-map.json`).

> # Paquet de production v26 (généré) — NON APPLIQUÉ
>
> V1.8.6 — Agenda et rendez-vous d’équipe (`docs/V186_AGENDA_CLUB.md`). Généré par
> `node tools/db/build-production-bundle.mjs --bundle v26` depuis `supabase/migrations/`. **Ne pas modifier à la main** :
> `tests/production-bundle.test.mjs` échoue si un fichier diffère de sa source. Décision du propriétaire requise avant application,
> **après les paquets v21 à v25** (V1.8.1 à V1.8.5, pas encore appliqués non plus).
>
> | Fichier | Effet | Visible pour les joueurs ? |
> |---|---|---|
> | `01` agenda du club | Agenda privé d’un club : rendez-vous uniques ou hebdomadaires (2 à 12, même heure de Paris), lieu général, lieu précis et plan de repli facultatifs, capacité facultative avec file d’attente ; réponses « Je viens », « Peut-être », « Je ne viens pas » ; déplacement, plan de repli, annulation et rétablissement d’une occurrence, annulation et reprise d’une série sans doublon ; historique ; lien d’invitation `?rdv=` qui ne dit rien une fois expiré ou à un ancien membre ; rappels facultatifs ; fiche du rendez-vous terminé (présence déclarée, séance confirmée du jour associée par son auteur seulement, totaux à partir de 3 séances associées) ; clé `agenda` du récap `titan_social_digest_v1` ; déclencheurs (départ du club, place libérée) ; export `clubAgenda` ; mesure `private.titan_club_agenda_measure()` | Seulement quand `screens.club_agenda` est ouvert (fermé par défaut). « Je ne viens pas », la présence, l’association d’une séance et les annulations restent toujours possibles |
>
> Répétition sur une réplique construite depuis le dépôt (24 novembre 2026), migrations jusqu’à `20261128090000` enregistrées (146) :
> `00-check-before` à `ok = true` (private 166/550d46c5de65/3f3e1401b571, public 332/44ce47c36337/978b18a6a81f, état de fin du paquet v25),
> `01` appliqué, `99-check-after` à `ok = true` (private 175/123f4f781013/2bbe668c12c0, public 335/5837421547a7/f1cf55fb57c9), second passage
> de `01` refusé (« already registered »), postflights v11 (328/328), v13 (42/42) et v131 (54/54) vrais.
>
> ## Procédure
>
> 1. Les paquets v21 à v25 doivent être appliqués (`20261128090000` enregistré).
> 2. Publier le Web et l’application Android qui contiennent V1.8.6 (les anciens clients n’appellent pas `titan_club_agenda_v1` et ignorent
>    la clé `agenda` du récap : rien ne casse s’ils restent en service).
> 3. `00-check-before.sql` : deux lignes `ok = true`.
> 4. `01-20261129090000_club_agenda.sql` (garde d’ordre : refusé s’il est rejoué ou si `20261128090000` manque).
> 5. `99-check-after.sql` : deux lignes `ok = true`, puis les postflights v11, v13 et v131.
> 6. Ouvrir `screens.club_agenda` pour les comptes d’un ou deux clubs pilotes seulement.
>
> Retour arrière : décrit dans l’en-tête de la migration (déclencheurs, fonctions et tables nouvelles supprimés,
> `public.titan_social_digest_v1` re-créée depuis `20261126090000` et `private.titan_social_export_v1` depuis `20261128090000`).

# V1.6.6 — Journal longue durée

Garder un journal rapide et juste après plusieurs années d'usage : 10 000 séances, peu de réseau, plusieurs appareils.
Mesures avant/après et contrôle des agrégats : `docs/v166/` (fichiers JSON produits par les outils ci-dessous).

## Ce qui change

| Sujet | Avant | Après |
|---|---|---|
| Lecture de l'historique (Web, Android) | 20 pages de 500 par décalage (`offset`), comptage exact à chaque page, rien d'affiché avant la dernière | pages de 500 par clé (`date`, puis `id`, plus récentes d'abord), comptage sur la première seulement ; la première page est affichée tout de suite, marquée partielle |
| Rafraîchissement avec une copie complète | toutes les lignes relues à chaque ouverture (18,3 Mo de JSON pour 10 000 séances) | le manifeste du compte (`id, revision, archived_at, status, is_suspicious`, 1,17 Mo) puis les seules lignes changées, par paquets de 100 |
| Modification ancienne faite ailleurs | relue avec tout le reste | relue parce que sa révision a changé, quelle que soit sa date ; une ligne supprimée sur le serveur (lot d'import retiré) quitte l'appareil |
| Correction confirmée pendant un rafraîchissement | écrasée par la copie lue avant elle | la révision la plus haute gagne (`TitanHistoryWindow.reconcile`) |
| Copie sur l'appareil | Web : un seul enregistrement IndexedDB réécrit en entier à chaque correction ; Android : 67 blocs AsyncStorage réécrits à chaque rafraîchissement | blocs triés par identifiant (500 lignes Web, 150 Android) : seul le bloc qui a changé est réécrit ; la copie garde sa couverture |
| Couverture hors ligne | aucune indication | journal (Web, Android) et records (Web, Android) : « tout ton journal est sur cet appareil (…, vérifié le …) » hors ligne, ou « cet appareil a tes séances du … à aujourd'hui (N sur M) … les totaux qui commencent avant le … sont partiels » ; le résumé du journal Web est marqué « Totaux partiels » |
| Liste du journal Web | jusqu'à environ 400 lignes puis « affine la recherche » (le reste était inaccessible sans filtre) | 100 lignes, puis « Afficher 100 séances de plus » ; chaque ligne est accessible ; l'en-tête d'un mois garde le total du mois filtré |
| Filtres Web | tri de tout l'historique à chaque puce et à chaque frappe | index trié une fois par changement d'historique, filtre en une passe |
| Records | regroupement des exercices quadratique (recherche linéaire par séance), clé d'exercice recalculée à chaque série | table par séance et clé mémorisée : résultat identique (vérifié sur les 10 000 séances), 172 → 51 ms sous Node |
| Dénivelé | non corrigeable (ni formulaire, ni serveur) | champ « Dénivelé positif » de « Corriger la séance » (Web et Android) pour une séance en km d'un sport qui le demande ; serveur : migration `20261130100400`, paquet `supabase/release-v24` (non appliqué) |

## Mesures (23 novembre 2026, 3 passes par cas)

Jeu : 10 000 séances synthétiques sur cinq ans (`tools/journal-profile/dataset.mjs`, 18,3 Mo de JSON, 2 828 résumés GPX, traces
séparées, 200 archivées), compte synthétique. Web : site construit, vrai SDK Supabase, Chromium du conteneur, 390 × 900, processeur
non bridé, faux PostgREST local ; réseau « local » (sans latence) ou « faible » (modèle : 300 ms d'aller-retour, 1,6 Mbit/s, taille gzip
des réponses). Avant = commit `0730d3c` (V1.6.4), après = ce lot. Valeurs en millisecondes, par passe.

| Mesure | Avant, local | Après, local | Avant, faible | Après, faible |
|---|---|---|---|---|
| Premier journal utilisable, à froid | 1 623 · 1 679 · 1 679 | 358 · 375 · 349 | 21 552 · 21 480 · 21 337 | 1 904 · 1 939 · 1 892 |
| Historique complet, à froid | 2 057 · 2 155 · 2 215 | 2 129 · 2 185 · 2 136 | 22 111 · 22 008 · 21 933 | 21 812 · 21 887 · 21 833 |
| Premier journal utilisable, à chaud | 186 · 201 · 209 | 190 · 179 · 198 | 171 · 191 · 167 | 186 · 181 · 175 |
| Rafraîchissement terminé, à chaud | 2 577 · 2 639 · 2 779 | 1 050 · 1 065 · 1 028 | 22 752 · 22 095 · 22 230 | 4 745 · 4 613 · 4 640 |
| Données relues à chaud | 20 requêtes, 18,21 Mo | 10 requêtes, 1,17 Mo | idem | idem |
| Filtre famille (180 mesures) p50 / p95 / max | 163 / 236 / 286 | 50 / 69 / 134 | 161 / 219 / 300 | 50 / 71 / 124 |
| Recherche (60 mesures, dont 120 ms d'attente de frappe) p95 | 324 | 181 | 311 | 175 |
| Ouverture de la séance ancienne | 47 · 47 · 47 | 48 · 48 · 46 | 45 · 47 · 47 | 47 · 47 · 48 |
| Correction de la durée → journal et records redessinés | 597 · 670 · 619 | 112 · 106 · 109 | 951 · 1 035 · 982 | 405 · 394 · 424 |
| Correction du dénivelé → idem | impossible | 110 · 113 · 104 | impossible | non mesuré |
| Records recalculés sur 10 000 séances (navigateur) | 149 · 187 · 153 | 37 · 36 · 35 | 124 · 133 · 147 | 35 · 34 · 30 |
| Tâches longues pendant le chargement à froid (nombre, ms) | 6, 1 068 à 1 202 | 4, 418 à 508 | 6, 1 241 à 1 301 | 4, 424 à 453 |
| Rechargement hors ligne : couverture affichée | aucune | « tout ton journal est sur cet appareil (10 000 séances, vérifié le …) » | aucune | idem |

Le gzip du manifeste du jeu synthétique (0,03 Mo) est optimiste, ses identifiants se suivent ; avec des identifiants aléatoires comme en
production il pèse 0,22 Mo, soit environ 4,1 s de transfert sur le réseau faible (contre 2,78 Mo et 19,9 s pour relire toutes les
lignes). Calculs partagés sous Node (`docs/v166/core.json`, mêmes fichiers que l'application Android, moteur V8 et non Hermes) :
records 108,6 → 34,2 ms (p50, résultat identique), tri du journal Android 14,5 → 2,7 ms, vues de `useLogs` 23,3 → 20 ms ; copie de
l'appareil réécrite après une correction : 18,22 Mo avant, 0,28 Mo (un bloc de 150) sur Android et 0,95 Mo (un bloc de 500) sur le Web.

Contrôle des agrégats (`docs/v166/reference-aggregates.json`) : deux appareils, 15 contrôles (premier chargement, correction ancienne,
archivages et restauration, corrections simultanées et conflit, changements faits ailleurs, cache effacé puis lecture coupée, reprise),
totaux annuels 2021 à 2026 et totaux de tout l'historique (séances, minutes, km) et record de distance de chaque sport : 0 écart au
calcul de référence. Contrôle négatif : un rafraîchissement limité aux 90 derniers jours manque la correction d'une séance de 2022,
le contrôle relève 2 écarts.

## Pourquoi le manifeste suffit

Toute modification serveur d'une séance fait bouger au moins une colonne du manifeste :

- correction, archivage, restauration (`titan_update_training_session`, et la correction du dénivelé de la v24) : `revision + 1` ;
- archivage en masse des imports d'une source (`titan_archive_imported_v1`) : `archived_at` (sans révision) ;
- revue d'une séance (exclusion, mise en vérification) : `status`, `is_suspicious` ;
- retrait d'un lot d'import (V1.6.4) ou suppression du compte : la ligne disparaît du manifeste.

Le manifeste est lu par `id` croissant, 1 000 lignes par page. Une ligne citée par le manifeste mais disparue avant sa lecture est traitée comme supprimée.

## Fichiers

- `js/core/history-window.js` (partagé, copié tel quel dans `mobile/src/core/web/`) : lecture par clé, manifeste, fusion, réconciliation par révision, couverture et sa phrase, index du journal.
- Web : `js/state.js` (lecture du compte), `js/main.js` (copie de l'appareil avec sa couverture), `js/training-store.js` (blocs IndexedDB, version 3 de la base `titan-training`, registre de couverture par compte), `js/app/journal.js` (index, pagination, couverture, champ dénivelé), `js/app/records.js` (couverture), `js/app/sessions.js` (dénivelé, messages), `js/core/history-ledger.js` (changement « Dénivelé »), `js/sport-insights.js` (records linéaires), les 17 pages qui chargent `training-store.js`.
- Android : `src/data/hooks.ts` (`useLogs`), `src/data/api.ts` (`refreshLogs`), `src/data/logsCache.ts` (blocs triés, couverture), `src/data/historyCoverage.ts`, `src/data/auth.tsx`, `src/components/CoverageNote.tsx`, `src/screens/progress/JournalScreen.tsx`, `RecordsScreen.tsx`, `src/screens/session/SessionEditScreen.tsx`, `src/lib/errors.ts`.
- Serveur : `supabase/migrations/20261130100400_journal_long_duration.sql`, `supabase/release-v24/`, `sql/tests/300_journal_long_duration.sql`.
- Preuves : `tools/journal-profile/` (jeu de 10 000 séances, faux PostgREST et modèle de réseau, banc navigateur, banc des calculs, contrôle des agrégats), `tests/history-window.test.mjs`, `tests/e2e/journal-long-duration.e2e.mjs`, `mobile/__tests__/journalLongDuration.test.tsx`.

## Rejouer les preuves

```bash
node tools/build-public.mjs
PW_CHROMIUM=/opt/pw-browsers/chromium node tools/journal-profile/bench-web.mjs --tree . --net faible --runs 3 --out docs/v166/web-apres-faible.json
node tools/journal-profile/reference-check.mjs --out docs/v166/reference-aggregates.json
node tools/journal-profile/bench-core.mjs --before <arbre du commit 0730d3c> --out docs/v166/core.json
```

Le profil « avant » se rejoue sur un arbre de travail du commit `0730d3c` (`git worktree add <dossier> 0730d3c`, puis `node tools/build-public.mjs` dans ce dossier et `--tree <dossier>`).

## Limites

- Aucune mesure sur un Galaxy S23 ni sur un compte réel : aucun appareil ni compte n'est attaché au conteneur. Web : Chromium du conteneur, processeur non bridé. Android : les modules partagés sous Node et Jest, et le volume réseau et disque.
- Le réseau « faible » est un modèle (300 ms d'aller-retour, 1,6 Mbit/s, taille gzip des réponses), pas une mesure radio.
- La correction du dénivelé attend le paquet v24 (lui-même après v21, v22, v23) ; d'ici là le serveur la refuse avec un message clair, le reste du lot fonctionne sur le schéma actuel.
- Les autres pages qui lisent l'historique (statistiques, objectifs, carrière) ne disent pas encore qu'une copie est partielle ; elles ne voient une copie partielle que pendant le tout premier chargement d'un appareil, avant la fin de la lecture.

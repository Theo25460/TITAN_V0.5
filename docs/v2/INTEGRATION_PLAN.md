# TITAN V2.0 — Plan d'intégration (mission A1 : inventaire et architecture)

Relevé le 26/11/2026. Registre machine-lisible : [`integration-manifest.json`](integration-manifest.json).
Ce plan ne fusionne aucune fonctionnalité. Il prépare la mission A2 (fusion et données), qui partira du SHA de clôture d'A1.

Vocabulaire des statuts : **prévu**, **codé**, **testé auto** (déclaré par le rapport du lot, en local), **testé CI** (GitHub Actions), **testé appareil**, **fusionné** (dans `main`), **publié** (en production). Aucun lot ne passe à « fusionné » sur la seule foi d'un compte rendu.

## 1. Points épinglés

| Élément | Valeur | Source |
|---|---|---|
| `main` | `0dae9af9b32d7cf7ec3ceca7b1dee52e92544f39` | `git fetch --all --prune` après dé-shallow (1 049 commits) |
| Web en production | déploiement Netlify `6afec02bcf8ca878e98133e6`, commit `0dae9af9…` (= `main`), publié le 19/11/2026 à 09:24:21 UTC, 6 fonctions, 137 redirections, 71 règles d'en-têtes | API Netlify, lecture seule |
| Base de production | projet `oubmftfufwwzwpgvrcag`, registre de **141** migrations, tête `20261122090000`, **identique** aux 141 fichiers de `main` | Supabase `list_migrations`, lecture seule, aucune donnée utilisateur |
| Migrations V1.5 à V1.9 en production | **aucune** | idem |
| Google Play | **INCONNU** : cette session n'a pas accès à Play Console | Le dépôt indique : AAB 1.4.0 (1400) signé avant `0dae9af` ; revue bloquée par l'orientation imposée ; correctif `0dae9af` ; `mobile/docs/last-version-code.txt` = 1304 |
| Référence SEO | `tools/seo/baseline/production.json` (branche SEO) : commit `0dae9af`, déploiement `6afec02…`, 27 URL dans le sitemap, 0 P0 | PR #166 |
| Branche d'intégration | `integration/v2.0-all-versions` **n'existait pas**. Créée depuis `main` vérifié ; elle ne porte que les documents A1 | — |

**Prérequis « clôture du bouclier SEO » : partiellement rempli.**
- Ce qui existe : le code, l'audit `docs/seo/AUDIT_2026-11-26.md`, la référence de production et la recette de sabotage (toutes les lignes en PASS). La CI de la PR #166 est verte sur `73364dc2` (run 45816501537).
- Ce qui manque :
  - aucun compte rendu n'est écrit dans l'onglet « Protection SEO & CI/CD » du document ;
  - la PR n'est pas fusionnée ;
  - `main` n'a aucune protection de branche.
- Ce manque ne bloque pas A1, qui ne fait qu'un inventaire. **Il bloque A2** tant que le propriétaire n'a pas acté la clôture du bouclier.

## 2. Photographie Git et GitHub

- **Branches distantes** : 192 au total.
  - 141 sont des ancêtres de `main`, donc déjà intégrées.
  - **51** ne sont pas fusionnées : 38 partent du `main` actuel (lots V1.5 à V1.9 et chantiers transversaux), 13 sont anciennes (*legacy*).
- **Tags et releases** : aucun.
- **PR ouvertes** : **53**.
  - Pour 49 d'entre elles, la tête est déjà un ancêtre de `main`. Ce sont des PR obsolètes, gardées ouvertes : A1 ne les ferme pas et propose au propriétaire de les fermer.
  - 4 PR ouvertes ont un contenu absent de `main` :

| PR | Tête | Statut |
|---|---|---|
| #166 | `73364dc2` | Bouclier SEO |
| #155 | `6ce1d39c` | DÉCISION : places coach avec TITAN+ |
| #147 | `0093a5bc` | 157 illustrations candidates, approbation requise |
| #129 | `939ee0dd` | Hotfix profils, remplacé (à vérifier) |

- **PR historiques à surveiller** :
  - #159 et #161 (« PREVIEW UNIQUEMENT — NE PAS FUSIONNER ») sont marquées *merged*, parce que leurs têtes ont été absorbées par #163, la release consolidée. Leur contenu est en production ; ne pas le re-fusionner.
  - #156, #157, #158 et #160 (Signature, Android natif, Excellence, icônes) sont restées ouvertes alors que leurs têtes sont dans `main`.
  - Les décisions encore ouvertes : #155 (offre commerciale) et #147 (graphisme).

### Graphe des chaînes (`merge-base` = `0dae9af` pour toutes)

```
main 0dae9af
├─ RPG      V1.5.0 1933f36d → .1 f27a635e → .2 e48cf1d6 → .3 c9eed983 → .4 721cc47c → .5 52e83b24   (12 commits)
├─ JOURNAL  V1.6.1 b75161f5 → .2 18c062b0 → .3 1e684f1c → .4 0730d3c0 ─┬─ FOURCHE A  V1.6.5 29424d8f (+4)
│                                                                         └─ FOURCHE B  V1.6.6 897b7316 (+2)
│           → V1.7.1 819fcfd8 → .2 fcb8e33f → .3 4de371f5 → .4 0572d742 → .5 a07e25e2 → .6 21a0cbad → V1.7.7 52a209bd (+17)
├─ COOP     V1.8.1 caaa302f → .2 ade9ae19 → .3 a12beb4d → .4 f546cafc → .5 a799bfe3 → .6 c7e0223f   (12 commits)
├─ COACH    V1.9.1 3b834eb4 → .2 88e7601f → .3 45c176ac → .4 1cdfba73 → .5 1d1ca059 → .6 3229bdce   (21 commits)
├─ SEO       dreamy-rubin 73364dc2 (PR #166)      ├─ PARTAGE  stoic-meitner e767d523
├─ SITE/PLAY funny-cerf   01839119                ├─ ADMOB    upbeat-cannon 34243ab3
└─ assetlinks serene-gates 2a3c6492 · visuels Play ecstatic-cerf 45ef689d · marketing tender-clarke cf8bcfbb
```

Chaque lot est l'ancêtre de la tête de sa chaîne (`git merge-base --is-ancestor`, preuve lot par lot dans le registre). Il suffit donc d'**une fusion par chaîne**, plus V1.6.5 à part.

**Les deux fourches du journal.** V1.6.5 et V1.6.6 partent toutes deux de V1.6.4 (`0730d3c0`).
- Les 3 migrations communes sont identiques octet pour octet dans les deux fourches (blobs `39416b1d`, `f334278f` et `6e4a21df`).
- Chaque fourche a son propre `release-v24`, dont le contenu diffère : `source_center` d'un côté, `journal_long_duration` de l'autre.
- La chaîne sportive (V1.7) contient V1.6.6, **pas** V1.6.5.

## 3. Classement des 31 lots et des 4 chantiers transversaux

Tous les lots sont **prévus et codés**. Aucun n'est testé en CI, testé sur appareil, fusionné ni publié. Aucun n'a de PR. Leurs tests sont déclarés par les rapports, en local. Les SHA complets et le détail sont dans le registre (`lots[]`).

| Lot | Branche (tête) | Migration | Classement | Voie d'intégration |
|---|---|---|---|---|
| V1.5.0 Bifurcations | determined-dijkstra `1933f36d` | 20261123090000 ⚠ | intégration nécessaire | via V1.5.5 |
| V1.5.1 Gardiens | eager-hopper `f27a635e` | 20261124090000 ⚠ | intégration nécessaire | via V1.5.5 |
| V1.5.2 Camp et conséquences | zen-hypatia `e48cf1d6` | 20261125090000 ⚠ | intégration nécessaire | via V1.5.5 |
| V1.5.3 Quatre mondes | upbeat-feynman `c9eed983` | 20261126090000 ⚠ | intégration nécessaire | via V1.5.5 |
| V1.5.4 Quêtes entre les mondes | gallant-franklin `721cc47c` | 20261127090000 ⚠ | intégration nécessaire | via V1.5.5 |
| V1.5.5 Chroniques | gracious-feynman `52e83b24` | 20261128090000 ⚠ | intégration nécessaire | **fusion n° 4** |
| V1.6.1 État de synchronisation | quirky-darwin `b75161f5` | — | intégration nécessaire | via V1.7.7 |
| V1.6.2 Rapprochement | sweet-pascal `18c062b0` | 20261123090000 ⚠ | intégration nécessaire | via V1.7.7 |
| V1.6.3 Contrôle et réconciliation | upbeat-ramanujan `1e684f1c` | 20261123120000 | intégration nécessaire | via V1.7.7 |
| V1.6.4 Migration de l'historique | great-brahmagupta `0730d3c0` | 20261123150000 | intégration nécessaire | via V1.7.7 |
| V1.6.5 Centre des sources | hopeful-fermat `29424d8f` | 20261124090000 ⚠ | intégration nécessaire (fourche A) | **fusion n° 3** |
| V1.6.6 Journal longue durée | kind-knuth `897b7316` | 20261123180000 | intégration nécessaire (fourche B) | via V1.7.7 |
| V1.7.1 à V1.7.6 | magical-darwin … blissful-albattani `21a0cbad` | — (état client) | intégration nécessaire | via V1.7.7 |
| V1.7.7 GPS | gifted-brahmagupta `52a209bd` | 20261125170000 | intégration nécessaire, **flag fermé, pas prêt à publier** | **fusion n° 2** |
| V1.8.1 à V1.8.6 | elegant-heisenberg … sweet-cannon `c7e0223f` | 20261124 à 29090000 ⚠ | intégration nécessaire ; V1.8.5 à arbitrer (prérequis pilote) | **fusion n° 5** |
| V1.9.1 à V1.9.6 | serene-shannon … bold-pasteur `3229bdce` | 20261201 à 06090000 | intégration nécessaire, flags fermés | **fusion n° 6** |
| T4 Bouclier SEO | dreamy-rubin `73364dc2`, PR #166 | — | intégration nécessaire, prérequis | **fusion n° 1** |
| T1 Partage (cartes story) | stoic-meitner `e767d523` | 20261126120000 | intégration nécessaire | **fusion n° 7** |
| T2 Site et accès Android | funny-cerf `01839119` | — | **à arbitrer** : contredit GP13 (lien Play volontairement absent) | fusion n° 8, après décision |
| T3 AdMob | upbeat-cannon `34243ab3` | — | intégration nécessaire, interrupteurs fermés | **fusion n° 9** |

⚠ = la version de migration est réutilisée par une autre chaîne (voir § 4).

Ces lignes sont réconciliées avec le code réel. Aucun nom ni périmètre n'a changé. V1.7.7 (GPS) est bien le 7e lot sport, ce qui donne 31 lots.

Autres branches récentes :
- `serene-gates` (assetlinks) : intégration nécessaire, fusion n° 10 ;
- `ecstatic-cerf` (visuels Play) : hors périmètre du code ;
- `tender-clarke` (concours « Les 20 premiers ») : **à arbitrer**, car c'est un engagement juridique.

Branches anciennes (*legacy*) :
- **déjà présentes** : #140, #142 à #146 ;
- **remplacées** :
  - `gracious-turing` est remplacée par les sondes de production ;
  - `codex/v11-google-oauth` est remplacée par `mobile/src/lib/googleAuth.ts` ;
  - `fix/v1-profile-conflict-storm` (#129) est sans doute remplacée : A3 doit rejouer ses tests pour le confirmer ;
- **à arbitrer** : #155, #147 et `design/titan-sports-library-consolidation` (icônes provisoires jamais validées) ;
- **obsolète** : `codex/v11-integration-recovery`, qui ne contient que de la documentation.

Aucune de ces branches n'est réintroduite.

## 4. Migrations : collisions, objets cumulatifs, ordre final

### Collisions confirmées par `git diff`

| Version | Utilisée par |
|---|---|
| 20261123090000 | V1.5.0 `adventure_branches_v1` · V1.6.2 `session_match_review` |
| 20261124090000 | V1.5.1 `adventure_guardian_v1` · V1.6.5 `source_center` · V1.8.1 `cordee_relay` (**triple**, non signalée dans le document) |
| 20261125090000 | V1.5.2 · V1.8.2 |
| 20261126090000 | V1.5.3 · V1.8.3 |
| 20261127090000 | V1.5.4 · V1.8.4 (non signalée) |
| 20261128090000 | V1.5.5 · V1.8.5 (non signalée) |

Les noms de paquets se télescopent aussi :
- `release-v21` à `release-v26` sont chacun revendiqués par 2 ou 3 chaînes ;
- `release-v24` existe en **4** variantes ;
- `release-v19` est réservé par #155.

Chaque `00-check-before.sql` a été figé sur l'état v20. Le premier paquet appliqué invalide donc les précontrôles de toutes les autres chaînes.

**Règle de renumérotation.** Aucune de ces migrations n'est appliquée, ni en production ni dans le registre. La renumérotation est donc sans risque :
- versions strictement croissantes, supérieures à `20261122090000`, et uniques ;
- noms de paquets uniques (proposition : `release-v2-01` à `release-v2-NN`) ;
- empreintes régénérées dans l'ordre final.

### Objets SQL cumulatifs

Matrice complète dans `integration-manifest.json` › `migrations.cumulative_functions` : 37 fonctions, 604 objets relevés.

- **`private.titan_export_extras_v1`** (risque **P0** de perte de données exportées). Trois styles d'écriture s'affrontent :
  - V1.5 renomme l'ancienne fonction (`titan_export_extras_before_<x>_v1`) puis l'enveloppe ; cela s'enchaîne sans perte ;
  - V1.7.7 la réécrit entièrement : sections de `main` + `routes` et `places` ;
  - V1.9 la réécrit entièrement 5 fois : sections de `main` + sections coach.

  Toute réécriture complète appliquée en dernier efface les sections des autres. A2 doit écrire **une seule définition finale** : les 15 clés de `main`, les 7 clés `adventure*`, `routes` et `places`, et les sections coach. Un test d'export doit ensuite vérifier toutes les clés.
- **`private.titan_social_export_v1`** : réécrite 6 fois dans la seule chaîne V1.8. Vérifier que la dernière définition conserve toutes les sections.
- **`public.titan_coach_messages_v1`** : V1.9.2 la redéfinit par-dessus `20261121100000_coach_capacity_enforced`. Vérifier que le contrôle de capacité est conservé ; le diff indicatif montre un sur-ensemble.
- **Fonctions du journal** :
  - V1.6.6 redéfinit encore `titan_update_training_session` et `titan_session_changes_v1` ;
  - V1.6.5 redéfinit `titan_garmin_ingest_v1` et `titan_garmin_deregister_v1`, et touche `titan_import_core` ;
  - appliquer `source_center` **après** `journal_long_duration`, puis comparer les corps des fonctions.
- **`public.titan_cordees_v1` et `public.titan_social_digest_v1`** : redéfinies 3 fois et 2 fois dans V1.8.
- **`private.titan_analytics_payload_valid_v300`** : redéfinie par le chantier Partage.
- **Droits et accès** :
  - toutes les fonctions refont leurs `revoke` et `grant` ;
  - aucune `create policy` nouvelle, aucune extension, aucun type ;
  - les nouvelles tables ont RLS activé, avec accès par RPC `SECURITY DEFINER`.

  A2 ajoute un contrôle des droits après migration (`has_function_privilege` pour `anon` et `authenticated`) sur la liste cumulative.

### Ordre final proposé (A2)

1. Journal `session_match_review`, `history_reconcile`, `history_migration`, `journal_long_duration` (versions 2026112309/12/15/18, conservées).
2. V1.6.5 `source_center` (renumérotée).
3. V1.7.7 `gps_navigation`.
4. V1.5.0 à V1.5.5 `adventure_*` (renumérotées). La chaîne d'enveloppes reste intacte.
5. V1.8.1 à V1.8.6 `cordee_*` et `club_*` (renumérotées). V1.8.2 et V1.8.3 imposent de publier les clients avant la migration.
6. Partage `analytics_share_story`.
7. V1.9.1 à V1.9.6 `coach_*`. **Réécrire ici** la définition finale unique de `titan_export_extras_v1`.
8. Une migration de consolidation finale, qui vérifie les clés d'export et les droits.

## 5. Fichiers partagés et conflits

Simulation cumulative par `git merge-tree`, sur des objets non référencés : aucune branche n'a été écrite.

| Fusion simulée (ordre) | Fichiers en conflit |
|---|---|
| SEO | 0 |
| V1.7.7 | 1 (`package.json`) |
| V1.6.5 | 14 |
| V1.5.5 | 19 |
| V1.8.6 | 30 |
| V1.9.6 | 8 |
| Partage | 12 |
| Site/Play, AdMob, assetlinks, visuels | 0 |

Ces conflits relèvent de quatre familles :

1. **Paquets `supabase/release-v2x/*`.** Ils sont à reconstruire, pas à résoudre ligne par ligne.
2. **Fichiers générés et copies Android** : `mobile/src/core/web/manifest.json`, `mobile/src/core/icons.generated.ts`, `mobile/scripts/sync-web-core.mjs`, `tools/db/build-production-bundle.mjs`. Les régénérer avec `node mobile/scripts/sync-web-core.mjs <checkout> <sha>` sur le SHA consolidé ; le test de hachage exige une copie Web/Android identique octet pour octet.
3. **Textes légaux** : `legal_privacy.html`, `supprimer-mon-compte.html`, `tools/data/legal-versions.json`, `tools/build-public-docs.mjs`, `changelog.html`. Rédiger **une** version consolidée qui couvre toutes les données (V1.6.5, V1.7.7, V1.8 ; V1.8 fait passer la politique de v15 à v18). Le libellé AdMob doit suivre la décision sur les publicités.
4. **Code partagé** : `package.json` (scripts de test de chaque lot), `css/ascension-app.css`, `tests/coherence-offers.test.mjs`, `tools/db/test-migrations.sh`, `mobile/src/data/api.ts`, `mobile/src/navigation/types.ts`, `SessionDetailScreen.tsx`, `CommunityScreen.tsx`, `journal.html`, `js/app/journal.js`, `js/app/parcours.js`, `netlify.toml` (SEO et GPS), `tools/build-public.mjs` (SEO, GPS et assetlinks).

Liste exhaustive des 76 fichiers partagés, par famille : registre, `files.shared_files`.

**Conflits sémantiques possibles même quand Git fusionne sans erreur :**
- l'ordre des écritures dans les fonctions d'export ;
- `titan_social_digest_v1` modifiée à la fois par V1.8.3 et V1.8.6 ;
- le lien Play ajouté par T2 contre la règle GP13 du bouclier SEO ;
- les nouvelles pages publiques et les scripts à déclarer dans `tools/seo/manifest.json` (`/sortie`, GPS) ;
- les paquets V1.9 conçus sans V1.8.

## 6. Flags, prix et droits, CI et coûts (relevés sans modification)

**Flags de production** (`private.titan_feature_flags`, lecture seule) :
- 25 drapeaux, tous actifs à 100 %, dont `screens.live`, `screens.cordee`, `screens.clubs`, `screens.routes`, les `screens.coach*` historiques et `auth.google` ;
- **absents de la production** : les 16 drapeaux revendiqués par les lots, à savoir `screens.gps`, `screens.cordee_relay`, `screens.cordee_reprise`, `screens.cordee_suite`, `screens.club_season`, `screens.club_match`, `screens.club_match_versus`, `screens.club_agenda`, `screens.coach_followup`, `screens.coach_feedback`, `screens.coach_review`, `screens.coach_programs`, `screens.coach_cycle_report`, `screens.coach_groups`, `ads.android`, `ads.android.interstitial`.

Un drapeau absent prend la valeur par défaut du client. A3 doit donc prouver que chaque défaut est « fermé ». Aucune ouverture globale.

**Offres et droits** (aucune modification) :

| Produit | Offre |
|---|---|
| `titan01` | `titan_plus` |
| `titan02` | `coach` (5 places) |
| `titan03` | `coach_pro`, affiché « Coach Ultra » (15 places) |

- Règle actuelle des places : celles de l'offre Coach ; sinon **20** places avec un TITAN+ personnel payant ; sinon 3.
- #155 propose de passer à 3 places sans offre Coach. **Décision du propriétaire requise.**
- `PLAY_BILLING_ENABLED=true` depuis le 19/11.
- Prix : 4,99 / 19,99 / 39,99 € visés, 5,99 / 23,99 / 47,99 € observés dans Play Console (selon le rapport ABSOLUTE ONE, non revérifié ici).
- Libellé à harmoniser : V1.9.6 écrit « Coach Pro 15 ».

**CI** :
- Durées constatées :

| Job | Durée |
|---|---|
| Qualite (Playwright) | 24 à 32 min |
| Réplique Postgres | environ 3 min |
| Android natif | 27 à 28 min |
| Sonde de production | toutes les 6 h, moins d'1 min |
| Audit du site publié | quotidien, 2 à 9 min |

- 1 203 exécutions au total sur le dépôt.
- **`main` 0dae9af est rouge au push** (run 44496036957) : un parcours instable, `one-aventure-live.e2e.mjs:43`. Le même SHA est vert sur sa PR.
- Netlify : offre `nf_team_dev`, déploiement en 25 s. Le coût en minutes et en euros ne se lit pas dans l'API : à relever dans la console.

## 7. Plan de fusion A2 (sur `integration/v2.0-all-versions`)

Une fusion par chaîne, `--no-ff`, sans force-push. Avant chaque fusion, un tag local de restauration `a2/rp-NN` est posé sur la tête précédente (poussé seulement si le propriétaire l'accepte).

| # | Source (SHA complet dans le registre) | Contient | Après la fusion |
|---|---|---|---|
| 0 | `main` `0dae9af` + documents A1 | — | `pnpm verify` ; noter les échecs hérités (base de référence) |
| 1 | SEO `73364dc2` (#166) | bouclier | `node tools/seo-guard.mjs` sur `dist/` ; check SEO |
| 2 | V1.7.7 `52a209bd` | V1.6.1–.4, V1.6.6, V1.7.1–.7 | `test:db` ; suites `journal-long-duration`, `week-plan`, `gps` ; Jest ; garde SEO (`/sortie`) |
| 3 | V1.6.5 `29424d8f` | Centre des sources | renuméroter `source_center` ; fusionner les deux `release-v24` ; textes légaux ; `source-center` 3/3 |
| 4 | V1.5.5 `52e83b24` | V1.5.0 à V1.5.5 | renuméroter les 6 migrations ; scénarios RPG sans double XP ; `rpg-multisport` |
| 5 | V1.8.6 `c7e0223f` | V1.8.1 à V1.8.6 | renuméroter les 6 migrations ; contrats de concurrence V1.8 ; drapeaux fermés |
| 6 | V1.9.6 `3229bdce` | V1.9.1 à V1.9.6 | régénérer v191 à v196 **après** V1.8 ; export final unique ; capacité des places |
| 7 | Partage `e767d523` | cartes story | conflits journal, parcours et écrans Android |
| 8 | Site/Play `01839119` | lien Play | **seulement après décision** (GP13) et approbation SEO |
| 9 | AdMob `34243ab3` | interrupteurs publicitaires | interrupteurs absents donc fermés ; textes légaux |
| 10 | assetlinks `2a3c6492` | sonde | `probe-prod` |
| 11 | Consolidation | paquets SQL régénérés, copies Android, textes légaux, `coherence-offers` | `pnpm verify`, `test:db` complet, Playwright complet, Jest, export Android, CI GitHub sur le SHA final |

**Points de restauration.**
- Les tags `a2/rp-01` à `a2/rp-11`.
- La production Web reste sur `6afec02bcf8ca878e98133e6` et la base sur `20261122090000` : aucune publication en A2.
- Un rollback du frontend n'annule pas une migration. Toute migration de production attendra une validation propriétaire, avec sauvegarde PITR préalable.

**Tests à rejouer** sur la base `0dae9af` **et** sur le candidat consolidé :
- les échecs hérités connus :
  - `coherence-offers` (privacy : limites citées par la politique) ;
  - `assistance: Profile gives a direct visible entry` ;
  - `public card actions: bearer stays A` ;
  - `rpg-multisport all4guardians` (sélecteur ambigu) ;
  - `one-aventure-live` (instable) ;
  - les postflights v131 44/54 (registre absent de la réplique).
- Tout échec nouveau sur le candidat est une régression à traiter avant A3.

## 8. Anomalies

| Gravité | Anomalie |
|---|---|
| **P0** | Réécritures concurrentes de `private.titan_export_extras_v1` : perte de sections d'export selon l'ordre d'application. |
| **P0** | Versions de migration en double (6 versions dont une triple) et 4 variantes de `release-v24` : impossible d'appliquer les chaînes ensemble sans renumérotation. |
| **P1** | Précontrôles des paquets figés sur v20 : chaque chaîne casse les autres. |
| **P1** | `main` rouge au push (E2E instable). |
| **P1** | Aucune protection sur `main`. |
| **P1** | CI jamais exécutée sur les 31 lots. |
| **P1** | Prérequis SEO non clos formellement (PR #166 non fusionnée, onglet sans compte rendu). |
| **P1** | Play Console inconnu ; `last-version-code.txt` resté à 1304. |
| **P1** | V1.8.2 et V1.8.3 : règles actives sans drapeau dès la migration. |
| **P1** | Lien Play (T2) contraire à la règle GP13. |
| **P1** | Textes légaux divergents dans 5 branches. |
| **P2** | 49 PR obsolètes ouvertes. |
| **P2** | Libellé « Coach Pro » contre « Coach Ultra ». |
| **P2** | 4 titres SEO de plus de 65 caractères. |
| **P2** | `tools/check-deployment.mjs` obsolète. |
| **P2** | `_redirects` racine périmé. |
| **P2** | `www.titan-app.fr` non testé. |

## 9. Arbitrages requis (propriétaire)

1. Clôture du bouclier SEO et fusion de #166 : prérequis d'A2.
2. #155 : places coach avec TITAN+ seul (20 actuellement, 3 proposées).
3. T2 : ajout du lien Google Play sur le site, contraire à GP13.
4. #147 et la consolidation d'icônes : approuver ou écarter les candidates graphiques.
5. Concours « Les 20 premiers » (`tender-clarke`).
6. V1.8.5 : intégrer le code sans pilote V1.8.4 (recommandé : intégré, drapeau fermé).
7. AdMob : texte légal et moment d'activation.
8. Fermeture des 49 PR obsolètes.
9. Protection de `main` et poussée des tags de restauration.

## 10. Limites et inconnus documentés

- Pas d'accès à Play Console, à la console AdMob, à Search Console en direct, ni à la facturation Netlify. Aucun chiffre n'est inventé.
- Les tests des lots sont **déclarés** par leurs rapports. A1 n'a rejoué aucune suite : ce n'était pas son périmètre, et aucune fusion n'a eu lieu. La base de référence de tests est la première étape d'A2.
- Aucune donnée utilisateur lue. Seuls le registre des migrations, la table des drapeaux et la table des produits ont été consultés, en lecture seule.

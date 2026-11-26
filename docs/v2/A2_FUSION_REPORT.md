# TITAN V2.0 — Mission A2 : fusion et données — compte rendu technique

Session Claude Code cloud du 26/11/2026. Départ : `integration/v2.0-all-versions` au SHA A1 `1418a8501bb5b8dfb11782994e71305bb9d89f45`
(main `0dae9af` + documents A1), **pas** `main`. Registre A1 : [`integration-manifest.json`](integration-manifest.json) (section `a2`
ajoutée). Séquence SQL : [`MIGRATIONS_V2.md`](MIGRATIONS_V2.md). Sécurité : [`A2_SECURITY_F2.md`](A2_SECURITY_F2.md). Compatibilité :
[`A2_CLIENT_SERVER_COMPAT.md`](A2_CLIENT_SERVER_COMPAT.md).

Vocabulaire : **prévu**, **codé**, **testé auto** (rejoué ici), **testé appareil**, **fusionné** (dans `main`), **publié**. A2 ne fusionne
rien dans `main`, ne publie rien, n'applique aucune migration, n'ouvre aucun drapeau, ne modifie aucun prix ni droit.

## 1. Re-vérifications avant fusion

- `main` distant toujours `0dae9af9b32d7cf7ec3ceca7b1dee52e92544f39` ; les 11 têtes de branches sources identiques au relevé A1.
- Base de tests sur `1418a85` : `pnpm verify` vert (782 tests Node), `pnpm run test:db` vert. Les échecs hérités cités par A1 ne se
  reproduisent pas sur la base (ils venaient des branches de lots) ; ils sont rejoués sur le candidat (§ 4).
- Prérequis « clôture SEO » : toujours non acté formellement (PR #166 ouverte, pas de compte rendu dans l'onglet SEO). A2 intègre le
  bouclier dans la branche d'intégration (pas dans `main`) pour que chaque fusion suivante soit contrôlée par lui.

## 2. Fusions (une par chaîne, `--no-ff`, sans force-push), dans l'ordre retenu

| # | Tag local | Commit | Source (SHA complet) | Contenu | Conflits | Résolution (jamais `--ours`/`--theirs` global) |
|---|---|---|---|---|---|---|
| 1 | `a2/rp-01` | `d237661c` | SEO `73364dc2ace76fe1e07d2771edc6dc61ab5cda6e` (PR #166) | bouclier SEO | 0 | — |
| 2 | `a2/rp-02` | `555498c0` | V1.7.7 `52a209bdbb1a2aba95e6864f61060fa805384c6a` | V1.6.1–.4, V1.6.6, V1.7.1–.7 | 1 | listes de tests de `package.json` fusionnées en union ordonnée |
| 3 | `a2/rp-03` | `d797771e` | V1.6.5 `29424d8f0ea0f73f2e9488ac0d949f3b5d37ff6e` | Centre des sources (fourche A) | 14 | textes légaux fusionnés par ligne de tableau / item / mot ; union des listes ; CSS par unité ; copie Android régénérée ; `release-v24` doubles remplacés ; séquence SQL canonique créée |
| 4 | `a2/rp-04` | `0ea1dc00` | V1.9.6 `3229bdceccf29b0db9359763ee4d37b33fb24e2b` | coaching V1.9.1–.6 | 8 | `SessionDetailScreen` (hooks déplacés par le journal + `useOwner` du coach) ; `test-migrations.sh` (blocs entiers) ; paquets v191–196 → v2-03 |
| 5 | `a2/rp-05` | `f3b49b73` | V1.5.5 `52e83b24283e7809d38ce4e828e014db79f3442f` | RPG V1.5.0–.5 | 7 | parcours d'export générique (postflights v11/v13) qui couvre les 5 couches du lot ; cas de sabotage du lot conservés |
| 6 | `a2/rp-06` | `240ca557` | V1.8.6 `c7e0223ffaf87fe7c78dc94905735e216da56b8d` | coopération V1.8.1–.6 | 12 | légal fusionné par mot ; journal des versions : une entrée consolidée qui garde chaque phrase ; lignes de rétention réunies |
| 7 | `a2/rp-07` | `b5be670b` | Partage `e767d523da405c5ee4dd8082c2a0929312ab3304` | cartes story 9:16 | 12 | « Partager » à côté de « Corriger » ; gestionnaires du journal réunis ; `shapeForSession` ajouté à la bibliothèque GPS ; paramètres Android `defi` + `sheet` |
| 8 | `a2/rp-08` | `e3f3d2fa` | — (A2) | paquet de consolidation v2-08 | — | export complet, hygiène des droits, garde finale |
| 9 | `a2/rp-09` | `412ffefd` | AdMob `34243ab3389aaaea95fe182077bf7ce9e8f2a584` | interrupteurs publicitaires | 0 | drapeaux absents = fermés |
| 10 | `a2/rp-10` | `08a1a773` | assetlinks `2a3c6492fbc7a4bfd379811476be16d21212898e` | sonde `/.well-known/assetlinks.json` | 0 | — |

Non fusionnés, avec motif : **T2** site/lien Play `funny-cerf` `018391199ab4…` (contredit la règle GP13 du bouclier SEO : arbitrage),
`tender-clarke` (concours « Les 20 premiers », engagement juridique : arbitrage), **#155** (places coach : décision commerciale),
**#147** et la consolidation d'icônes (graphisme non approuvé), `ecstatic-cerf` (visuels Play, hors code), les branches anciennes
classées par A1 (déjà présentes, remplacées ou obsolètes). Aucune expérimentation graphique étrangère au registre n'est intégrée.

**Preuve d'apport.** Les 31 têtes de lots, le partage, AdMob, le SEO et assetlinks sont ancêtres de la tête candidate
(`git merge-base --is-ancestor`, 35/36 ; seul T2 ne l'est pas). Seules deux suppressions de fichiers par rapport à `main`
(`mobile/src/lib/historyImport.ts` et son test), voulues par V1.6.4 (lecteur partagé).

## 3. Consolidation (phases 4 à 7)

- **SQL** : 26 migrations canoniques, 8 paquets `release-v2-01` … `-08`, registre ancien → nouveau avec SHA, sommes et paquets d'origine
  (`MIGRATIONS_V2.md`). Ordre prouvé par la matrice des objets (seule `titan_export_extras_v1` est partagée entre chaînes).
- **Export de compte** : une seule chaîne d'enveloppes (main → coaching → GPS → RPG → v2-08) ; GPS converti en enveloppe ; ajout des
  lots d'import et des synchronisations des sources ; garde qui refuse le paquet si une section disparaît.
- **Postflights historiques** v11, v13, v131 rendus robustes (parcours des appels réels au lieu de noms figés), même invariant.
- **Légal / confidentialité** : une seule version candidate par document (confidentialité 15, suppression 5, 26/11/2026), toutes les
  clauses des fourches conservées ; les entrées non publiées des lots sont tracées dans `legal-unpublished-versions.json`.
- **Core Web copié dans Android** : `mobile/scripts/sync-web-core.mjs` relancé à chaque fusion (57 modules, 343 icônes) ; le test de
  hachage Jest (`webCore`) est vert. Règles sport/XP : un seul moteur `js/core/*`, copié octet pour octet.
- **Documentation des lots** : références aux anciens paquets remplacées par les paquets canoniques.
- Refactoring de cohérence limité aux conflits ; aucune refonte esthétique, aucune ressource produite, aucun identifiant, route,
  jeton ou composant historique supprimé (bouclier SEO : 175 routes, P0 0, P1 0).

## 4. Tests rejoués sur la tête candidate

| Suite | Résultat |
|---|---|
| `pnpm run verify` (typecheck, 1 305 tests Node, build, audit public, release-check) | PASS (base : 782) |
| `pnpm run test:db` (base vierge) | PASS |
| `tools/db/v2-replica-rehearsal.sh` (réplique synthétique) | PASS : 94 contrôles, 0 échec |
| Android `tsc --noEmit` | PASS |
| Android Jest | PASS : 157 suites, 1 406 tests |
| Bouclier SEO sur `dist/` | PASS : 175 routes, P0 0, P1 0, P2 10 (titres longs connus) |
| Playwright complet (`test:e2e`, 1 257 parcours, Chromium du conteneur) | 1 250 PASS, 7 FAIL dans 5 fichiers (avant correctifs, tête `95971967`) |
| Les 5 fichiers en échec, après correctifs (`de0654b6`, `8a985d44`, `1ae75799`) + 9 fichiers voisins | PASS (discipline-analysis 3/3 passages, real-account 7/7, sortie-gps 8/8, rpg-multisport 2/2, smoke « Assistance » 3/3) ; la suite complète n'a pas été relancée après correctifs |
| `one-aventure-live` | instable : 1 échec sur 4 passages sur le candidat, 0 sur 2 sur `main` ici, déjà rouge au push de `main` selon A1 (P2 hérité, non corrigé) |
| Export Android (`expo export:embed`), Gradle, appareil | NON TESTÉ (CI Android / A3) |
| CI GitHub sur la tête | NON EXÉCUTÉE (aucune PR ouverte par A2 ; A3 crée la PR de consolidation) |

Échecs reproduits et traités (origine prouvée en rejouant sur `main` `0dae9af` et sur la tête V1.7.7 `52a209bd`) :

| Échec | `main` | tête du lot | Cause | Traitement |
|---|---|---|---|---|
| `real-account` 320/390/1440 px | PASS | FAIL | le journal V1.6.2 lit `titan_session_matches_v1` ; la fixture « compte réel » ne répondait pas ; puis `/stats` débordait de 480 px à 320 px (V1.7.5) | fixture : les 8 fonctions V2 lues par ces pages répondent « fonction introuvable » comme la production actuelle (preuve automatique nouveau client / ancien serveur : aucune erreur, aucun débordement) ; CSS `.da` corrigé |
| `discipline-analysis` (focus) | — | FAIL 1 fois sur 2 | un rendu arrivant juste après le changement perdait le focus | le rendu de la semaine rend le focus au contrôle d'analyse |
| `sortie-gps` « préparation » | — | FAIL | la ligne « Réglages » n'était redessinée qu'à l'événement `close` | redessinée aussi au clic sur « Fermer » |
| `rpg-multisport` all4guardians | PASS | PASS (V1.7.7) | sélecteur `[data-world]` ambigu une fois les panneaux RPG ajoutés (signalé par A1) | le test vise l'onglet du monde |
| smoke « Profile gives a direct visible entry » | FAIL 1 fois sur 2 | FAIL | titre lu avant le chargement de `/service` | attente du chargement |
| `public card actions: bearer stays A` | — | — | non reproduit (PASS dans la suite complète) | aucun |
| `coherence-offers`, postflights v131 | — | — | PASS (`coherence-offers`) ; v131 54/54 sur la réplique avec registre | aucun |

## 5. Limites

- Réplique **synthétique** (aucune donnée utilisateur exportée) au lieu d'une copie anonymisée de production.
- Aucun test sur appareil, aucune CI GitHub, aucun essai du nouveau client contre l'ancien serveur (analyse statique seulement).
- Modèle réellement utilisé : `claude-opus-5-5` (session et dernier tour servi) ; effort de session `high`, **inférieur** à l'« Extra élevé / maximum » demandé (écart signalé).

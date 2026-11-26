# Bouclier SEO de TITAN — guide d'exploitation

Le bouclier vérifie, **avant chaque publication puis en production**, ce que Google peut voir de `titan-app.fr` : statuts, redirections, indexabilité, canoniques, sitemap, robots, contenu, liens, boutons, fichiers, poids des pages. Il ne fige pas le SEO : un changement voulu d'une page publique est visible, relu et tracé, puis passe.

Audit initial, chiffres et preuves : [`AUDIT_2026-11-26.md`](AUDIT_2026-11-26.md).

## 1. Ce qui est contrôlé, et où

| Pièce | Rôle |
|---|---|
| [`tools/seo/manifest.json`](../../tools/seo/manifest.json) | **Le contrat** : chaque route (100, et leurs variantes `.html` et `/`), son groupe, sa criticité, ses attentes et le motif de chaque exception. Le diff de ce fichier *est* la revue d'un changement de routage. |
| [`tools/seo/baseline/production.json`](../../tools/seo/baseline/production.json) | **La référence** : la production du 26/11/2026 (déploiement `6afec02bcf8ca878e98133e6`, commit `0dae9af`), par page publique : titre, description, canonique, H1, intertitres, texte principal par blocs, liens internes, FAQ, données structurées, poids. Aucun secret, aucun cookie, aucun contenu privé (seulement les 27 pages publiques). |
| [`tools/seo/approvals.json`](../../tools/seo/approvals.json) | **Les approbations** : un changement voulu, pour une URL, une règle et la valeur exacte. |
| `tools/seo-guard.mjs` (+ `tools/lib/seo-guard.mjs`, `seo-html.mjs`, `seo-robots.mjs`, `netlify-emulator.mjs`) | Contrôle HTTP du HTML **brut** : sur `dist/` (servi localement avec les vraies règles de `netlify.toml`), une preview ou la production. Sans dépendance, sans réseau pour `dist/`. |
| `tools/seo-render.mjs` | Contrôle du **DOM rendu** (Chromium, téléphone 390 px et ordinateur 1 280 px, tiers coupés, première visite avec la bannière de consentement) et parcours Google → page → lien interne → connexion / inscription. Option `--perf` : mesures de laboratoire. |
| `tools/lib/build-context.mjs` | Écrit `/build-info.json` (commit, contexte Netlify, déploiement) et, **seulement** pour `deploy-preview`, `branch-deploy` ou `dev`, un `dist/_headers` avec `X-Robots-Tag: noindex`. |

Contrôles systématiques : statut final attendu, 404/5xx inattendus, boucles et chaînes de redirection, canonique unique et absolue vers la page elle-même, indexabilité selon le groupe (meta robots **et** `X-Robots-Tag`), sitemap XML valide et cohérent avec le contrat, robots.txt servi en `text/plain` et ne bloquant aucune page publique (règles Google : la plus longue l'emporte, `Allow` gagne à égalité), contenu principal présent, soft 404 (page vide ou page 404 servie en 200, repli qui répond 200 aux URL inconnues), boutons vers `/onboarding`, liens internes vers des pages mortes, scripts de la vitrine (aucun bundle applicatif, SDK ni carte), CSS/JS servis avec le bon type MIME et l'empreinte `rev=` (pas de mélange de deux builds), poids de chaque page, fichiers internes jamais publiés, hôtes en double, commit réellement servi, titres et descriptions dupliqués entre pages, pages publiques orphelines, réciprocité des `hreflang` (aucun aujourd'hui).

### Fidélité de l'émulateur

Mesurée le 26/11/2026 sur 114 chemins : **113 réponses identiques à la production** (statut, `Location`, `X-Robots-Tag`) ; le seul écart est une fonction serveur, volontairement non émulée ([preuve](evidence-2026-11-26/emulator-parity.md)). Règles reproduites : première règle qui correspond, `force` et masquage par un fichier, `/x` → `x.html`, `/x/` → 301 `/x`, en-têtes appliqués au **chemin demandé** (pas au fichier servi), aucun en-tête personnalisé sur une réponse 3xx, chemins sensibles à la casse. Non reproduit : le repli de casse de Netlify sur les fichiers existants (`/Fonctionnalites` → 301), contrôlé en production seulement.

## 2. Gravité

| Niveau | Effet | Exemples (règle du rapport) |
|---|---|---|
| **P0** — bloque | Build Netlify refusé (l'ancien déploiement reste en ligne), CI rouge, sonde rouge | page publique absente (`page-unavailable`), 5xx (`server-error`), `noindex` inattendu, `robots-disallowed`, canonique hors domaine (`canonical-mismatch`), URL historique sans redirection (`redirect-missing`, `route-dropped`), sitemap inaccessible ou incohérent à plus de 20 % (`sitemap-*`), page privée dans le sitemap, contenu principal disparu (`content-removed`, `soft-404`, `render-content-lost`), boucle de redirection, fichier interne exposé (`file-exposed`), cible des boutons cassée (`cta-broken`), noindex de preview dans un build de production (`noindex-propagation`, `build-context`), commit publié différent du commit validé (`build-mismatch`) |
| **P1** — revue | CI rouge tant qu'il n'y a pas d'approbation ; jamais bloquant dans le build Netlify ni la sonde | titre stratégique changé, contenu réduit de plus de 25 %, liens internes réduits de plus de 30 %, FAQ réduite, canonique changée, script applicatif sur une page publique, page plus lourde de plus de 30 % **et** 30 Ko, redirection en deux sauts, page indexable hors contrat, hôte en double indexable |
| **P2** — avertissement | Jamais bloquant, listé dans le résumé | titre de plus de 65 caractères, description hors 50–170, H1 multiple, texte modifié sans perte, nouvelle page, `lastmod` uniforme, page `noindex` hors contrat |

Seuils (dans le manifeste) tirés de la référence réelle : le plus petit texte de chaque groupe fixe son plancher (`/partenariats` 139 mots → 100 pour support et légal ; guides ≥ 328 → 250 ; vitrine ≥ 434 → 300). Un résultat réseau qui échoue après les nouvelles tentatives (2, délai 15 s) est **non concluant**, jamais une réussite : code de sortie 3.

Chaque constat donne : URL, assertion, valeur attendue, valeur obtenue, gravité et piste de correction.

## 3. Commandes

```bash
node tools/build-public.mjs
```

```bash
node tools/seo-guard.mjs check --dist dist
```

```bash
node tools/seo-guard.mjs check --base https://titan-app.fr --scope smoke --fail-on p0
```

```bash
node tools/seo-guard.mjs check --base https://deploy-preview-<n>--titano-app.netlify.app --context deploy-preview --expect-commit <sha> --wait-commit 480 --fail-on p0
```

```bash
node tools/seo-render.mjs --dist dist
```

```bash
node tools/seo-render.mjs --base https://titan-app.fr --perf --runs 3
```

```bash
node --test tests/seo-guard.test.mjs tests/seo-guard-defects.test.mjs tests/seo-guard-changes.test.mjs
```

Codes de sortie : 0 PASS (P2 tolérés), 1 FAIL, 3 non concluant (réseau), 2 usage. Rapports : `test-results/seo-guard/<nom>.json` et `.md` (le `.md` est aussi ajouté au résumé GitHub Actions). Dans un bac à sable dont le réseau passe par un proxy, préfixer par `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) ; inutile sur GitHub Actions.

## 4. Changer une page publique (le cas normal)

1. Modifier la page (ou son générateur `tools/build-public-site.mjs` / `tools/build-public-docs.mjs`).
2. `node tools/build-public.mjs && node tools/seo-guard.mjs check --dist dist`.
3. Un P1 apparaît (par exemple `title-changed`) : si c'est voulu, copier l'entrée que propose le rapport dans `tools/seo/approvals.json` et la compléter :

```json
{ "id": "2026-12-03-titre-fonctionnalites", "path": "/fonctionnalites", "rule": "title-changed", "to": "<le titre exact>", "reason": "Titre plus explicite pour « application suivi sportif »", "ref": "PR #171", "approvedBy": "Theo25460", "expires": "2027-01-31" }
```

   Une approbation couvre **une URL, une règle, une valeur exacte** (pour un texte : l'empreinte du nouveau contenu). Un nouveau changement de la même page la rend caduque. Pas de motif `*`, pas d'interrupteur global ; une règle de contrat (statut, noindex, robots, sitemap, soft 404, fuite) ne s'approuve pas : on corrige, ou on change le manifeste dans la PR.
4. Après publication, rafraîchir la référence **depuis la production** et retirer les approbations devenues inutiles (le rapport les signale `approval-unused`) :

```bash
node tools/seo-guard.mjs baseline --base https://titan-app.fr --reason "Publication du <date> : <changement>"
```

   La commande refuse une preview, un build local, et une production qui a un P0 ou un résultat non concluant. Le fichier se relit puis se commite à la main : la CI ne réécrit jamais la référence.

**Créer une page publique** : la page, ses deux règles `netlify.toml` (`/x.html` → 301 `/x` et la réécriture si besoin), son entrée dans `sitemap.xml`, son entrée dans le manifeste (groupe `guide`, `marketing`, `support` ou `legal`). Sans entrée, le bouclier lève `route-unclassified` (P1).

**Déplacer une URL** : nouvelle page + 301 directe `/ancienne` → `/nouvelle` dans `netlify.toml`, l'ancienne passe au groupe `redirect` (avec `location`) dans le manifeste, sitemap, liens internes et canonique mis à jour. **Supprimer sans équivalent** : groupe `gone` (404 ou 410), jamais une redirection vers l'accueil.

**Changement applicatif seul** (QG, journal, GPS, RPG, communauté, coaching) : rien à faire. Une nouvelle page d'application `noindex` est seulement signalée en P2 pour compléter l'inventaire (groupe `app`).

## 5. Previews, branches et production

| Hôte | Constaté le 26/11/2026 | Règle |
|---|---|---|
| `deploy-preview-<n>--titano-app.netlify.app` | `X-Robots-Tag: noindex` ajouté par Netlify, canonique vers `titan-app.fr` | + `dist/_headers` noindex écrit par le build (`CONTEXT=deploy-preview`) ; contrôlé par le job `seo-preview` |
| `<deploy-id>--titano-app.netlify.app` (permaliens) | `noindex` ajouté par Netlify | rien à faire |
| `<branche>--titano-app.netlify.app` (branch deploys) | Netlify n'ajoute **pas** de noindex au dernier déploiement d'une branche | `dist/_headers` noindex écrit par le build (`CONTEXT=branch-deploy`) |
| `titano-app.netlify.app`, `main--titano-app.netlify.app` | **200 indexables**, canonique vers la production | 301 de domaine vers `https://titan-app.fr/:splat` en tête de `netlify.toml` (effective à la prochaine publication) |
| `titan-app.fr` | indexable selon le manifeste | aucun `_headers` noindex ; un `CONTEXT` vide ou inconnu n'écrit **jamais** de noindex |

`robots.txt` est le même partout (jamais `Disallow: /` sur une preview : Google ne pourrait plus lire le `noindex`). Les canoniques, `og:url` et le sitemap sont écrits en dur sur `https://titan-app.fr` : rien n'est construit depuis l'hôte de la requête, et le contrôle rendu vérifie qu'aucun script ne les réécrit. Le build de production refuse un `_headers` noindex ; le contrôle de preview refuse une page sans noindex. `robots.txt` et `noindex` ne protègent aucune donnée : les écrans privés ne contiennent rien sans la session Supabase (RLS).

## 6. De la PR à la production

```
PR ─► CI « Qualite » (verify : tests + build + bouclier sur dist/ ; e2e : rendu ; base) ─┐
   └► Netlify Deploy Preview (même build + bouclier --context deploy-preview) ─► job seo-preview (commit exact) ─┤
fusion dans main ─► Netlify build de production : garde de publication (TITAN_APPROVED_RELEASE_SHA = commit) ─► build ─► bouclier P0 ─► publication
                                                                                                   └► échec = l'ancien déploiement reste en ligne
après publication ─► probe-prod (workflow_dispatch avec expect_commit, puis toutes les 6 h) + audit-live (quotidien, complet + rendu)
```

- **Verrou prépublication réel** : le build Netlify de production exécute la garde de publication puis le bouclier (`--fail-on p0`). Un P0 fait échouer le build : Netlify garde le déploiement précédent. La garde existante n'autorise que le SHA exact approuvé (`TITAN_APPROVED_RELEASE_SHA`).
- **Provenance** : `/build-info.json` nomme le commit construit par Netlify ; le job `seo-preview` attend la preview du **commit de tête** de la PR (pas le commit de fusion, pas un ancien commit) ; `--expect-commit` refuse en P0 une production qui sert un autre commit.
- **Checks requis** : `main` n'a aujourd'hui **aucune protection** (vérifié le 26/11/2026 : « Branch not protected », aucun ruleset). Voir § 9.
- **Secrets** : aucun job du bouclier n'utilise de secret ; permissions `contents: read`. Le code d'une PR s'exécute sans privilège.

## 7. Coût CI mesuré

| Étape | Avant | Après | Mesure |
|---|---|---|---|
| `pnpm test` (local, 4 cœurs) | 6,3 s, 782 tests | 13,4 s, 815 tests | +7 s : 33 scénarios en trois fichiers parallèles |
| Bouclier sur `dist/` (job verify) | — | 0,4–0,7 s, 172 routes | sans réseau |
| Build Netlify | — | +0,5 s | aucun build supplémentaire |
| E2E (job e2e, ~25 min) | 1 093 parcours | + 2 tests, ~16 s en local | |
| `seo-preview` (PR vers `main`) | — | 1 job, ~1–3 min (attente de Netlify, plafond 12 min) | lecture seule |
| `probe-prod` (toutes les 6 h) | ~20 s | + ~15 s (checkout, Node, smoke de 35 routes en 3,7 s) | |
| `audit-live` (quotidien) | ~3 min | + ~1,5 min (172 routes en 6 s, rendu 6 pages × 2 écrans) | |

Le dépôt est public : les minutes GitHub Actions des exécuteurs standard ne sont pas facturées. Netlify (offre `nf_team_dev`) : aucun build supplémentaire. **Aucune dépense nouvelle.** Le rendu complet et les mesures de performance ne tournent pas sur chaque PR (seulement les 6 pages critiques dans la suite E2E déjà existante).

## 8. Retour arrière (frontend Web)

Dernier déploiement sain connu, avant la V2.0 : **`6afec02bcf8ca878e98133e6`** (commit `0dae9af`, publié le 19/11/2026 09:24 UTC). Vérifié le 26/11/2026 : `ready`, sans expiration ; son permalien passe le bouclier complet (172 routes, 0 P0 : [preuve](evidence-2026-11-26/rollback-target-6afec02.md)).

1. **Décider** : un P0 en production (sonde ou audit rouge, rapport à l'appui), ou un parcours critique cassé. Suspendre les publications : ne pas changer `TITAN_APPROVED_RELEASE_SHA` (la garde refuse tout autre commit).
2. **Identifier la cible** : Netlify › titano-app › Deploys, le dernier déploiement de production vert dont le commit est connu (le permalien `https://<id>--titano-app.netlify.app` peut d'abord passer `node tools/seo-guard.mjs check --base https://<id>--titano-app.netlify.app --context deploy-preview --fail-on p0`).
3. **Vérifier les variables et fonctions** : un ancien déploiement garde **les fonctions et les variables d'environnement de son build**. Exemple réel : `PLAY_BILLING_ENABLED=true` n'est pris en compte qu'à partir de `6afec02…` ; restaurer `6afeab78f177d84c3561c584` (commit `2bcd078`, code Web identique) refermerait la vente. Comparer les fonctions (même empreinte dans l'API Netlify) et les variables avant de choisir.
4. **Vérifier la base** : un retour arrière du frontend n'annule aucune migration. Il n'est sûr que si les migrations appliquées depuis la cible sont additives (pas de suppression, de renommage ni de retrait de droit sur ce que l'ancien frontend appelle). Contrôle statique du 26/11/2026 des 25 migrations des lots V1.5–V1.9 : aucun `DROP TABLE/COLUMN` ni `RENAME` ; les `REVOKE` portent sur les nouvelles fonctions, et les deux fonctions publiques recréées (`titan_update_training_session`, `titan_session_changes_v1`) gardent leur signature et leur `GRANT` à `authenticated`. À reconfirmer par le lot base de données au moment de la V2.0.
5. **Restaurer** : Netlify › Deploys › le déploiement cible › **Publish deploy** (aucun rebuild, effet immédiat).
6. **Contrôler** : `node tools/seo-guard.mjs check --base https://titan-app.fr --scope full --fail-on p0` (avec `--expect-commit <sha>` si la cible sert `build-info.json`), puis `node tools/seo-render.mjs --base https://titan-app.fr`, puis les parcours connectés de `PUBLIC_RELEASE_QA_CHECKLIST.md` (connexion, séance, journal) et la sonde `probe-prod` (fonctions). Pour une PWA installée : vérifier la mise à jour du service worker.
7. **Consigner** : date, déploiement restauré, cause, rapports (artefacts), puis corriger sur une branche et republier normalement.

Ce runbook n'a **pas** été exécuté en production (aucun retour arrière réel n'était justifié) ; ses étapes 2 à 4 ont été vérifiées en lecture seule.

## 9. Réglages à faire par le propriétaire (non activables depuis cette session)

1. **Protection de `main`** (GitHub › Settings › Branches › Add rule, ou Rulesets) : *Require a pull request before merging* ; *Require status checks to pass* : « Tests et build public », « Parcours navigateur (Playwright) », « Migrations sur une replique vide (Postgres 17.6) » ; *Require branches to be up to date before merging* (un check vert d'une ancienne révision n'autorise plus une révision non testée). Ne pas rendre `seo-preview` obligatoire : il est absent des PR vers d'autres branches et peut être non concluant.
2. **Netlify › Branch deploys** : vérifier quelles branches sont déployées ; le `noindex` des branch deploys n'existe qu'à partir des builds qui contiennent ce changement.
3. **Après la prochaine publication** : `/build-info.json` en 200, puis retirer `"pending"` de sa route dans le manifeste ; `titano-app.netlify.app/` et `main--titano-app.netlify.app/` en 301.

## 10. Search Console (protocole, sans connecteur dans cette session)

Source actuelle des chiffres : l'Observatoire SEO quotidien (Google Doc) alimenté par Windsor.ai ; ne pas créer de second suivi.

- **Avant la V2.0** : exporter Performances › Résultats de recherche sur 28 jours et 7 jours (impressions, clics, CTR, position ; onglets Requêtes et Pages, export CSV), Indexation › Pages (indexées, non indexées par motif, export), Sitemaps (date de dernière lecture). Classer les requêtes contenant « titan » en marque.
- **Le jour J** : `seo-guard` complet et rendu sur la production, avec `--expect-commit` ; soumettre `https://titan-app.fr/sitemap.xml` (Google ne l'a pas relu depuis le 24/05/2026) ; inspecter seulement les URL dont le titre ou la canonique a changé.
- **J+1, J+7, J+14, J+28** : mêmes exports. Tenir compte du délai de 2–3 jours, des journées provisoires et du faible volume (100 impressions / 7 jours au 24/11/2026). Une variation de position due à de nouvelles requêtes n'est pas un incident : chercher d'abord une corrélation avec une URL touchée, une erreur d'exploration ou une date de déploiement. Ne pas demander l'indexation en masse.

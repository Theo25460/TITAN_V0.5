# SEO07 / SEO04 / SEO08 — correction et contrôles — 17 octobre 2026

## Changement livré

Le générateur publiait `2026-10-05` comme dernière modification de toutes les pages, indépendamment de leur évolution. Le champ facultatif `lastmod` est maintenant omis du sitemap et de son générateur jusqu'à la disponibilité de dates significatives fiables par page. La constante partagée inutilisée et son import/export ont été retirés. Les mêmes 23 URL et priorités sont conservées ; aucune page publique, offre ou règle métier n'est modifiée.

Base : PR #65, commit `d4877515385dff8c9056089577bd79b2b22fe5f2`. Nouvelle branche isolée ; le chantier actif de validation du nom Profil n'est pas repris. Aucun changement de configuration Netlify, robots.txt, backend, données, Android ou Search Console ; aucune fusion ni mise en production.

## Les trois points travaillés

| Exigence | Résultat de ce lot | Reste à vérifier |
| --- | --- | --- |
| SEO07 | Dates non justifiées retirées à la source et du XML versionné ; génération identique au sitemap commité, 23 URL préservées. | Intégration de la chaîne puis contrôle du déploiement exact : l'audit précédent observait 22 URL en ligne. |
| SEO04 | Test du sitemap réellement généré contre les canonical propres aux routes publiques. Détection des doublons, URL manquantes/surnuméraires et d'une canonical pointant vers une autre page. Une page sans robots reste indexable par défaut et entre dans le contrôle. | Audit complet titres/descriptions et recette distante des métadonnées de la release. |
| SEO08 | Contrôle explicite de 20 pages de compte, d'application, d'administration, de secours et de partage : `noindex` générique dans le head initial et absence du sitemap généré. Les commentaires ne comptent pas comme des balises actives. | Index Google, configuration CDN réelle et variantes de routes après déploiement. `noindex` ne démontre jamais l'autorisation d'accès aux données. |

Ces trois exigences restent globalement `[~]` : le correctif et les tests sont livrés sur branche, la recette du déploiement reste ouverte.

## Validation

- Baseline avant modification : `pnpm verify`, 183/183 tests, build réussi et audit sans erreur, avec 16 avertissements existants.
- RED : le nouveau test du vrai générateur échoue sur les `lastmod` figés. Les huit autres tests ciblés passent ; cet échec est une assertion de comportement, pas une erreur d'environnement.
- GREEN : neuf tests `public-offer` passent, y compris la reproductibilité des pages d'offre existantes. Trois nouveaux contrats sont inclus dans la commande de tests déjà exécutée par verify, sans modification du pipeline.
- `pnpm verify` final : 186/186 tests, build et audit réussis ; 16 avertissements existants. Aucun test SQL ou accès à une base réelle n'est requis par ce diff de sitemap.
- Navigateur : `node --test --test-concurrency=1 --test-name-pattern='SEO metadata|private pages are noindex' tests/e2e/smoke.e2e.mjs` : 7/7 passent dans Chromium, avec XML parsé par DOMParser, inventaire servi et pages CMS. Ce sont sept tests ciblés ; la suite navigateur complète n'est pas revendiquée. Premier lancement avant la fin d'installation de Chromium bloqué dans le hook de préparation ; aucun défaut produit déduit de cet échec d'environnement. Relance réussie après installation.
- Contrôles négatifs en copie temporaire : canonical Assistance vers l'accueil et suppression de `noindex` sur Profil détectées. Revue indépendante : directive générique renommée en Googlebot, balise commentée et nouvelle page sans robots absente du sitemap également détectées. Fixtures restaurées, 9/9 rejoués.
- Revue indépendante : un défaut Important et deux Minor de couverture initialement relevés, tous corrigés et vérifiés par le même reviewer. Aucun Critical/Important/Minor restant dans le diff revu. Aucun élargissement à l'application.

## Reprise

Le sitemap correct ne doit pas être déployé en contournant les validations de la chaîne existante. Après intégration autorisée, appliquer `SEARCH_CONSOLE_RELEASE_RUNBOOK.md` sur le déploiement exact. La suppression de `lastmod` ne garantit ni exploration ni indexation de Google.

Le précédent handoff mentionnait par erreur `/a/:token` comme variante de partage non couverte ; la configuration versionnée utilise `/u/*` vers athlete.html. Ce chemin est aussi présent dans le test navigateur existant exécuté ici avec un token synthétique. Cela reste un contrôle du serveur local, pas du CDN ni d'une carte réelle.

Référence officielle déjà vérifiée pour ce choix : [Google Search Central — construire un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). `lastmod` doit représenter une modification significative réelle lorsqu'il est fourni.

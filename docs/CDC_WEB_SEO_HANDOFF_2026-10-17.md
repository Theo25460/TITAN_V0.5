# Lot SEO07 / SEO08 / SEO10 — 17 octobre 2026

## Résultat

Trois points traités : contrôle sitemap/robots, exclusions d'indexation et procédure Search Console. Aucun changement de l'application, des métadonnées, du routage, de robots.txt ou du sitemap ; aucune fusion, soumission Search Console ni mise en production.

Base technique auditée : PR #64, commit `e4650a3cd65890cc2d84ec6b096045242f562296`. Les preuves distantes portent sur le site public au moment des GET, pas sur une preuve que ce commit est déployé. Branche documentaire isolée, PR ciblant la branche de #64 pour limiter le diff à ce lot. Le chantier de validation du nom Profil déclaré actif dans le cahier reste réservé à son propriétaire.

## SEO07 — partiel

- Build neuf : 44 fichiers HTML à la racine de dist, dont une preuve Google de propriété, 23 pages prévues au sitemap et 20 pages avec `noindex`.
- Les 23 URL du sitemap sont uniques, HTTPS sur titan-app.fr, sans query/fragment, avec un fichier généré et une canonical correspondante ; aucune page `noindex` n'y figure. Pas de conflit avec les règles de blocage robots présentes. Liste du générateur identique au XML versionné.
- Le site public répond 200 sur robots.txt et sitemap.xml. Le robots public est identique au fichier de la branche. Les 23 routes publiques répondent 200 et déclarent leur canonical attendue sans `noindex` dans les directives contrôlées.
- Écart réel : 22 URL dans le sitemap public contre 23 sur la branche ; `/partenariats` est absent en ligne, alors que sa page répond 200. L'ajout a déjà été préparé en PR #35 ; ne pas produire un second correctif concurrent. Recontrôler après intégration et déploiement validés de la chaîne.
- Les `lastmod` sont tous `2026-10-05`. Le générateur les reprend de la constante `TODAY` figée dans `tools/lib/public-template.mjs`, même pour Assistance modifiée depuis. Cette date ne prouve donc pas la dernière évolution significative de chaque page. Prochain correctif : dates justifiées par page ou suppression du champ facultatif lorsque sa valeur n'est pas connue ; ne pas remplacer uniformément par la date de build.

SEO07 reste `[~]` : le contrôle est effectué, mais les dates et la cohérence du sitemap après déploiement restent à régler.

## SEO08 — vérification technique obtenue, recette Google ouverte

Les 20 routes ci-dessous sont absentes du sitemap de la branche et déclarent `noindex` dans leur HTML initial public. Certaines disposent aussi d'un en-tête HTTP ; les deux couches ne sont pas nécessaires pour qu'une directive soit présente.

| Routes contrôlées | Nombre |
| --- | ---: |
| `/404`, `/network-error` | 2 |
| `/admin`, `/dynamic-page`, `/athlete` | 3 |
| `/login`, `/onboarding`, `/update-password`, `/profile` | 4 |
| `/aujourdhui`, `/adventure`, `/boutique`, `/coaching`, `/journal`, `/objectifs`, `/prevoir`, `/records`, `/social`, `/stats`, `/training` | 11 |

Les deux variantes de `sys_core_override_99` et une URL inexistante dédiée répondent 404. La page `/404` elle-même répond 200 avec `noindex` : la réponse 404 d'une URL réellement absente a été contrôlée séparément. Les sept entrées internes contrôlées (`sys_core_override_99.html`, package.json, sql, tools, functions, .git et netlify.toml) sont absentes du build.

Limites : GET anonymes de routes fixes, redirections suivies. Pas de consultation de compte, de session authentifiée ou de carte contenant un token réel ; variantes `.html` et routes `/a/:token` non couvertes systématiquement. Aucun audit RLS ou contrôle d'autorisation ne peut être déduit de `noindex`. L'absence de résultats dans l'index Google n'est pas démontrée par ces GET, ni par la réponse lisible d'un moteur de recherche. SEO08 reste `[~]` jusqu'à la recette Search Console et aux contrôles des variantes après déploiement.

## SEO10 — procédure livrée

`SEARCH_CONSOLE_RELEASE_RUNBOOK.md` couvre prérequis de release, contrôle HTTP et des dates, droits Search Console, sitemap, inspection indexée/directe, canonical choisie, demandes ciblées, exclusions et preuve de suivi. Sources officielles Google relues, sans promesse de délai ou d'apparence du résultat. SEO10 peut passer `[x]` : l'exigence est de prévoir une procédure, pas de prétendre l'avoir exécutée.

## Vérifications et reprise

- `node tools/build-public.mjs` : réussi, 101 fichiers précachés.
- `node tools/audit-public.mjs` : zéro erreur et 16 avertissements préexistants ; 43 HTML applicatifs/publics analysés, hors preuve de propriété Google.
- Inventaire Python stdlib : HTMLParser limité au head, XML ElementTree, configuration TOML ; assertions sur 23 URL, parité générateur, canonical, absence de noindex dans le sitemap et exclusions du build.
- 48 GET publics, 8 workers maximum, timeout de 15 secondes par URL, sans authentification ni mutation : aucune erreur réseau ; 45 réponses finales 200, trois réponses 404 attendues. Assertions sur les 23 pages publiques et les 20 exclusions, plus le delta exact d'une URL du sitemap. Aucune mesure de performance tirée de ce lot.
- Preuve horodatée et digest des réponses réussies : `CDC_WEB_SEO_AUDIT_EVIDENCE_2026-10-17.json`. Le fichier contient les URL fixes, statuts finaux, directives, canonical, sitemap/robots et inventaire local, sans corps HTML ni informations de compte. Les hashes sont des empreintes de corps décodés UTF-8, pas des identifiants de déploiement.

Le script de collecte ponctuel utilisait urllib.request avec redirections suivies ; ses contrôles sont décrits ici et les chemins exacts sont dans la preuve. Aucun outil applicatif nouveau à maintenir, aucun test de produit modifié. Les suites SQL, unitaires et navigateur ne sont pas relancées pour ce lot exclusivement documentaire ; leurs anciens résultats ne sont pas revendiqués comme nouvelle preuve.

Prochaine reprise : corriger la politique `lastmod` dans un lot déclaré, intégrer la chaîne existante après validation, contrôler sitemap/variantes sur le déploiement exact, puis appliquer le runbook Search Console. Les exigences et autres statuts du cahier restent conservés.

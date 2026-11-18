# Opération SEO V1.3.1 — acquisition organique, autorité sportive et conversion

Rapport de mission du 18 novembre 2026. Branche `claude/funny-heisenberg-l7zcpi`, créée depuis `main` à `a4dc113` (fusion de la PR #149, qui inclut la PR #148). Rien n'est publié : la production n'a pas été touchée.

Vocabulaire tenu dans tout le document : **impressions** et **clics** = Search Console ; **sessions** et **pages d'atterrissage** = GA4, seulement pour les visiteurs qui ont accepté GA4 ; **inscriptions** = événement serveur `signup` (et conversion GA4 `sign_up` après accord) ; **utilisateurs actifs** = séances confirmées par le serveur. Un clic Search Console n'est ni un visiteur unique ni une inscription.

## 0. Sources consultées et limites

| Source | Accès | Ce qui en a été tiré |
|---|---|---|
| Observatoire SEO quotidien (Google Doc `1M8qm0bj…`) | Lu en entier le 18/11 (26 entrées, 29/10 → 18/11, plus la référence V1.3.1 du 10/11 et l'audit du 14/11) | Toutes les données de performance de ce rapport |
| Google Search Console, Windsor.ai, Google Analytics | **Aucun connecteur dans cette session** | Aucune donnée relue en direct. Dernière journée GSC connue : 15/11/2026 (Observatoire du 18/11) |
| Production `https://titan-app.fr` | Requêtes HTTP anonymes le 18/11 | État réel servi (§ 1.1), contrôle `tools/check-seo-live.mjs` |
| `www.titan-app.fr`, `titano-app.netlify.app` | Refusés par le relais réseau de la session (502 / 403) | **Non vérifiés** ; `http://titan-app.fr` → 301 `https://` vérifié |
| Recherche web | Moteur géolocalisé aux États-Unis | Repérage des homonymes et des concurrents ; **ce n'est pas une page de résultats Google France** |
| Wikipédia, MEC (tableaux de cotations) | Hôtes bloqués par la politique réseau | Le tableau voie ↔ YDS n'a pas pu être recoupé : il n'est pas publié (§ 3) |
| Dépôt, PR #148 / #149, `docs/v131/lot7-seo.md` | Complet | Travaux antérieurs vérifiés avant toute modification |

## A. Diagnostic priorisé

### 1.1 Faits établis (preuves reproductibles)

1. **Les corrections SEO des PR #148/#149 ne sont pas en ligne.** La production sert le build du 4 novembre (`sw.js` : `titan-os-v301-profile-sync-20261104-r1`) ; le dépôt est à `titan-os-v301-v13-20261109-r1`. Le message de fusion de #149 le dit : « Cette fusion ne publie rien : Netlify attend `TITAN_APPROVED_RELEASE_SHA` ». Contrôle `node tools/check-seo-live.mjs https://titan-app.fr` du 18/11 : **29/38 contrôles conformes au dépôt**. Écarts : sitemap servi à 25 URL au lieu de 27 ; `/suivi-velo` et `/defis-sportifs` répondent **404** ; anciens title ou description sur `/`, `/service`, `/suivi-escalade`, `/changelog`, `/pour-les-coachs`, `/journal-course-a-pied`.
2. **Google n'a pas relu le sitemap depuis le 24/05/2026** (rapport Sitemaps, contrôle direct du 06/11 consigné le 10/11). Les « 18 soumises » décrivent le fichier de mai. 25 (fichier servi), 18 (soumises), 9 (découvertes via le sitemap) et 20 (indexées, toute la propriété) sont quatre mesures différentes.
3. **`/suivi-escalade` est indexée** (inspection du 10/11). Son recul (61 impressions du 25 au 30/09, 11 les 01 et 03/10, plus rien ensuite) n'est pas une désindexation et il commence **avant** la refonte du 05/10.
4. **Les requêtes visibles sont des requêtes de marque, partagées avec des homonymes.** Du 09 au 15/11 : 28 des 29 impressions à requête visible contiennent « titan » ; une seule requête hors marque (« application sport digitalisation », position 69). 59 impressions sur 88 n'ont pas de requête visible et sont inclassables. D'autres produits portent le nom : Hudl Titan (traceur GPS d'équipe — cf. « titan gps »), Titan Athlete, Titan Workouts, « titan summit app », marques grand public (« sav marque titan »).
5. **L'ancien title de l'accueil ne contenait ni « application » ni « app »**, alors que « titan application » (≈ 13–17 impressions par semaine, 0 clic) et « application titan » sont les requêtes visibles les plus fréquentes.
6. **Le candidat V1.3.1 est techniquement propre.** Crawl statique des 27 URL du build : 0 lien interne cassé, 0 orpheline, une canonique égale à l'URL du sitemap, JSON-LD valide, aucune note ni avis déclarés, fils d'Ariane visibles = déclarés, aucun title ni description en double. Pages d'application : `noindex` et hors sitemap. Seuls écarts : 4 titles au-delà de 65 caractères, dont celui de `/service`, où la partie coupée était justement « application de sport ».
7. **Performances : pas de goulot.** Lighthouse 12, mobile simulé, build local non compressé : performance 95 (accueil) à 98, SEO 100, accessibilité 100, CLS 0, LCP 2,3 à 2,7 s. En production, les feuilles de style pèsent 8 + 4 Ko en brotli. Aucune donnée terrain (Search Console n'a pas assez de trafic ; le suivi Netlify RUM est à lire dans la console Netlify).
8. **La mesure ne relie pas une recherche Google à une inscription.** GA4 ne reçoit ni référent (`page_referrer: ""`) ni paramètre : toute visite y apparaît « directe ». La politique de confidentialité publiée limite GA4 aux pages vues et à trois conversions sans donnée. En revanche, GA4 permet déjà de croiser **page d'atterrissage × `sign_up`** pour les visiteurs consentants (exploration « Page de destination »).

### 1.2 Hypothèses (non démontrées)

| Sujet | Hypothèse | Confiance | Comment trancher |
|---|---|---|---|
| Escalade | Google a testé la page à son entrée dans le sitemap (13/09), puis l'a reléguée : à l'époque, elle parlait de « suivi » d'une application alors que la recherche « cotation bloc escalade » attend l'échelle et des correspondances | Faible à moyenne | Positions et impressions de `/suivi-escalade` 28 jours après la publication de la version candidate, à comparer aux 28 jours précédents |
| `/service` | 0 clic sur 37 impressions/semaine : homonymes (personnes qui cherchent l'assistance d'un autre Titan), accueil affiché au-dessus pour la marque, position ≈ 7 | Moyenne | CTR de `/service` après publication ; ventilation page × requête dans GSC |
| « titan application » | Une partie des personnes cherchent un homonyme ; les autres ne reconnaissent pas une « application » dans l'ancien title | Moyenne | CTR des requêtes « titan application », « application titan » sur 28 jours après publication |
| 4 « explorées, non indexées » | Anciennes orphelines (`/progression-sportive`, `/motivation-sport`, `/partenariats`), pages minces, pages créées les 20–21/10 | Faible | Export du rapport Pages à J0, J+14, J+28 |

### 1.3 Causes confirmées

- **Aucun effet des travaux SEO de novembre ne peut encore exister** : ils ne sont pas servis (fait 1) et Google ne lit pas le sitemap actuel (fait 2). C'est la cause confirmée n° 1 de la stagnation **depuis le 14/11** — pas des causes antérieures.
- Le recul de l'escalade **n'est pas** dû à une désindexation ni à la refonte du 05/10.

### 1.4 Priorités

| Niveau | Action | Impact SEO | Confiance | Bénéfice utilisateur | Effort | Risque | Mesurable |
|---|---|---|---|---|---|---|---|
| **P0** | Publier la V1.3.1 (SHA approuvé) puis contrôler 38/38 avec `tools/check-seo-live.mjs` | Élevé : débloque tout le reste | Élevée | Élevé | Décision propriétaire | Faible côté SEO | Oui (immédiat) |
| **P0** | Soumettre à nouveau le sitemap, inspecter 7 URL (`docs/SEARCH_CONSOLE_RELEASE_RUNBOOK.md`, section V1.3.1) | Élevé | Élevée | — | 15 min | Nul | Oui (date de lecture) |
| P1 — fait | Titles de l'accueil et de `/service` désambiguïsés ; boutons de guides explicites ; test de non-régression | Moyen | Moyenne | Moyen | Fait | Faible | Oui (CTR à 28 j) |
| P1 — fait | Contrôleur production ↔ dépôt (`tools/check-seo-live.mjs`) | Indirect | Élevée | — | Fait | Nul | — |
| P2 | Tableau voie ↔ YDS sur `/suivi-escalade`, après vérification sur une source de référence (FFME, IFSC) | Faible à moyen | Faible tant que non vérifié | Moyen | 1 h | Erreur factuelle si non vérifié | Oui |
| P2 | Décision sur la mesure d'acquisition (catégorie de provenance sans URL, mise à jour de la politique) | Indirect | — | — | Décision + 2 h | Juridique | — |
| P2 | Liens entrants éditoriaux (§ C.3) | Élevé à terme | Moyenne | — | Continu | Faible si légitime | Oui (liens dans GSC) |

## B. Corrections livrées

| Commit | Fichiers | Avant → après | Pourquoi |
|---|---|---|---|
| `d8b34ea2` | `tools/build-public-site.mjs`, `index.html` | Title « TITAN — Journal sportif multisport, progression et aventure » → **« TITAN — Application de suivi sportif multisport et gratuite »** (59 car.) ; description → « Application gratuite de suivi sportif en français : un journal pour 260 sports, tes statistiques, tes records et une progression façon RPG. Privé par défaut. » (157 car.) | Fait 5 : la personne qui cherche « titan application » doit reconnaître une application de sport ; celle qui cherche un homonyme peut passer son chemin. « Française » n'est pas écrit : les mentions légales ne l'établissent pas. |
| `d8b34ea2` | idem | `WebApplication` : `description`, `inLanguage`, `publisher` (référence à l'organisation) | Décrire ce qui est visible ; aucune note, aucun avis |
| `d8b34ea2` | `tools/build-public-docs.mjs`, `service.html` | « Assistance TITAN : aide, connexion et contact — application de sport » → **« Assistance TITAN, l'application de sport : connexion, aide, contact »** | Fait 6 : le désambiguïsant passe dans les 60 premiers caractères |
| `d8b34ea2` | `tools/build-public-docs.mjs`, 6 guides | Bouton « Commencer » → « Ouvrir mon carnet » (musculation, escalade), « Commencer mon journal » (course, multisport, journal), « Ouvrir mon journal vélo » ; même destination `/onboarding` | Dire ce que l'on obtient ; mesuré : une seule ligne à 320 px (21 car. au plus tiennent) |
| `d8b34ea2` | `tests/seo-crawl.test.mjs` (ajouté à `pnpm test`) | — | Garde : liens internes cassés, liens `.html` (301 inutiles), notes/avis en données structurées, désambiguïsation des titles de marque, boutons des guides. Vérifié : le test échoue si l'on remet l'ancien title ou un lien `.html` |
| `d8b34ea2` | `PUBLIC_SEARCH_PREVIEW.md` | Aperçu de recherche mis à jour | Contrat de `tests/public-offer.test.mjs` |
| `5708c26b` | `tools/check-seo-live.mjs` | — | Compare ce qu'un site déployé **sert** au dépôt (sitemap, robots, statut, canonique, indexabilité, title, description, H1, redirections, 404, `noindex` des écrans privés, build servi) |
| `5708c26b` | `docs/SEARCH_CONSOLE_RELEASE_RUNBOOK.md` | Section « Release V1.3.1 — jour 0 » | Séquence exacte : preview, production, sitemap, 7 inspections, export du rapport Pages |

**Ce qui n'a pas été refait** (déjà correct dans `main` depuis #148/#149, vérifié par le crawl) : réécriture de `/suivi-escalade` (échelle 4 → 8A, notations reconnues), enrichissement des six guides minces, maillage et fin des orphelines, 14 fils d'Ariane, `/suivi-velo`, `/defis-sportifs`, entrée v1.1 des Nouveautés, nœud `WebSite` unique.

**Ce qui n'a pas été touché, volontairement** : logique sportive, progression RPG, achats, permissions, migrations, écrans privés, direction artistique, `/titan-plus` (figé par la décision du 21/10 et par #155 en attente), textes juridiques, mesure GA4 (la politique publiée ne couvre ni clic de bouton ni provenance), CSS (aucun gain réel en production pour un risque de régression visuelle).

## C. Positionnement concurrentiel

Méthode : intention, résultats observables, ce que les concurrents font bien, ce qui manque, ce que TITAN possède réellement, opportunité, coût. Limite : la recherche web disponible est géolocalisée aux États-Unis ; les résultats ci-dessous indiquent les **types** de concurrents, pas des positions Google France.

| Sujet | Intention | Concurrents réellement présents | Leur force | Ce qui manque | Atout réel de TITAN | Décision |
|---|---|---|---|---|---|---|
| **Cotations de bloc** (« cotation bloc escalade ») | Informationnelle : l'échelle et des correspondances | Guides de marques et sites spécialisés (Mammut, 99boulders, DPM Climbing), convertisseurs | Tableaux complets, autorité de marque | Le lien entre la cotation et **son propre carnet** ; la mise en garde « bloc ≠ voie » est rarement concrète | Échelle Font 4 → 8A avec repères V, notations reconnues à la saisie, carnet qui garde le système d'origine, gratuit | **Priorité n° 1 hors marque** (seule demande prouvée : 72 impressions en position 5–7). Publier la version candidate et mesurer 28 j. P2 : voie ↔ YDS une fois vérifié |
| **Marque** (« titan application », « titan app ») | Navigationnelle, mélangée aux homonymes | Hudl Titan, Titan Athlete, Titan Workouts, Tennessee Titans | Notoriété | — | Le seul TITAN de suivi sportif multisport en français | **Fait** : titles désambiguïsés. Ne pas chercher à capter l'assistance d'autres marques |
| **Journal multisport** (« application suivi sportif multisport ») | Commerciale : choisir une application | Listes « meilleures applications » (blogs de coachs, sites de téléchargement), Strava, Decathlon Coach | Notoriété, GPS, plans | Peu d'outils gratuits qui tiennent un journal **par discipline** (mesures propres à chaque sport) sans abonnement | 260 sports avec mesures propres, records avec séance source, progression qui ne s'achète pas, gratuit | Page `/suivi-sportif` = point d'entrée. L'autorité viendra d'être **cité** dans ces listes (liens éditoriaux), pas de pages supplémentaires |
| **Carnet de musculation** | Commerciale (application) ou outil (calcul 1RM) | Fiches des stores (Hevy, StrongLifts, Carnet de Musculation) ; calculateurs 1RM | Applications spécialisées très abouties | — | Carnet série par série, RIR, routines, dans le même journal que les autres sports | Pas de page « calcul 1RM » : **TITAN affiche explicitement « Ce n'est pas un 1RM estimé »** ; une page 1RM contredirait le produit |
| **Allure course à pied** (« tableau allure ») | Outil / tableau | Campus Coach, The Running Collective, Miles Republic, Alltricks, calculateurs | Tableaux et calculateurs complets | Rien que TITAN fasse mieux aujourd'hui | Allure calculée dans le journal | **Pas de page.** Idée d'outil pour plus tard (calculateur relié au journal), seulement si les requêtes le justifient |
| **Vélo, gravel, VTT** | Commerciale + outil GPX | Strava, Komoot, Openrunner (itinéraires) | Cartes, itinéraires | — | Analyse GPX sur l'appareil, sept pratiques cyclistes, même journal que les autres sports | Page `/suivi-velo` (déjà créée) à publier et mesurer ; TITAN n'est pas un planificateur d'itinéraires et ne doit pas le promettre |
| **Défis sportifs** | Souvent : idées de défis (« défi 30 jours ») | Blogs et magazines | Listes d'idées | — | Défis sans mise, quêtes, TITAN Duo, saisons | `/defis-sportifs` publiée telle quelle ; attente faible, intention partiellement différente |

### C.3 Autorité durable (mois suivant la publication) — toutes les prises de contact demandent ta validation

1. **Communautés d'escalade** (salles, clubs FFME/FFCAM locaux, associations sportives étudiantes) : proposer la page des cotations comme ressource gratuite pour les débutants ; c'est le sujet où TITAN a une demande prouvée.
2. **Listes « meilleures applications de suivi sportif »** : écrire aux auteurs des articles existants avec une fiche factuelle (gratuité, 260 sports, données privées par défaut). Aucun lien payé.
3. **Associations sportives universitaires** (BDS) : cohérent avec l'histoire du projet ; utilisation réelle par des groupes, donc mentions naturelles.
4. **Annuaires d'applications** légitimes et, à son ouverture, la fiche Google Play (lien depuis le site via `tools/data/play-store.json`).
5. **Amélioration continue** plutôt que création : une page n'est retravaillée qu'à partir d'une requête observée en position 4–15 avec un CTR faible.

Interdits maintenus : achat de liens, réseaux de sites, pages satellites, avis inventés, génération de pages par sport ou par ville.

## D. Plan 30 / 60 / 90 jours (à compter du jour de publication)

Aucun objectif de position ni de trafic : 80 à 90 impressions par semaine ne permettent aucune promesse. Les fenêtres se comparent à durée égale, sans chevauchement, en tenant compte du délai de consolidation de GSC (2 à 3 jours) et de la limite de 30 jours d'historique du connecteur Windsor.

| Échéance | Action | Indicateur de réussite | Source |
|---|---|---|---|
| **J0** | Publier ; `check-seo-live` 38/38 ; soumettre le sitemap ; inspecter 7 URL ; exporter le rapport Pages | 38/38 ; sitemap lu à J0 ; canonique choisie = déclarée | Script, GSC |
| **J+7** | Vérifier exploration et erreurs | Sitemap lu, 27 URL dans le fichier, découvertes > 9 ; aucune erreur d'exploration nouvelle ; `/suivi-velo` et `/defis-sportifs` explorées | GSC (Sitemaps, Pages) |
| J+7 | Vérifier la mesure | Pages vues GA4 sur les guides ; `sign_up` présents (consentants seulement) | GA4 |
| **J+14 à J+28** | Premières comparaisons (28 j après / 28 j avant) | Pages indexées (20 → ?), « explorées non indexées » (4 → ?) ; impressions et position de `/suivi-escalade` ; CTR de l'accueil sur « titan application » / « application titan » ; CTR de `/service` | GSC |
| J+28 | Décider | Si une requête hors marque apparaît en position 4–15 avec un CTR faible : retravailler **une** page (title, premier paragraphe) | GSC |
| **J+60** | Lire la contribution des pages | Nombre de requêtes visibles sans « titan » ; pages d'atterrissage qui reçoivent des clics ; `sign_up` par page d'atterrissage (GA4, consentants) | GSC, GA4 |
| J+60 | Autorité | Liens entrants nouveaux (rapport Liens de GSC) issus des contacts validés | GSC |
| **J+90** | Bilan hors marque | Clics hors marque sur 28 j vs les 28 j précédant la publication ; inscriptions dont la page d'atterrissage est un guide | GSC, GA4, événements serveur |
| J+90 | Décider la suite | S'il reste nul : l'acquisition viendra des liens et communautés, pas de nouvelles pages ; sinon, troisième page par sport **uniquement** sur la foi des requêtes observées | — |

Rappels de lecture : une variation de quelques impressions n'est pas une tendance ; les requêtes anonymisées ne se classent ni en marque ni hors marque ; la dernière journée GSC peut être révisée ; la saison (fin d'automne) et l'âge du site pèsent autant que les modifications.

## E. Validation technique

| Contrôle | Résultat |
|---|---|
| `pnpm run typecheck` | OK |
| `pnpm test` | **676/676** (671 avant la mission + 5 nouveaux de `seo-crawl`) |
| Parcours navigateur publics (`smoke`, `activation`, `accessibility-axe`, `viewports`, `ga4-consent`, `brand-assets`) avec le Chromium de la session (`PW_CHROMIUM`) | **375/375** — dont axe-core WCAG A/AA sur toutes les pages publiques et aucun défilement horizontal aux largeurs testées. La suite e2e complète (≈ 1 049 parcours) n'a pas été relancée |
| `pnpm run build`, `pnpm run audit`, `pnpm run release-check` | OK ; l'audit garde 18 avertissements, tous sur des écrans privés `noindex` (titres courts d'application), inchangés |
| Crawl statique des 27 URL du build | 0 lien cassé, 0 orpheline, JSON-LD valide, aucun doublon |
| Boutons des guides | Une ligne à 320, 390 et 1 440 px, aucun débordement (Playwright) |
| Lighthouse 12 mobile (build local, non compressé) | `/` : perf 95, SEO 100, a11y 100, LCP 2,7 s, CLS 0 · `/suivi-escalade` : 98, LCP 2,3 s · `/service` : 97, LCP 2,6 s · `/carnet-musculation` : 98, LCP 2,3 s. Mesure de laboratoire, pas de données terrain |
| Production (`check-seo-live`, 18/11) | 29/38 : build du 4 novembre (écart attendu tant que la V1.3.1 n'est pas publiée) |
| Preview Netlify (PR #162) | Construite par Netlify (`deploy-preview-162--titano-app.netlify.app`) ; l'hôte a été autorisé dans l'environnement de la session et répond **200** sur `/sitemap.xml`. Le contrôle page par page n'a **pas** pu être lancé depuis la session (exécution refusée par le mode automatique) : à faire avec `node tools/check-seo-live.mjs https://deploy-preview-162--titano-app.netlify.app` (attendu : tout conforme, hors indexabilité) |

### Anomalies restantes

- `www.titan-app.fr` et le sous-domaine Netlify : non vérifiables d'ici (S-03 du lot 7, toujours ouvert).
- Trois titles dépassent 65 caractères (`/comprendre-mes-donnees`, `/carnet-musculation`, `/progression-sportive`) : seule la marque finale « | TITAN » serait coupée ; accepté.
- `sitemap.xml` sans `lastmod` : voulu (pas de date non vérifiée), Google s'en passe.
- Pas de mesure de provenance (fait 8) : décision du propriétaire.
- Tableau voie ↔ YDS non publié faute de source vérifiable dans cette session.

### Niveau : **ORANGE**

Le code est prêt, testé et sans régression mesurée. Le niveau ne peut pas être vert tant que **la production sert le build du 4 novembre** et que **Google n'a pas relu le sitemap** : aucune des améliorations de novembre, ni de #148/#149 ni de cette mission, ne peut produire d'effet avant ces deux actions, qui t'appartiennent.

## Décisions qui t'appartiennent

1. Approuver le SHA de release (Netlify `TITAN_APPROVED_RELEASE_SHA`) puis suivre la section « Release V1.3.1 — jour 0 » du runbook.
2. Valider ou non les prises de contact du § C.3 (aucune n'a été faite).
3. Décider si l'on mesure une **catégorie** de provenance (moteur de recherche / autre / directe, sans URL) dans GA4 — cela demande une mise à jour de la politique de confidentialité.

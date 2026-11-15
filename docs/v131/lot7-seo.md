# Lot 7 · SEO technique et acquisition organique — V1.3.1

Périmètre : pages publiques (racine du dépôt), `sitemap.xml`, `robots.txt`, `netlify.toml`, générateurs `tools/build-public-site.mjs`, `tools/build-public-docs.mjs`, `tools/lib/public-template.mjs`, tests `tests/seo-*.test.mjs`.
Rien n’est publié : tout ce qui est « corrigé » ci-dessous l’est dans la branche candidate, pas en ligne.

## 0. Sources et limites

- **Observatoire SEO quotidien** (Google Doc `1M8qm0bjqEDUUYQOQMB5FPXCCkE-bh7IzFyQ4uzrj1DY`) lu en entier le 14/11/2026 : 22 entrées du 29/10 au 14/11, plus la référence « V1.3.1 » du 10/11 (contrôle direct de Search Console du 06/11).
- **Aucun connecteur Search Console, Windsor.ai ni Analytics n’est disponible dans cette session.** Aucune donnée de performance n’a été relue en direct : tous les chiffres GSC cités viennent de l’Observatoire. Dernière période consolidée : 4–10 novembre 2026, 80 impressions, 4 clics, CTR 5 %, position pondérée ≈ 5,61. Aucune journée GSC postérieure au 10/11 au relevé du 14/11. **Le trafic hors marque n’est pas démontré.**
- **Production** interrogée par `curl` le 14/11/2026 vers 20 h 55 UTC (25 URL du sitemap, `robots.txt`, `sitemap.xml`, variantes d’adresse). Elle sert le build du 4 novembre (`sw.js` : `titan-os-v301-profile-sync-20261104-r1` ; dépôt : `titan-os-v301-v13-20261109-r1`). Ni la V1.3 ni la V1.3.1 ne sont déployées : chaque constat « production » décrit cette ancienne version.
- **Non vérifiable d’ici** : `http://titan-app.fr/` (pas de sortie HTTP en clair), `https://www.titan-app.fr/` (le relais répond 502 : hôte injoignable depuis cette session, à contrôler depuis un navigateur), `https://titano-app.netlify.app/` (refusé par la politique réseau de la session). Rapports « Pages » et « Sitemaps » de Search Console, console AdSense : non accessibles.
- **AdSense** : dernier événement officiel connu = demande de correction du site reçue le 31 octobre 2026. **Approbation non confirmée.** Le site candidat n’affiche aucune publicité (`adsEnabled: false`) ; ce lot ne touche pas à la monétisation.
- Vocabulaire à ne pas confondre dans tout ce document : **URL dans le fichier** (25 `<loc>` servis) ≠ **URL soumises** (chiffre du rapport Sitemaps : 18) ≠ **URL découvertes** via le sitemap (9) ≠ **URL indexées** (20, rapport Pages du 06/11). **Clics GSC** ≠ visiteurs.

## 1. Audit technique par URL (production du 4 novembre → candidat avant ce lot)

Toutes les URL du sitemap répondent **200** en production, sans redirection, avec `content-type: text/html; charset=UTF-8`, une canonique égale à leur propre adresse, `index, follow, max-image-preview:large`, Open Graph complet (image `og-titan.jpg`, 1 200 × 630, 96,9 ko) et un JSON-LD valide. **Titres, descriptions et H1 sont identiques en production et dans le candidat** pour les 25 URL. Le contenu est dans le HTML initial : aucune page publique n’a besoin de JavaScript pour afficher son texte (`/service` n’utilise JS que pour le formulaire d’assistance).

Colonnes : H2 = nombre de titres de niveau 2 ; liens entrants « contenu » = pages du sitemap qui pointent vers l’URL depuis leur `<main>` ; « tous » = y compris en-tête et pied de page ; mots = texte de `<main>`. Format `production → candidat`.

| URL | HTTP | Canonique | Robots | Title / description (car.) | Données structurées | H2 | Liens entrants contenu | Liens entrants tous | Mots | Constat |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 200 | propre | index, follow | 59 / 159 | Org, WebPage, WebApplication, FAQPage | 9 → 9 | 0 → 12 | 24 → 24 | 1668 → 1735 | Accueil : 7 images décoratives (alt vide, dimensions déclarées), image LCP en WebP 800/1600. H1 sans mot-clé, title descriptif. |
| `/fonctionnalites` | 200 | propre | index, follow | 60 / 164 | Org, WebPage, FAQPage | 7 → 7 | 8 → 8 | 24 → 24 | 431 → 440 | Production : aucun lien vers /journal-entrainement ni /progression-sportive (ajoutés dans le candidat). |
| `/titan-plus` | 200 | propre | index, follow | 35 / 159 | Org, WebPage, FAQPage, Product | 5 → 5 | 1 → 1 | 24 → 24 | 1340 → 1512 | Title et H1 « Bientôt disponible » figés par décision du 21/10 et par tests (lot 6, C-05). Un seul lien de contenu entrant (/service), mais présent dans l’en-tête de toutes les pages. |
| `/niveaux-et-xp` | 200 | propre | index, follow | 64 / 147 | Org, WebPage, FAQPage, BreadcrumbList | 8 → 8 | 5 → 6 | 24 → 24 | 751 → 766 | Lien vers /motivation-sport seulement dans le candidat. Production : `BreadcrumbList` déclaré sans fil d’Ariane visible. |
| `/aventures-sportives` | 200 | propre | index, follow | 51 / 155 | Org, WebPage, FAQPage, BreadcrumbList | 7 → 7 | 4 → 4 | 24 → 24 | 509 → 509 | Conforme. 5 images décoratives. Production : `BreadcrumbList` déclaré sans fil d’Ariane visible. |
| `/comprendre-mes-donnees` | 200 | propre | index, follow | 70 / 152 | Org, WebPage, FAQPage, BreadcrumbList | 8 → 8 | 4 → 4 | 24 → 24 | 428 → 431 | Conforme. Production : `BreadcrumbList` déclaré sans fil d’Ariane visible. |
| `/debuter-titan` | 200 | propre | index, follow | 59 / 130 | Org, WebPage, FAQPage, BreadcrumbList | 7 → 7 | 1 → 1 | 24 → 24 | 341 → 345 | Un seul lien de contenu entrant (/service) ; présent dans le menu mobile et le pied de page. Production : `BreadcrumbList` déclaré sans fil d’Ariane visible. |
| `/pour-les-coachs` | 200 | propre | index, follow | 59 / 160 | Org, WebPage, FAQPage, BreadcrumbList | 6 → 6 | 4 → 4 | 24 → 24 | 423 → 469 | Description incomplète (offres Coach absentes) : lot 6, § 2 SEO. Production : `BreadcrumbList` déclaré sans fil d’Ariane visible. |
| `/sports` | 200 | propre | index, follow | 52 / 132 | Org, WebPage | 1 → 6 | 2 → 5 | 24 → 24 | 813 → 828 | Production : aucun H2 (les 5 familles ne sont pas titrées) et aucun lien vers les guides par sport. Corrigé dans le candidat. Ni FAQ ni fil d’Ariane. |
| `/suivi-sportif` | 200 | propre | index, follow | 58 / 143 | Org, WebPage, FAQPage → + BreadcrumbList | 5 → 5 | 0 → 1 | 24 → 24 | 185 → 191 | Contenu mince (≈ 190 mots dont le bloc d’appel commun). Aucun lien de contenu entrant en production. |
| `/journal-entrainement` | 200 | propre | index, follow | 62 / 161 | Org, WebPage, FAQPage → + BreadcrumbList | 5 → 5 | 1 → 2 | 1 → 2 | 169 → 174 | Contenu mince (≈ 170 mots). Production : 1 seul lien entrant sur tout le site (/suivi-escalade), absent de l’en-tête et du pied de page. |
| `/journal-course-a-pied` | 200 | propre | index, follow | 65 / 154 | Org, WebPage, FAQPage → + BreadcrumbList | 6 → 6 | 1 → 2 | 24 → 24 | 286 → 298 | Description : « records sur 5, 10… » alors que le code et la page disent 1, 5, 10, 21,1 et 42,2 km. |
| `/carnet-musculation` | 200 | propre | index, follow | 67 / 139 | Org, WebPage, FAQPage → + BreadcrumbList | 6 → 6 | 2 → 3 | 24 → 24 | 258 → 264 | Conforme, contenu court (≈ 260 mots). |
| `/suivi-escalade` | 200 | propre | index, follow | 59 / 146 | Org, WebPage, FAQPage → + BreadcrumbList | 6 → 6 | 1 → 2 | 24 → 24 | 676 → 686 | Production = candidat pour le contenu (réécriture « cotations de bloc » en ligne depuis le déploiement des 3–5 novembre). Le title ne contient pas « escalade » ; le H1 ne contient pas « bloc ». |
| `/progression-sportive` | 200 | propre | index, follow | 68 / 147 | Org, WebPage, FAQPage → + BreadcrumbList | 5 → 5 | 0 → 1 | 0 → 1 | 180 → 185 | ORPHELINE en production (aucun lien interne, hors sitemap). Contenu mince (≈ 185 mots). |
| `/motivation-sport` | 200 | propre | index, follow | 61 / 149 | Org, WebPage, FAQPage → + BreadcrumbList | 5 → 5 | 0 → 1 | 0 → 1 | 171 → 178 | ORPHELINE en production. Contenu mince (≈ 180 mots). |
| `/changelog` | 200 | propre | index, follow | 19 / 107 | Org, WebPage | 4 → 4 | 1 → 1 | 24 → 24 | 187 → 187 | Title court (19 car.). Dernière entrée : 5 octobre 2026 (lot 6, F-10). Aucun lien sortant dans le contenu. |
| `/service` | 200 | propre | index, follow | 35 / 157 | Org, WebPage, FAQPage | 9 → 9 | 0 → 0 | 24 → 24 | 713 → 770 | Page écrite à la main (générateur divergent, lot 6 G-02). Title sans mention du sport : rien ne distingue TITAN de ses homonymes. Aucun lien de contenu entrant (pied de page seulement). |
| `/partenariats` | 200 | propre | index, follow | 60 / 156 | Org, WebPage | 3 → 3 | 0 → 1 | 0 → 1 | 130 → 145 | ORPHELINE en production. Contenu court (145 mots). |
| `/legal_privacy` | 200 | propre | index, follow | 36 / 163 | Org, WebPage | 13 → 13 | 6 → 6 | 24 → 24 | 1740 → 2418 | Production : Version 10 ; candidat : Version 12 (lot 6, B-04). |
| `/legal_cgu` | 200 | propre | index, follow | 42 / 142 | Org, WebPage | 13 → 13 | 5 → 5 | 24 → 24 | 837 → 1353 | Production : Version 6 ; candidat : Version 8 (lot 6, B-02). |
| `/legal_mentions` | 200 | propre | index, follow | 24 / 112 | Org, WebPage | 6 → 6 | 5 → 5 | 24 → 24 | 273 → 322 | Écart de contenu (lot 6, B-05). |
| `/legal_hub` | 200 | propre | index, follow | 63 / 138 | Org, WebPage | 2 → 2 | 5 → 5 | 5 → 5 | 146 → 200 | Saut de niveau de titre : des H3 (cartes) précèdent le premier H2. Liée seulement depuis les 5 autres pages juridiques. |
| `/regles-communaute` | 200 | propre | index, follow | 45 / 159 | Org, WebPage | 7 → 7 | 5 → 5 | 24 → 24 | 742 → 794 | Conforme. |
| `/supprimer-mon-compte` | 200 | propre | index, follow | 43 / 159 | Org, WebPage | 6 → 6 | 5 → 5 | 5 → 5 | 393 → 492 | Liée seulement depuis les 5 autres pages juridiques (exigée par Google Play). |

### Contrôles transverses

| Contrôle | Résultat en production (14/11) | Candidat |
|---|---|---|
| `robots.txt` | 200, identique au dépôt ; `Sitemap:` présent ; aucune page publique bloquée | identique |
| `sitemap.xml` | 200, `application/xml`, 25 `<loc>`, identique au dépôt, sans `lastmod` | 25 avant ce lot |
| `.html` → adresse propre | `/suivi-escalade.html`, `/service.html`, `/index.html` : 301 vers l’adresse propre | identique |
| Barre oblique finale, casse | `/suivi-escalade/`, `/service/`, `/Suivi-Escalade` : 301 vers l’adresse propre | identique |
| Anciennes routes | `/tarifs` → 301 `/titan-plus` ; `/guide` → `/debuter-titan` et `/algorithme` → `/niveaux-et-xp` (règles 301 du dépôt) | identique |
| Adresse inconnue | 404 réel, page `noindex` | identique |
| Pages d’application | `/login`, `/onboarding`, `/aujourdhui`, `/recours`, `/defi`, `/athlete`, `/carriere` : 200, `noindex` (balise et en-tête `X-Robots-Tag`) ; absentes du sitemap | identique (test `seo-index`) |
| Console retirée | `/sys_core_override_99` : 404 | identique |
| Images | 7 sur l’accueil, 1 à 5 ailleurs, toutes décoratives (`alt=""`), dimensions déclarées, `loading="lazy"` hors image principale ; WebP de 33 à 150 ko | identique |
| Poids HTML compressé | accueil 8,9 ko, `/suivi-escalade` 4,6 ko, `/service` 5,2 ko ; CSS en cache 7 jours | — |
| Scripts | `pwa.js` + `ga4-consent.js` (injecté au build) + script de mesure Netlify (`/.netlify/scripts/rum`) | `pwa.js` (les deux autres sont ajoutés au build ou par Netlify) |
| Fil d’Ariane | 5 guides (`/niveaux-et-xp`, `/aventures-sportives`, `/comprendre-mes-donnees`, `/debuter-titan`, `/pour-les-coachs`) déclarent un `BreadcrumbList` **sans fil d’Ariane visible** ; les 7 guides par sport n’ont ni l’un ni l’autre | 12 fils d’Ariane visibles et déclarés |
| Pages orphelines | **3** : `/progression-sportive`, `/motivation-sport`, `/partenariats` (aucun lien interne) | reliées, mais par 1 seul lien chacune |
| Contenu mince | `/journal-entrainement` 169 mots, `/motivation-sport` 171, `/progression-sportive` 180, `/suivi-sportif` 185 (dont ≈ 60 mots de bloc d’appel commun et la FAQ) | inchangé avant ce lot |
| Doublons | Aucun titre, description ni H1 en double. Bloc d’appel final et pied de page communs à toutes les pages ; pas de page quasi identique à une autre | identique |
| Hôtes en double | `www` et sous-domaine Netlify : non vérifiables d’ici (§ 0). Toutes les pages portent une canonique absolue vers `https://titan-app.fr` | identique |

## 2. Rapprochement 25 (fichier) / 18 (soumises) / 20 (indexées)

Faits établis :

1. **25** = nombre de `<loc>` du fichier servi le 14/11 (identique au dépôt).
2. **18 soumises** (Windsor, rapport Sitemaps) est accompagné de « dernière soumission 19/05/2026, dernier téléchargement 24/05/2026 ». Le contrôle direct du 06/11 dit la même chose : « 9 pages découvertes, dernière lecture le 24/05 ». Ce chiffre décrit donc **le fichier que Google a lu le 24 mai 2026**, pas le fichier actuel. Google n’a pas relu `sitemap.xml` depuis près de six mois.
3. Le dépôt actuel commence le 10/09/2026. À cette date le sitemap comptait **16** URL (dont `/guide` et `/algorithme`, depuis redirigées) ; **23** le 13/09 ; **25** depuis le 21/10. Le fichier de mai (ancien dépôt) n’est pas consultable : sa composition exacte est inconnue.
4. **20 indexées** vient du rapport Pages (toute la propriété, quelle que soit la façon dont Google a trouvé l’URL), avec 28 exclues : 21 `noindex` (les pages d’application, voulu), 3 redirections, 4 « explorées, actuellement non indexées ». `/suivi-escalade` était **indexée** à l’inspection du 10/11.
5. L’alternance 18 / 36 du connecteur (36 = 2 × 18) est un artefact de jointure du connecteur (lignes `path=null`), déjà relevé par l’Observatoire.

Conséquences : « 25 − 18 = 7 » n’est pas une liste de sept URL fautives, c’est l’écart entre le fichier d’aujourd’hui et celui de mai. Ce que l’on peut nommer avec certitude, ce sont les **11 URL du fichier actuel qui n’étaient pas dans le plus ancien fichier connu (10/09)** ; au moins 7 d’entre elles ne peuvent donc pas avoir été « soumises » en mai. Et « 25 − 20 = 5 » : au plus 5 URL du fichier ne sont pas indexées (si les 20 indexées sont toutes dans le fichier, ce qui n’est pas prouvé).

| URL absente du fichier du 10/09 | Entrée dans le fichier | Impressions GSC relevées (Observatoire) | Hypothèse (à vérifier dans Search Console) |
|---|---|---|---|
| `/journal-course-a-pied` | 13/09 | non relevées | Hypothèse : trouvée par les liens (accueil, pied de page), probablement indexée, peu de demande |
| `/carnet-musculation` | 13/09 | oui (11 en sept.–oct.) | Indexée (elle a des impressions) ; jamais « soumise » au sens du rapport |
| `/suivi-escalade` | 13/09 | oui (72 du 25/09 au 03/10) | Indexée (inspection du 10/11) ; trouvée par les liens |
| `/pour-les-coachs` | 13/09 | non relevées | Hypothèse : indexée par les liens de l’en-tête |
| `/niveaux-et-xp` | 13/09 | oui | Indexée |
| `/aventures-sportives` | 13/09 | oui | Indexée |
| `/comprendre-mes-donnees` | 13/09 | non relevées | Hypothèse : indexée par les liens (menu, pied de page) |
| `/debuter-titan` | 13/09 | oui (25 en sept.–oct.) | Indexée |
| `/titan-plus` | 21/10 (remplace `/tarifs`) | non relevées | Hypothèse : `/tarifs` compte parmi les 3 « redirections » ; `/titan-plus` connue par l’en-tête de toutes les pages |
| `/regles-communaute` | 21/10 | non relevées | Hypothèse : découverte tardive (pied de page seulement), candidate au statut « explorée, non indexée » |
| `/supprimer-mon-compte` | 20/10 | non relevées | Hypothèse : candidate au statut « explorée, non indexée » ou pas encore découverte (liée seulement depuis les pages juridiques) |

Hypothèses pour les « 4 explorées, non indexées » et l’écart de 5 (aucune n’est démontrée) : les trois pages **orphelines en production** (`/progression-sportive`, `/motivation-sport`, `/partenariats` : présentes dans le fichier de septembre mais sans aucun lien interne, et le fichier n’est plus relu) ; les pages **minces** (`/journal-entrainement`, `/suivi-sportif`) ; les deux pages créées les 20–21/10. Les 3 « redirections » sont, par hypothèse, `/tarifs`, `/guide` et `/algorithme` (ou leurs variantes `.html`).

Ce qu’il faut faire (hors de portée d’ici, `Bloqué par un accès externe`) : dans Search Console › Sitemaps, **soumettre à nouveau `https://titan-app.fr/sitemap.xml`** après le déploiement, relever la date de lecture et le nombre d’URL découvertes ; dans Pages, exporter la liste des 4 URL « explorées, non indexées » et des 3 redirections ; inspecter les 11 URL ci-dessus.

## 3. `/suivi-escalade`

- **Constat de mesure** : 61 impressions du 25 au 30/09, 11 les 01 et 03/10, plus aucune ligne depuis, sur les requêtes « escalade bloc cotation », « cotation escalade bloc », « cotation bloc escalade » (position 5 à 7, 0 clic). La baisse commence avant la refonte du 5 octobre. La page est **indexée** (inspection du 10/11) : il ne s’agit pas d’une désindexation.
- **Intention** : ces trois requêtes sont informationnelles. La personne veut **l’échelle des cotations de bloc** et, le plus souvent, un tableau de correspondance Fontainebleau / V-scale. Elle ne cherche pas une application.
- **Ce qui est en ligne** : la réécriture du 2 novembre (title « Cotations de bloc : Fontainebleau, V-scale et suivi | TITAN », tableau de 4 systèmes, limites des équivalences, exemple de carnet, FAQ) est servie depuis le déploiement des 3–5 novembre. Les données GSC s’arrêtent au 10/11 : **son effet n’est pas encore mesurable** et rien ne permet de le prédire.
- **Ce qui manque encore pour l’intention** : (1) le title ne contient pas le mot « escalade », présent dans les trois requêtes ; (2) le H1 ne contient pas « bloc » ; (3) la page montre un extrait de l’échelle (6A à 7A) mais pas l’échelle entière ni de repères de correspondance, alors que c’est la réponse attendue ; (4) elle ne dit pas quelles notations l’application reconnaît ; (5) le vocabulaire des grimpeurs (« carnet de croix », « à vue », « flash ») est absent ; (6) en production, pas de fil d’Ariane et un seul lien de contenu entrant (l’accueil).
- **Structure** : un H1, 6 H2, pas de saut de niveau ; FAQ visible = FAQ déclarée ; 3 liens externes de référence (BMC, Mammut).
- **Liens internes** : entrants depuis l’accueil, le pied de page (24 pages) et, dans le candidat, `/sports` ; sortants vers `/comprendre-mes-donnees`, `/journal-entrainement`, `/fonctionnalites`.

## 4. `/service`

- **Requêtes** : l’Observatoire ne ventile pas les requêtes par page. La lecture page × requête du 2 novembre (`docs/V11_SEO_FINAL_2026-11-02.md`) attribue à `/service` « support titan » (position 9), « titan connexion » (7) et « titan social » (18), une impression chacune. Les autres requêtes visibles de la période (« contact titan », « titan application », « app.titan », « titan gps ») contiennent toutes « titan ». La page totalise 21 impressions et 0 clic du 4 au 10/11, 41 et 0 sur 28 jours.
- **Pourquoi 0 clic (hypothèses, volumes trop faibles pour conclure)** : (a) « Titan » est un nom partagé par d’autres produits ; une personne qui cherche l’assistance d’un autre « Titan » ne cliquera pas, et c’est normal ; (b) pour une recherche de notre marque, l’accueil est affiché au-dessus (position 2 à 4) et prend le clic ; (c) le title « Assistance, aide et contact | TITAN » et la description ne disent pas que TITAN est une application de sport : rien ne permet à la bonne personne de se reconnaître ni à la mauvaise de s’écarter ; (d) position 7 : peu de clics attendus de toute façon.
- **Pertinence** : pour « titan connexion » et « support titan », la page répond (rubrique « Compte et connexion », lien vers `/login`, contact). Le contenu est correct ; c’est l’extrait qui manque de contexte.
- **Technique** : 200, canonique propre, FAQ déclarée et visible, aucun lien de contenu entrant (pied de page seulement). Page écrite à la main (lot 6, G-02).

## 5. Parcours de conversion : Google → page publique → compréhension → inscription → première séance

| Étape | Constat | Mesuré ? |
|---|---|---|
| Résultat Google → page | Extraits cohérents avec le contenu ; `/titan-plus` annonce « Bientôt disponible » (vrai aujourd’hui) | Impressions, clics, position : Search Console seulement |
| Page → compréhension | Chaque guide ouvre sur un H1, un chapeau et un bouton « Commencer » ; l’accueil explique la boucle en 6 étapes | Non : aucune mesure de lecture ni de clic sur les boutons |
| Appels à l’action | « Commencer » (en-tête, partout), « Commencer · 2 minutes » (accueil), bloc final « Commencer » / « J’ai un compte » sur l’accueil et les guides : tous vers `/onboarding`, libellés cohérents. Absents des pages juridiques, des nouveautés, des partenariats et de l’assistance (voulu pour le juridique) | Non |
| Inscription | `/onboarding` (4 questions, essai sans compte possible) | Événements internes `signup`, `onboarding_completed` ; conversion GA4 `sign_up` |
| Première et deuxième séance | Confirmées par le serveur | Événements internes `first_session`, `second_session` ; conversions GA4 `first_session_confirmed`, `second_session_confirmed` |

Ce qui **n’est pas** mesuré, par construction : la source d’une visite (GA4 reçoit `page_referrer: ""` et l’adresse sans paramètres, donc aucune campagne ni moteur ; toutes les visites y apparaissent comme directes) ; la page d’entrée d’un futur inscrit (les événements internes n’ont ni référent ni page d’atterrissage) ; les clics sur les boutons des pages publiques (`analytics.js` n’est chargé que sur `/service`) ; rien du tout sans accord explicite pour GA4. On ne peut donc pas relier un clic Search Console à une inscription : la seule lecture possible est de rapprocher, par jour, les clics GSC par page et le nombre d’inscriptions. C’est un choix de confidentialité cohérent avec la politique publiée ; le changer demanderait une décision du propriétaire et une mise à jour de la politique (hors périmètre).

## 6. Opportunités de contenu (peu de pages, appuyées sur des fonctions qui existent)

| Thème | État | Décision |
|---|---|---|
| Suivi multisport | `/suivi-sportif`, mince | Enrichir la page existante (pas de nouvelle URL) |
| Journal d’entraînement | `/journal-entrainement`, mince, presque sans lien | Enrichir et relier |
| Musculation | `/carnet-musculation` | Compléter et relier |
| Course à pied | `/journal-course-a-pied` | Corriger la description, relier |
| Escalade | `/suivi-escalade` | Échelle complète, notations reconnues, vocabulaire (§ 3) |
| **Vélo et gravel** | **Aucune page**, alors que le catalogue contient Vélo, Gravel, Cyclisme sur route, VTT, Vélotaf, Vélo d’intérieur, Cyclo-cross (`js/core/sports-catalog.js`), l’import GPX (distance, temps en mouvement, pauses, dénivelé, temps par kilomètre : `js/core/gpx.js`) et les souvenirs de longues sorties (`js/core/endurance.js`) | **Nouvelle page `/suivi-velo`** |
| **Défis sportifs** | Aucune page ; les défis sans mise, quêtes de la semaine et du mois, quête commune, TITAN Duo, saisons, guilde et clubs existent (`js/app/defi.js`, `duels.js`, `quetes-periodiques.js`, `quete-commune.js`, `binome.js`, `saison.js`, `clubs.js`) et ne sont décrits qu’en une ligne sur l’accueil | **Nouvelle page `/defis-sportifs`** |
| Progression, motivation | `/progression-sportive`, `/motivation-sport`, minces et orphelines en production | Enrichir et relier |
| Analyse GPX seule | Fonction réelle, mais l’intention « lire un fichier GPX » attend un outil avec carte : promesse difficile à tenir | Pas de page ; le contenu va dans `/suivi-velo` et `/journal-course-a-pied` |

Aucune page générée en série, aucune page par ville, par sport du catalogue ou par mot-clé.

## 7. Corrections apportées (candidat, non déployé) — avant / après

Tests après chaque série : `pnpm test` (583 réussis avant ce lot).

### 7.1 `/service` (page écrite à la main : `service.html` seul, le générateur n’a pas été relancé sur cette page — lot 6, G-02)

| Élément | Avant | Après |
|---|---|---|
| `<title>`, `og:title`, `twitter:title`, `WebPage.name` | Assistance, aide et contact \| TITAN (35 car.) | Assistance TITAN : aide, connexion et contact — application de sport (68 car.) |
| Méta description, `og:description`, `twitter:description`, `WebPage.description` | Connexion, séances, TITAN+, remboursement, données ou communauté : trouve une réponse et les actions disponibles, puis contacte l’équipe TITAN si nécessaire. | Assistance de TITAN, l’application de suivi sportif : connexion, séance en attente, XP, TITAN+, données, signalement. Trouve ta réponse ou écris à l’équipe. (156 car.) |
| Chapeau visible | Choisis le sujet qui te concerne. Retrouve les réponses… | L’assistance de TITAN, l’application de suivi sportif. Choisis le sujet qui te concerne : tu y trouves les réponses et les actions disponibles, puis tu peux écrire à l’équipe si tu as encore besoin d’aide. |

But : dire dans l’extrait de quel « Titan » il s’agit et reprendre les mots des requêtes relevées (« titan connexion », « support titan », « contact titan »). Aucun gain de clics n’est promis : 21 impressions par semaine ne permettent pas de le mesurer vite. H1, rubriques, réponses et textes sur TITAN+ et le remboursement (lot 6) inchangés.

### 7.2 `/suivi-escalade` (`tools/build-public-docs.mjs`, page régénérée)

| Élément | Avant | Après |
|---|---|---|
| `<title>` | Cotations de bloc : Fontainebleau, V-scale et suivi \| TITAN | Cotations de bloc en escalade : Fontainebleau et V-scale \| TITAN (64 car.) — contient les trois mots des requêtes relevées |
| H1 | Comprendre les cotations, suivre ton escalade | Cotations de bloc en escalade : les lire, puis suivre tes séances |
| Description | Lis les cotations de bloc Fontainebleau et V-scale, distingue bloc et voie, puis garde tes essais et réussites dans un journal d’escalade gratuit. | L’échelle des cotations de bloc en escalade : Fontainebleau, V-scale, repères de correspondance, bloc ou voie, et un carnet gratuit pour tes séances. (149 car.) |
| Contenu | Extrait de l’échelle (6A à 7A), tableau de 4 systèmes | **Nouvelle section « L’échelle Fontainebleau et ses repères en V-scale »** : 12 lignes de 4 à 8A (V0 à V11), présentées comme indicatives, avec leurs limites. Notations reconnues à la saisie (d’après `js/sport-insights.js`, fonction `grade`). Récap « par système, discipline et lieu » (clé de regroupement du code) |
| FAQ visible et déclarée | 4 questions | 5 : ajout de « TITAN peut-il servir de carnet de croix ? » (réponse : en partie, séance par séance, pas voie par voie) |
| Liens de contenu | sortants : 3 ; entrants : 2 | bloc « À lire aussi » (4 guides) ; entrants : 3 |
| Mots (`<main>`) | 686 | 996 |

Les repères Font / V-scale sont ceux des tableaux couramment publiés (dont la source Mammut déjà citée sur la page) ; la page dit qu’ils varient d’un demi-degré selon les sources et que TITAN ne convertit rien. Aucun retour des impressions n’est promis : la version du 2 novembre, en ligne depuis dix jours, n’a pas encore de données.

### 7.3 Titres et descriptions des autres pages

| Page | Avant | Après |
|---|---|---|
| `/pour-les-coachs` (description) | … propositions de séances acceptées ou déclinées. 3 sportifs gratuits, 20 avec TITAN+. | Invitation privée, accord explicite, périmètre choisi par le sportif, séances proposées. 3 sportifs sans abonnement, 20 avec TITAN+, 5 ou 15 avec une offre Coach. (162 car. ; lot 6, § 2) |
| `/journal-course-a-pied` (description) | … records sur 5, 10, 21,1 et 42,2 km. | … records sur 1, 5, 10, 21,1 et 42,2 km. (conforme à `js/sport-insights.js`) |
| `/changelog` (title) | Nouveautés de TITAN (19 car.) | Nouveautés de TITAN : les versions de l’application (51 car.) |
| `/changelog` (description) | … version 300 Ascension et versions précédentes. | … version 1.1 de novembre 2026, version 300 Ascension et versions précédentes. |
| `/titan-plus`, accueil | inchangés | inchangés : figés par la décision du 21/10 et par `tests/launch-decision.test.mjs` ; à basculer à l’ouverture de l’achat (lot 6, § 3) |

### 7.4 Nouveautés (`/changelog`)

Avant : dernière entrée « v300 — Ascension, 5 octobre 2026 ». Après : entrée **« v1.1 — Communauté, import d’activités et suivi, 3 novembre 2026 »** (6 lignes). Date : mise en production Web constatée le 3 novembre 2026 par deux sources (Observatoire, entrée du 4/11 : déploiement Netlify publié le 03/11 à 14 h 54 UTC ; `docs/V11_STATUT_REEL_2026-11-03.md`). Contenu limité à ce qui est servi en production (`clubs.js`, `binome.js`, `saison.js`, `quetes-periodiques.js`, `quete-commune.js`, `classement.js`, `coach-tools.js`, `duels.js`, `gpx.js`, `endurance.js` : HTTP 200 le 14/11 ; « GPX / Garmin » présent dans `seance.js` servi). Rien sur l’application Android, la publicité ni les abonnements : aucune date publique vérifiable (lot 6, F-10, reste ouvert pour ces entrées).

### 7.5 Maillage interne et pages orphelines (`tools/lib/public-template.mjs`, générateurs)

| Élément | Avant | Après |
|---|---|---|
| Pied de page « Produit » | Fonctionnalités, TITAN+ · bientôt, Les sports, Pour les coachs, Nouveautés | + Journal d’entraînement, Partenariats |
| Pied de page « Comprendre » | Bien démarrer, Niveaux et XP, L’aventure, Mes données | + Défis et quêtes, Progression, Motivation |
| Pied de page « Par sport » | Course à pied, Musculation, Escalade, Multisport | + Vélo et gravel |
| Bloc « À lire aussi » | absent | 4 guides voisins sur les 9 guides par sport et par thème |
| Accueil | carte « Défis sans mise » sans lien | carte liée à `/defis-sportifs` ; lien « Vélo, gravel et VTT : le journal vélo » |
| `/fonctionnalites` | cartes « Séance » et « Défis » sans lien | liées à `/suivi-sportif` et `/defis-sportifs` |
| `/sports` | un guide par famille | Endurance : course à pied **et** vélo |
| `/service` (à la main) | pied de page et JSON-LD de l’ancien gabarit | alignés sur le gabarit |

Liens entrants, toutes zones (pages du sitemap) : `/journal-entrainement` 2 → 26, `/progression-sportive` 1 → 26, `/motivation-sport` 1 → 26, `/partenariats` 1 → 26. Liens entrants depuis le contenu : `/suivi-sportif` 1 → 7, `/journal-entrainement` 2 → 6, `/progression-sportive` 1 → 7, `/motivation-sport` 1 → 4, `/carnet-musculation` 3 → 7, `/journal-course-a-pied` 2 → 6. En production, trois de ces pages n’ont aujourd’hui **aucun** lien.

### 7.6 Pages minces enrichies (faits déjà vérifiés par le lot 6 ou relus dans le code)

| Page | Mots avant → après | Ajouts |
|---|---|---|
| `/suivi-sportif` | 191 → 407 | Cinq familles et leurs mesures ; maîtrise par sport et rang commun ; 2 questions |
| `/journal-entrainement` | 174 → 399 | Contenu d’une séance ; séance oubliée (historique après 30 jours) ; du journal aux réponses ; 2 questions |
| `/progression-sportive` | 185 → 375 | Records sourcés ; objectifs datés ; limites ; 1 question |
| `/motivation-sport` | 178 → 343 | Défis et quêtes ; progression qui ne se perd pas ; 1 question |
| `/carnet-musculation` | 264 → 373 | Routines (5 gratuites, 20 avec TITAN+, les existantes restent utilisables) ; 1 question |
| `/journal-course-a-pied` | 298 → 411 | Import GPX (analyse sur l’appareil : `js/core/gpx.js`) ; 1 question |

### 7.7 Deux nouvelles pages (aucune autre n’est justifiée)

| Page | Pourquoi | Fonctions sur lesquelles elle s’appuie | Enregistrée dans |
|---|---|---|---|
| `/suivi-velo` — « Suivi vélo, gravel et VTT : journal, GPX et dénivelé \| TITAN », 512 mots | Aucun contenu vélo alors que 7 pratiques cyclistes sont au catalogue | `js/core/sports-catalog.js` (Vélo, Gravel, Cyclisme sur route, VTT, Cyclo-cross, Vélotaf, Vélo d’intérieur et leurs champs), `js/core/gpx.js`, `js/core/endurance.js`, `js/sport-insights.js` (plus longue distance) | `tools/build-public-docs.mjs`, `INDEXABLE` de `tools/build-public-site.mjs` (sitemap), `netlify.toml` (301 `.html` + réécriture), pied de page, `/sports`, accueil, `tests/seo-meta.test.mjs` (fil d’Ariane et lien du catalogue) |
| `/defis-sportifs` — « Défis sportifs entre amis, quêtes et expéditions \| TITAN », 544 mots | Défis, quêtes, TITAN Duo, saisons, guilde et clubs n’avaient qu’une ligne sur l’accueil | `js/app/defi.js`, `duels.js`, `quetes-periodiques.js`, `quete-commune.js`, `binome.js`, `saison.js`, `clubs.js`, `classement.js` | idem, plus accueil, `/fonctionnalites`, `/motivation-sport` |

Ces deux pages n’ont aucune donnée de recherche derrière elles : elles comblent un manque de contenu, sans promesse de trafic. `sitemap.xml` : 25 → **27** URL.

### 7.8 Données structurées et hiérarchie des titres

| Élément | Avant | Après |
|---|---|---|
| Entité du site | `WebPage.isPartOf` contenait un `WebSite` anonyme, répété | Un nœud `WebSite` (`@id` `https://titan-app.fr/#website`, éditeur = l’organisation) et `WebPage.isPartOf` / `about` par référence, sur toutes les pages |
| Fil d’Ariane | 12 guides | 14 (les deux nouvelles pages) ; visible = déclaré (test) |
| FAQ | visible = déclarée | idem, questions ajoutées des deux côtés par le même générateur |
| `/legal_hub` | des H3 avant le premier H2 | H2 « Nos engagements » avant les cartes (aucun texte juridique modifié) |
| Corps des pages juridiques, de `/titan-plus`, `/pour-les-coachs`, `/partenariats` | — | `<main>` identique à l’octet près à la version du lot 6 (contrôle par empreinte) ; seuls l’en-tête JSON-LD et le pied de page changent |

### 7.9 `robots.txt`, `sitemap.xml`, canoniques, redirections

- `robots.txt` : **inchangé** (conforme, identique à la production).
- `sitemap.xml` : 27 URL, toujours sans `lastmod` (contrat de test : pas de date non vérifiée).
- Canoniques : inchangées, une par page, égales à l’URL du sitemap (tests `seo-meta`, `public-offer`).
- Redirections : deux paires ajoutées pour les nouvelles pages. Aucune autre : aucun doublon réel n’a été constaté (`.html`, barre finale et casse redirigent déjà en 301). `www` et le sous-domaine Netlify n’ont pas pu être contrôlés d’ici : aucune règle ajoutée à l’aveugle.

### 7.10 Tests

`pnpm test` : **583 réussis, 0 échec** après chaque série. Un seul test modifié, pour le **durcir** : `tests/seo-meta.test.mjs` ajoute `/suivi-velo` et `/defis-sportifs` à la liste des guides dont le fil d’Ariane doit être visible et déclaré, et `/suivi-velo` aux liens exigés dans le catalogue. Aucune attente relâchée. Reproductibilité : `tools/build-public-site.mjs` puis `tools/build-public-docs.mjs` exécutés dans un dossier vide, comparaison octet à octet avec la racine : seul `service.html` diffère (attendu, lot 6 G-02). Ni `tools/build-public.mjs` ni la suite e2e n’ont été lancés ; l’e2e « Assistance » exige un titre de niveau 1 « Assistance » exact et le lien de pied de page « Assistance » : tous deux conservés.

## 8. Matrice

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
|---|---|---|---|---|---|---|---|
| S-01 Statut HTTP, canonique, robots des 25 URL | 200, canonique propre, indexable | Conforme en production et dans le candidat | — | — | Aucune | `curl` des 25 URL le 14/11 ; `tests/seo-meta.test.mjs` | Vérifié conforme |
| S-02 Variantes d’adresse (`.html`, barre finale, casse, anciennes routes) | 301 vers l’adresse propre | Conforme | — | — | Aucune | `curl -w %{redirect_url}` | Vérifié conforme |
| S-03 `www`, `http`, sous-domaine Netlify | Redirection vers `https://titan-app.fr` | Non joignables depuis la session | Inconnu | P2 | À contrôler dans un navigateur et dans Netlify › Domain management ; si le sous-domaine Netlify sert le site, ajouter une règle 301 | § 0 | Bloqué par un accès externe |
| S-04 Pages d’application | `noindex`, hors sitemap | Conforme (balise et en-tête) | — | — | Aucune | `curl -I /login` ; `tests/seo-index.test.mjs` | Vérifié conforme |
| S-05 Sitemap lu par Google | Fichier actuel connu de Google | Dernière lecture le 24/05/2026 : « 18 soumises » décrit le fichier de mai | Google ignore le fichier actuel depuis six mois | P1 | Soumettre à nouveau le sitemap après le déploiement et relever la date de lecture | Observatoire (10/11 et relevés Windsor) ; § 2 | Bloqué par un accès externe |
| S-06 Rapprochement 25 / 18 / 20 | Écarts expliqués | Trois indicateurs différents ; 11 URL postérieures au plus ancien fichier connu ; au plus 5 URL du fichier non indexées | Liste nominative impossible sans Search Console | P2 | Exporter les « explorées, non indexées » et les redirections du rapport Pages | § 2 | Bloqué par un accès externe |
| S-07 Pages orphelines | Aucune | 3 en production ; 1 lien chacune dans le candidat avant ce lot | Découverte et poids internes faibles | P1 | Pied de page, blocs « À lire aussi », liens de l’accueil et des fonctionnalités | § 7.5 ; test « orphan pages » | Corrigé, non testé en conditions réelles |
| S-08 Contenu mince | Pages utiles à elles seules | 4 guides sous 200 mots | Risque de non-indexation (hypothèse) | P1 | Enrichissement de 6 guides avec des faits vérifiés | § 7.6 | Corrigé, non testé en conditions réelles |
| S-09 `/suivi-escalade` : réponse à « cotation bloc escalade » | Échelle et repères visibles, mots de la requête dans le title | Title sans « escalade », H1 sans « bloc », échelle partielle | Intention partiellement servie | P1 | Title, H1, description, échelle 4 → 8A, notations reconnues, FAQ | § 7.2 | Corrigé, non testé en conditions réelles |
| S-10 `/service` : extrait | L’extrait dit de quel « Titan » il s’agit | Title et description sans contexte sportif ; 21 impressions, 0 clic (4–10/11) | Extrait ambigu face aux homonymes | P1 | Title, description, chapeau | § 7.1 | Corrigé, non testé en conditions réelles |
| S-11 Descriptions inexactes | Conformes aux règles réelles | `/pour-les-coachs` sans les offres Coach ; `/journal-course-a-pied` sans le 1 km | Incohérence | P2 | Corrigées | § 7.3 | Corrigé et vérifié |
| S-12 Nouveautés | Journal à jour | Arrêté au 5 octobre | Obsolète | P1 | Entrée v1.1 du 3 novembre, limitée au Web vérifié en production | § 7.4 | Corrigé, non testé en conditions réelles |
| S-13 Nouveautés : Android, publicité, abonnements, V1.3 | Entrées datées | Aucune date publique vérifiable | — | P2 | À faire par : propriétaire (dates) puis SEO | lot 6, F-10 | En attente d'approbation |
| S-14 Données structurées | Valides, cohérentes avec le visible | Valides ; en production, 5 `BreadcrumbList` sans fil d’Ariane visible | Mineur | P2 | Nœud `WebSite`, fils d’Ariane visibles (déjà dans le candidat) | § 7.8 ; tests | Corrigé et vérifié |
| S-15 Hiérarchie des titres | Un H1, pas de saut | Saut sur `/legal_hub` | Mineur | P2 | H2 ajouté | § 7.8 | Corrigé et vérifié |
| S-16 Images | `alt`, dimensions, poids | Toutes décoratives (`alt=""`), dimensions déclarées, WebP ≤ 150 ko | — | — | Aucune | § 1 | Vérifié conforme |
| S-17 Image de partage | Une image par type de page | La même image `og-titan.jpg` partout (exigé par `tests/public-offer.test.mjs`) | Partages peu différenciés | P2 | Non modifié : demande des visuels approuvés (règle 3 du registre) | `tests/public-offer.test.mjs` | En attente d'approbation |
| S-18 `/titan-plus` : title, H1, `availability`, lien « TITAN+ · bientôt » | Vrais le jour de l’ouverture | Vrais aujourd’hui | À basculer | P1 | À faire par : SEO + propriétaire le jour de l’ouverture (lot 6, § 3) | `tests/launch-decision.test.mjs` | En attente d'approbation |
| S-19 Vélo et gravel | Une page utile | Aucune | Manque de contenu | P2 | `/suivi-velo` | § 7.7 | Corrigé, non testé en conditions réelles |
| S-20 Défis sportifs | Une page utile | Aucune | Manque de contenu | P2 | `/defis-sportifs` | § 7.7 | Corrigé, non testé en conditions réelles |
| S-21 Mesure du parcours Google → inscription | Source d’acquisition lisible | GA4 sans référent ni paramètres, événements internes sans page d’entrée | Attribution impossible | P2 | Décision du propriétaire (confidentialité contre mesure) ; d’ici là, rapprochement journalier clics GSC / inscriptions | `js/ga4-consent.js:44-52`, `js/app/analytics.js` | En attente d'approbation |
| S-22 Registre des visuels (`docs/V13_ASSET_REGISTRY.json`) | À jour | `node tools/v13-asset-registry.mjs --check` échouait déjà avant ce lot (sources modifiées par d’autres lots) ; les deux nouvelles pages n’y figurent pas | Registre périmé | P2 | À faire par : intégration — `node tools/v13-asset-registry.mjs` une fois tous les lots posés | commande ci-contre | Non terminé |
| S-23 Générateur de `/service` | Source = page | Toujours divergent ; page modifiée à la main | Lot 6, G-02 | P1 | À faire par : intégration/outillage | comparaison octet à octet | Non terminé |
| S-24 AdSense | Statut connu | Dernier événement : demande de correction du 31/10 ; approbation non confirmée ; le site n’affiche aucune publicité | — | — | Aucune dans ce lot | Observatoire | Bloqué par un accès externe |
| S-25 Trafic hors marque | Démontré ou non | Non démontré : requêtes visibles presque toutes « titan », 44 impressions sur 80 non ventilées | — | — | Mesurer après publication (§ 10) | Observatoire | Bloqué par un accès externe |
| S-26 Espaces insécables | Règle 8 | Absentes de tout le site (lot 6, F-11) ; les textes de ce lot suivent l’usage actuel des pages | — | P2 | Correction mécanique unique dans le gabarit (lot 6) | lot 6, F-11 | Non terminé |

## 9. Backlog priorisé

1. **P1 — Déployer le candidat, puis soumettre à nouveau le sitemap** dans Search Console (S-05) et demander l’inspection de `/suivi-escalade`, `/service`, `/suivi-velo`, `/defis-sportifs` et des trois anciennes orphelines. Suivre `docs/SEARCH_CONSOLE_RELEASE_RUNBOOK.md`.
2. **P1 — Exporter le rapport Pages** (4 « explorées, non indexées », 3 redirections) et le comparer aux hypothèses du § 2.
3. **P1 — Bascule TITAN+** le jour de l’ouverture de l’achat (S-18).
4. **P2 — Contrôler `www` et le sous-domaine Netlify** (S-03).
5. **P2 — Compléter les Nouveautés** avec les dates confirmées (S-13).
6. **P2 — Réparer le générateur de `/service`** et régénérer le registre des visuels (S-22, S-23).
7. **P2 — Décider de la mesure d’acquisition** (S-21).
8. **P2 — Images de partage par famille de pages**, avec des visuels approuvés (S-17).
9. **Plus tard, seulement si les données le justifient** : une page natation ou sports de raquette (aucune donnée aujourd’hui), le lien Google Play quand la fiche sera publique (`tools/data/play-store.json`).

## 10. Plan 30 / 60 / 90 jours (à compter de la mise en ligne du candidat)

Aucun objectif de position ni de trafic : les volumes actuels (80 impressions par semaine) ne permettent pas de promettre un résultat. Les indicateurs ci-dessous disent quoi regarder.

**Jours 1 à 30 — publier et vérifier**
- Jour 0 : déployer ; contrôler en production les 27 URL (200, canonique, title), `sitemap.xml` (27 `<loc>`), `robots.txt`.
- Jour 0 : soumettre le sitemap ; noter la date de lecture et le nombre d’URL découvertes. Inspecter les 7 URL citées au § 9.1.
- Chaque semaine (Observatoire) : impressions, clics et position de `/suivi-escalade` et des requêtes « cotation bloc escalade » ; impressions et clics de `/service` ; pages recevant une première impression ; nombre de pages indexées.
- Indicateurs : sitemap relu (oui / non), pages indexées (20 → ?), pages « explorées, non indexées » (4 → ?).
- Ne rien conclure avant 14 à 28 jours de données consolidées.

**Jours 31 à 60 — lire et ajuster**
- Comparer 28 jours après à 28 jours avant, à périodes égales : `/suivi-escalade` (impressions, position), `/service` (CTR), guides enrichis (première impression ou non).
- Si une requête hors marque apparaît en position 4 à 15 avec un CTR faible : retravailler le title et le début de la page concernée, une page à la fois.
- Si `/suivi-velo` ou `/defis-sportifs` restent sans impression après 6 semaines : vérifier leur indexation avant de toucher au contenu.
- Bascule TITAN+ et lien Google Play si l’achat ou la fiche sont ouverts.

**Jours 61 à 90 — décider**
- Bilan hors marque : nombre de requêtes sans « titan » visibles, pages d’atterrissage, clics. S’il reste nul, l’acquisition organique ne viendra pas de ces pages seules : envisager des liens entrants réels (clubs partenaires, annuaires d’applications, page `/partenariats`) plutôt que davantage de pages.
- Décider d’une éventuelle troisième page par sport uniquement sur la foi des requêtes observées.
- Revoir la mesure (S-21) si le propriétaire veut relier recherche et inscriptions.

## 11. Observatoire

Une section datée « 14 novembre 2026 — Audit technique et corrections V1.3.1 (candidat, non déployé) » a été ajoutée **à la fin** du Google Doc de l’Observatoire le 15/11/2026 (insertion en fin de document uniquement ; aucun contenu existant supprimé ni réécrit). Elle résume les constats, les corrections présentes dans la branche candidate (non en ligne tant que le site n’est pas déployé) et ce qu’il faut mesurer après publication.

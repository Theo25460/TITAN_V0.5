# TITAN V1.3.1 · Registre central de l'Opération Renaissance finale

Branche `claude/titan-v131-finalization-9g6jjo` · PR [#148](https://github.com/Theo25460/TITAN_V0.5/pull/148) (brouillon) · base `main` `67e17c7`.
Règles et format : [`README.md`](README.md). Rien n'est déployé : ni Netlify, ni Google Play, ni base de production.

## 1. Lots, état et preuves

| Lot | Objet | Détail | État au dernier point | Commits |
|---|---|---|---|---|
| 0 | Reprise, inventaire, sources de vérité | ce fichier, [`cahier-reference.md`](cahier-reference.md), [`NOTES_DE_VERSION.md`](NOTES_DE_VERSION.md), [`RAPPORT_FINAL.md`](RAPPORT_FINAL.md) | Clos | `2950f1d`, `8597828` |
| 1 | Sécurité Supabase | [`lot1-securite.md`](lot1-securite.md), [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 3 | Clos sur réplique locale : couche sociale durcie, export de compte réparé et complété, 209 fonctions exposées attaquées sans lecture ni écriture inter-comptes. Rien n'est appliqué en production | `29c2479`, `204aa46` |
| 2 | Paiements | [`lot2-paiements.md`](lot2-paiements.md) | Corrigé ; chaîne réelle non testée (aucun achat) | `c232576`, `36067e6` |
| 2 | Intégrations (Garmin, GPX, Health Connect, GPS, OAuth) | [`lot2-integrations.md`](lot2-integrations.md) | Clos : 10 correctifs testés (simulés ou rejoués localement), dont la déduplication des imports ; rien testé sur compte ou appareil réel | `4760215`, `13071c3`, `9b790a2`, `9a13a08`, `ce5bc1e` |
| 3–4 | UX Android | [`lot3-4-ux-android.md`](lot3-4-ux-android.md), [`cahier-reference.md`](cahier-reference.md), 16 paires avant/après dans `mobile/docs/avant-apres/v131/` | Clos : 22 routes modifiées sur 45 (QG, Aventure, résultat de séance, onglet Séance, Profil et écrans liés), 21 contrôlées sans changement, 2 non terminées. 808 tests, aucun débordement à 320, 360 et 412 dp sur l'aperçu. Aucune note de simplicité validée par des utilisateurs ; rien vérifié sur téléphone ni avec TalkBack | `717e076`, `08fadb4`, `9a13a08`, `48d2cd4`, `5f3e6b3` |
| 3, 8 | UX Web, performance, accessibilité | [`lot3-8-web-ux-performance.md`](lot3-8-web-ux-performance.md), 11 paires avant/après dans `captures-web/`, [`../ACCESSIBILITY_ASSESSMENT.md`](../ACCESSIBILITY_ASSESSMENT.md) | Clos : QG, résultat de séance, Aventure et Profil refaits ; re-contrôles de stabilité avec verdict chacun ; mesures avant/après (seule l'Aventure progresse nettement) ; axe sans violation sur les pages privées contrôlées. Chromium uniquement, réseau simulé ; aucun test avec des utilisateurs ni technologie d'assistance | `39fc696`, `8d9ec3f`, `253a65b`, `414533b` |
| 5 | Direction artistique | [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 5 | 4 blasons approuvés intégrés ; production des visuels manquants bloquée (crédits et réseau du générateur) | `88b0ad4`, design `3ff33c4` |
| 6 | Textes, juridique, cohérence commerciale | [`lot6-textes-juridique.md`](lot6-textes-juridique.md), [`vocabulaire.md`](vocabulaire.md) | Clos côté Web public : publicité, disponibilité, capacités Coach, données déclarées unifiées ; 582 tests verts. Points pour un juriste listés. Ce n'est pas une certification juridique | `1066c66` |
| 7 | SEO | [`lot7-seo.md`](lot7-seo.md) ; section du 14 novembre ajoutée à l'Observatoire | Clos dans le candidat (rien n'est en ligne) : audit par URL de la production et du candidat, `/service`, `/suivi-escalade`, maillage, données structurées, journal des nouveautés, deux pages (`/suivi-velo`, `/defis-sportifs`), sitemap 25 → 27. Aucun connecteur Search Console, Windsor ou Analytics : chiffres issus de l'Observatoire | `a0a5e1a` |
| 9 | Recette, CI, AAB, GO/NO-GO | § 3 ci-dessous, [`RAPPORT_FINAL.md`](RAPPORT_FINAL.md) | Clos : CI verte et build signé sur `414533b`. Verdict : NO-GO grand public tant que les décisions P0 hors dépôt ne sont pas prises ; GO pour un candidat de recette | `414533b` |

## 2. Faits établis sur la production (lecture seule, 14 novembre 2026)

| Élément | Constat | Conséquence |
|---|---|---|
| Site `titan-app.fr` | Sert le cache `titan-os-v301-profile-sync-20261104-r1` : build du 4 novembre | Ni la V1.3 ni la V1.3.1 ne sont en ligne ; toute comparaison « production » porte sur cette version |
| Registre des migrations | S'arrête à `20261102150000` | 10 migrations à appliquer dans l'ordre du runbook (`lot1-securite.md`) : `20261104085851` (déjà présente hors registre, rejouée sans effet pour entrer au registre), `20261105213712`, `20261110130137`, `20261110140000`, `20261110142656`, `20261110152700`, `20261110152800`, `20261110152900`, `20261114160000`, `20261114170000`, puis `20261114180000` |
| `public.friendships` | `authenticated` a encore `INSERT` ; 0 ligne | Faille d'amitié forcée ouverte, aucune ligne forgée à nettoyer |
| Achats Play | `titan_apply_play_entitlement_v1` et `titan_play_checkout_ready_v1` absentes ; 0 accès `google_play`, 2 accès `manual` | Aucun achat ne peut ouvrir d'accès en production |
| Offres | `titan01` → `titan_plus`, `titan02` → `coach`, `titan03` → `coach_pro` | Conforme |
| `20261104085851` | 6 fonctions portent `PT409`, aucune ne lève `40001`, version absente du registre | Migration appliquée hors registre : à réconcilier |
| Conseiller de sécurité | 0 erreur ; 4 familles d'avertissements | Analyse dans `lot1-securite.md` |

## 3. Vérifications automatiques

Candidat recetté : `414533b`. Tableau complet : [`RAPPORT_FINAL.md`](RAPPORT_FINAL.md) § 9.

| Vérification | SHA | Résultat |
|---|---|---|
| CI « Tests et build public » | `414533b` | Succès |
| CI « Parcours navigateur (Playwright) », suite complète | `414533b` | Succès |
| CI « Migrations sur une réplique vide (Postgres 17.6) », deux chaînes | `414533b` | Succès |
| CI Android « Types et tests unitaires » | `414533b` | Succès |
| CI Android « Parcours réel sur émulateur (réplique locale du backend) » | `414533b` | Succès |
| CI Android « APK et AAB release » (clé d'essai) | `414533b` | Succès |
| Contrôle `render` de la bibliothèque graphique (PR #147) | design `3ff33c4` | Succès après correctif |
| Local : Web 588/588, Android 808/808, deux chaînes de migrations (PostgreSQL 16), bundle Android, suite navigateur 1 033/1 034 (A34) | `414533b` | Succès, une instabilité préexistante |

| Build Android signé `1.3.1 (1303)` (clé d'envoi) et parcours sur émulateur avec le schéma après migrations | `414533b` | Succès, [exécution n° 206](https://github.com/Theo25460/TITAN_V0.5/actions/runs/43705392551), artefact `titan-android-1303-upload` ; non envoyé à Google Play |

Non exécuté : achat Google Play réel ou de licence, appareil Android physique, Garmin et Health Connect réels, tests avec de nouveaux utilisateurs.

## 4. Anomalies P0 / P1 ouvertes ou soumises à décision

| # | Anomalie | Gravité | Statut | Référence |
|---|---|---|---|---|
| A1 | Migrations V1.3 / V1.3.1 non appliquées en production (faille d'amitié ouverte, achats impossibles) | P0 | En attente d'approbation (mise en production) | § 2, `lot2-paiements.md` |
| A2 | Chaîne d'achat jamais prouvée de bout en bout | P0 | Bloqué par un accès externe (banc Play, compte de licence) | `lot2-paiements.md` |
| A3 | Clients V1.2.1 (1301) sans contrôle avant paiement | P0 | En attente d'approbation (Play Console) | `lot2-paiements.md` |
| A4 | Blasons Champion, Titan, Légende et autres familles non produits | P1 | Bloqué par un accès externe (générateur d'images) | `../V131_FINALISATION_2026-11-14.md` § 5 |
| A5 | TITAN+ payant : 20 sportifs suivis, contre 5 pour Coach | P1 | En attente d'approbation (décision produit) | `lot2-paiements.md` ligne 19 |
| A6 | Tests avec 5 à 10 nouveaux utilisateurs | P1 | Non terminé (validation humaine) | `lot3-4-ux-android.md` |

| A7 | Une séance saisie à la main et le même effort poussé par Garmin ou Santé Connect donnaient deux séances et deux récompenses | P1 | Corrigé, non testé en conditions réelles (migration `20261114180000`, rejouée localement). Limite assumée : une séance saisie après l'arrivée de la montre reste distincte | `lot2-integrations.md`, `ce5bc1e` |
| A8 | Une déconnexion ordinaire effaçait l'historique local des pas, son réglage et l'objectif | P1 | Corrigé et vérifié (tests Jest ; la suppression de compte les efface toujours) | `lot2-integrations.md`, `9a13a08` |
| A9 | Le site en ligne (build du 4 novembre) affiche encore 19,99 € et 39,99 € par mois pour Coach et Coach Ultra sans mention TTC, des CGU en version 6 sans clauses de renouvellement, remboursement ni restauration, et « pas de publicité » | P1 | En attente d'approbation : déployer le candidat avant d'activer les produits Play | `lot6-textes-juridique.md` |
| A10 | Identité de l'éditeur, vendeur des abonnements, rétractation, médiateur | P1 | En attente d'approbation (validation juridique humaine ; rien n'a été inventé) | `lot6-textes-juridique.md` § juriste |
| A11 | Âge minimal : 13 ans annoncés, 15 ans pour consentir seul en France, aucune question d'âge, publicité non marquée pour mineurs | P1 | En attente d'approbation | `lot6-textes-juridique.md` J-03 |
| A12 | Les outils Coach ne dépendent pas de l'offre : un coach gratuit a la suite que les cartes Coach annoncent | P1 | En attente d'approbation (décision produit) | `lot6-textes-juridique.md` |
| A13 | `docs/PLAY_CONSOLE.md` déclare « contient des annonces : non » alors que le build gratuit Android peut afficher AdMob | P1, P0 si la fiche Play en ligne le déclare aussi | Bloqué par un accès externe (Play Console) | `lot6-textes-juridique.md` |
| A14 | Durée de conservation réellement réglée dans GA4 ; comportement du formulaire de consentement publicitaire en cas de refus | P2 | Bloqué par un accès externe (console GA4, appareil) | `lot6-textes-juridique.md` J-14 |
| A15 | Espaces insécables absentes de toutes les pages (typographie française) | P2 | Non terminé | `lot6-textes-juridique.md` |

« Paddle » : aucune des 11 pages en ligne contrôlées le 14 novembre ne le mentionne ; le résultat de recherche est un cache périmé. Statut : Vérifié conforme.

| A16 | En production, le corps d'une fonction d'export a été retapé au déploiement et a perdu deux clés : « Exporter toutes mes données » échoue pour un compte lié à Garmin ou en binôme (latent : 0 lien, 0 binôme aujourd'hui). L'export omettait aussi 26 familles de données | P1 | Corrigé, non testé en conditions réelles (migration `20261114170000`) ; requête d'empreintes au runbook pour détecter tout autre écart après déploiement | `lot1-securite.md`, `204aa46` |
| A17 | Stockage : le compartiment `avatars` est public, sans limite de taille et inscriptible par tout compte connecté, sans appelant côté client ; le fichier d'avatar d'un compte supprimé y est encore public | P1 | En attente d'approbation (modification de production) | `lot1-securite.md` |
| A18 | Le compte administrateur n'a pas de double authentification ; la protection « mots de passe compromis » est désactivée | P1 | En attente d'approbation (console Supabase) | `lot1-securite.md` |
| A19 | `contact_messages` et `analytics_events` acceptent des insertions anonymes sans limite ; `titan_submit_cache_reconciliation` sans limite de débit ; table `private.titan_rpc_backup_20261104` présente seulement en production ; identifiant en dur dans la policy `coupons` | P2 | En attente d'approbation | `lot1-securite.md` |

| A20 | Le cahier ne nomme pas 46 écrans : il compte des fichiers. Le dépôt compte 45 routes (44 fichiers d'écran) | — | Vérifié conforme (inventaire réconcilié) | `lot3-4-ux-android.md`, `cahier-reference.md` |
| A21 | Captures de la fiche Play : elles montrent l'ancien QG et l'ancienne Aventure | P2 | Non terminé (à régénérer depuis l'aperçu, puis sur appareil) | `lot3-4-ux-android.md` |
| A22 | Le bouton à deux lignes tronquait le libellé le plus long à 200 % de taille de texte sur 360 dp ; les libellés de la barre d'onglets se touchaient à 200 % | P2 | Corrigé et vérifié par tests le 16/11 : au-delà de 1,3× le libellé d'un bouton n'est plus limité en lignes (`Button.tsx`, `buttonResponsive.test.tsx`) ; la barre passe en 2 colonnes à 2× (`tabLayout`, `tabLabels.test.tsx`). Non vérifié sur téléphone | `lot3-4-ux-android.md` |
| A23 | Forges et Aurores restent « Disponibilité à confirmer » tant que la migration serveur ne les ouvre pas | P2 | Bloqué par la mise en production des migrations (A1) | `lot3-4-ux-android.md` |
| A24 | `service.html` n'est plus reproductible par son générateur : lancer `tools/build-public-docs.mjs` à la racine l'écraserait par une version plus ancienne | P2 | Non terminé (page éditée à la main ; générateur à réparer) | `lot6-textes-juridique.md` G-02, `lot7-seo.md` |
| A25 | Référencement : 25 URL au fichier, 18 « soumises », 20 « indexées ». Les 18 décrivent le fichier lu par Google le 24 mai 2026 et les 20 le rapport Pages global ; les 7 URL d'écart ne sont pas nommables sans Search Console | P2 | Bloqué par un accès externe (Search Console) ; hypothèses étiquetées au § 2 du lot | `lot7-seo.md` |
| A26 | Mesure d'acquisition : GA4 efface le référent, un clic de recherche ne peut donc pas être relié à une inscription | P2 | En attente d'approbation (décision vie privée / mesure) | `lot7-seo.md` |
| A27 | AdSense : dernier événement officiel connu le 31 octobre (demande de correction) ; approbation non confirmée | — | Bloqué par un accès externe (console AdSense) | `lot7-seo.md` |

| A28 | Web : une fenêtre héritée « Bienvenue dans TITAN OS » (vocabulaire retiré, lien mort, écriture du profil à la fermeture) couvrait le QG à la première connexion de tout compte | P0 | Corrigé et vérifié (fenêtre retirée, test « a signed-in new account lands on a readable QG ») | `lot3-8-web-ux-performance.md` § 3, `39fc696` |
| A29 | Web : après un déploiement, une feuille de style dont la clé `?v=` n'avait pas changé restait périmée un affichage, et la nouvelle version restait « en attente » indéfiniment | P1 | Corrigé et vérifié sur Chromium (`js/pwa.js`, `tests/pwa-update.test.mjs`). Reste recommandé : empreinte `rev=` sur les feuilles de style dans `tools/build-public.mjs` et cache long sur `/js`, `/css`, polices (`netlify.toml`) | `lot3-8-web-ux-performance.md` § 3 et § 5 |
| A30 | Web : sur la page Séance, Retour quittait la page au lieu de revenir à la liste des sports | P1 | Corrigé et vérifié (2 tests) | `lot3-8-web-ux-performance.md` § 3 |
| A31 | Web : au profil, le focus clavier retombait en haut de page quand un enregistrement se terminait en arrière-plan (course présente aussi sur `main`, cause d'échecs intermittents de la CI) | P2 | Corrigé et vérifié (0 échec sur 15 exécutions contre 4 sur 8 avant) | `253a65b` |
| A32 | Web : les voies « GPX / Garmin » de la page Séance dépendent des réglages serveur `screens.activityhub` et `screens.garmin`, éteints par défaut | P1 | En attente d'approbation (activer un réglage serveur est une décision de publication) | `lot3-8-web-ux-performance.md` § 4 |
| A33 | Web : le temps d'affichage mobile de première visite (LCP 2,6 à 3,1 s mesurés, 4,1 à 5,0 s selon le modèle Lighthouse) reste fixé par environ 275 Ko de scripts ; QG, Séance et Profil n'ont pas progressé | P2 | Non terminé (allègement des scripts hérités : chantier à part) | `lot3-8-web-ux-performance.md` § 5 |
| Stabilité re-contrôlée | Boucle d'enregistrement du profil (PR #133), conflits `40001`, réessais sur 503, changement de compte pendant une écriture, double clic, hors ligne | — | Vérifié conforme sur Chromium avec un serveur simulé | `lot3-8-web-ux-performance.md` § 3 |

| A34 | Web : le parcours clavier des onglets de mondes de l'Aventure (« region tabs use one keyboard stop… ») échoue par intermittence sous forte charge : 2 fois sur 10 sur le candidat, 1 fois sur 10 sur `main` ; jamais en CI ce jour | P2 | Non terminé (course de focus préexistante, de même nature que A31) | recette locale du 15 novembre |

Toutes les anomalies connues à la clôture du chantier figurent ci-dessus.

## 5. Décisions et opérations réservées au propriétaire

Voir [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 6, complété à la clôture.

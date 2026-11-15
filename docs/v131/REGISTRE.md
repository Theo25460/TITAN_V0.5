# TITAN V1.3.1 · Registre central de l'Opération Renaissance finale

Branche `claude/titan-v131-finalization-9g6jjo` · PR [#148](https://github.com/Theo25460/TITAN_V0.5/pull/148) (brouillon) · base `main` `67e17c7`.
Règles et format : [`README.md`](README.md). Rien n'est déployé : ni Netlify, ni Google Play, ni base de production.

## 1. Lots, état et preuves

| Lot | Objet | Détail | État au dernier point | Commits |
|---|---|---|---|---|
| 0 | Reprise, inventaire, sources de vérité | ce fichier, [`cahier-reference.md`](cahier-reference.md) | En cours | `2950f1d` |
| 1 | Sécurité Supabase | [`lot1-securite.md`](lot1-securite.md), [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 3 | Clos sur réplique locale : couche sociale durcie, export de compte réparé et complété, 209 fonctions exposées attaquées sans lecture ni écriture inter-comptes. Rien n'est appliqué en production | `29c2479`, `204aa46` |
| 2 | Paiements | [`lot2-paiements.md`](lot2-paiements.md) | Corrigé ; chaîne réelle non testée (aucun achat) | `c232576`, `36067e6` |
| 2 | Intégrations (Garmin, GPX, Health Connect, GPS, OAuth) | [`lot2-integrations.md`](lot2-integrations.md) | Clos : 10 correctifs testés (simulés ou rejoués localement), dont la déduplication des imports ; rien testé sur compte ou appareil réel | `4760215`, `13071c3`, `9b790a2`, `9a13a08`, `ce5bc1e` |
| 3–4 | UX Android | [`lot3-4-ux-android.md`](lot3-4-ux-android.md), captures `mobile/docs/avant-apres/v131/` | En cours : QG, Aventure, résultat de séance, profil, progression refondus (points d'étape) | `717e076`, `08fadb4` |
| 3, 8 | UX Web, performance, accessibilité | `lot3-8-web-ux-performance.md` | À reprendre | — |
| 5 | Direction artistique | [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 5 | 4 blasons approuvés intégrés ; production des visuels manquants bloquée (crédits et réseau du générateur) | `88b0ad4`, design `3ff33c4` |
| 6 | Textes, juridique, cohérence commerciale | [`lot6-textes-juridique.md`](lot6-textes-juridique.md), [`vocabulaire.md`](vocabulaire.md) | Clos côté Web public : publicité, disponibilité, capacités Coach, données déclarées unifiées ; 582 tests verts. Points pour un juriste listés. Ce n'est pas une certification juridique | `1066c66` |
| 7 | SEO | `lot7-seo.md` | En cours (audit par URL, puis corrections dans les générateurs de pages) | — |
| 9 | Recette, CI, AAB, GO/NO-GO | § 3 ci-dessous | CI verte sur `2950f1d` | — |

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

| Vérification | SHA | Résultat |
|---|---|---|
| CI « Tests et build public » | `2950f1d` | Succès |
| CI « Parcours navigateur (Playwright) », suite complète | `2950f1d` | Succès |
| CI « Migrations sur une réplique vide (Postgres 17.6) », deux chaînes | `2950f1d` | Succès |
| CI Android « Types et tests unitaires » | `2950f1d` | Succès |
| CI Android « Parcours réel sur émulateur (réplique locale du backend) » | `2950f1d` | Succès |
| CI Android « APK et AAB release » (clé d'essai) | `2950f1d` | Succès |
| Contrôle `render` de la bibliothèque graphique (PR #147) | design `3ff33c4` | Succès après correctif |
| Local : `pnpm test` 581/581, Android 773/773, rejeu des migrations (PostgreSQL 16) | `ed97864` | Succès |

Non exécuté : build signé avec la clé d'envoi (`1.3.1 (1303)`), achat Google Play réel ou de licence, appareil Android physique,
Garmin et Health Connect réels, tests avec de nouveaux utilisateurs.

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

Les anomalies des lots en cours sont ajoutées ici à la clôture de chaque lot.

## 5. Décisions et opérations réservées au propriétaire

Voir [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 6, complété à la clôture.

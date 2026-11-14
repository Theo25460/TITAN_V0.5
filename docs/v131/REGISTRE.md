# TITAN V1.3.1 · Registre central de l'Opération Renaissance finale

Branche `claude/titan-v131-finalization-9g6jjo` · PR [#148](https://github.com/Theo25460/TITAN_V0.5/pull/148) (brouillon) · base `main` `67e17c7`.
Règles et format : [`README.md`](README.md). Rien n'est déployé : ni Netlify, ni Google Play, ni base de production.

## 1. Lots, état et preuves

| Lot | Objet | Détail | État au dernier point | Commits |
|---|---|---|---|---|
| 0 | Reprise, inventaire, sources de vérité | ce fichier, [`cahier-reference.md`](cahier-reference.md) | En cours | `2950f1d` |
| 1 | Sécurité Supabase | [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 3, `lot1-securite.md` | Social : corrigé et vérifié sur réplique. Revue approfondie des fonctions exposées : en cours | `29c2479` |
| 2 | Paiements | [`lot2-paiements.md`](lot2-paiements.md) | Corrigé ; chaîne réelle non testée (aucun achat) | `c232576`, `36067e6` |
| 2 | Intégrations (Garmin, GPX, Health Connect, GPS, OAuth) | `lot2-integrations.md` | En cours | — |
| 3–4 | UX Android | `lot3-4-ux-android.md` | En cours | — |
| 3, 8 | UX Web, performance, accessibilité | `lot3-8-web-ux-performance.md` | À reprendre | — |
| 5 | Direction artistique | [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 5 | 4 blasons approuvés intégrés ; production des visuels manquants bloquée (crédits et réseau du générateur) | `88b0ad4`, design `3ff33c4` |
| 6 | Textes, juridique, cohérence commerciale | `lot6-textes-juridique.md`, [`vocabulaire.md`](vocabulaire.md) | En cours | — |
| 7 | SEO | `lot7-seo.md` | À reprendre (audit, puis corrections après le lot 6) | — |
| 9 | Recette, CI, AAB, GO/NO-GO | § 3 ci-dessous | CI verte sur `2950f1d` | — |

## 2. Faits établis sur la production (lecture seule, 14 novembre 2026)

| Élément | Constat | Conséquence |
|---|---|---|
| Site `titan-app.fr` | Sert le cache `titan-os-v301-profile-sync-20261104-r1` : build du 4 novembre | Ni la V1.3 ni la V1.3.1 ne sont en ligne ; toute comparaison « production » porte sur cette version |
| Registre des migrations | S'arrête à `20261102150000` | Les 7 migrations V1.3 / V1.3.1 et les 2 du 14 novembre restent à appliquer |
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

Les anomalies des lots en cours sont ajoutées ici à la clôture de chaque lot.

## 5. Décisions et opérations réservées au propriétaire

Voir [`../V131_FINALISATION_2026-11-14.md`](../V131_FINALISATION_2026-11-14.md) § 6, complété à la clôture.

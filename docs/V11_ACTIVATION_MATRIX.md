# TITAN V1.1 — pourquoi des fonctions sont encore masquées, et comment les allumer (02/11/2026)

> **STATUT À JOUR : voir `docs/V11_STATUT_REEL_2026-11-03.md`.** Les 33 migrations sont présentes en production, le registre est réconcilié, les drapeaux sont créés. Toute mention contraire ci-dessous est périmée.


Rien n'est « cassé » : chaque fonction développée est derrière un interrupteur volontairement éteint, et plusieurs dépendent de migrations qui ne sont **pas appliquées en production** (les 29 migrations V1 le sont ; les migrations V1.1 30 à 60 ne le sont pas). Ce document est la source de vérité. Aucune ligne n'a été allumée par Claude.

## 1. Les quatre niveaux d'interrupteurs
| Niveau | Où se règle | Effet |
|---|---|---|
| A. Migration | Supabase (copie d'abord, puis production avec accord) | Sans elle, la fonction n'existe pas en base : l'écran, même allumé, ne trouve rien |
| B. Drapeau de base (web) | Centre de contrôle › Drapeaux (ou `titan_admin_feature_flag_set_v1`) | Un drapeau absent ou éteint = écran absent. Se règle à chaud, sans nouvelle version |
| C. Variable Netlify (serveur) | Netlify › Variables d'environnement | Fonctions de paiement, notifications |
| D. Variable de build Android | Actions › Android natif › Run workflow (cases `ads`, `billing`, `google_signin`) | Compilée dans l'application : un autre build est nécessaire pour changer |

## 2. Tableau par fonction
| Fonction | Migration | Drapeau web (B) | Serveur (C) | Build Android (D) | État aujourd'hui |
|---|---|---|---|---|---|
| Outils Coach (messagerie, check-in, modèles) | 56, 57 | `screens.coachtools` | — | — | code + tests ; migrations non appliquées ; drapeau non créé |
| Espace Coach (roster, calendrier, export, analyse) | 56 | `screens.coachworkspace`, `screens.coachcalendar`, `screens.coachexport`, `screens.coachanalysis` | — | — | idem |
| Places Coach incluses (5 / 15) | 56 | — | produits rattachés à `coach` / `coach_pro` (SQL du document propriétaire §E) | — | modèle serveur prêt ; aucun produit rattaché |
| Achats TITAN+ / Coach / Coach Pro | 20261020020000 (déjà prévue au plan), 56, 58 | — | `PLAY_BILLING_ENABLED=true`, `PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_PRODUCT_IDS`, RTDN (`PLAY_RTDN_*`) | `billing = true` (EXPO_PUBLIC_TITAN_BILLING=1) | code + tests ; éteint partout |
| Connexion Google web | — | `auth.google` | — | — | fournisseur Google saisi dans Supabase (déclaré par le propriétaire) ; essai réel non fait ; drapeau non créé |
| Connexion Google Android | — | — | — | `google_signin = true` (EXPO_PUBLIC_TITAN_GOOGLE=1) | idem |
| Publicités AdMob (Android) | — | — | — | `ads = test` puis `live` | éteintes ; `app-ads.txt` prêt, pas déployé |
| Publicités web | — | `ads.web` | — | — | **jamais** : décision du 02/11/2026, aucune publicité sur le web |
| Communauté (consultations, intentions, quête commune, binômes, saisons, classement, défis) | 42, 44 à 49 | `screens.consultations`, `.intents`, `.commonquest`, `.buddy`, `.seasons`, `.ranking`, `.duels` | — | — | code + tests ; migrations non appliquées |
| Objectif mondial, clubs, factions, Panthéon | 51 à 55 | `screens.worldgoal`, `.clubs`, `.factions`, `.pantheon` | — | — | idem ; avant les clubs publics : désigner qui traite les signalements |
| Garmin | 40, 41 | `screens.garmin` | variables Garmin (déjà posées), `GARMIN_ENABLED` faux | — | essai réel avec deux comptes à faire |
| Parcours GPS (bibliothèque privée : liste, détail, GPX, suppression) | 59 | `screens.routes` (web) | — | rien (disponible dans tout build Android ; fond de carte : `TITAN_TILES_URL` / `TITAN_TILES_ATTRIBUTION`, facultatif) | code + tests ; migration 59 non appliquée ; drapeau non créé |
| Cartes GPX, hub d'activités | 50 | `screens.gpxterrain`, `screens.activityhub` | — | — | migration 50 de la PR #118 non appliquée |

## 3. Ordre d'allumage recommandé
1. Appliquer les migrations V1.1 sur une **copie restaurée** de la base, lancer `tools/db/postflight-v11.sql`, corriger si besoin.
2. Après ton « oui » : les appliquer en production, un fichier à la fois (plan : `docs/V11_RELEASE_PLAN.md`).
3. Déployer le site V1.1 (ton accord).
4. Créer les drapeaux un par un, du moins risqué au plus risqué (`screens.activityhub`, `screens.coachtools`, communauté…), en observant.
5. Billing : étapes A à F du document propriétaire, essai avec compte testeur de licence, puis seulement `PLAY_BILLING_ENABLED=true` en production et un build `billing = true`.
6. Publicités : `ads = test` → consentement AdMob publié → `app-ads.txt` en ligne et vérifié → feu vert → `ads = live`.

## 4. Ce qui n'est PAS une cause
Aucune condition de sécurité n'a été retirée ou assouplie pour « débloquer » une fonction. Le refus d'un achat fait pour un autre compte, l'absence de publicité sans droits connus, le consentement avant le SDK sont des protections volontaires.

## Correctif de confidentialité avant ouverture (02/11/2026)
La migration 60 (`20261102130000_legacy_social_privacy`) rejoint le lot V1.1 : 33 migrations au total, numérotées 30 à 62. Elle ferme deux lectures héritées (code ami privé/bloqué/suspendu et statistiques d’une relation non acceptée). Aucun drapeau ne remplace ce correctif serveur. Elle est testée sur base jetable et doit suivre le même processus de copie restaurée, recette puis autorisation avant production.

La finition ajoute les migrations 61 (rencontres RPG, journal privé, attestation capteurs service uniquement et export) et 62 (édition des maintiens). Les écrans Android métriques, Garmin et messages de guilde utilisent les contrats réels, sans activer les services à distance. Le candidat effort v2 reste un simulateur parallèle ; aucune bascule XP/coins.

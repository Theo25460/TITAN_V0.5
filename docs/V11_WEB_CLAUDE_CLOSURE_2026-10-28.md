# V1.1 web — bilan de Claude Code (28/10/2026)

Branche `claude/titan-cahier-charges-0k7cdn` (PR #105), partie de la référence V1 publiée (`8102c17`, PR #117). Aucune fusion, aucun déploiement, aucune migration appliquée en production (lectures seules : migrations déjà appliquées, conseillers de sécurité et de performance, définition de `export_own_data`). `mobile/` et la PR #116 n'ont pas été touchés.
Suite : `pnpm run verify` 355/355 ; banc SQL (`tools/db/test-migrations.sh`) vert ; CI de la PR verte sur les têtes précédentes (tests, navigateur, réplique Postgres 17.6, APK de debug).

## Ce qui est livré

| Ligne du cahier | Contenu | Preuve |
|---|---|---|
| V11-09 | mesures propres à 81 sports qui n'avaient que les génériques (migration 31), trois mesures en tête, détails facultatifs, champs conditionnels | `sql/tests/300_sport_measures.sql`, e2e `sport-measures` |
| V11-10 | informations publiques alignées, plus de « après mise à jour serveur » | `tests/launch-decision.test.mjs` |
| V11-11 | endurance à la durée seule (jamais 0 km inventé), jusqu'à 1000 km, durée obligatoire au-delà de 300 km, vitesses invraisemblables refusées (migrations 30 et 32) | `300_ultra_distance`, `300_sport_limits_more`, e2e `endurance-entry` |
| V11-12 | exploits d'endurance cosmétiques, niveaux non accélérés (simulation SQL), image partageable | `300_level_pace`, `tests/endurance.test.mjs`, e2e `profile-title` |
| V11-13, V11-15 | quête hebdomadaire unique et quête mensuelle multisport, calculées côté serveur (migration 33) | `300_periodic_quests`, e2e `periodic-quests` |
| V11-14, V11-16, V11-29 | bilans du mois et de l'année gratuits, partageables, comparaison sur les mêmes jours, records et temps forts d'aventure | `tests/month-report.test.mjs`, e2e `month-report` |
| V11-17 | invitation au bilan du mois écoulé dans le QG (première semaine, masquable) | e2e `month-prompt` |
| V11-06 (moitié serveur) | import d'activités d'une source externe selon l'ADR-003 : consentement par source, idempotent, rattachement aux séances déjà au journal, mêmes plafonds et même score de risque (migration 34) | `300_activity_import` |
| V11-18 | « Exporter toutes mes données » complet (migration 35) ; suppression du compte vérifiée sur les nouvelles tables | `300_export_complete` |
| V11-19 | raccourcis de sports au QG | e2e `qg-shortcuts` |
| V11-20 | « streak souple » prouvée (une semaine manquée ne reprend rien) | `tests/ascension-progress.test.mjs` |
| V11-22 | catalogues réutilisés 10 minutes sans appeler le serveur | e2e `catalog-cache` |
| V11-23 | vitrine de profil, trois distinctions gagnées au plus (migration 36) | `300_profile_showcase`, e2e `profile-showcase` |
| V11-25 | garde contre les formulations de pression | `tests/no-pressure-mechanics.test.mjs` |
| V11-26 | « Pourquoi mon niveau monte ? » | e2e `qg-context` |
| V11-27 | import : minuit, fuseaux, plafonds de création, rejeu | `300_activity_import` |
| V11-30 | écran « Sources connectées » (voir, retirer l'accès, archiver) (migration 37) | e2e `profile-showcase` |
| V11-31 | indices contextuels sur cinq écrans, trois visites au plus | e2e `hints`, axe |
| V11-34 | cinq index de clés étrangères (migration 38) | `300_fk_indexes` |
| V11-40 (V11-05, GAR-01/02) | Garmin côté serveur préparé SANS clé et désactivé : lien Garmin↔compte, ingestion réservée au rôle serveur, anti-doublon entre sources, désenregistrement, fonction Netlify (OAuth 2.0 PKCE, push à jeton secret) testée avec un Garmin simulé (migrations 40 et 41, réécriture du callback `/auth/garmin/callback`, jetons scellés, déconnexion avec retrait chez Garmin, `docs/GARMIN.md`) | `300_garmin`, `300_garmin_tokens`, `tests/garmin.test.mjs` |
| V11-38 (prépare V11-04) | activité quotidienne (pas) : table privée et deux fonctions, jamais une séance ni une récompense, le plus élevé des sources et jamais la somme (migration 39) | `300_daily_activity` |
| V11-56 (HC-P0-06) | carte « Pas aujourd’hui » du QG : valeur, source, dernière mise à jour, sept jours, objectif facultatif local ; jamais une séance ni une récompense ; rien sans donnée (migration 39 : l'heure de mise à jour s'ajoute) | `tests/steps.test.mjs`, `tests/e2e/steps-card.e2e.mjs` |
| V11-61 (COM-B7) | rendez-vous quotidien facultatif : intention du jour, privée par défaut, partage aux amis, encouragements comptés sans noms, aucune série ni pénalité (migration 44) | `300_daily_intents`, `tests/e2e/daily-intent.e2e.mjs` |
| V11-60 (COM-D1) | badge Pionnier attribué par un administrateur selon une règle annoncée, jamais automatique, sans effet sur la progression (migration 43) | `300_pioneer_badge`, `tests/e2e/pioneer-badge.e2e.mjs` |
| V11-57 (COM-F3, COM-F4) | votes à clôture et feuille de route avec soutiens ; derrière le drapeau `screens.consultations` ; aucune récompense (migration 42) | `300_community_consultations`, `tests/e2e/consultations.e2e.mjs` |
| V11-36 | découverte progressive des écrans au QG | `tests/ascension-progress.test.mjs` |

## Migrations (30 à 44), à appliquer dans l'ordre après les 29 de la V1

Voir `docs/V11_RELEASE_PLAN.md` : une ligne par fichier avec son effet, ce qu'il réécrit et son retour arrière. Toutes additives, sans `BEGIN/COMMIT`, à appliquer une par une sur une copie restaurée d'abord. La 35 doit suivre la 34 (elle lit ses tables) la 39 la 35 (elle redéfinit l'export) la 40 la 39 (elle l'enrobe d'un assistant) et la 41 la 40 ; la 36 redéfinit un déclencheur de la 29 ; la 38 pose cinq index (verrou bref, délai de 5 s).

## Ce que le web ne peut pas faire seul

- **Lire Health Connect** : application native Android (`mobile/`, PR #116, non touchée). La moitié serveur est prête et prouvée ; permissions du manifeste et de la Play Console, recette sur téléphone réel restent à faire.
- **V11-01 à V11-08** : publicités, TITAN+ commercialisé, connexion Google, pas, HealthKit, Strava : partenaires, clés, décisions de Théo. **Garmin** : la préparation serveur est faite (`docs/GARMIN.md`), mais il reste à obtenir l'accès programme de Garmin (état du programme à confirmer), à **révoquer la clé remise le 28/10 et en générer une nouvelle**, à renseigner les adresses et champs réels, puis à essayer sur de vrais comptes avant d'ouvrir le bouton « Connecter Garmin ».
- **Protection contre les mots de passe compromis** (Supabase Auth) : réglage du tableau de bord (V11-35).
- **Reporté (V11-24)** : collections de cosmétiques par région, qui demandent de nouveaux visuels de la DA.
- Recette sur appareils réels, relecture juridique, décision de publier.

## Points d'attention pour la reprise

- La CI du 28/10 a révélé deux causes d'infrastructure : `ubuntu-latest` pointait vers Ubuntu 26.04, que Playwright 1.56 ne gère pas (job épinglé sur `ubuntu-24.04`) ; quatre faux positifs du scan d'historique (variable d'environnement avec repli, branche Android séparée), acquittés avec leurs motifs dans `tools/history-scan-known.json`, à confirmer par Codex.
- Les e2e `authenticated-session-resume` et quelques tests de `smoke` peuvent échouer de façon intermittente quand la machine est chargée (deux lancements à la suite ne reproduisent pas) ; la CI fait foi.

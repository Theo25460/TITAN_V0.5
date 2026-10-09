# Vues d’analyse sauvegardées — plan d’exécution

Spec: `docs/CDC_WEB_ANALYSIS_VIEWS_SPEC_2026-10-09.md`

Goal: presets privés des comparaisons et bilans, dix par compte TITAN+, conservés à expiration.

Global Constraints: pas de production/main/fusion/Play Console, pas de données réelles, pas de prix ni récompenses ; préserver trois images étrangères. Référence de branche 901e367. Cahier fraîchement relu et claim déclaré avant code. Exécution inline avec une seule revue indépendante Sol 6.1 à la fin. Tests RED puis GREEN avant chaque implémentation.

## Task 1: Stockage privé et mutations sûres

**Interfaces**
Produces: les deux RPC et enveloppes définies par la spec, erreurs nommées AUTH_REQUIRED/PROFILE_UNAVAILABLE/PREMIUM_REQUIRED/INVALID_VIEW_OPTIONS/VIEW_NOT_FOUND/VIEW_VERSION_CONFLICT/VIEW_LIMIT/VIEW_NAME_TAKEN.
Consumes: profil/entitlement courant, auth.uid, sports.id, baseline et runner natif PostgreSQL.

1. Écrire `sql/tests/300_analysis_views.sql` et deux cas concurrents dans un runner autonome protégé contre une base non-test. Exécuter le SQL sur la réplique PGlite.
Expected: échec RPC/table absente, pas un faux positif.
2. Créer la migration avec la CLI Supabase épinglée, implémenter table/RLS/RPC/contrôles et raccordement du runner natif. Rejouer SQL.
Expected: contrat SQL vert ; la CI devra aussi prouver les deux connexions réelles.
3. Vérifier types, privilèges, enveloppes, noms, erreurs et comptes Free ; commit explicite des seuls fichiers du lot.
Expected: PGlite vert ; aucune image étrangère incluse.
4. `task-done ... -- node /workspace/scratch/1cc6e73964fc/reports-pg/views.mjs`.
Expected: succès du SQL complet du lot, preuve dans le ledger.

## Task 2: Parcours web et offre vérifiable

**Interfaces**
Consumes: enveloppes et erreurs Task 1 ; panneaux analyses/rapports et signal de session existants.
Produces: module `TitanAnalysisViews`, panneau Mes vues secondaire, événements `titan:analysis-view-save` / `titan:analysis-view-selected` portant propriétaire et époque ; analyse fraîche à restauration ; offre honnête.

1. Tests unitaires module et offre d’abord, puis E2E parcours sauvegarde/restauration/rename/delete, expiration, session, délai et contrats malformés.
Expected: RED sur fonctionnalité absente.
2. Implémenter validation stricte et texte sûr, panneau, hooks des analyses et offre générée. Délai quinze secondes pour les requêtes du lot, guard owner/epoch/client/visibilité. Éditer un nom conserve les filtres, UUID stable en répétition incertaine.
Expected: tests du lot GREEN à 360/1280 px, capture contrôlée, aucun overflow ni erreur console.
3. `pnpm verify`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/1cc6e73964fc/playwright pnpm test:e2e`, puis commit explicite.
Expected: suites complètes vertes et générateur reproductible.
4. `task-done ... -- pnpm verify`.
Expected: contrôles finaux verts et ledger à jour.

## Review Focus

Contrôler volontairement les chemins non couverts ou difficiles : identité étrangère et RLS, droits directs sur table/fonctions, quota et entitlement concurrent, JSON extra/nombres atypiques/noms Unicode, répétition après sauvegarde incertaine, lecture STABLE après mutation, cascade, restauration avec période/fuseau actuel, réponses A→B→A et anciennes réponses après changement de filtres, fermeture/cachage/hors ligne pendant mutation, message après succès serveur mais échec de rafraîchissement, clavier et débordement mobile, offres Free/Premium et libellés du CDC.

Après tâches : package whole-branch et UNE revue Sol 6.1 fraîche ; classer par effet utilisateur. Critical/Important : une passe RED→GREEN et suite complète ; Minor différés avec ledger. Chaque jugement écarté par le reviewer reçoit un Ruling et coût. Publier une PR empilée autorisée, trois jobs CI verts incluant PostgreSQL16 deux chemins, relire CDC avant écriture ciblée, handoff avec preuve exacte puis release du claim. Ne déclarer global terminé qu’après tous les items du cahier ; PREM06 reste partiel.

## Progression contrôlée

Task 1 et Task 2 complets avec contrats RED→GREEN : 101/101 tests unitaires, build/audit sans erreur (16 avertissements SEO antérieurs), 52/52 E2E Chromium, captures 360/1280 contrôlées. Unique revue Sol 6.1 sans Critical/Important, trois Minor différés et aucun comportement écarté. CI 37995034526 trois jobs verts, dont PostgreSQL16 deux routes avec quinze suites SQL et concurrence quota/révision. Handoff dans `docs/CDC_WEB_ANALYSIS_VIEWS_HANDOFF_2026-10-09.md` ; le dernier commit documentaire doit aussi passer sa CI, puis la PR et le cahier donnent la preuve canonique. Aucun déploiement ni fermeture du cahier global ; PREM06 reste partiel.

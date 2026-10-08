# Intégrité économique web — plan d'implémentation

> **For agentic workers:** Use superpowers:executing-plans, test-driven-development and systematic-debugging. L'exécution autonome est autorisée par le cahier maître et la demande de continuation.

**Goal:** empêcher les états économiques négatifs et prouver que les répétitions et appels simultanés ne doublent ni récompense ni débit.

**Architecture:** conserver les reçus et verrous existants ; ajouter des tests SQL et deux connexions PostgreSQL réellement concurrentes au banc éphémère. Préparer uniquement les contraintes dont l'absence est reproduite, sans corriger automatiquement de données historiques.

**Tech Stack:** PostgreSQL, psql, Python standard, GitHub Actions, Supabase CLI 2.120.0.

**Spec:** [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M/edit), SEC04/SEC05/SEC10. Ce lot cible séances et achats cosmétiques ; paiement et rewarded ads restent hors portée.

## Contraintes globales

- Production en lecture de catalogue et d'agrégats seulement ; aucun test ni DDL/DML sur les données réelles.
- Branche indépendante de #19/#20, base `e903ac3`. Aucun changement Android, paiement, UI ou formulation des exigences.
- Conserver les interfaces RPC et le refus `PURCHASE_LIMIT_ONCE` de la boutique. Une répétition ne doit pas redébiter ; aucun nouveau protocole client.
- CHECK ajoutés `NOT VALID` : pas de scan/réécriture historique ; valeurs nulles anciennes conservées selon le contrat nullable existant. Validation historique distincte avant activation complète.

## Revue prioritaire

- Même événement avec contenu différent : refus précis, aucune nouvelle récompense.
- Même UUID chez deux propriétaires : événements indépendants, aucune fuite du reçu.
- Répétition après édition/archive : reçu original, pas de nouvelle séance ni récompense.
- Deux connexions concurrentes : attente du verrou observée, résultat et état final vérifiés ; un refus générique ne satisfait pas le test.
- Économie invalide via INSERT privilégié : refus SQL par la contrainte, frontière zéro/niveau 1 et parcours normaux conservés.

## Tâche 1 — Contrats et reproduction

Fichier : `sql/tests/300_economy_integrity.sql`.

- [x] Tester reçu identique, conflits de contenu, portée par propriétaire, achat répété sans débit et absence de droits directs sur les reçus.
- [x] Tester le rejeu après archive et vérifier les compteurs/reçus persistés.
- [x] Tenter les INSERT privilégiés crédits=-1, XP=-1, niveau=0 ; attendre SQLSTATE 23514, sans avaler une assertion échouée.
- [x] Exécuter la CI avant correction et conserver l'échec attendu.

## Tâche 2 — Contraintes et concurrence

Fichiers : migration créée par CLI ; `tools/db/test-economy-concurrency.py` ; `tools/db/test-migrations.sh`.

- [x] Ajouter les trois bornes CHECK nommées, `NOT VALID`, sans UPDATE/DELETE de données ni changement de grants.
- [x] Lancer deux appels séance identiques sous authenticated ; attendre le verrou et vérifier une séance, un reçu, 300 XP et 30 crédits.
- [x] Lancer deux achats identiques sous authenticated ; vérifier un succès, un refus PURCHASE_LIMIT_ONCE, une ligne d'historique et un débit de 450.
- [x] Intégrer les tests concurrents dans le banc ; refuser une base sans préfixe `titan_test_`, nettoyer les seules identités synthétiques et terminer les processus en cas d'échec.
- [x] Rejouer la CI entière : SQL, concurrence, tests/build et navigateur.

## Tâche 3 — Livraison

- [x] Relecture indépendante du SQL, des contraintes et des processus de test ; traiter les constats.
- [x] Handoff avec preuves, limites, validation historique et rollback ; synchroniser le cahier avant chaque commit important.
- [x] PR #21 et handoff préparés ; corrections relues vérifiées par CI 37772140507. La tête finale sera contrôlée avant remise ; SEC04/SEC05/SEC10 restent partiels.

## Relecture et décisions

Deux constats Important corrigés : test réel du rollback appelant et chemin RELEASE_SQL rouge sur CI 37771760136, verts sur CI 37772140507. Aucun Critical/Minor. Le bundle historique reste inchangé ; ses corrections sont appliquées séparément et testées explicitement. Nullable et gardes UPDATE conservés, validation historique différée sans réécriture. Le banc contrôle aussi le refus sur une base non-test avant fixtures. Preuves et limites : `docs/CDC_WEB_ECONOMY_HANDOFF_2026-10-08.md`.

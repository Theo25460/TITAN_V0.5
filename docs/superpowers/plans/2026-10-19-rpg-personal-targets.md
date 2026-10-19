# RPG personal targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figer et appliquer des objectifs de chapitres personnels sans perdre les acquis.

**Architecture:** Une colonne serveur porte le contrat courant, alimentée par le profil de quêtes existant. Snapshot et claim utilisent les mêmes cibles ; le client affiche ces cibles sans les recalculer.

**Tech Stack:** PostgreSQL16, JavaScript, Node24, Playwright.

**Spec:** docs/superpowers/specs/2026-10-19-rpg-personal-targets-design.md

## Global Constraints

- Deux jours minimum au gardien ; effort personnel 30–135, plafond 90/jour.
- Chapitres actifs : anciennes conditions conservées ; aucun gain rétroactif.
- Aucun sport imposé, aucune règle XP/crédits modifiée.
- Profil/smoke/Android/WORK/images étrangères et base réelle exclus.

## Review Focus

- Départ sans historique : gardien 2/30 et impossibilité de le valider sur un jour.
- Archivage ou ajout tardif : cible inchangée, preuves recalculées.
- Migration répétée : acquis et contrat actif inchangés.
- Ancien serveur/découverte : conditions fixes annoncées honnêtement.
- Futur/passé : aucune cible personnelle reconstruite depuis le catalogue.

### Task 1: Contrat serveur et lecture client

**Files:** nouvelle migration CLI ; sql/tests/300_adventure_personal_targets.sql ; sql/tests/300_z_adventure_personal_migration.sql ; tests/e2e/rpg-personal-targets.e2e.mjs ; js/app/aventure.js ; js/renaissance-engine.js ; tools/build-public-site.mjs et sorties ; adventure.html ; package.json ; tests SQL existants liés.

**Interfaces:** Consumes private.titan_adventure_quest_profile(anchor,timezone), profile daysTarget/effortTarget. Produces main_objective {version,days,effort,frozen_at}, snapshot v4 target/effort_target identiques au claim.

- [ ] Écrire tests SQL version4, novice2/30, profil régulier3/135, gel et refus/claim ; publier brouillon et observer RED PostgreSQL sur le parent.
- [ ] Écrire tests navigateur cible serveur2/70 dans mission/détails/règles/gardien et absence de fausse cible future ; lancer et observer RED.
- [ ] Créer migration par CLI ; backfill version0 sans écraser les contrats ; étendre trigger et remplacer snapshot/claim avec objectif figé.
- [ ] Mettre les lectures et copies liées en cohérence, garder découverte fixe explicite ; adapter les attentes multisports au nouveau contrat sans enlever les comparaisons ni récompenses.
- [ ] Exécuter pnpm verify puis navigateurs ciblés, PostgreSQL16 deux voies et suite navigateur complète en CI. Expected: toutes vertes.
- [ ] Commit explicite des seuls fichiers du lot ; une revue indépendante, correction des Important avec RED→GREEN.
- [ ] Publier PR prête non fusionnée, handoff et mise à jour limitée du CDC avec preuves et limites.

Self-review : contrat unique, migration rétrocompatible et cinq risques couverts par tests ; tâche unique car snapshot/claim/affichage partagent la même interface. Exécution autonome conformément à l'autorisation utilisateur.

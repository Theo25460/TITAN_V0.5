# Quêtes de campagne — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Confirmer les mini-quêtes adaptées et leurs souvenirs côté serveur, avec quatre campagnes gratuites.

**Architecture:** Étendre le snapshot et la transaction de balise existante. Figer les cibles sur adventure_progress ; stocker les souvenirs dans une table RLS distincte et les lire dans Aventure.

**Tech Stack:** PostgreSQL16, Supabase RPC, JavaScript sans framework, node:test et Playwright.

**Spec:** docs/superpowers/specs/2026-10-19-rpg-server-quests-design.md

## Global Constraints

- Aucun gain XP/crédit ; uniquement trois souvenirs de carnet cosmétiques.
- Cibles :1/2/3jours, effort15–45minutes, fenêtre28jours et cap90/jour.
- Préserver chapitres, routes, départs, insignes et soldes existants ; pas de gains rétroactifs.
- Comptes version3 : aucune décision de cible/gain issue de l’historique client.
- Base jetable seulement ; aucun Profil/Android/image étrangère/fusion/déploiement.

## Review Focus

- Historique effacé ou importé pendant le chapitre : cible inchangée (SQL tâche1).
- Serveur ancien ou contrat version3 incomplet : aucune récompense fabriquée (unitaire/navigateur tâche2).
- Deux onglets valident ensemble : un seul chapitre et jeu de souvenirs (deux connexions tâche1).
- Changement de compte : aucun souvenir étranger dans le carnet (navigateur tâche2).
- Campagne préexistante : migration préserve exactement les acquis (SQL tâche1).

### Task1 — Contrats et transaction serveur

**Files:** nouvelle migration créée par Supabase CLI ; sql/tests/300_adventure_quests.sql ; tools/db/test-adventure-concurrency.py ; tools/db/test-migrations.sh.

**Interfaces:** public.titan_adventure_quests(p_world text)->jsonb ; campaigns[].quests et quest_rewards du snapshot version3 selon spec. private.titan_adventure_action signature inchangée.

- [x] Écrire le contrat SQL : version3, quatre tier=free, profils figés1/15 et3/45, source annotée, gains uniques et soldes inchangés, RLS et legacy.
- [x] Constater RED sur la migration parent via runner jetable/CI ; si PostgreSQL local indisponible, documenter et utiliser la CI sur tête exacte sans prétendre RED local.
- [x] Créer la migration par CLI ; ajouter profil, trigger, table protégée et helper invoker ; remplacer snapshot/action sans retirer leurs gardes.
- [x] Ajouter le contrat deux connexions avec refus d’une base non titan_test_, observer le verrou réel, conflit de la seconde révision et unicité après commit.
- [x] Rejouer les deux voies de migrations ; vérifier tous les contrats verts et commit des seuls fichiers du lot.

### Task2 — Lecture visible et gratuité

**Files:** js/core/campaign-quests.js ; js/app/aventure.js ; js/renaissance-catalog.js ; js/renaissance-engine.js ; adventure.html et autres références de cache des modules modifiés ; tests/campaign-quests.test.mjs ; tests/renaissance.test.mjs ; tests/e2e/rpg-server-quests.e2e.mjs ; package.json.

**Interfaces:** TitanCampaignQuests.plan({...existing,serverVersion=0})->modèle existant enrichi authority='server' et reward ; questRewardName(id)->string. Snapshot racine quest_rewards lu uniquement au propriétaire courant.

- [x] Écrire/run RED : profil serveur indépendant de history, champ incomplet refusé en version3, valeurs bornées, découverte libreforge/aurores.
- [x] Lire les missions version3 et rendre leur gain prévu puis les souvenirs réellement confirmés dans le carnet. Garder le fallback antérieur explicitement indicatif ; retirer le paywall des quatre campagnes en cohérence avec le serveur.
- [x] Ajouter/run navigateur : cible serveur stable après changementhistory, gain prévu distinct d’acquis, refus ne crée rien, succès/rafraîchissement montre un souvenir sans doublon, propriétaire/transition, quatre régions gratuites, ancien serveur explicite ;360/1280.
- [x] Run pnpm verify puis parcours ciblés (jamais en parallèle du build) ; commit ciblé.

### Task3 — Revue et livraison

**Files:** docs/CDC_WEB_RPG_SERVER_QUESTS_HANDOFF_2026-10-19.md et ce plan.

- [x] Revue indépendante unique de la branche selon executing-plans ; corriger Critical/Important confirmés.
- [x] Publier un arbre GitHub identique au local, PR vers main pour recette agrégée des lots96–99 ; lire les résultats CI exacts.
- [x] Handoff avec les trois rubriques CDC, preuves et limites ; mettre à jour le cahier sans changer ses307formulations, libérer le claim et vérifier le readback.

Self-review : les contrats, compatibilité, gratuité, préservation et cinq risques sont couverts. Exécution inline selon l’autonomie demandée ; pas de nouvelle demande d’approbation.

# Handoff — limites de débit : guildes et achats (CHEAT17, SEC10)

**Convergence (19/10/2026, après la PR 103 de Codex)** : Codex a préparé son propre limiteur des créations et modifications de séances (migration `20261019122259_training_mutation_rate_limits.sql`, branche `codex/web-training-rate-limits-cdc`). Pour ne pas avoir deux mécanismes, **cette migration ne limite plus les séances** : le déclencheur `training_logs` et son test ont été retirés ; elle ne couvre que les entrées/sorties de guilde et les achats. CHEAT16 relève désormais de la migration de Codex ; le refus `TRAINING_RATE_LIMIT` de Codex reçoit un message lisible dans `js/app/sessions.js`. Ce fichier a été renommé pour éviter un conflit d'ajout avec le `docs/CDC_WEB_RATE_LIMITS_HANDOFF_2026-10-19.md` de Codex.

Le reste de ce document est l'état avant convergence : les passages sur les modifications de séances (plafond 120/h, bucket `training_change`, déclencheur sur `training_logs`) ne sont plus d'actualité.

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `dbdc91d`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel. Aucune RPC existante réécrite, aucune donnée modifiée.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| CHEAT17 — rate limits adaptés aux endpoints sensibles | `[~]` | Trois chemins d'écriture sans limite en ont maintenant une, côté base (déclencheurs `BEFORE`, donc aussi pour une écriture directe d'un joueur connecté) : changements d'appartenance à une guilde de son propre compte (20/h ; changer de guilde en coûte deux ; se ré-inscrire à la guilde déjà rejointe ne coûte rien), lignes d'achat (120/h), modifications de ses séances (120/h, unité comprise). Déjà limités avant ce lot et laissés intacts : séances (12/h, 40/j), demandes d'ami (25/j), partages et encouragements, défis, messages, assistance. Restent sans limite : sauvegarde d'état de profil (légitimement fréquente), carte publique, apparence. |
| CHEAT16 — spam création/suppression/recréation de séances | `[~]` | Création : limites déjà en place (12/h, 40/j). Nouveau : modification ou archivage répétés d'une séance (120 changements de contenu/h). Une écriture qui ne change rien (même valeur) ne compte pas. Pas de détection de motif « créer puis effacer puis recréer » en tant que tel. |
| SEC10 — attaques logiques (boutique, publicité récompensée, Premium, séances) | `[~]` | Cadence d'achats et de modifications désormais bornée et testée ; publicité récompensée non couverte par ce lot. |

## Fonctionnement

- `private.titan_rate_limit(utilisateur, seau, plafond, fenêtre)` : compte les événements récents dans `private.titan_rate_events` (table privée sans droit API), refuse `RATE_LIMITED` (SQLSTATE `PT429`, seau en `DETAIL`) au plafond, verrou consultatif par utilisateur et seau contre deux scripts parallèles, nettoyage des événements de plus d'un jour pour cet utilisateur.
- À 75 % du plafond, **un** signal `rate_limit.near` (moyen) est consigné et apparaît dans la file de modération ; la tentative refusée elle-même ne peut pas l'être (la transaction est annulée).
- Jamais limités : service, facturation, administration et maintenance SQL (pas de `auth.uid()`), ni une écriture imbriquée dans un autre déclencheur ou une cascade — **une suppression de compte par le joueur lui-même (`delete_own_account`) supprime ses propres lignes et doit toujours réussir** (c'est la suite de suppression de compte existante qui a révélé le défaut de ma première version).
- Plafonds généreux pour un joueur honnête ; à calibrer sur données réelles.

## Fichiers

`supabase/migrations/20261019200000_rate_limits.sql`, `sql/tests/300_rate_limits.sql`, `300_z_rate_limits_migration.sql`, lignes ajoutées au plan de production et au contrôle préalable. Aucun fichier réservé modifié.

## Vérifications

- RED avant migration. Banc PostgreSQL 16, deux voies, suites vertes dont suppression de compte, achats, séances. Mutations détectées : comptage de toutes les lignes d'une guilde dissoute, toute mise à jour comptée, aucun refus, aucun signal d'approche, règle d'imbrication retirée (suppression de compte cassée). Un mutant « service limité » est équivalent (l'identité nulle ne correspond à aucune ligne) : la garde reste en défense.
- Rejeu transactionnel deux fois : aucune ligne modifiée, un déclencheur de chaque type, droits fermés.
- `pnpm run verify` : 235/235. Revue de code unique : 4 remarques, traitées : plafond de guilde trop serré (changer de guilde coûte deux changements, un réessai `ON CONFLICT` sur la même guilde comptait) → 20/h et ré-inscription non comptée ; édition/archivage d'un historique importé → 120/h ; unité non comptée dans le contenu ; purge des anciens événements de tous les seaux de l'utilisateur. Non traité : purge globale pour comptes dormants (au plus ~120 lignes par compte, bornées) et message client pour `RATE_LIMITED` (voir backlog).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- Test de concurrence à deux connexions réelles non écrit (le verrou consultatif est raisonné et testé en série seulement).
- Le front ne traduit pas encore `RATE_LIMITED` en message lisible (les écrans verraient une erreur générique) ; à brancher avec les écrans concernés (guildes, boutique), non réservés mais hors de ce lot SQL.
- Pas de limite sur la publicité récompensée, la carte publique, l'apparence, la sauvegarde d'état de profil.
- Les tentatives refusées ne sont pas journalisées (CHEAT18 : journal persistant à concevoir).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Message utilisateur pour `RATE_LIMITED` dans les écrans guilde/boutique ; journal persistant des refus (CHEAT18) ; CHEAT14/15 après décision humaine sur le moment d'exclusion ; Q-001/Q-002 restent à trancher.

## Retour arrière

```sql
drop trigger if exists titan_rate_limit_guild_members on public.guild_members;
drop trigger if exists titan_rate_limit_shop_history on public.shop_history;
drop trigger if exists titan_rate_limit_training_logs on public.training_logs;
drop function if exists private.titan_rate_limit_trigger();
drop function if exists private.titan_rate_limit(uuid, text, integer, interval);
drop table if exists private.titan_rate_events;
```
Aucune donnée utilisateur concernée (la table ne contient que des compteurs temporaires).

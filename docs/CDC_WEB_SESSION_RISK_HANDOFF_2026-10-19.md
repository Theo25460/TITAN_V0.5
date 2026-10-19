# Handoff — risque explicable par séance (CHEAT12, CHEAT13, CHEAT06)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `82b78a8`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel, aucune interface. Lecture seule : aucun rejet, aucune exclusion, aucune modification de XP, de crédits ou de classements.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| CHEAT12 — score de risque explicable à partir de plusieurs signaux | `[~]` | `public.titan_session_risk_v1(compte, limite)` (administrateurs seulement) renvoie, pour les séances récentes, un score, les signaux et leurs points. Trois signaux seulement ; pas de plafond de performance par sport (CHEAT03/05) ni de calcul à l'enregistrement. |
| CHEAT13 — états de séance | `[~]` | États calculés : normal (< 3), à surveiller (3-7), à examiner (8-19), critique (≥ 20). L'« exclusion temporaire des récompenses/classements » existe déjà (`training_logs.is_suspicious`, respecté par classements et récompenses) : elle est **rapportée** (`excludedFromRankings`), jamais posée automatiquement. |
| CHEAT06 — chevauchements impossibles | `[~]` | Signal `overlap` : moyen si ≥ 50 % de la plus courte séance et ≥ 10 min, haut si ≥ 90 % et ≥ 20 min. `date` pouvant être un début ou une fin, seul le chevauchement valable **dans les deux lectures** est retenu (un test le verrouille). |

Signaux additionnels du score : `speed_jump` (km/h ≥ 1,5× moyen, ≥ 2× haut, par rapport à la médiane du joueur sur le même sport, au moins 5 séances antérieures : CHEAT08 partiel) et `day_volume` (≥ 12 h moyen, ≥ 16 h haut déclarées le même jour UTC : CHEAT07 partiel). Séances historiques et archivées exclues ; séances d'autres comptes jamais comparées. Poids communs avec la modération (1/3/8/20).

## Fichiers

`supabase/migrations/20261019180000_session_risk.sql`, `sql/tests/300_session_risk.sql`, `sql/tests/300_z_session_risk_migration.sql`, ajout à `docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md` (15e migration) et `tools/db/preflight-production.sql`. Aucun fichier réservé modifié ; `titan_guard_training_log` et `titan_submit_training_session` intacts.

## Vérifications

- RED avant migration (fonction absente). Banc PostgreSQL 16, deux voies : suites vertes, rejeu transactionnel (deux fois), aucune ligne existante modifiée, droits (anon refusé, fonction privée fermée).
- Mutations détectées : historique compté dans les chevauchements, chevauchement haut supprimé, saut de vitesse haut supprimé, séances archivées comptées, contrôle administrateur retiré.
- Le test vérifie aussi qu'une séance, un signal ou un profil n'est jamais modifié par l'appel.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert. Rappels : `profile.html` charge encore `training-store.js?v=300.0` ; le test `assistance labels` est instable.

## NON BLOQUANT / BACKLOG FINITION

- Aucune interface : brancher le dossier de modération (`js/admin.js`) sur cette RPC est la suite naturelle (BOT04 prolongé).
- Le score est calculé à l'appel, pas à l'enregistrement : pas de signal persistant (CHEAT18) ni de file de séances (BOT03 reste sur les comptes).
- L'exclusion reste manuelle (`is_suspicious`) : aucun lien état → exclusion (CHEAT14/15) ni procédure d'appel (CHEAT19).
- Seuils (50/90 %, 1,5×/2×, 12 h/16 h, 5 séances) choisis de façon conservatrice sans données réelles ; à calibrer après recette. `speed_jump` ne couvre que l'unité `km`.
- Hypothèse documentée : durée lue dans `details.val2` ou `details.duration` ; une séance sans durée n'est jamais signalée.
- Plafonds de performance humaine par sport (CHEAT03/05/11) non faits.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Afficher ces états dans le dossier de modération (admin), puis CHEAT14/15 (exclusion des récompenses tant que la vérification n'est pas passée) après décision sur le moment où une séance « à examiner » doit être exclue. SEC08 reste documentaire.

## Retour arrière

```sql
drop function if exists public.titan_session_risk_v1(uuid, integer);
drop function if exists private.titan_session_risk(uuid, integer);
```
Aucune donnée ni table concernée.

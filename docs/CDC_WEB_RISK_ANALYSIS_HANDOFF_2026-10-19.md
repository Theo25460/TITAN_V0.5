# Handoff — analyse périodique des séances (BOT01, BOT02, CHEAT18)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `9fb8ab8`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| BOT01 — un système serveur qui analyse régulièrement | `[~]` | `private.titan_run_risk_analysis(heures, plafond)` analyse les comptes ayant enregistré des séances dans la fenêtre (26 h par défaut côté tâche), avec le risque explicable par séance (`private.titan_session_risk`). Planifiée chaque jour à 04:35 UTC sur les 50 dernières heures (un jour manqué reste couvert) **si `pg_cron` existe** (présent en production, v1.6.4 ; absent du banc local, donc la planification n'est pas exercée par les tests). Trois signaux seulement, pas de modèle statistique. |
| BOT02 — prioriser par risque plutôt que bannir | `[~]` | Un signal par séance « à examiner » ou « critique » (`SESSION_RISK_REVIEW` gravité haute, `SESSION_RISK_CRITICAL` gravité critique) avec score et signaux en charge utile ; la file de modération classe déjà les comptes par ces signaux (test : le compte apparaît, pas le compte régulier). Aucune action sur un compte ou une séance. |
| CHEAT18 — journaliser les signaux de manière exploitable | `[~]` | Signaux **persistants** (écrits par une analyse qui réussit, contrairement à un refus annulé avec sa transaction), dédoublonnés par séance — y compris après classement par un humain —, sans valeur de séance ni donnée brute : identifiant, score, état, codes de signaux. Reste ouvert : journal des refus (voir le limiteur de Codex, `raise log`). |

## Fonctionnement et garanties

- Fenêtre 1 à 168 h, 1 à 1000 comptes par exécution (les plus récents d'abord), 100 séances analysées par compte. Les comptes sont choisis par date d'**enregistrement** des séances ; une séance datée de plus de 120 jours est hors de la fenêtre du risque par séance (voulu). Seules les séances `review` (score 8-19) et `critical` (≥ 20) produisent un signal ; `watch` n'en produit pas.
- N'écrit que dans `titan_suspicious_actions` ; ne modifie ni profil, ni séance, ni récompense (test : comparaison avant/après).
- Un seul passage à la fois (verrou consultatif) ; un compte qui échoue est isolé (sous-transaction, `failed` dans le résultat) sans annuler les signaux des autres ; une séance dont l'état empire (« à examiner » → « critique ») est signalée à nouveau ; fermée à `anon` et `authenticated` (l'exécution est réservée au propriétaire de la tâche planifiée).

## Vérifications

RED avant la migration. Banc PostgreSQL 16 deux voies vert, rejeu transactionnel deux fois. Mutations détectées : dédoublonnage retiré (ou sans l'état), fenêtre retirée, séances « watch » signalées, plafond de comptes ignoré, isolation des échecs retirée, verrou retiré, plafonnement de durée retiré. `pnpm run verify` : 248/248. Revue de code unique : 9 remarques, traitées : un compte à durée absurde faisait échouer toute l'analyse chaque nuit (durée plafonnée à 24 h dans le risque par séance, isolation par compte), exécutions concurrentes (verrou), séances au-delà de 30 (100 analysées), signal non renouvelé quand l'état empire (dédoublonnage par séance et état), tâche déjà existante mise à jour (`cron.alter_job`), subvention `service_role` inutile retirée, chemin « critique » testé. Non traité : la planification `pg_cron` n'est pas exercée par le banc (à vérifier dans `cron.job` après application) ; sélection des comptes par balayage de `created_at` (pas d'index, coût négligeable au volume actuel).

## Effets à connaître avant la mise en production

À la première exécution, toutes les séances actives des dernières 26 h sont analysées : des signaux `open` apparaîtront dans la file de modération. Pour un classement en masse, utiliser « Classer sans suite » depuis la file.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- Planification non testée sur un vrai `pg_cron` (vérifier `cron.job` après application).
- Seuils du risque par séance à calibrer ; pas de lien avec la file de séances (liste par compte seulement).
- BOT10 : évolution vers des modèles statistiques non traitée.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Consentement (LEG41/CMP) ; nonces CSP ; premier déploiement répété sur une copie restaurée (A09-A11).

## Retour arrière

`select cron.unschedule('titan_run_risk_analysis'); drop function private.titan_run_risk_analysis(integer, integer);` Les signaux déjà écrits restent.

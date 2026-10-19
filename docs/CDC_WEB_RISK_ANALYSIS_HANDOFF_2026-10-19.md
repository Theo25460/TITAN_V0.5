# Handoff — analyse périodique des séances (BOT01, BOT02, CHEAT18)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `9fb8ab8`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| BOT01 — un système serveur qui analyse régulièrement | `[~]` | `private.titan_run_risk_analysis(heures, plafond)` analyse les comptes ayant enregistré des séances dans la fenêtre (26 h par défaut côté tâche), avec le risque explicable par séance (`private.titan_session_risk`). Planifiée chaque jour à 04:35 UTC **si `pg_cron` existe** (présent en production, v1.6.4 ; absent du banc local, donc la planification n'est pas exercée par les tests). Trois signaux seulement, pas de modèle statistique. |
| BOT02 — prioriser par risque plutôt que bannir | `[~]` | Un signal par séance « à examiner » ou « critique » (`SESSION_RISK_REVIEW` gravité haute, `SESSION_RISK_CRITICAL` gravité critique) avec score et signaux en charge utile ; la file de modération classe déjà les comptes par ces signaux (test : le compte apparaît, pas le compte régulier). Aucune action sur un compte ou une séance. |
| CHEAT18 — journaliser les signaux de manière exploitable | `[~]` | Signaux **persistants** (écrits par une analyse qui réussit, contrairement à un refus annulé avec sa transaction), dédoublonnés par séance — y compris après classement par un humain —, sans valeur de séance ni donnée brute : identifiant, score, état, codes de signaux. Reste ouvert : journal des refus (voir le limiteur de Codex, `raise log`). |

## Fonctionnement et garanties

- Fenêtre 1 à 168 h, 1 à 1000 comptes par exécution (les plus récents d'abord). Seules les séances `review` (score 8-19) et `critical` (≥ 20) produisent un signal ; `watch` n'en produit pas.
- N'écrit que dans `titan_suspicious_actions` ; ne modifie ni profil, ni séance, ni récompense (test : comparaison avant/après).
- Fermée à `anon` et `authenticated` ; exécutable par `service_role`.

## Vérifications

RED avant la migration. Banc PostgreSQL 16 deux voies vert, rejeu transactionnel deux fois. Mutations détectées : dédoublonnage retiré, fenêtre retirée, séances « watch » signalées, plafond de comptes ignoré. `pnpm run verify` : voir clôture. Revue de code unique : voir ci-dessous.

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

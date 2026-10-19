# Handoff — file de modération explicable (BOT03, BOT05, BOT06 partiel, BOT09)

Chantier AUTRE — Claude Code, 19/10/2026, suite de `docs/CDC_WEB_PURCHASE_MODERATION_HANDOFF_2026-10-19.md` (Q-003 corrigé). Branche `claude/titan-cahier-charges-0k7cdn` au-dessus de `4f291e45775686845edecdacfe774c0d8de8f205`. Aucune fusion, aucun déploiement, aucune migration appliquée à un projet réel, aucune interface.

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| BOT03 — file de comptes/séances à examiner | `[~]` | `titan_moderation_queue_v1` classe les **comptes** ayant des signaux ouverts. Les séances concernées ne sont accessibles que par les signaux bruts du dossier (`titan_moderation_case_v1`, champ `payload`) : pas de liste de séances dédiée. |
| BOT05 — afficher les signaux à l'origine du score | `[~]` | Chaque ligne de la file montre raison, gravité, nombre réel d'occurrences, points apportés, première et dernière date ; le dossier ajoute les 20 derniers signaux bruts. Aucune interface ne les affiche encore (BOT04). |
| BOT09 — logs d'actions de modération et retour en arrière | `[x]` | Chaque décision est enregistrée sans modification possible, avec auteur, motif et de quoi l'annuler ; la dernière décision d'un compte est annulable et l'annulation est elle-même enregistrée. |
| BOT06 — actions graduées | `[~]` | Disponibles : classer, surveiller, suspendre, rétablir. Absents : retrait temporaire de classement ou de récompenses et demande de vérification (aucun effet sur XP, crédits ou classements dans ce lot). |
| BOT07 — pas de bannissement automatique définitif | `[x]` proposé | Aucune action n'est automatique et le bannissement n'est pas une décision disponible ; la suspension est réversible et humaine. Un bannissement posé ailleurs n'est ni levé ni écrasé. |

## Fonctionnement

- Score, par compte, sur les signaux **ouverts des 30 derniers jours** de `titan_suspicious_actions` : par raison distincte, poids de la plus haute gravité (faible 1, moyenne 3, haute 8, critique 20) × au plus 3 occurrences. Cinquante signaux faibles identiques pèsent 3 points. Niveaux : bas < 8 ≤ à surveiller < 20 ≤ à examiner < 40 ≤ urgent. Le score ne dépend ni du sport ni du volume : un athlète exceptionnel n'est pas pénalisé pour sa seule pratique.
- Lecture et décisions : administrateurs uniquement (rôle lu sur le profil, jamais dans les métadonnées client). Les modérateurs ne voient pas encore la file.
- Décisions (`titan_moderation_decide_v1`) : `dismiss` marque les signaux ouverts comme examinés, `watch` consigne une surveillance sans effet, `suspend` et `restore` passent par la RPC d'administration existante (donc par le journal d'audit et `admin_logs`). Motif obligatoire (3 à 500 caractères). Refus : soi-même, un administrateur, un compte inconnu, double suspension, rétablissement d'un compte non suspendu ou banni.
- Annulation (`titan_moderation_revert_v1`) : dernière décision du compte seulement, jamais une annulation, jamais deux fois ; le compte doit être encore dans l'état laissé par la décision (`ACCOUNT_STATE_CHANGED` sinon, pour ne pas écraser un changement fait ailleurs) ; mêmes protections contre soi-même et les administrateurs. L'annulation d'un classement indique combien de signaux ont été rouverts sur combien attendus.
- Données : table privée `private.titan_moderation_decisions`, sans droit API, entrées immuables (modification, suppression et troncature refusées) ; seul le détachement d'un compte réellement supprimé est permis, ce qui conserve l'historique des administrateurs sans identité du joueur. Aucun identifiant de joueur dans les instantanés.

## Vérifications

- RED avant migration : la suite échoue faute de fonctions. Mutations détectées : plafond d'occurrences retiré, tout utilisateur connecté considéré administrateur, bannissement autorisé, décisions modifiables, cible administrateur autorisée, annulation d'une décision non récente, annulation aveugle d'une suspension, annulation sur un administrateur promu, suspension ignorant `is_suspended`.
- Banc PostgreSQL 16 natif, deux voies : 35 suites SQL par voie, rejeu des migrations en transaction appelante. `pnpm run verify` : 219/219, build et audit sans erreur (16 avertissements préexistants). Lot SQL uniquement : aucun parcours navigateur modifié.
- Une revue de code unique : 8 remarques, toutes traitées (annulation aveugle, prédicats de suspension unifiés, contrôles administrateur/soi-même à l'annulation, compte de signaux rouverts, poids de gravité unique, agrégat calculé une fois et index partiel des signaux ouverts, boucle de test inutile, document de retour arrière ci-dessous).

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert. Rappel : `profile.html` charge encore `training-store.js?v=300.0` (réservation Codex du Profil).

## NON BLOQUANT / BACKLOG FINITION

- Une séance rejetée par le moteur annule sa transaction, donc le signal `training_log.rejected` journalisé dans cette même transaction n'existe pas : la file voit surtout les signaux souples (déjà noté par la passation QA03). Un journal persistant des refus est à concevoir (CHEAT18).
- Pas d'analyse périodique (BOT01) : le score est calculé à l'appel. Pas d'interface (BOT04) ni de retrait de récompenses ou de classement (BOT06, CHEAT15).
- Pas de procédure d'appel par le joueur (CHEAT19) : la décision `dismiss` en est le point d'entrée côté administrateur.
- Les modérateurs ne lisent pas la file ; à décider avec l'interface.
- Les signaux bruts du dossier contiennent les valeurs envoyées par le joueur (distance, durée, avatar refusé) : lisibles par les administrateurs seulement.

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

BOT04 (vue d'administration sur ces fonctions, dans `admin.html`/`js/admin.js`, non réservés mais volumineux), puis CHEAT12/CHEAT13 (score de risque par séance, états de séance) qui alimenteraient la file. Sinon Android et intégrations santé, ou monétisation. RPG réservé à Codex.

## Retour arrière

```sql
drop function if exists public.titan_moderation_queue_v1(integer), public.titan_moderation_case_v1(uuid),
  public.titan_moderation_decide_v1(uuid, text, text), public.titan_moderation_revert_v1(bigint, text),
  private.titan_moderation_signals(uuid), private.titan_moderation_level(integer),
  private.titan_moderation_weight(text), private.titan_moderation_require_admin();
drop index if exists public.titan_suspicious_actions_open_user_idx;
-- Les décisions enregistrées sont immuables par conception. Pour supprimer la table, retirer d'abord ses gardes :
drop trigger titan_moderation_decisions_row_guard on private.titan_moderation_decisions;
drop trigger titan_moderation_decisions_truncate_guard on private.titan_moderation_decisions;
drop table private.titan_moderation_decisions;  -- efface l'historique des décisions : à n'exécuter qu'en connaissance de cause
drop function private.titan_moderation_decisions_guard();
```

Effet : plus de file ni de décisions de modération ; les suspensions déjà prononcées restent en place (elles vivent dans `profiles`). Un compte suspendu par ce moyen se rétablit alors par la RPC d'administration existante.

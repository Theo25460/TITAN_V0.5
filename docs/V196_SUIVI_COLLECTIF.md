# V1.9.6 — Suivi collectif individualisé

Un coach part d’un même programme pour un groupe, l’adapte à chaque sportif, vérifie qui recevra quelle version, envoie, reprend les envois
incomplets et voit qui a besoin d’un retour. Coach : Web. Sportif : il reçoit un programme V1.9.4 ordinaire (Web et Android), sans jamais voir
le groupe ni les autres. Drapeau serveur `screens.coach_groups` (fermé par défaut, vérifié par le serveur ; à ouvrir après
`screens.coach_programs` et `screens.coach_cycle_report`). Migration `20261130101600`, paquet `supabase/release-v2-03` (ancien paquet du lot `release-v196`, remplacé par la séquence canonique V2.0, voir `docs/v2/MIGRATIONS_V2.md`) (après v191 à v195).

## Ce qui est réutilisé

- Le lien de partage `public.coach_links` décide de chaque envoi et de chaque lecture, destinataire par destinataire, au moment même : un lien
  en pause (au-delà des places de l’offre, `private.titan_coach_link_active`) ou arrêté ne reçoit rien.
- La version d’un sportif devient un programme V1.9.4 envoyé (`private.titan_coach_plans`, état `sent`, base = la version du modèle) dont les
  séances sont des propositions ordinaires (`public.coach_assignments`) : réponses, déplacements, révisions et bilans V1.9.5 inchangés.
- La revue lit les propositions par la ligne V1.9.1 (`private.titan_coach_followup_row`, contrat du lien appliqué) et n’en garde que des
  comptes et des états.

## Données

| Objet | Rôle |
|---|---|
| `private.titan_coach_groups`, `_group_members` | Un groupe privé du coach (20 au plus), fait de ses liens en cours (30 au plus). |
| `private.titan_coach_dispatches` | Un bloc à diffuser : la version du modèle figée, le premier lundi, une révision. |
| `private.titan_coach_dispatch_recipients` | Par sportif : sa variante, son exclusion, le résultat du dernier essai (`pending`, `sent`, `failed` + raison), le nombre d’essais, le programme créé (un au plus, index unique). |
| `private.titan_coach_dispatch_sends` | Les résultats de chaque envoi par `op_id` : un appel rejoué rend les mêmes résultats et n’écrit rien. |

## Actions (`public.titan_coach_group_v1`)

`groups`, `group`, `review`, `dispatch` (lectures) ; `create_group`, `edit_group` (révision), `delete_group` ; `prepare` (bloc depuis un modèle
et un lundi, un destinataire par membre en cours) ; `variant` (révision du bloc ; `shift_weeks` 0–4, `day_map`, `moves`, `skip`, `excluded`) ;
`discard` (bloc jamais envoyé) ; `send` (`preview_key` de l’aperçu lu, `op_id`).

Envoi : refusé si l’aperçu a changé (`COACH_CONFLICT`, rien n’est écrit). Chaque destinataire non servi et non exclu est traité dans sa propre
sous-transaction : lien verrouillé, arrêté → `SHARING_UNAVAILABLE`, en pause → `COACH_CAPACITY_PAUSED`, dates hors période, limites de
programmes et de propositions ; un refus n’arrête ni n’annule les autres. Un destinataire déjà servi n’est jamais renvoyé. Le bloc est complet
quand chacun est servi ou exclu. Un sportif n’a aucun groupe (`COACH_ONLY`).

Suppression du groupe : groupe, membres et blocs supprimés ; les programmes reçus et leurs réponses restent. Un lien arrêté sort de tout envoi,
est affiché « Suivi arrêté » sans nom pendant 30 jours, et n’a plus de ligne de revue.

## Mesure

`private.titan_coach_group_measure()` (équipe) : groupes, taille médiane, blocs et blocs complets, destinataires par résultat, refus par raison
(sur tous les envois) et refus encore ouverts, envois, reprises réussies, versions adaptées (demandées et réellement différentes du modèle),
programmes en double (doit rester 0), temps de préparation d’un bloc (préparé → premier envoi, médiane) comparé au temps des programmes
préparés un par un (brouillon → envoi, médiane), programmes envoyés par bloc.

Protocole « semaine type » à suivre avec les coachs du pilote : préparer une semaine de groupe (8 sportifs dont 3 avec un autre calendrier) une
fois par le groupe et une fois sportif par sportif (V1.9.4), chronométrer les deux, puis contrôler l’individualisation (chaque sportif ouvre
sa version et la compare à ce qu’il attendait) et les erreurs d’envoi (`refusals` et `duplicatePlans` de la mesure). Le temps gagné vaut
`individualPrepMinutesMedian × programmes − prepMinutesMedian` sur la semaine.

## Écrans

- Web coach (`js/app/coach-groups.js`, `js/core/coach-group.js`) : « Groupes de suivi » dans l’espace « J’accompagne » ; création et membres ;
  revue (prochaine action et charge, « Ouvrir son suivi » pour le détail) ; « Préparer un bloc » ; aperçu par sportif (version, dates,
  séances, raison s’il ne recevra rien), « Adapter pour … », « Laisser de côté » ; envoi avec `op_id` gardé jusqu’à la réponse ; résultats
  par sportif ; reprise des envois incomplets ; suppression. Captures `docs/v196/preview.png`, `results.png`, `review.png`.
- Sportif : aucun écran nouveau ; le programme reçu s’affiche comme tout programme V1.9.4 (Web et Android).

## Preuves

`sql/tests/300_coach_groups.sql`, `tools/db/test-coach-group-concurrency.sh`, `tests/coach-group.test.mjs`, `tests/e2e/coach-group.e2e.mjs`,
`mobile/__tests__/coachGroups.test.tsx`, fixtures `tests/fixtures/coach-group.json` (`tools/db/coach-group/fixtures.sql`).

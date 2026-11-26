# V1.9.4 — Programmation multi-semaines

Un coach prépare un cycle de plusieurs semaines depuis un modèle versionné, l’adapte pour un sportif, l’envoie une fois, voit quelles séances
ont été acceptées, déclinées ou sont à discuter, puis révise une séance, une semaine ou la suite du cycle sans perdre ce qui avait été
accepté ni réécrire les semaines jouées. Coach Web ; sportif Web et Android (« Mes suivis de coaching »). Drapeau serveur
`screens.coach_programs` (fermé par défaut, vérifié par le serveur ; à ouvrir après `screens.coach_followup`, `screens.coach_feedback` et
`screens.coach_review`). Migration `20261130101400`, paquet `supabase/release-v2-03` (ancien paquet du lot `release-v194`, remplacé par la séquence canonique V2.0, voir `docs/v2/MIGRATIONS_V2.md`) (après v191, v192 et v193).

## Ce qui est réutilisé

- Le lien de partage `public.coach_links` : périmètre, pause de capacité (`private.titan_coach_link_active`), révocation. Il décide de chaque
  lecture et de chaque écriture, au moment même.
- Chaque séance d’un programme envoyé est une ligne ordinaire de `public.coach_assignments` (statut `proposed`) : portail, suivi V1.9.1
  (déplacer, indiquer faite, relier par `session_id`, retirer le lien), file « Décisions à prendre » et revue de la semaine V1.9.3 la
  traitent comme toute proposition.
- La règle V1.9.1 d’un changement : une séance acceptée (ou déclinée) n’est jamais écrasée ; le changement attend à côté de la version en
  vigueur (`pending_change`), la première version acceptée (`accepted_version`) est gardée ; une séance faite et liée n’est jamais touchée.
- La projection V1.9.1 d’une séance liée : hors du contrat du lien, le coach lit « liée » seulement (ni jour ni mesure).
- Le modèle de blocs V1.7.4 (`js/core/training-block.js`) vit sur la branche de la V1.7 (non fusionnée) et appartient au sportif
  (`game_state.user.schedule.blocks`). Le programme du coach en reprend les règles (semaine du lundi, un changement ne touche ni la semaine
  jouée ni ce qui est fait, aperçu avant d’appliquer, versions conservées) mais vit côté serveur, sous les droits du coaching.

## Données

| Objet | Rôle |
|---|---|
| `private.titan_coach_programs` + `_program_versions` | Modèles du coach (nom, 1 à 12 semaines, 5 objectifs, 60 séances : semaine, jour, nom, sport, consignes, clé stable). Enregistrer crée une version ; les anciennes restent lisibles ; 50 modèles actifs. |
| `private.titan_coach_plans` | Un programme pour un suivi : brouillon (invisible du sportif), envoyé, clos, abandonné. Garde son point de départ (`basis` : modèle et version, ou programme d’un autre sportif) pour l’aperçu. |
| `private.titan_coach_plan_versions` | Une version immuable par envoi, révision (avec `op_id`, portée, résumé) et clôture, avec l’instantané de chaque séance (proposition et statut, jamais une mesure). |
| `public.coach_assignments` | `plan_id`, `plan_key`, `plan_week` (index unique par programme : un envoi rejoué ne crée rien), `discuss_note`, `discuss_at` (« à discuter »). |

## Actions (`public.titan_coach_program_v1`)

| Action | Qui | Effet |
|---|---|---|
| `library`, `program`, `save_program`, `archive_program` | coach | Modèles et leurs versions. |
| `adapt` | coach | Brouillon pour un suivi depuis un modèle (version courante) ou depuis un programme d’un autre sportif (tel qu’il est, révisions comprises), premier lundi du cycle choisi. |
| `edit`, `discard` | coach | Adapter le brouillon (révision relue) ; l’aperçu liste chaque séance ajoutée, retirée ou modifiée et ses champs. |
| `send` | coach | Crée les propositions (dates de la semaine et du jour), version 1. Rejoué : « déjà », rien de plus. |
| `link`, `plan`, `athlete` | coach, sportif | Lecture par le contrat du lien (coach : lien actif ; sportif : lien actif, en pause ou arrêté depuis moins d’un an, lecture seule). |
| `revise` | coach | `dry_run` : effet par séance sans écrire, avec une clé d’aperçu. Application : la même clé (sinon `COACH_CONFLICT`) et un `op_id` (rejoué : la version créée, rien de plus). |
| `answer` | sportif | Par séance : accepter, décliner, à discuter (mot de 300 caractères) ; accepter un changement ou garder sa version ; « tout accepter ». Une séance déjà décidée reste telle quelle (`unchanged`). |
| `close` | coach | Séances sans réponse annulées, changements en attente retirés, ce qui est accepté ou fait reste ; version de clôture. |

## Révision partielle

| Séance | Une occurrence | Une semaine / la suite |
|---|---|---|
| Faite et liée | conservée (`kept_done`) | conservée |
| Pas encore répondue (ou à discuter) | mise à jour (`updated`), « à discuter » levé | mise à jour |
| Acceptée | changement proposé (`change_proposed`), version acceptée gardée | changement proposé |
| Déclinée | changement proposé | conservée (`kept_declined`) |
| Date passée | — | conservée (`kept_past`) |
| Semaine entièrement jouée | — | refusée (`WEEK_PLAYED`) |

## Mesure

`private.titan_coach_program_measure()` (équipe seulement) : modèles et versions, programmes par état, temps de préparation (brouillon créé →
envoi : médiane et maximum, en minutes), révisions, programmes révisés et programmes révisés dont toutes les versions sont présentes,
séances acceptées, liées et à discuter. Protocole pilote : chronométrer la préparation d’un cycle de quatre semaines pour un sportif
(depuis le modèle jusqu’à l’envoi) avec et sans le lot, sur deux coachs ; relever la mesure serveur au bout de quatre semaines.

## Preuves

- `sql/tests/300_coach_programs.sql` (scénario complet, voir le compte rendu), `tools/db/test-coach-program-concurrency.sh` (deux connexions).
- `tests/coach-program.test.mjs`, `tests/e2e/coach-program.e2e.mjs` (captures `docs/v194/`), `mobile/__tests__/coachPrograms.test.tsx`.
- Réponses réelles du serveur : `tests/fixtures/coach-program.json` (`node tools/db/coach-program/build-fixtures.mjs psql … -d titan_test_…`).

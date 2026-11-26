# V1.9.5 — Bilans de cycle partageables

En fin de cycle (un programme V1.9.4 envoyé ou clos), le coach prépare un bilan sourcé ; le sportif choisit ce qu’il partage et le valide ;
les décisions qu’il approuve deviennent les objectifs du cycle suivant, avec leur origine. Coach Web ; sportif Web et Android (« Mes suivis
de coaching »). Drapeau serveur `screens.coach_cycle_report` (fermé par défaut, vérifié par le serveur ; à ouvrir après
`screens.coach_programs`). Migration `20261130101500`, paquet `supabase/release-v2-03` (ancien paquet du lot `release-v195`, remplacé par la séquence canonique V2.0, voir `docs/v2/MIGRATIONS_V2.md`) (après v191 à v194).

## Ce qui est réutilisé

- Le lien de partage `public.coach_links` : périmètre (sport, depuis, détails, notes), pause de capacité, révocation. Il décide de chaque
  lecture et de chaque écriture, au moment même.
- Le cycle est un programme V1.9.4 (`private.titan_coach_plans`) ; ses séances sont ses propositions (`public.coach_assignments`) avec leurs
  états V1.9.1 : proposée, acceptée, déplacée (par le sportif) ou révisée (par le coach), dite faite, liée à une séance du journal.
- La mesure d’une séance liée est la projection « core » de V1.9.2 (jour, sport, valeur, unité, durée), seulement dans le périmètre du lien.
- Le cycle suivant est un brouillon V1.9.4 ordinaire (`adapt`), que le coach adapte et envoie comme tout programme.

## Données

| Objet | Rôle |
|---|---|
| `private.titan_coach_cycle_reports` | Un bilan par programme : copie de travail du coach (constats reliés aux séances sources, décisions), brouillon invisible du sportif, proposé, publié ; accès retiré par le sportif. |
| `private.titan_coach_cycle_report_versions` | Une version par validation du sportif : faits des séances, mesures, notes et check-ins qu’il a cochés, constats, décisions avec sa réponse, son mot, contrat du lien, fichier autorisé ou non, retraits (genre et clé seulement). |
| `private.titan_coach_cycle_report_exports` | Qui a téléchargé un fichier, de quelle version, combien de champs (jamais le contenu). |
| `private.titan_coach_plans.origin` | Le bilan, la version et les objectifs approuvés d’où vient un cycle suivant (index unique : un seul cycle suivant vivant par bilan). |

Les totaux ne sont jamais stockés : ils sont recalculés à chaque lecture à partir des séances de la version, après vérification de chaque
source (une séance du journal archivée ou supprimée n’est plus « réalisée », une séance sortie du périmètre perd sa mesure et sa note).

## Actions (`public.titan_coach_cycle_v1`)

| Action | Qui | Effet |
|---|---|---|
| `link`, `athlete`, `report` | coach, sportif | Lecture par le contrat du lien. Coach : lien actif seulement ; contenu publié seulement s’il est en ligne. Sportif : jamais un brouillon ; lecture seule en pause et un an après la fin du partage. |
| `start`, `save`, `propose`, `recall` | coach | Ouvrir le bilan (une fois), enregistrer la copie de travail (révision relue), la proposer (rejoué : « déjà »), la reprendre. |
| `validate` | sportif | Validation dédiée sur sa lecture (`preview_key`, sinon `COACH_CONFLICT`) avec un `op_id` (rejoué : la version créée). Seul ce qui était proposé peut être coché ; une note va avec la mesure de sa séance. |
| `return` | sportif | Renvoie le bilan proposé au coach avec un mot ; rien n’est publié. |
| `retract` | sportif | Retire une note, une mesure, un check-in ou son mot : supprimé de toutes les versions stockées, donc de la version en ligne et des prochains fichiers. |
| `withdraw` | sportif | Retire l’accès à la version en ligne : le coach ne lit plus aucun contenu partagé (`REPORT_WITHDRAWN`), même par un appel direct. |
| `export` | coach (si autorisé), sportif | Les champs autorisés de la version en ligne, pour un fichier ; journalisé. |
| `next` | coach | Brouillon du cycle suivant avec les seules décisions approuvées (objectifs ; séances à placer en semaine 1) et leur origine. Rejoué : le même brouillon. |

Un changement du périmètre du lien après la validation suspend la version en ligne (`REPORT_REVALIDATION`) jusqu’à une nouvelle validation.

## Chiffres

Chaque chiffre porte sa période (le cycle, du lundi au dimanche) et ses sources (les clés des séances comptées) : proposées, acceptées,
réalisées (liées à une séance du journal encore présente), reportées (date en vigueur différente de la date proposée à l’origine, par le
sportif ou par une révision du coach), dites faites, sans séance liée, sans réponse, déclinées, annulées, archivées depuis, durée et volume
(séances partagées seulement). Semaine par semaine, une séance compte dans la semaine où elle se trouve maintenant : rien n’est compté deux fois.

## Mesure

`private.titan_coach_cycle_measure()` (équipe seulement) : bilans par état, temps de production d’un bilan (ouvert par le coach → première
validation : médiane et maximum), versions, versions avec notes et check-ins, retraits, accès retirés, fichiers par rôle, décisions
approuvées, cycles relancés (cycle suivant envoyé) et préparés, et la réponse facultative du sportif à « Ce que ton coach verra est-il clair ? »
(clair / pas tout à fait). Protocole pilote : chronométrer la production d’un bilan de six semaines avec deux coachs, relever la part des
cycles relancés et la compréhension au bout d’un cycle.

## Preuves

- `sql/tests/300_coach_cycle_reports.sql` (scénario complet de six semaines), `tools/db/test-coach-cycle-concurrency.sh` (deux connexions).
- `tests/coach-cycle.test.mjs` (bilan de référence comparé au résultat affiché), `tests/e2e/coach-cycle.e2e.mjs` (captures `docs/v195/`),
  `mobile/__tests__/coachCycles.test.tsx`.
- Réponses réelles du serveur : `tests/fixtures/coach-cycle.json` (`node tools/db/coach-cycle/build-fixtures.mjs psql … -d titan_test_…`).

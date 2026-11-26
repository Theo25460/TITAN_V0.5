# V1.8.6 — Agenda et rendez-vous d’équipe

Un club se donne un moyen simple de se retrouver pour de vraies séances : ses administrateurs proposent des rendez-vous privés, chaque
membre répond, et après coup chacun peut dire qu’il y était et associer **sa propre** séance au bilan du groupe. L’agenda s’adosse aux
briques existantes : l’espace Club et ses rôles (`20261030090000`, administrateur et membre, droits validés par V1.8.4), le seuil de
confidentialité de 3 des clubs, les séances confirmées (`private.titan_confirmed_sessions`, `20261120110000`) et le récap « Depuis ta
dernière visite » (`titan_social_digest_v1`, version `20261130104300`). Migration `supabase/migrations/20261130104600_club_agenda.sql`
(paquet `supabase/release-v26`, **non appliqué**), drapeau serveur `screens.club_agenda` (absent = fermé, déploiement par compte). Une
rencontre interclubs (V1.8.5) n’est pas nécessaire.

## Règles

| Sujet | Ce que fait le serveur (`public.titan_club_agenda_v1`, `public.titan_club_agenda_act_v1`, `public.titan_club_agenda_invite_v1`) | Refus explicites |
|---|---|---|
| **Organiser** | Seuls les **administrateurs du club** proposent : titre (3 à 60), lieu général (2 à 60), **lieu précis facultatif** (≤ 200), **plan de repli facultatif** (≤ 200), durée 15 min à 8 h, **capacité facultative** (2 à 100), **une fois** ou **chaque semaine** (2 à 12 rendez-vous), au moins 30 min à l’avance et dans les 60 jours ; dix séries à venir au plus par club. Ils **déplacent** une occurrence, **passent au plan de repli** (et en reviennent), **annulent** puis **rétablissent** une occurrence, **annulent** puis **reprennent** une série, **renouvellent** le lien d’invitation. | `CLUB_ADMIN_REQUIRED`, `AGENDA_INVALID`, `AGENDA_LIMIT`, `NOT_ELIGIBLE`, `SLOT_STARTED`, `SLOT_CANCELLED`, `SERIES_CANCELLED`, `SERIES_ACTIVE`, `NO_FALLBACK` |
| **Séries** | Matérialisées une fois à la création (`unique (event_id, n)`), chaque occurrence à la **même heure de Paris** (18 h 30 reste 18 h 30 au changement d’heure de mars et d’octobre). Annuler une série annule **sur place** ses occurrences à venir ; la reprendre rétablit **les mêmes lignes** (aucun doublon) ; une occurrence annulée seule le reste. | |
| **Répondre** | « Je viens », « Peut-être », « Je ne viens pas » jusqu’au début. Avec une capacité, un « Je viens » au-delà de la dernière place est gardé **en file d’attente** (ordre des réponses) ; une place libérée (changement d’avis, départ du club, compte effacé) va au premier qui attend (`promoted_at`). Répéter sa réponse la confirme sans perdre sa place dans la file. Verrou de la ligne du club puis de l’occurrence : deux réponses simultanées pour la dernière place ne dépassent jamais la capacité. | `SLOT_STARTED`, `SLOT_CANCELLED`, `ACCOUNT_SUSPENDED` |
| **Changements** | Un déplacement, un passage au plan de repli, un rétablissement ou une reprise **gardent les réponses** et les marquent « à confirmer » (`changed_at > confirmed_at`) : le membre garde l’heure, le plan de repli et l’historique, et change d’avis s’il veut. **Historique clair** (`private.titan_club_event_changes`) : création, déplacement (de → à), plan de repli, annulation, rétablissement, série annulée, série reprise, avec la date, **jamais l’auteur**. | |
| **Ce que chacun voit** | **Membres** : titre, heure, durée, lieu général, plan de repli, capacité, **nombres** de réponses, leur propre réponse et sa place dans la file, l’historique. **Lieu précis** : administrateurs et membres qui viennent, hésitent ou attendent, jusqu’à la fin ; jamais une fois annulé. **Administrateurs** : en plus, qui a répondu quoi et qui a déclaré sa présence (nom public, comme la liste des membres qu’ils modèrent) et le lien d’invitation. | `CLUB_NOT_FOUND` hors du club |
| **Lien d’invitation** | `/social.html?rdv=CODE` (8 caractères). Pour un **membre actuel**, tant que la série a une occurrence à venir : le rendez-vous. Sinon **« expiré »** (série terminée ou annulée) pour un membre, **« indisponible »** pour tout autre cas (code inconnu ou renouvelé, autre club, ancien membre) : ni titre, ni heure, ni lieu. 30 lectures par heure, jamais d’erreur pour un code faux. | |
| **Rappels** | Facultatifs, par réponse (« Me le rappeler ») : le rendez-vous apparaît dans « Depuis ta dernière visite » dans ses 24 dernières heures. Rien n’est poussé. | `ANSWER_REQUIRED` |
| **Fiche du rendez-vous terminé** | Du début à **7 jours après la fin** : chaque membre actuel déclare « J’y étais » ou « Je n’y étais pas » (une déclaration, rien de plus) et, s’il y était, **associe une de ses séances confirmées du même jour de Paris** — ou la retire. Une séance n’est associée qu’à un rendez-vous. **`public.training_logs` n’est jamais écrit** : aucune séance créée, modifiée ou attribuée. Bilan du groupe : nombre de réponses, de présences, de séances associées ; minutes (90 au plus par séance), distance et nombre de disciplines **à partir de 3 séances associées**. | `PRESENCE_REQUIRED`, `LOG_NOT_ELIGIBLE`, `SLOT_NOT_STARTED`, `SLOT_CLOSED` |

**Départ du club** : les réponses aux occurrences à venir sont retirées (une place tenue revient au premier qui attend) ; les réponses et
présences des rendez-vous déjà commencés restent dans les nombres du groupe. Toute lecture et toute réponse exigent l’appartenance
actuelle.

**Rien n’est gagné** : ni XP, ni crédit, ni titre, ni classement.

**Drapeau fermé** : proposer, déplacer, rétablir, reprendre une série, renouveler un lien, répondre oui ou peut-être, demander un rappel,
ouvrir un lien et les lignes du récap sont refusés (`FEATURE_DISABLED`) ; « Je ne viens pas », la présence, l’association d’une séance,
les annulations et l’arrêt d’un rappel restent possibles.

## Récap « Depuis ta dernière visite »

`titan_social_digest_v1` gagne la clé `agenda` (six lignes au plus, une par occurrence, dans cet ordre) : une place s’est libérée pour
moi ; un rendez-vous auquel je venais est annulé ; il a changé depuis ma réponse ; mon rappel (moins de 24 h) ; la prochaine occurrence
d’une série, dans les 14 jours, à laquelle je n’ai pas répondu ; un rendez-vous terminé depuis moins de 7 jours où je n’ai pas dit si j’y
étais. Formulé par `js/core/club-agenda.js` (`digest`), sans urgence ni reproche.

## Historique, export, effacement, mesure

- Tables `private.titan_club_events`, `private.titan_club_event_slots`, `private.titan_club_event_answers`, `private.titan_club_event_changes`
  (aucun accès API direct).
- Export du compte : clé `clubAgenda` (les séries qu’on a organisées ; ses réponses, rappels, présences et séances associées ; jamais un
  autre membre).
- Effacement : réponses, présences et liens partent avec le compte (une place tenue revient au premier qui attend) ; un rendez-vous garde
  son historique sans son organisateur (`created_by`, `by_user` : `on delete set null`).
- Mesure du pilote (rôle de service) : `private.titan_club_agenda_measure(depuis)` → séries et séries hebdomadaires créées, occurrences
  terminées, **rendez-vous tenus** (terminés, non annulés, au moins une présence déclarée), annulés, déplacés, **réponses confirmées**
  (« Je viens » aux rendez-vous terminés), places libérées données à la file, présences, séances associées, et le **taux de retour la
  semaine suivante** (`returned` / `returnEligible` : parmi les présences de rendez-vous terminés depuis 7 jours au moins, celles suivies
  dans les 7 jours d’une séance confirmée ou d’un « Je viens » à un autre rendez-vous du club). Des nombres seulement.

## Clients

- Module partagé `js/core/club-agenda.js` (règle en miroir, formulations, heure de Paris, récap), copié tel quel dans l’application Android.
- Web : Communauté › Clubs, bloc « Agenda du club » (formulaire de l’organisateur avec date et heure de Paris, répétition, lieu précis,
  plan de repli et capacité ; réponses ; rappel ; déplacement, plan de repli, annulation et rétablissement, série annulée et reprise
  avec confirmation ; réponses nominatives et lien pour l’organisateur ; historique ; rendez-vous passés avec présence et séance associée),
  lien `?rdv=` lu une fois puis retiré de l’adresse, lignes dans « Depuis ta dernière visite ».
- Android : Communauté › Clubs, même bloc pour répondre, demander un rappel, déclarer sa présence, associer ou retirer sa séance ; pour
  l’organisateur, plan de repli et annulation avec confirmation. Proposer, déplacer et gérer une série se font sur le Web, comme la
  création d’un club ou d’une saison. Les lignes du récap apparaissent dans « Dans ton cercle depuis ta dernière visite ».

## Preuves

`sql/tests/300_club_agenda.sql`, `tools/db/test-club-agenda-concurrency.sh`, `tests/club-agenda.test.mjs`,
`tests/e2e/club-agenda.e2e.mjs`, `docs/v186/*.png` ; Android : `mobile/__tests__/clubAgenda.test.tsx`.

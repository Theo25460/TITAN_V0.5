# V1.8.5 — Rencontres entre clubs

Deux clubs de tailles et de disciplines différentes se lancent un défi privé compréhensible, avec une contribution limitée par personne,
**d’abord en coopération**. La rencontre s’adosse aux briques existantes : l’espace Club et ses rôles (`20261030090000`), le seuil de
confidentialité de 3 de l’objectif de la semaine (`20261120100000`), les séances confirmées et la règle du jour actif de la Cordée
(`20261120110000`), l’adhésion explicite et révocable de la saison de club (`20261130104400`, V1.8.4). Migration
`supabase/migrations/20261130104500_club_match.sql` (paquet `supabase/release-v25`, **non appliqué**), drapeaux serveur
`screens.club_match` (coopération) et `screens.club_match_versus` (format comparatif, **fermé**).

## Le modèle de score

| Élément | Règle | Pourquoi |
|---|---|---|
| **Jour actif** | Un jour de Paris avec au moins **12 minutes d’effort comptées** (90 par jour au plus) issues des **séances confirmées** (validées, non suspectes, estampillées par le serveur, sans récompense retenue), datées et enregistrées pendant la participation | Un jour de natation vaut un jour de vélo : les disciplines sont égales |
| **Part** | Jours de l’allure (douce 2, régulière 3, soutenue 4 par semaine) × semaines de participation, **au prorata du temps passé, arrondie au-dessus** | Partir tôt pèse peu ; partir à la fin sans rien avoir fait ne relève pas le taux |
| **Plafond individuel** | Chacun compte **au plus sa propre part** | Un membre très actif ne fait jamais plus que 1 ÷ effectif du taux : il ne porte pas son club seul (simulation B) |
| **Taux d’un club** | Jours comptés ÷ somme des parts, **en pour cent arrondi en dessous**, seulement **à partir de 3 participants encore là** | Un taux ne dépend pas de la taille du club (simulation A) |
| **Coopération** (pilote) | **Score commun = moyenne des deux taux** (chaque club pèse la moitié), arrondie en dessous ; **seuil de 60 %** | 60 % est atteint par la plupart des clubs qui tiennent leur allure et rarement par des clubs à moitié (simulation F) |
| **Comparaison** (fermée) | Le meilleur taux l’emporte ; **égalité à moins de 5 points** ; **deux semaines seulement** | Une semaine avec un petit club est trop souvent décidée par le hasard (simulation G) |

Les scores partagés sont **arrêtés à la dernière minuit de Paris** pendant la rencontre (séances datées et enregistrées avant) : personne
ne peut voir quand un membre s’entraîne. Chacun lit ses propres jours en direct. Le score final est celui de la fin (séances datées et
enregistrées avant la fin), figé une fois dans le récapitulatif ; il n’est jamais recalculé.

Simulations : `node tools/simulate-club-match.mjs --write` → `docs/V185_SIMULATIONS.md` (graine fixe, données synthétiques), vérifiées
par `tests/club-match.test.mjs`.

## Parcours

| Sujet | Ce que fait le serveur (`public.titan_club_match_v1`, `public.titan_club_match_preview_v1`, `public.titan_club_match_act_v1`) | Refus explicites |
|---|---|---|
| **Proposer** | Un **administrateur** du club A choisit le format, le départ (de demain à 28 jours), la durée (1 ou 2 semaines) et l’allure ; il obtient un **code à usage unique** à transmettre. Une rencontre à la fois par club (proposée ou en cours, d’un côté ou de l’autre). Retirer la proposition rend le code inutilisable | `CLUB_ADMIN_REQUIRED`, `MATCH_INVALID`, `MATCH_OPEN`, `VERSUS_CLOSED`, `NOT_ELIGIBLE`, `FEATURE_DISABLED` |
| **Accepter ou refuser** | Un administrateur du club B lit d’abord l’**aperçu** du code (paramètres, règles, nom du club A ; limité à 20 lectures par heure, jamais une erreur pour un code faux, pour que la limite tienne), puis **accepte ou refuse** par l’identifiant de la proposition, avant le départ. Deux comptes différents doivent s’accorder | `MATCH_CODE`, `MATCH_SELF`, `MATCH_SAME_ORGANISER`, `MATCH_STARTED`, `MATCH_OPEN` |
| **Participer** | Personne n’est ajouté : chaque membre de l’un ou l’autre club choisit **Participer**, jusqu’à la fin du deuxième jour. **Quitter** est définitif (les jours comptés restent au club, la part est réduite au temps passé). Quitter le club, ou en être retiré, retire de la rencontre (déclencheur `titan_club_members_match`). Compte suspendu : ni proposer, ni accepter, ni participer | `MATCH_JOIN_CLOSED`, `MATCH_LEFT`, `MATCH_NOT_IN`, `ACCOUNT_SUSPENDED` |
| **Arrêter** | Chaque côté peut arrêter : avant le départ, la rencontre est **annulée** ; après, elle est **abandonnée sans résultat**. Une proposition non acceptée avant le départ **expire** | `CLUB_ADMIN_REQUIRED`, `MATCH_NOT_FOUND`, `MATCH_ENDED` |
| **Fin** | Récapitulatif figé, lisible 60 jours par les membres des deux clubs : taux de chaque club, score commun (ou vainqueur, égalité), et pour chacun sa propre part. Si un club compte moins de 3 participants à la fin : **sans résultat**. Une proposition refusée, expirée ou retirée n’est lue que par les administrateurs du club qui l’a proposée | — |
| **Avis** | Chaque participant répond une fois à deux questions : le score était-il clair, referais-tu une rencontre ? Compté pour la mesure, jamais montré aux clubs | `MATCH_NOT_IN`, `MATCH_INVALID` |

## Confidentialité

- **Ce que lit l’autre club** : le nom du club, son nombre de participants et son taux (à partir de 3), arrêté chaque nuit. Rien d’autre :
  ni nom, ni séance, ni jour, ni présence, ni total de jours.
- **Ce que lit son propre club** : en plus, le total de jours comptés et l’objectif d’équipe (à partir de 3).
- **Ce que lit chacun de soi** : sa part et ses jours comptés, en direct ; jamais ceux d’un autre.
- Aucune table n’est lisible par l’API ; tout passe par des fonctions `security definer` ; aucun identifiant de compte n’apparaît dans ce
  qu’un membre lit (vérifié pour chaque compte du scénario dans `sql/tests/300_club_match.sql`).
- Export du compte : clé `clubMatches` (ses participations et avis, les rencontres proposées, acceptées ou refusées ; jamais un autre membre).
- Effacement : participations et avis partent avec le compte ; une rencontre garde son récapitulatif sans ses organisateurs
  (`on delete set null`). Politique de confidentialité version 17, page de suppression version 7.
- Limite connue : à 3 participants, la variation du taux d’une nuit à l’autre peut laisser deviner qu’un membre a été actif la veille,
  comme pour l’objectif de la semaine existant ; jamais lequel, ni quand dans la journée.

## Mesure du pilote et ouverture du format comparatif

`private.titan_club_match_measure(depuis)` (rôle de service) : propositions, acceptées, refusées, expirées, annulées, abandonnées,
**rencontres complétées** (avec résultat), seuil atteint ensemble, sans résultat, **avis** et part de « pas clair » (**incompréhensions du
score**), côtés qui ont répondu et **côtés qui souhaitent recommencer** (majorité de « oui »), et `explainable` : au moins 5 rencontres en
coopération complétées, 10 avis, au plus 1 sur 5 « pas clair ». **Le format comparatif reste fermé** (`screens.club_match_versus`) tant
que `explainable` n’est pas vrai ; il n’accepte alors que deux semaines, et la simulation G recommande des clubs d’au moins 8 participants.

## Clients

- Module partagé `js/core/club-match.js` (règle en miroir, modèle de score, formulations), copié tel quel dans l’application Android et
  utilisé par les simulations.
- Web : Communauté › Clubs, bloc « Rencontre entre clubs » (proposer, code, aperçu d’un code reçu, accepter ou refuser, les deux clubs,
  score commun, sa part, « Comment le score est calculé », participer, quitter, arrêter avec confirmation, récapitulatif, avis).
- Android : Communauté › Clubs, même bloc pour lire, participer, quitter, arrêter et donner son avis ; proposer et répondre à un code se
  font sur le Web, comme le lancement d’une saison.

## Preuves

`sql/tests/300_club_match.sql`, `tools/db/test-club-match-concurrency.sh`, `tests/club-match.test.mjs`, `tests/e2e/club-match.e2e.mjs`,
`docs/V185_SIMULATIONS.md`, `docs/v185/*.png` ; Android : `mobile/__tests__/clubMatch.test.tsx`.

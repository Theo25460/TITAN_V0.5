# V1.8.4 — Saisons privées de club

Un club lance une saison privée où chacun contribue à son rythme, et l’équipe voit ce qu’elle a accompli semaine après semaine. La saison
s’adosse aux briques existantes : l’espace Club et ses rôles (`20261030090000`), l’objectif commun de la semaine et son seuil de 3
(`20261120100000`), les séances confirmées et la règle de la longueur de la Cordée (`20261120110000`). Migration
`supabase/migrations/20261127090000_club_season.sql` (paquet `supabase/release-v24`, **non appliqué**), drapeau serveur
`screens.club_season` (absent = fermé, déploiement par compte).

## Règles

| Sujet | Ce que fait le serveur (`public.titan_club_season_v1`, `public.titan_club_season_act_v1`) | Refus explicites |
|---|---|---|
| **Organiser** | Seuls les **administrateurs du club** créent (titre 3 à 60 caractères, départ aujourd’hui ou dans les 28 jours, 2 à 8 semaines, allure douce, régulière ou soutenue), **reportent** un départ (7 ou 14 jours, deux fois au plus, avant le départ) et **arrêtent** (avant le départ : annulée ; après : terminée maintenant, bilan figé). Une saison à la fois par club. Un organisateur ne participe que s’il rejoint, comme tout le monde | `CLUB_ADMIN_REQUIRED`, `SEASON_INVALID`, `SEASON_OPEN`, `SEASON_STARTED`, `SEASON_POSTPONE_LIMIT`, `NOT_ELIGIBLE` |
| **Adhésion explicite** | Appartenir au club n’est pas un consentement : personne n’est ajouté, chacun choisit **Participer**. Révocable : **pause** (rien ne compte, la part restante est libérée), **reprise**, **départ** définitif pour cette saison (les jours acquis restent au groupe). Quitter le club, ou en être retiré, termine la participation (déclencheur `titan_club_members_season`). Compte suspendu : ni rejoindre ni reprendre | `SEASON_LEFT`, `SEASON_NOT_IN`, `ACCOUNT_SUSPENDED`, `FEATURE_DISABLED` |
| **Progression équitable** | **Jour actif** : un jour de Paris avec au moins **12 minutes d’effort comptées** (90 par jour au plus) issues des **séances confirmées** (`private.titan_confirmed_sessions`), enregistrées pendant la participation, hors pauses. Un jour de natation vaut un jour d’escalade. **Part** de chacun = jours par semaine de l’allure (2, 3 ou 4) × semaines prévues de participation (au prorata de l’arrivée, une pause ou un départ libère le reste). **Objectif** = somme des parts. **Plafond individuel** = 1,5 × la part prévue à l’arrivée, figé alors | — |
| **Étapes** | Trois étapes à un tiers, deux tiers et l’objectif entier. Une étape se débloque quand le total compté l’atteint **et** qu’au moins **deux participants** ont contribué (dès que la saison en a compté deux) : **aucun compte seul ne remplit la part collective**. Une étape atteinte est **figée avec sa date** sous verrou : une arrivée qui relève l’objectif ne la reverrouille pas, un départ n’enlève aucun jour acquis | — |
| **Confidentialité** | À partir de **3 participants encore dans la saison** : total, objectif, pauses, contributeurs et étapes. En dessous : le nombre de participants et sa propre part seulement. Jamais un nom, une part ou une séance d’un autre membre ; aucun classement | — |
| **Bilan** | Figé une fois (statut `closed` ou `stopped`) : phase, étapes atteintes et leurs dates, total et objectif (si le seuil était atteint), participants ; chacun y lit sa propre part. Lisible par les membres du club pendant 60 jours. Jamais recalculé | `SEASON_ENDED`, `SEASON_NOT_FOUND` |

**Même entrée, même résultat** : l’état est calculé par une seule fonction stable (`private.titan_club_season_state`) ; un recalcul
identique donne le même résultat, et le bilan figé ne bouge plus (séance tardive, compte effacé). Toutes les actions passent par le
verrou de la ligne du club : un départ et un arrêt simultanés sont sérialisés.

**Rien n’est gagné** : ni XP, ni crédit, ni titre, ni classement.

## Historique, export, effacement, mesure

- Tables `private.titan_club_seasons`, `private.titan_club_season_members`, `private.titan_club_season_pauses`.
- Export du compte : clé `clubSeasons` (ses participations, ses pauses, les saisons qu’on a organisées ; jamais un autre membre).
- Effacement : participations et pauses partent avec le compte ; une saison garde son bilan sans son organisateur (`on delete set null`).
- Mesure du pilote (rôle de service) : `private.titan_club_season_measure(depuis)` → saisons démarrées, saisons à 3 participants ou plus,
  étapes tenues (total et par étape), saisons terminées, **groupes encore actifs la dernière semaine** (deux participants au moins avec un
  jour actif dans les 7 derniers jours), arrêtées avant terme, annulées avant le départ. Des nombres seulement.

## Clients

- Module partagé `js/core/club-season.js` (règle en miroir, formulations), copié tel quel dans l’application Android.
- Web : Communauté › Clubs, bloc « Saison du club » (formulaire de lancement pour l’organisateur, étapes, objectif en cours pendant les
  pauses, sa part, actions proposées par le serveur, confirmation avant de quitter ou d’arrêter, bilan).
- Android : Communauté › Clubs, même bloc ; la saison se lance depuis le Web, comme le club lui-même.

## Preuves

`sql/tests/300_club_season.sql`, `tools/db/test-club-season-concurrency.sh`, `tests/club-season.test.mjs`,
`tests/e2e/club-season.e2e.mjs`, `docs/v184/*.png` ; Android : `mobile/__tests__/clubSeason.test.tsx`.

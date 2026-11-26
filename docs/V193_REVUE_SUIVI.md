# V1.9.3 — Revue de suivi

Une revue hebdomadaire pour le coach : pour chaque sportif, le dossier à traiter, l’action suivante et sa source ; puis la prochaine
proposition préparée depuis un modèle existant, relue dans un aperçu des changements et envoyée seulement par le coach. Coach Web ; le
sportif répond dans son espace habituel (Web, Android « Mes suivis de coaching »). Drapeau serveur `screens.coach_review` (fermé par défaut,
vérifié par le serveur ; à ouvrir après `screens.coach_followup` et `screens.coach_feedback`). Migration `20261130101300`, paquet
`supabase/release-v193` (après v191 et v192).

## Ce qui est réutilisé

- Le lien de partage `public.coach_links` : périmètre, pause de capacité (`private.titan_coach_link_active`), révocation. Il décide de chaque
  lecture et de chaque envoi, au moment même.
- Les états du suivi V1.9.1 (`private.titan_coach_followup_row` : dates prévue, déplacée, faite ; écart ; attente ; historique).
- Les retours V1.9.2 (`private.titan_coach_feedback` : séance liée sans retour, ajustement en attente ou répondu).
- Le check-in hebdomadaire V11-81, seulement s’il est partagé avec **ce** lien.
- Les modèles du coach (`private.titan_coach_templates`) et les règles du portail pour une proposition (fenêtre de dates, 500 par suivi).
- Une proposition envoyée est une ligne ordinaire de `public.coach_assignments` (statut `proposed`) : le sportif l’accepte ou la décline
  comme avant ; sa décision revient dans la revue de la semaine suivante (bloc « Décision sur la revue précédente »).

## L’action suivante, calculée par le serveur

| Ordre | Action | Quand | Source affichée |
|---|---|---|---|
| 1 | Traiter un écart | un dossier V1.9.1 en écart non traité | la proposition (ou la séance liée) |
| 2 | Laisser un retour | séance liée la semaine écoulée ou en cours, dans le périmètre, sans retour | la séance liée et sa proposition |
| 3 | Reprendre la proposition préparée | un brouillon de cette semaine existe | le brouillon et son modèle |
| 4 | Attendre sa réponse | une proposition ou un ajustement attend le sportif | la proposition ou le retour |
| 5 | Préparer la suite | rien de prévu pour la semaine qui vient | la dernière proposition, sinon le check-in partagé, sinon « dossier vide » |
| — | En pause | lien au-delà des places de l’offre | aucune : le nom seulement, rien n’est lu |

Par défaut la revue ne montre que les cas actionnables (1, 2, 3, 5) et les suivis en pause ; « Tous les sportifs » montre chaque dossier.
La semaine est une semaine de Paris (lundi) ; on peut naviguer de 8 semaines en arrière à 1 semaine en avant.

## Règles

| Règle | Comment |
|---|---|
| Préparer ≠ envoyer | `prepare` crée ou met à jour le brouillon (un par suivi et par semaine) ; rien n’atteint le sportif. L’aperçu liste ce que le sportif recevra et ce qui diffère du point de départ (modèle, proposition reprise, page blanche). |
| Reprise après interruption | Préparer à nouveau sans la révision du brouillon le **reprend** tel quel (`resumed`), sans rien écraser ; une révision périmée est refusée (`COACH_CONFLICT`). |
| Aucun doublon | `send` exige la révision relue ; un brouillon envoyé répond « déjà » avec la même proposition ; une proposition identique déjà ouverte sur le lien est rattachée au lieu d’être recréée (`ALREADY_PROPOSED`). Deux envois simultanés : verrou du lien, un seul crée. |
| Accès et capacité | Revérifiés à chaque lecture et à chaque envoi : révoqué → `SHARING_UNAVAILABLE`, en pause → `COACH_CAPACITY_PAUSED` ; le brouillon reste non envoyé. |
| Périmètre | Les dossiers passent par les lignes V1.9.1 (hors périmètre : « liée », sans date ni mesure) ; jamais la note privée ; check-in seulement partagé ; deux coachs d’un même sportif ne voient que leur propre lien. |
| Journal | Aucune action n’écrit `public.training_logs`, une note ou un check-in. |

## Mesure

`private.titan_coach_review_measure()` (équipe seulement, sans identifiant) : brouillons par état, envoyés, envoyés depuis un modèle,
répondus, cycles éligibles et **cycles complets sur deux semaines** (proposition envoyée en semaine W, répondue, puis nouvelle proposition
envoyée à la revue de W + 1). Taux = `cyclesComplete / cyclesEligible`, sur les comptes du pilote.

Temps de revue : `tests/e2e/coach-review.e2e.mjs` mesure le même scénario (cinq sportifs, deux liens en pause, une proposition depuis un
modèle) par les écrans existants puis par la revue, avec 120 ms par réponse serveur, et écrit `docs/v193/measure.json`. C’est un indicateur
automatisé, pas le temps d’un coach : le chronométrage avec les coachs du pilote reste à faire (mêmes cinq dossiers, drapeau fermé puis
ouvert, médiane par condition).

## Preuves

`sql/tests/300_coach_review.sql`, `tools/db/test-coach-review-concurrency.sh`, `tests/coach-review.test.mjs`,
`tests/e2e/coach-review.e2e.mjs` (captures `docs/v193/`). Les tests Web rejouent les réponses réelles du serveur
(`tests/fixtures/coach-review.json`, produites par `node tools/db/coach-review/build-fixtures.mjs psql … -d titan_test_…`).

## Choix à valider

Un brouillon par suivi et par semaine ; la revue regarde la semaine écoulée et la semaine qui vient ; « préparer la suite » dès que rien
n’est prévu pour la semaine qui vient ; une proposition préparée ne peut pas être datée dans le passé ; le nom d’un suivi en pause reste
affiché (le coach le connaît déjà) ; l’export du coach contient ses brouillons.

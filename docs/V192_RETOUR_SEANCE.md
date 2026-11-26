# V1.9.2 — Retour sur la séance

Un retour du coach reste relié à la proposition et à la séance qu’il commente, et une consigne pour la suite devient une proposition que
le sportif accepte ou décline. Coach Web, sportif Web et Android. Drapeau serveur `screens.coach_feedback` (fermé par défaut, vérifié par le
serveur ; à ouvrir après `screens.coach_followup`). Migration `20261130101200`, paquet `supabase/release-v2-03` (ancien paquet du lot `release-v192`, remplacé par la séquence canonique V2.0, voir `docs/v2/MIGRATIONS_V2.md`) (après le paquet v191).

## Ce qui est réutilisé

- Le lien de partage `public.coach_links` : périmètre (sport, date de début), `share_details`, `share_notes`, pause de capacité,
  révocation. Il décide de chaque lecture, au moment de la lecture.
- La proposition et son lien au journal (`public.coach_assignments.session_id`), le suivi V1.9.1 (`titan_coach_followup_v1`, historique,
  version acceptée gardée).
- Le fil privé du lien (`private.titan_coach_messages`) : l’**observation** du coach est un message de ce fil, avec sa limite de débit
  (60 par heure) et sa taille (500 messages). La lecture du fil indique désormais quel message porte un retour (`feedback_id`).
- Le check-in hebdomadaire : visible dans le contexte d’un retour seulement tant que le sportif le partage.

## Règles

| Règle | Comment |
|---|---|
| Bonne séance | Le retour se pose sur la proposition ; la séance est celle que la proposition désigne. Le composeur renvoie une clé (séance, révision de la séance, révision du lien). Une reliaison, une correction ou un changement de partage entre la lecture et l’envoi refuse le retour (`SESSION_CHANGED`) ; le texte est gardé et les mesures relues. Une proposition reliée ensuite à une autre séance garde son retour sur la séance d’origine. |
| Observation ≠ proposition | Deux blocs distincts partout. La proposition a un statut : à confirmer, acceptée, déclinée, retirée par le coach, plus applicable. |
| Mesures partageables | Jamais copiées. À chaque lecture, le serveur projette la séance par le contrat actuel du lien (la projection du portail « sessions ») : date, sport, mesure, durée ; exercices, séries, charges, répétitions, RIR et détails d’escalade seulement si `share_details` ; la note seulement si `share_notes` ; le check-in de la semaine seulement s’il est partagé. Seule une empreinte md5 par catégorie est gardée. |
| Corrections | Valeurs actuelles affichées ; « modifiée après ce retour » si une catégorie que le coach peut lire a changé (une correction de la note privée ne signale rien au coach). |
| Archivage, retrait, hors périmètre | Aucune mesure pour le coach ; l’observation, la proposition et son statut restent. Le sportif voit de quelle séance il s’agit. |
| Retrait du partage | Les aperçus (cartes de proposition, liste, composeur, vue du sportif) sont reconstruits à chaque lecture : un détail retiré disparaît partout. |
| Ajustement accepté | Sur une proposition ouverte du lien : elle est mise à jour et acceptée, sa première version acceptée (V1.9.1) reste, l’historique note « ajustée après un retour ». Nouvelle séance : créée sur le lien, déjà acceptée, origine notée. Déclinée : rien ne change. Proposition visée changée ou annulée entre-temps : « plus applicable », rien n’est modifié (`ADJUSTMENT_STALE`). Un seul ajustement en attente par proposition visée. |
| Journal | Aucune action n’écrit `public.training_logs`, les notes ou le check-in. |
| Accès | Chaque lecture revérifie le lien. Pause : le coach ne lit rien, le sportif lit sans agir (sauf « Compris »). Révocation : le coach ne lit rien, y compris par le lien direct `coaching#retour=<id>` ; le sportif garde une lecture seule 365 jours. |
| Limites | Observation 1 000 caractères, 5 retours par séance, note de l’ajustement 300 caractères. |

## Mesure

`private.titan_coach_feedback_measure()` (équipe seulement, sans identifiant) : séances liées, séances liées avec un retour, séances liées
dont un retour est lu (« Compris » ou réponse) et rattaché à une action (ajustement accepté ou décliné), ajustements par statut, ajustements
reportés dans une proposition. La part demandée par le cahier des charges = `understoodWithAction / linkedSessions`, sur les comptes du
pilote ; elle n’a de sens qu’avec de vrais coachs.

## Preuves

`sql/tests/300_coach_feedback.sql` ; `tests/coach-feedback.test.mjs` et `tests/e2e/coach-feedback.e2e.mjs` (captures `docs/v192/`) ;
`mobile/__tests__/coachFeedback.test.tsx`. Les tests Web et Android rejouent les réponses réelles du serveur
(`tests/fixtures/coach-feedback.json`, produites par `node tools/db/coach-feedback/build-fixtures.mjs psql … -d titan_test_…`).

## Choix à valider

Cinq retours au plus par séance ; un ajustement accepté sur une proposition encore « proposée » vaut acceptation de la séance ajustée ;
le sport « inchangé » n’est jamais envoyé pour un ajustement, une nouvelle séance prend le sport de la séance commentée ; lecture seule
du sportif 365 jours après révocation (comme V1.9.1) ; le coach ne peut pas modifier une observation envoyée (elle est un message du fil).

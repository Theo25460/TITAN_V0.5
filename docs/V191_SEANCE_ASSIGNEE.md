# V1.9.1 — Une séance assignée

Rendre les propositions du coach réellement suivables : savoir lesquelles demandent une décision, de qui et pourquoi, surtout après un
changement de date ou de contenu. Sportif Android et coach Web. Les données de séance viennent toujours du journal du sportif.
Drapeau serveur `screens.coach_followup` (fermé par défaut, vérifié par le serveur). Migration `20261201090000`, paquet `supabase/release-v191`.

## Ce qui est réutilisé

Le lien de partage (`public.coach_links`, sa pause de capacité et sa révocation), les statuts de `public.coach_assignments`
(`proposed`, `accepted`, `declined`, `completed`, `cancelled`), le lien vers le journal (`session_id`, une proposition par séance,
index unique), le portail `titan_coach_portal` (inchangé), la liste des propositions et les modèles de séance du coach.

## Les états, calculés par le serveur

| État | Quand | Le coach | Le sportif |
|---|---|---|---|
| En attente | proposée, pas encore de réponse | attendre une réponse | accepter ou décliner |
| Proposée à nouveau | le coach a proposé un changement sur une séance acceptée ou déclinée ; la version en vigueur reste | attendre une réponse ; peut retirer le changement | voir ce qui change, accepter ou garder sa version |
| Reportée | le sportif a déplacé la séance, rien n’est encore lié | traiter un écart (prendre acte ou suggérer un changement) | redéplacer, revenir au jour prévu |
| À rapprocher | une séance du journal correspond (même sport, éligible, à 3 jours près de la date en vigueur, liée à aucune autre proposition) | attendre : le coach ne voit pas la séance candidate | confirmer le lien, ou non |
| Faite sans correspondance | le sportif l’indique comme faite, sans séance liée (ou la séance liée a été supprimée du journal) | traiter un écart | relier une séance quand elle arrive, retirer « faite » |
| Date passée | date en vigueur passée, rien de lié ni déclaré | traiter un écart | déplacer, indiquer « faite », décliner |
| Liée | une séance du journal est liée (confirmée par le sportif) | lit la date faite et l’écart avec la date prévue, dans le contrat du lien ; prend acte s’il y a un écart | retirer le lien (le journal ne change pas) |
| Déclinée | le sportif a décliné | suggérer : proposer à nouveau | — |

La file « Décisions à prendre » du coach ne garde que ce qui demande une action (attendre, traiter un écart, proposer à nouveau),
filtrable par action et par sportif. Un écart traité (« Prendre acte ») sort de la file et y revient si la situation change.

## Règles

- La version acceptée n’est jamais écrasée (`accepted_version`) ; un changement attend à côté (`pending_change`) et ne s’applique qu’avec
  l’accord du sportif ; l’ancienne version reste dans l’historique. Le dossier montre l’original accepté, la correction et l’activité liée.
- Un rapprochement n’est qu’une suggestion : il devient un lien seulement quand le sportif le confirme, par le même `session_id` qu’avant.
- Deux tentatives concurrentes gardent un seul lien : verrou du lien de partage, puis de la proposition, puis de la séance (verrou
  consultatif), et l’index unique en dernier garde-fou. Une tentative refusée reçoit une réponse (`ALREADY_LINKED`,
  `SESSION_ALREADY_LINKED`) et s’inscrit à l’historique ; elle ne remplace jamais le lien en place.
- Pause (capacité de l’offre du coach) : le coach ne lit plus rien ; le sportif lit ses propositions sans agir.
  Révocation : le coach ne lit plus rien ; le sportif retrouve ses propositions et sa propre séance, en lecture seule, pendant un an.
- Hors du contrat du lien (sport ou période), le coach sait seulement qu’une séance est liée, sans date ni mesure.
- Aucune action n’écrit `public.training_logs`. Ni XP, ni crédit, ni notification.

## Mesure

`private.titan_coach_followup_measure()` (équipe seulement, sans identifiant) : propositions, liens, déplacements, « faites » sans séance,
changements en attente, acceptés et déclinés, tentatives de lien refusées, écarts traités.
Mesure du cahier des charges (temps médian pour comprendre trois dossiers, avant et après, sur les mêmes scénarios) : à chronométrer avec
les coachs du pilote. Protocole proposé : trois dossiers identiques (séance déplacée puis liée, changement en attente, faite sans
correspondance) ; « avant » sur l’écran actuel (drapeau fermé), « après » avec la file et le dossier ; la question posée est la même
(« qu’est-ce qui s’est passé et que dois-tu faire ? ») ; temps jusqu’à la bonne réponse, médiane par condition. Aucun chiffre n’est
encore mesuré.

## Preuves

`sql/tests/300_coach_followup.sql`, `tools/db/test-coach-followup-concurrency.sh`, `tests/coach-followup.test.mjs`,
`tests/e2e/coach-followup.e2e.mjs` (captures `docs/v191/`), `mobile/__tests__/coachProposals.test.tsx`. Les tests Web et Android
rejouent les réponses réelles du serveur (`tests/fixtures/coach-followup.json`, produites par `tools/db/coach-followup/fixtures.sql`).

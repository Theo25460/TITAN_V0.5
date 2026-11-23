# V1.6.3 — Contrôle et réconciliation : matrice officielle par état

Source de vérité exécutable : `js/core/history-ledger.js` (`MATRIX`), copié tel quel dans Android
(`mobile/src/core/web/history-ledger.js`, manifeste de hachages vérifié par les tests). Chaque case reprend le contrat que la vue
applique déjà : le module ne crée aucune règle. `tests/history-reconcile.test.mjs` vérifie la matrice contre ces contrats.

| État | Journal | Totaux de période | Records | CSV | JSON « toutes mes données » |
|---|---|---|---|---|---|
| Confirmée | journal | oui | oui | journal, « Confirmée » | oui |
| Restaurée | = confirmée : même id, même référence, révision + 1, aucune récompense | oui | oui | journal | oui, la restauration est dans `trainingRevisions` |
| Sur cet appareil / en attente d’envoi | journal, badge | oui, sur l’appareil qui la détient | oui, idem | journal, « Sur cet appareil » ou « En attente d’envoi » | non : l’export lit le serveur (« Exporter une copie » couvre ce cas) |
| Mode découverte (invité) | journal | oui | oui | journal, « Sur cet appareil » | export local de l’appareil |
| Refusée : à corriger | journal, bloc Synchronisation | non | non | non (copie propre, V1.6.1) | non |
| En vérification (tenue par le serveur) | journal | non | non | journal, « En vérification » | oui |
| Archivée | archives | non | non | archives, « Archivée » | oui, avec `archived_at` |

Règles qui portent ces cases :

- Totaux et records : `TitanTraining.counted`, puis `TitanProgress.summarize` et `TitanInsights.records`. Ce dernier s’appuie aussi
  sur `TitanTraining.plausible` : une séance invraisemblable reste comptée dans les totaux, mais ne détient aucun record.
- Les km du total portent sur les séances mesurées en km (contrat existant) : une nage en m n’y entre pas.
- Depuis V1.6.3, Android lit le même ensemble que le site pour le récapitulatif hebdomadaire, la semaine du journal, la page des
  records et les badges de record. Avant V1.6.3, il ne lisait que les séances confirmées pour ces vues.
- Identité : la référence canonique est le `client_event_id` (8 premiers caractères affichés). Elle est la même sur le site, sur
  Android et dans le CSV. Une ligne serveur et sa copie dans la file comptent pour une seule entrée, et la ligne serveur l’emporte
  (`split`).
- Correction : seuls les champs modifiés partent. La date est comparée à la minute et l’unité ne change pas (le serveur la refuse,
  sauf pour les exercices). La fiche affiche « Modifications » (`titan_session_changes_v1`, paquet v22).
- Restauration : aucune récompense n’est accordée. Une séance archivée par une réunion V1.6.2 ne se restaure pas depuis le journal
  (`SESSION_MATCH_JOINED`) ; « Séparer en deux séances » la restaure.
- Sources qui ne répercutent pas leurs modifications : Garmin (`docs/GARMIN.md`), Santé Connect et l’historique importé. Un import
  déjà reçu répond `duplicate` et n’est pas relu. La fiche le signale, et la correction locale reste celle du compte.

Jeu d’essai : `tests/fixtures/history-reconcile.json`. Il compte 10 séances et 8 étapes, avec les valeurs attendues avant et après
chaque mutation pour un appareil Web qui détient une file et pour un appareil Android. Le même fichier est rejoué par :

- `tools/history-reconcile-sim.cjs` ;
- `tests/history-reconcile.test.mjs` (Web) ;
- `mobile/__tests__/historyReconcile.test.tsx` (Android).

Les effets serveur sont prouvés par `sql/tests/300_history_reconcile.sql`, et le parcours réel par
`tests/e2e/history-reconcile.e2e.mjs`.

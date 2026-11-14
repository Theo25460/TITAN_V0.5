# Lot 2 — Paiements et abonnements (critère P0 de publication)

Offres : Gratuit, TITAN+ (`titan01`), Coach (`titan02`), Coach Ultra (`titan03`). Prix de référence France : 4,99 €, 19,99 €, 39,99 € par mois.
Aucun montant n'est écrit dans le code Android : le prix affiché est celui que Google Play renvoie (`mobile/__tests__/playBilling.test.ts`, « no price or amount is written in the app »).

**Niveau de preuve.** Tout ce qui suit est vérifié par lecture du code, tests automatiques avec un Google et un Supabase simulés, rejeu SQL local et
lecture seule de la production. **Aucun achat n'a été effectué**, ni réel ni de licence : la chaîne réelle reste à prouver sur un banc (§ « Recette réelle »).

## Cause de l'incident V1.2.1 (paiement accepté, accès non ouvert)

| Hypothèse | Éléments | Verdict |
|---|---|---|
| Serveur non prêt, client sans contrôle préalable | La V1.2.1 ouvrait Google Play sans interroger le serveur (`761340d:mobile/src/lib/playBilling.ts`) ; Netlify n'avait aucune variable `PLAY_*` (`docs/V12_FINALISATION_2026-11-04.md`) ; le serveur répondait 503 après l'encaissement. En production aujourd'hui : aucun accès `google_play` dans `private.titan_entitlements` (2 accès `manual` seulement) ; `titan_apply_play_entitlement_v1` et `titan_play_checkout_ready_v1` n'existent pas. | Cause la plus probable. Fermée côté client par le contrôle avant paiement (V1.3.1) ; côté serveur, **reste ouverte tant que les migrations ne sont pas appliquées et la configuration posée**. |
| Achat fait avec un compte testeur de licence | `functions/play-billing.mjs` refuse volontairement tout achat de test sur la base de production (`allowsPlayTestPurchases`, `test_purchase_refused`). | Possible, non départageable d'ici. Comportement voulu ; le message est désormais explicite. |

## Matrice

| Élément | Attendu | Réalité constatée | Écart | Gravité | Correction | Preuve | Statut |
|---|---|---|---|---|---|---|---|
| 1. Produits et prix TTC affichés | Prix réels de Google Play, période visible, essai jamais présenté comme prix | La première offre portant un jeton était affichée telle quelle : essai gratuit ou offre annuelle possibles, sans période | Prix potentiellement trompeur | P1 | Prix récurrent de Google avec sa période, essai annoncé, offre mensuelle préférée (celle que le serveur contrôle) | `mobile/src/lib/playBilling.ts` `offerPriceLabel`, `loadOffers` ; tests « the card shows the recurring price… », « when Play lists several offers… » | Corrigé, non testé en conditions réelles |
| 2. Achat via Google Play | Jamais ouvert si le serveur ne peut pas enregistrer l'achat | Le contrôle préalable ne prouvait que la lecture du catalogue | Encaissement possible suivi d'un échec systématique | P0 | Sonde « achat inexistant » (droit de lecture des achats) et exigence de la configuration des notifications | `functions/play-billing.mjs` étapes `google_purchases`, `configuration` ; `tests/play-billing.test.mjs` (40/40) | Corrigé, non testé en conditions réelles |
| 3. Vérification serveur | L'accès vient de la réponse de Google, jamais du client | Conforme : `subscriptionsv2`, états inconnus refusés | — | — | — | `interpretSubscription` ; `tests/play-billing.test.mjs` | Vérifié conforme (simulé) |
| 4. Association au bon compte | Un jeton ne s'attache qu'au compte qui a payé | Conforme : `obfuscatedAccountId` = identifiant TITAN, comparé côté serveur ; jeton d'un autre compte refusé | — | — | — | `play-billing.mjs:191` ; tests « purchase_bound_to_other_account » | Vérifié conforme (simulé) |
| 5. Attribution des droits | Écriture transactionnelle, droit visible dans `profiles.is_elite` | Conforme dans le dépôt (`20261110152900`, `20261110130137`). **En production les fonctions n'existent pas** | Aucun achat ne peut ouvrir d'accès en production | P0 | Migrations à appliquer (validation humaine) | Lecture seule production du 14/11 ; rejeu local `tools/db/test-migrations.sh` | Bloqué par un accès externe (décision de mise en production) |
| 6. Déblocage immédiat ou reprise fiable | Un achat encaissé finit toujours en accès | Reprise uniquement par le bouton « Restaurer mes achats » | Accès perdu si l'application est fermée pendant le contrôle bancaire, paiement en attente, réseau coupé | P0 | `BillingRecovery` : reprise silencieuse à la connexion, au premier plan, au retour du réseau | `mobile/src/data/BillingRecovery.tsx`, `recoverPurchases` ; 11 tests | Corrigé, non testé en conditions réelles |
| 7. Acquittement | Après écriture de l'accès seulement ; relance si échec | Conforme : `provider_needs_ack`, relance horaire | — | — | — | `play-billing.mjs:201-212`, `play-reconcile.mjs` | Vérifié conforme (simulé) |
| 8. Notifications serveur (RTDN) | Achat confirmé application fermée, renouvellement, remboursement | Conforme dans le code ; la configuration Pub/Sub et `PLAY_RTDN_*` n'est pas lisible d'ici | Inconnu en production | P0 | Le contrôle avant paiement exige désormais cette configuration | `functions/play-notifications.mjs` ; `tests/play-notifications.test.mjs` | Bloqué par un accès externe |
| 9. Restauration | Rattache chaque achat connu, explique un refus | Un achat de test refusé renvoyait vers une restauration impossible | Message trompeur | P1 | Code `TEST_PURCHASE` et message propre ; relecture du profil après erreur | `playBilling.ts` `messageFor` ; tests | Corrigé et vérifié (simulé) |
| 10. Renouvellement | Accès prolongé sans action | Conforme : notification puis rapprochement horaire | — | — | — | `tests/play-reconcile.test.mjs`, `play-notifications.test.mjs` | Vérifié conforme (simulé) |
| 11. Annulation | Accès conservé jusqu'à l'échéance | Conforme (`SUBSCRIPTION_STATE_CANCELED` hors remplacement) | — | — | — | `interpretSubscription:83-84` | Vérifié conforme (simulé) |
| 12. Expiration | Accès retiré à l'échéance | Conforme : relu chez Google par le rapprochement | — | — | — | `tests/play-reconcile.test.mjs` | Vérifié conforme (simulé) |
| 13. Remboursement | Accès retiré | Conforme : relecture Google sur notification | — | — | — | `tests/play-notifications.test.mjs` | Vérifié conforme (simulé) |
| 14. Révocation | Accès retiré, jeton introuvable traité | Conforme (`gone`) | — | — | — | `play-reconcile.mjs:44-45` | Vérifié conforme (simulé) |
| 15. Changement d'appareil et de compte | Achat retrouvé sur un nouvel appareil ; jamais rattaché à un autre compte TITAN | Conforme ; la reprise automatique ignore les achats d'un autre compte | — | — | — | tests « purchases of another TITAN account… », « restore stops… after a TITAN account switch » | Vérifié conforme (simulé) |
| 16. Connexion instable | Pas d'écran bloqué, pas de fausse affirmation | Requêtes sans délai : attente infinie possible | Restauration bloquée | P1 | Abandon après 20 s | `BILLING_TIMEOUT_MS` ; test « a server that never answers… » | Corrigé et vérifié (simulé) |
| 17. Transactions en attente | Aucun accès avant confirmation ; reprise ensuite | Conforme pour l'attente ; la reprise demandait une action manuelle | Voir 6 | P0 | Voir 6 | tests « pending » | Corrigé, non testé en conditions réelles |
| 18. Rejeu et idempotence | Un événement rejoué ne change rien | Conforme : ordre par date de lecture, lectures tardives ignorées | Une course peut renvoyer 503 alors que l'accès est écrit | P2 | L'écran relit le profil après toute erreur | `tests/play-concurrency.test.mjs` ; `TitanPlusScreen.tsx` | Corrigé et vérifié (simulé) |
| 19. Droits Coach et places | Coach : 5 sportifs, Coach Ultra : 15, TITAN+ inclus pour eux | Conforme au serveur. Mais un TITAN+ payant sans offre Coach garde 20 sportifs suivis (règle héritée de la V1) | Incohérence commerciale entre offres | P1 | Aucune : règle produit à trancher par le propriétaire | `20261102090000_coach_seats.sql:191-206` ; production : `titan01/02/03` → `titan_plus/coach/coach_pro` | En attente d'approbation |
| 20. Cohérence interface, serveur, documentation | Mêmes avantages partout | Traité dans le lot 6 (textes) | — | P1 | Voir `lot6-textes-juridique.md` | — | Voir lot 6 |
| Séparation test / réel | Un achat de licence n'ouvre jamais d'accès sur le service public et est tracé | Conforme : refus sur la base de production, `provider_is_test` dans le registre privé | — | — | — | `allowsPlayTestPurchases` ; `20261110152900` | Vérifié conforme (simulé) |
| Erreurs 503 des fonctions de paiement | 503 seulement quand le service est réellement indisponible | `play-reconcile` répond 200 « disabled » quand la facturation est éteinte ; `play-billing` répond 503 par configuration absente | Attendu tant que `PLAY_BILLING_ENABLED` n'est pas posé | — | — | `play-reconcile.mjs:21` | Vérifié conforme |
| Clients V1.2.1 (1301) installés | Ne doivent pas pouvoir payer dans le vide | Ils n'ont pas le contrôle avant paiement | Rejoue l'incident si les produits sont actifs avant le serveur | P0 | Opérationnel : produits inactifs dans la Play Console jusqu'à serveur et migrations en place ; retirer 1301 | Lecture du code `761340d` | En attente d'approbation |
| `PLAY_PRODUCT_IDS` | Une erreur de saisie ne doit pas retirer l'accès d'abonnés | Le rapprochement révoque un produit non listé (règle testée existante) | Risque d'exploitation | P2 | Aucune (choix existant) ; relecture obligatoire de la variable | `tests/play-reconcile.test.mjs` « a product the team does not allow… » | Vérifié conforme (choix assumé) |

## Recette réelle à faire (validation humaine)

1. Appliquer les migrations (voir `lot1-securite.md`), poser les variables Netlify `PLAY_*` et `PLAY_RTDN_*`, donner au compte de service le droit de lire les achats.
2. Vérifier que `GET /functions/play-billing?product_id=titan01` (puis `02`, `03`), authentifié, répond `204`.
3. Sur un banc isolé (`PLAY_ALLOW_TEST_PURCHASES=true`, base distincte) avec un compte de licence France, **ou** avec un compte non testeur et un achat réel remboursé ensuite :
   achat de chaque offre et prix du dialogue Google ; fermeture de l'application pendant le paiement puis réouverture (accès attendu sans action) ;
   restauration après réinstallation ; passage TITAN+ → Coach → Coach Ultra et retour ; annulation (accès jusqu'à l'échéance) ; remboursement (accès retiré) ;
   renouvellement accéléré de licence ; second compte TITAN sur le même compte Google (refus attendu).
4. Critère d'échec bloquant : une transaction acceptée sans accès ouvert dans les deux minutes, application ouverte.

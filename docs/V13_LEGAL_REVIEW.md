# Préparation juridique V1.3

**Revue juridique humaine en attente.** Les quatre pages sont préparées dans le dépôt. Leur routage et leurs liens font l’objet de tests locaux. La vérification de leur disponibilité publique suit le déploiement.

- [Conditions d’utilisation](https://titan-app.fr/legal_cgu)
- [Politique de confidentialité](https://titan-app.fr/legal_privacy)
- [Mentions légales](https://titan-app.fr/legal_mentions)
- [Centre de confiance](https://titan-app.fr/legal_hub)

| Sujet | Source | Résultat |
|---|---|---|
| Prix et période | `mobile/src/lib/playBilling.ts` | L’offre et le prix affichés viennent de Google Play. La période apparaît dans les conditions Play avant achat. |
| Configuration France au 10 novembre 2026 | Play Console, lignes France des forfaits `titan01`, `titan02` et `titan03` | Trois forfaits mensuels actifs. TITAN+ 4,99 €, Coach 19,99 €, Coach Ultra 39,99 € TTC. La colonne Taxes affiche 20 % et 11 régimes territoriaux. L’affichage dans le dialogue d’achat reste à vérifier sur un compte de licence France. |
| Affichage Web | `tools/build-public-site.mjs` | Les pages publiques renvoient au prix applicable affiché par Google Play. |
| Disponibilité | `BILLING_BUILD`, `PLAY_BILLING_ENABLED`, `js/config.js` | Achat fermé par défaut. `webCheckout` désactivé. |
| Attribution | `functions/play-billing.mjs` | Le serveur relit Google et vérifie produit, état et propriétaire du jeton. Un achat en attente ne confère pas d’accès. |
| Provenance | `testPurchase` Google | Le verdict `access_kind` distingue `test` de `verified_purchase`. Un achat vérifié peut comporter un essai gratuit. |
| Droits existants | Ledger privé `google_play`, `paddle`, `manual`, `coach` | Le statut actif indique un droit d’accès. L’origine inconnue est présentée de façon neutre. |
| Atelier Web | `js/app/atelier.js` | Le cache local ne suffit plus pour annoncer un accès actif. Le repli serveur contrôle expiration et remboursement. |
| Android | `TitanPlusScreen.tsx` | Un verdict inactif entraîne un message d’accès non confirmé. Un test est indiqué comme tel. La gestion ouvre les abonnements Google Play. |
| Prestataire historique | `functions/webhook.mjs` | Les événements des anciens droits restent pris en charge. Les conditions renvoient au prestataire indiqué sur le reçu. |
| Cosmétiques | Contrat Atelier | Les pièces acquises par crédits restent en collection. L’accès temporaire aux autres pièces peut prendre fin. |

Le verdict de provenance est issu d’une lecture Google fraîche. Le ledger n’a pas de champ de provenance test adapté et le verdict ne constitue pas un relevé comptable. La mesure des montants encaissés demanderait un contrat de commandes et transactions dédié. Le registre conserve ses colonnes existantes et la réconciliation continue à gérer les droits d’accès.

Les conditions expliquent le renouvellement, l’arrêt du renouvellement dans le compte Google, la restauration et le maintien de l’accès pendant la période réglée sauf révocation. Elles renvoient aux procédures de remboursement applicables selon l’achat et le pays. [Abonnements Google Play](https://support.google.com/googleplay/answer/7018481?hl=fr) · [Remboursements](https://support.google.com/googleplay/answer/2479637?hl=fr) · [Contenus et services numériques dans l’EEE et au Royaume-Uni](https://support.google.com/googleplay/answer/15576634?hl=fr)

Avant une ouverture commerciale, vérifier le prix TTC et la période dans le dialogue Play de chacun des trois produits avec un compte testeur de licence France. Vérifier l’achat, l’état en attente, la restauration, l’arrêt du renouvellement et la révocation après remboursement. La revue humaine doit établir l’identité et les coordonnées légales de l’éditeur, l’immatriculation et la TVA applicables, le médiateur compétent et les règles de rétractation, remboursement et mineurs. Vérifier ensuite les quatre URL sur le site déployé.

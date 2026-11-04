# ADR-004 — Google Play Billing pour TITAN+ dans l'application Android (PREM12, PREM13, PREM14)

Statut (mis à jour le 02/11/2026) : **décision de Théo du 20/10/2026 : « Google Play Billing »**. **L'architecture a changé** : l'application Android n'est plus une coque web (TWA, ADR-001 abandonné pour Android) mais l'**application native** (`mobile/`, React Native / Expo SDK 57). Les mentions de TWA, d'API Digital Goods et de « coque » plus bas sont **historiques et caduques** ; la décision 5 est remplacée par la section « Client natif » ci-dessous.

État réel : **codé et testé en simulation, désactivé, jamais essayé avec un vrai achat**.
- Serveur : `functions/play-billing.mjs` (vérification), `functions/play-notifications.mjs` (RTDN), `functions/play-reconcile.mjs` (rattrapage horaire), `functions/play-auth.mjs` (jeton OIDC Pub/Sub), table de sources et RPC en base (migrations 20261020020000, 20261102090000 places Coach, 20261102110000 liste de rattrapage). Chemins et champs de l'API Android Publisher relus le 02/11/2026 (`purchases.subscriptionsv2.get`, `purchases.subscriptions.acknowledge`).
- Client : `mobile/src/lib/playBilling.ts` (module `expo-iap`, bibliothèque Play Billing 9.1.0 ajoutée par `mobile/plugins/with-play-billing.js`), écran `TitanPlusScreen`. Allumé seulement si le build porte `EXPO_PUBLIC_TITAN_BILLING=1` **et** si le serveur a `PLAY_BILLING_ENABLED=true`.
- Aucun prix dans le code : les prix affichés sont ceux de Google Play.

## Contexte
TITAN+ était vendu sur le web par Paddle (désactivé par la décision du 21/10/2026 : aucun achat sur le web). L'application Android était une coque web (TWA, ADR-001) ; elle est maintenant native. Les règles Google sur les paiements changent en 2026 selon la région (voir `docs/PLAY_CONSOLE.md` §3). Théo choisit de proposer l'abonnement **dans l'application via Google Play Billing**, ce qui lève le risque de renvoyer vers le site.

Contraintes du code actuel :
- `functions/webhook.mjs` applique l'abonnement par `titan_apply_paddle_entitlement_v87`, qui écrit **un seul** enregistrement sur `profiles` (`is_elite`, `elite_*`) avec la règle « le dernier événement gagne » (`elite_last_event_at`).
- Un joueur qui aurait deux sources (Paddle puis Google, ou un changement d'appareil) verrait l'une **écraser ou révoquer** l'autre. Ce défaut n'existe pas tant qu'il n'y a qu'une source.

## Décision (conception)
1. **Le serveur reste l'autorité (PREM13).** L'état Premium n'est jamais décidé par le client. Après un achat, le client envoie le **jeton d'achat** à une fonction serveur ; celle-ci interroge l'API Google Play Developer (abonnements) avec un compte de service, et n'accorde l'accès que sur réponse valide, pour le bon produit et le bon paquet `fr.titanapp.app`.
2. **Un enregistrement d'accès par source.** Nouvelle table privée `private.titan_entitlements(user_id, source ['paddle'|'google_play'], external_id, status, product_id, renews_at, ends_at, refunded_at, last_event_at)` avec clé `(source, external_id)`, RLS activée et aucun droit d'API. `profiles.is_elite` devient **dérivé** : vrai si au moins une source est active. Les colonnes `elite_*` de `profiles` restent renseignées pour les consommateurs actuels (affichage, `titan_atelier`), avec la source principale.
3. **Migration des abonnés Paddle existants** : copie des lignes actuelles (`elite_subscription_id`, statut, dates) dans la nouvelle table, sans changer le comportement visible ; l'ancienne RPC continue d'être appelée par le webhook Paddle, qui écrit désormais dans la table de sources puis recalcule `is_elite`. Plan de retour arrière écrit avant l'application.
4. **Renouvellements, annulations, remboursements (PREM14)** : notifications serveur de Google (Real-time developer notifications, Pub/Sub en push) vers une seconde fonction Netlify, vérifiées (jeton d'authentification du push), idempotentes sur l'identifiant de message, qui relisent l'état de l'abonnement auprès de Google avant d'écrire (on ne fait pas confiance au contenu de la notification). Restauration à un changement d'appareil : le client renvoie les achats actifs connus de Google Play au démarrage de l'écran Atelier ; le serveur rattache le jeton au compte **seulement s'il n'est lié à aucun autre compte** (un jeton ne sert qu'un compte, clé unique).
5. **Client natif (remplace la décision TWA).** L'application demande à Google Play les offres et leurs prix (`fetchProducts`), ouvre la feuille de paiement avec `obfuscatedAccountId` = identifiant du compte TITAN connecté, envoie le jeton à `play-billing`, et ne termine l'achat dans Play (`finishTransaction`) qu'après la réponse du serveur. « Restaurer mes achats » renvoie les achats actifs connus de Google. Le changement d'offre et la résiliation passent par le centre d'abonnements de Google Play (abonnements séparés, une facture chacun). Il n'y a aucun achat sur le web. Un abonné d'une source voit « TITAN+ actif » partout ; la gestion de l'abonnement renvoie vers la bonne source (Google Play ou Paddle) pour éviter une double souscription.
6. **Pas de double facturation** : si le compte a déjà une source active, l'autre bouton d'achat est remplacé par l'état « TITAN+ actif ».
7. **Aucune vente de puissance** : inchangé (SHOP, `tests/no-currency-purchase.test.mjs`).

## Ce qu'il faut de Théo (humain)
- Dans la Play Console : créer le produit d'abonnement TITAN+ (identifiant, prix, période), activer la facturation, puis créer un **compte de service** autorisé à lire les abonnements, et fournir le fichier de clé **uniquement** comme secret Netlify (jamais dans le dépôt ni dans une conversation).
- Configurer les notifications serveur (sujet Pub/Sub) vers la fonction de notification.
- Valider le prix, la période d'essai éventuelle, les mentions légales et la politique de remboursement (LEG).

## Phases
1. Lecture des règles Google à jour (faite le 02/11/2026 pour l'API serveur ; règles de région et de commission : à confirmer par Théo).
2. Migration et RPC : table de sources, dérivation de `is_elite`, migration des abonnés Paddle ; tests SQL (deux sources, une révoquée n'enlève pas l'autre ; jeton lié à un seul compte ; rejeu idempotent). **Aucune application en production** avant le plan de production.
3. Fonction serveur de vérification et fonction de notification, avec client Google simulé en test (réponses actives, expirées, remboursées, mauvais produit, mauvais paquet, jeton déjà lié).
4. Client : chemin d'achat natif derrière `EXPO_PUBLIC_TITAN_BILLING` (désactivé par défaut), tests avec Google simulé ; activation seulement après un essai réel avec un testeur de licence.
5. Essai sur appareil (testeurs de licence Google), puis test fermé.

## Conséquences
- Le webhook Paddle et `titan_atelier` changent : c'est le point le plus risqué de l'économie, d'où les tests SQL avant tout code client.
- Google prélève sa commission sur les achats faits par ce chemin ; la tarification et la comptabilité sont une décision de Théo.
- `docs/PLAY_CONSOLE.md` §3 doit être mis à jour : achats dans l'application = **oui** (déclaration « Contient des achats via l'application »).

## Décisions ajoutées le 02/11/2026
- **Un achat n'appartient qu'à un compte** : clé unique du registre (source, jeton) **et** liaison à l'identifiant de compte TITAN fourni à l'achat (`externalAccountIdentifiers.obfuscatedExternalAccountId`). Un achat sans cet identifiant, ou fait pour un autre compte, est refusé (409) avant toute écriture.
- **Acquittement** : fait par le serveur après enregistrement de l'accès ; si Google refuse, la réponse porte `acknowledged:false` et l'application propose « Restaurer mes achats » (Google rembourse un achat non acquitté au bout de trois jours).
- **Notifications** : authentification par jeton OIDC signé par Google (audience et compte de service épinglés) si `PLAY_RTDN_AUDIENCE` et `PLAY_RTDN_SERVICE_ACCOUNT` sont définis, sinon secret dans l'URL. Les remboursements arrivent en notification d'abonnement (type 12) ou d'achat annulé (`voidedPurchaseNotification`, produit = abonnement) ; dans tous les cas l'état est relu chez Google. Un jeton que Google ne connaît plus (404/410) retire l'accès qu'il donnait. L'écriture est datée de la lecture chez Google, pas de la notification, pour qu'une notification tardive ne défasse pas une vérification plus récente.
- **Rattrapage** : une tâche planifiée horaire relit les abonnements Google Play actifs qui finissent dans moins d'un jour ou sont silencieux depuis trois jours (une notification perdue ne laisse pas un accès éternel).
- **Offres Coach** : les produits `coach` (5 places) et `coach_pro` (15 places) sont rattachés aux offres par `titan_plan_product_set_v1` (étape humaine, après vérification des identifiants dans Play Console). Les places Titan+ des sportifs suivis suivent le registre (migration 20261102090000) sans toucher à leurs droits personnels.
- **Pas de double facturation** : un compte déjà abonné ne voit plus les boutons d'achat, seulement « Gérer dans Google Play ».

# ADR-004 — Google Play Billing pour TITAN+ dans l'application Android (PREM12, PREM13, PREM14)

Statut : **décision de Théo du 20/10/2026 : « Google Play Billing »** (option 3 de `docs/PLAY_CONSOLE.md` §3). La conception ci-dessous est proposée par Claude et n'est pas encore implémentée. Rien dans cet ADR n'a été vérifié contre les pages Google officielles : la lecture des pages « Payments » et « Play Billing » à jour est une étape obligatoire avant le code.

## Contexte
TITAN+ est aujourd'hui vendu sur le web par Paddle. L'application Android est une coque web (TWA, ADR-001). Les règles Google sur les paiements changent en 2026 selon la région (voir `docs/PLAY_CONSOLE.md` §3). Théo choisit de proposer l'abonnement **dans l'application via Google Play Billing**, ce qui lève le risque de renvoyer vers le site.

Contraintes du code actuel :
- `functions/webhook.mjs` applique l'abonnement par `titan_apply_paddle_entitlement_v87`, qui écrit **un seul** enregistrement sur `profiles` (`is_elite`, `elite_*`) avec la règle « le dernier événement gagne » (`elite_last_event_at`).
- Un joueur qui aurait deux sources (Paddle puis Google, ou un changement d'appareil) verrait l'une **écraser ou révoquer** l'autre. Ce défaut n'existe pas tant qu'il n'y a qu'une source.

## Décision (conception)
1. **Le serveur reste l'autorité (PREM13).** L'état Premium n'est jamais décidé par le client. Après un achat, le client envoie le **jeton d'achat** à une fonction serveur ; celle-ci interroge l'API Google Play Developer (abonnements) avec un compte de service, et n'accorde l'accès que sur réponse valide, pour le bon produit et le bon paquet `fr.titanapp.app`.
2. **Un enregistrement d'accès par source.** Nouvelle table privée `private.titan_entitlements(user_id, source ['paddle'|'google_play'], external_id, status, product_id, renews_at, ends_at, refunded_at, last_event_at)` avec clé `(source, external_id)`, RLS activée et aucun droit d'API. `profiles.is_elite` devient **dérivé** : vrai si au moins une source est active. Les colonnes `elite_*` de `profiles` restent renseignées pour les consommateurs actuels (affichage, `titan_atelier`), avec la source principale.
3. **Migration des abonnés Paddle existants** : copie des lignes actuelles (`elite_subscription_id`, statut, dates) dans la nouvelle table, sans changer le comportement visible ; l'ancienne RPC continue d'être appelée par le webhook Paddle, qui écrit désormais dans la table de sources puis recalcule `is_elite`. Plan de retour arrière écrit avant l'application.
4. **Renouvellements, annulations, remboursements (PREM14)** : notifications serveur de Google (Real-time developer notifications, Pub/Sub en push) vers une seconde fonction Netlify, vérifiées (jeton d'authentification du push), idempotentes sur l'identifiant de message, qui relisent l'état de l'abonnement auprès de Google avant d'écrire (on ne fait pas confiance au contenu de la notification). Restauration à un changement d'appareil : le client renvoie les achats actifs connus de Google Play au démarrage de l'écran Atelier ; le serveur rattache le jeton au compte **seulement s'il n'est lié à aucun autre compte** (un jeton ne sert qu'un compte, clé unique).
5. **Dans la coque Android**, l'achat passe par l'API Digital Goods et Payment Request de Chrome pour les TWA (à confirmer dans la documentation Google et Chrome du moment) ; le bouton « Passer à TITAN+ » appelle ce chemin, sans renvoi vers le site. Sur le web, Paddle reste inchangé. Un abonné d'une source voit « TITAN+ actif » partout ; la gestion de l'abonnement renvoie vers la bonne source (Google Play ou Paddle) pour éviter une double souscription.
6. **Pas de double facturation** : si le compte a déjà une source active, l'autre bouton d'achat est remplacé par l'état « TITAN+ actif ».
7. **Aucune vente de puissance** : inchangé (SHOP, `tests/no-currency-purchase.test.mjs`).

## Ce qu'il faut de Théo (humain)
- Dans la Play Console : créer le produit d'abonnement TITAN+ (identifiant, prix, période), activer la facturation, puis créer un **compte de service** autorisé à lire les abonnements, et fournir le fichier de clé **uniquement** comme secret Netlify (jamais dans le dépôt ni dans une conversation).
- Configurer les notifications serveur (sujet Pub/Sub) vers la fonction de notification.
- Valider le prix, la période d'essai éventuelle, les mentions légales et la politique de remboursement (LEG).

## Phases
1. Lecture des règles Google à jour ; confirmation de la faisabilité en TWA (Digital Goods) ; décision de la région d'abord concernée.
2. Migration et RPC : table de sources, dérivation de `is_elite`, migration des abonnés Paddle ; tests SQL (deux sources, une révoquée n'enlève pas l'autre ; jeton lié à un seul compte ; rejeu idempotent). **Aucune application en production** avant le plan de production.
3. Fonction serveur de vérification et fonction de notification, avec client Google simulé en test (réponses actives, expirées, remboursées, mauvais produit, mauvais paquet, jeton déjà lié).
4. Client : chemin d'achat dans la coque Android derrière un drapeau désactivé par défaut, test e2e avec API simulée ; activation seulement après un essai réel avec un testeur de licence.
5. Essai sur appareil (testeurs de licence Google), puis test fermé.

## Conséquences
- Le webhook Paddle et `titan_atelier` changent : c'est le point le plus risqué de l'économie, d'où les tests SQL avant tout code client.
- Google prélève sa commission sur les achats faits par ce chemin ; la tarification et la comptabilité sont une décision de Théo.
- `docs/PLAY_CONSOLE.md` §3 doit être mis à jour : achats dans l'application = **oui** (déclaration « Contient des achats via l'application »).

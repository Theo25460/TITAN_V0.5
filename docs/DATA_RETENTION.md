# Matrice de conservation (LEG31, LEG03, LEG09, LEG15, Q-002)

Décision de Théo du 20/10/2026 (Q-002) : déterminer les durées **les plus courtes légalement justifiables** et ne publier que des durées **réellement exécutées par le code**. Cette matrice est celle du code : chaque ligne « exécutée » correspond à une ligne de `private.titan_retention_rules` (migration `20261020030000_retention_purge.sql`, planifiée chaque jour à 04:20 UTC si `pg_cron` existe) et `tests/retention-matrix.test.mjs` échoue si le document et la migration divergent.

**Statut : migration non appliquée en production.** La page `/supprimer-mon-compte` et la politique de confidentialité n'annoncent ces durées qu'à partir du moment où la migration 25 est appliquée (ordre du plan de production : base d'abord, site ensuite).

**Ce n'est pas un avis juridique.** Les fondements ci-dessous sont des choix techniques minimaux, avec le texte ou l'usage qui les motive quand il est connu avec certitude ; ce qui n'est pas établi est dit tel quel. La validation humaine reste tracée dans LEG13 et LEG57 et ne bloque pas le développement.

## Durées exécutées par le code

| Règle (`id`) | Données | Durée | Fondement du choix | Après suppression du compte |
|---|---|---|---|---|
| `analytics` | événements de mesure d'audience | 13 mois | durée maximale de vie des traceurs recommandée par la CNIL pour la mesure d'audience ; identité déjà détachée | identité détachée (`ON DELETE SET NULL`), événements anonymes purgés à 13 mois |
| `support_general` | demandes d'assistance : bug, compte, communauté, autre | 6 mois | aucune durée légale minimale ; le temps de traiter et de retrouver une récidive | supprimées avec le compte |
| `support_payment` | demandes d'assistance : paiement et remboursement | 13 mois | couvre le délai de 13 mois dont dispose un client pour signaler une opération de paiement non autorisée (art. L133-24 du Code monétaire et financier) et le suivi d'un remboursement | supprimées avec le compte |
| `support_rights` | demandes d'assistance : exercice des droits | 12 mois | garder la preuve que la demande a été traitée ; durée à valider (LEG32) | supprimées avec le compte |
| `bug_reports` | anciens signalements de bug | 12 mois | ancienne table, usage actuel à confirmer ; durée courte | supprimés à la suppression du compte |
| `contact_messages` | anciens messages de contact | 12 mois | idem | supprimés à la suppression du compte |
| `billing_events` | copie locale des événements de facturation Paddle | 13 mois | réconciliation d'un abonnement et délai de signalement d'une opération de paiement non autorisée (13 mois) ; Paddle est marchand officiel (**à confirmer, LEG25** : si TITAN était vendeur, l'obligation comptable serait bien plus longue et cette règle devrait changer) | contenu (`payload`) vidé, identifiant joueur détaché ; ligne purgée à 13 mois |
| `admin_audit` | journal d'audit administrateur | 12 mois | traçabilité des actions d'administration ; aligné sur la conservation d'un an des données d'identification des hébergeurs (**à confirmer**) | contenu vidé pour la cible, identité détachée |
| `admin_logs` | ancien journal administrateur | 12 mois | idem ; usage actuel à confirmer | cible, anciennes et nouvelles valeurs vidées (aucune clé étrangère : le déclencheur le fait) |
| `audit_logs` | journal d'audit générique (copies de lignes) | 12 mois | idem | copies des messages, de l'inventaire, des signalements et de l'ancien journal nommant le compte supprimées (déclencheur après suppression) ; les autres copies expirent à 12 mois |
| `moderation_decisions` | décisions de modération | 24 mois | délai raisonnable pour contester une sanction ; choix technique. Une décision annulée par une plus récente, ou une suspension encore en vigueur (pas de restauration ni d'annulation postérieure), n'expire pas | `snapshot` vidé, identité détachée ; le motif écrit par l'administrateur reste |
| `appeals` | recours tranchés | 24 mois après la décision | même raison ; un recours ouvert n'expire jamais | supprimés avec le compte |
| `suspicious_actions` | signaux anti-triche | 12 mois | utilité de détection limitée dans le temps | supprimés à la suppression du compte |
| `moderation_reports` | signalements traités | 12 mois après création, seulement s'ils sont résolus ou rejetés | un signalement ouvert n'expire pas | texte libre vidé, identités détachées |
| `reports_legacy` | anciens signalements traités (statut autre que en attente, nouveau, ouvert) | 12 mois | ancienne table ; un signalement en attente n'expire pas | auteur, cible et texte libre vidés (aucune clé étrangère : le déclencheur le fait) |
| `reward_holds` | retenues de récompenses réglées | 3 mois après le règlement | trace utile au support récent | supprimées avec le compte |
| `verification_requests` | demandes de vérification et réponses du joueur | 12 mois | preuve que la vérification a eu lieu en cas de recours ; ouverte, répondue ou close, elle expire à 12 mois pour ne pas garder un texte libre indéfiniment | supprimées avec le compte |
| `social_action_log` | journal des actions sociales | 90 jours | limitation de débit et diagnostic | identité détachée |

## Conservé volontairement, sans purge

| Donnée | Pourquoi | Garantie |
|---|---|---|
| `titan_economy_journal` (journal d'économie immuable) | intégrité de l'économie du jeu ; la garde d'immuabilité n'est pas assouplie | une fois le joueur détaché, il ne reste que des montants et des types d'opération, sans texte libre ni identité |
| `referrals`, `contest_draws` | traces d'un parrainage ou d'un tirage | identité détachée ; aucune donnée personnelle restante (code de parrainage, compteurs) |
| Messages reçus d'un autre joueur | ce sont les données de leur auteur | l'auteur est seul concerné ; l'identifiant du destinataire supprimé n'est plus rattaché à un compte |

## Compte, séances et social

Tout ce que le joueur a produit (profil, séances, objectifs, social, coaching, achats, appels de recours) est supprimé avec le compte, par la fonction de suppression (`delete_own_account`) ou en cascade. La suppression d'un compte par l'administration ou par la purge d'inactivité (`delete_inactive_users`) passe aussi par les déclencheurs de la migration 25, qui effacent en plus ses messages et signalements de bug, vident les contenus qui survivraient et retirent les copies d'`audit_logs`.

Défaut trouvé et corrigé par cette migration : le déclencheur d'audit générique copiait les lignes supprimées (messages, inventaire) dans `audit_logs`, qui les gardait après la suppression du compte.

## Ce qui n'est pas maîtrisé par le code

| Élément | Statut |
|---|---|
| Sauvegardes de la base | appartiennent au fournisseur ; durée et rotation **à confirmer auprès de Supabase** (A11) ; rien n'est affirmé au public au-delà de « selon le calendrier du fournisseur » |
| Journaux d'hébergement (Netlify) | durée **à confirmer** auprès du fournisseur |
| Copies locales sur l'appareil | effacées par la suppression du compte pour ce compte (voir `docs/PRIVACY_TECHNICAL_INVENTORY.md` §2) |
| Facturation chez Paddle | obligations légales de Paddle, hors de TITAN |

## Points ouverts pour la revue humaine

Statut juridique de l'éditeur ; marchand officiel (LEG25) ; base légale de chaque traitement (LEG27) ; confirmation des durées de sauvegarde et de journaux d'hébergement ; usage réel des anciennes tables (`contact_messages`, `bug_reports`, `reports`, `admin_logs`).

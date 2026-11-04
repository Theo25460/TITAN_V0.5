# Actions de Communauté en attente — handoff du 11 octobre 2026

Suite de la PR #39 : parent publié `30b618d7d8a35aaa41975972129ad265c1ab991b`, parent local `c3e6840d466701dadf1ca7d39ad3efc956ac9ac8`, arbre commun `0e00874e5493d8da5ca8c1334b8d0c38d5791e84`. Branche isolée `codex/web-community-actions-cdc`. Le [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) et la PR enregistrent les SHAs publiés, la revue unique et la CI finale de ce lot.

## Problème et résultat

Trois soumissions du formulaire de guilde pouvaient envoyer trois messages. Accepter et refuser une demande pouvaient partir ensemble. Le handler du formulaire de défi pouvait envoyer plusieurs créations même si son bouton était désactivé. Le défi pouvait se fermer par Annuler pendant son envoi ; une relecture de fond effaçait un message en cours. Un ancien résultat ne devait pas déverrouiller l'envoi du compte suivant. L'erreur d'un défi restait affichée pendant sa nouvelle tentative.

La page réserve désormais une opération avant toute attente d'authentification ou de RPC. Une seule mutation de Communauté peut être en cours pour la session propriétaire/client/epoch courante. Les boutons, champs et sélecteurs de la page, ainsi que ceux du formulaire de défi ouvert, sont temporairement désactivés. La garde du handler bloque aussi les activations synthétiques ou soumissions répétées. Les liens et la navigation du shell restent disponibles.

L'état « Envoi en cours… » utilise `role=status`, placé hors du formulaire `aria-busy` et juste avant lui lorsqu'il existe. À l'échec, les états désactivés initiaux et l'attribut busy sont restaurés. Le message ou le défi garde ses valeurs et ses invités tant que son écran n'a pas été invalidé. Le défi affiche une erreur humaine, rend le focus à Lancer et efface l'ancienne erreur à la tentative suivante. Une réussite libère l'opération avant de relire les données ; aucune seconde relecture n'est ajoutée aux confirmations.

Échap, le fond, la croix et Annuler ne ferment pas un défi en cours. Une fermeture programmatique de sécurité reste possible lors d'un changement de session ou d'une coupure réseau. La mutation déjà envoyée n'est pas annulée par cette fermeture. Les anciennes continuations restaurent exclusivement leurs propres nœuds capturés ; elles ne retirent pas la réservation ou l'annonce d'une nouvelle opération du compte suivant.

Les relectures de fond de la même session sont ignorées pendant une mutation sur un écran prêt, pour conserver le brouillon. Une coupure réseau garde le nettoyage privé du parent. Si la page revient en ligne avant la réponse de l'opération, ses nouveaux contrôles restent bloqués et son annonce d'attente est remontée. Ils redeviennent disponibles lorsque cette opération se termine. Ce retour ne restaure pas un brouillon privé déjà retiré par le nettoyage hors ligne.

Les gardes de session, le jeton Authorization du propriétaire capturé, la hiérarchie, les RPC et leurs paramètres restent ceux des PR #38/#39. Le script de `social.html` passe de 300.2 à 300.3 ; le test PWA injecte aussi l'ancienne génération 300.2.

## Validation du lot

- Sept nouveaux tests ont échoué sur le parent pour les défauts décrits : messages multiples, réponses contradictoires, défis multiples, fermeture pendant l'envoi, perte de brouillon au refresh, verrou du nouveau compte et erreur persistante à la reprise. Ils ont ensuite passé avec les 19 parcours de session et les trois parcours de hiérarchie du parent.
- Deux contrôles complémentaires ont échoué avant leur correction : annonce de message hors du viewport mobile, puis annonce absente au retour en ligne d'une opération encore en attente. Le premier est ajouté au cas de message ; le second forme un huitième test. Huit nouveaux tests au total.
- Les quatre voies de fermeture du défi sont exercées dans le même test, puis la fermeture fonctionne de nouveau après erreur. Le cas Alice/Bob termine Alice alors que Bob envoie et vérifie qu'une nouvelle soumission de Bob ne produit aucun second RPC.
- Rendu du message et du défi en attente inspecté à 360 et 1280 px, avec absence de débordement horizontal. Identités, guilde, messages et réponses retardées sont des fixtures ; aucun compte réel ou serveur de production utilisé.
- Exécuter `pnpm verify` et `pnpm test:e2e` sur la version finale ; attendre 141 tests internes et 137 E2E. Les résultats constatés, la revue indépendante Sol 6.1 high et les trois logs CI sur le HEAD/base exacts sont consignés dans la PR et le cahier.
- Les quatre fichiers du lot sont `js/app/communaute.js`, `social.html`, `tests/e2e/smoke.e2e.mjs` et ce handoff. Aucun CSS, image, SQL ou autre module modifié.

## Décisions et limites

1. La sérialisation est limitée à cette instance de page et à sa session courante. Ce choix évite qu'une mutation suivie d'une relecture ne détruise le brouillon d'une autre mutation concurrente. Il bloque temporairement les autres actions de Communauté, même indépendantes ; il ne garantit pas l'idempotence côté serveur, entre onglets, appareils ou après rechargement.
2. Aucun timeout, abort, nouvel essai automatique, clé d'idempotence ou état de résultat incertain n'est ajouté. Une réponse qui n'arrive jamais maintient le verrou de cette page. Naviguer ou changer de compte permet un nouveau contexte mais ne prouve pas l'annulation de l'ancien envoi. La reprise après résultat réseau incertain reste à traiter côté contrat métier avant une garantie d'envoi unique.
3. Les relectures ignorées ne forment pas une file. Les actions qui relisaient déjà après réussite continuent de le faire ; un encouragement garde sa mise à jour locale. Après échec, aucune relecture automatique n'efface le brouillon conservé. Un événement de rafraîchissement ultérieur peut toujours remplacer un écran qui n'envoie plus.
4. Hors ligne et transition de compte conservent la politique de nettoyage privé du parent. Un formulaire retiré n'est pas restauré dans un autre contexte. Les résultats tardifs ne peuvent pas notifier, relire ou déverrouiller une autre session ; une requête expédiée auparavant peut néanmoins être appliquée pour son propriétaire initial.
5. Le statut et les attributs natifs sont vérifiés dans Chromium, sans revendiquer une recette TalkBack/VoiceOver, Safari/Firefox, une accessibilité globale ou une validation avec réseau, comptes et appareils réels. QA08/UX09 restent partiels.
6. L'audit RPG01 et WORK/Play Console restent indépendants. Le fichier image modifié dans le checkout d'origine est exclu par le worktree isolé. Aucun changement Android, Claude/suppression de compte, migration, RLS, données réelles, économie, prix ou récompenses.
7. Aucune fusion sur main ni mise en production. La recette globale et la passe Astra maximale requise par le cahier restent à effectuer avant une mise en production majeure.

## Retour arrière et suite

Restaurer les trois fichiers applicatifs/test depuis le parent PR #39 et retirer ce handoff pour annuler cette couche. Aucun rollback de données nécessaire ; aucun retour arrière exécuté en production. Libérer le claim après revue et CI finale, puis choisir le prochain lot web à partir du cahier et de ses claims actuels.

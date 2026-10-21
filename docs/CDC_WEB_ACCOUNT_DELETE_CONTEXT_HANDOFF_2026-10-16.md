# Suppression Profil — compte capturé et nettoyage local

Lot SEC01/SEC04/QA08. Parent PR #62, HEAD publié `2368cd853b5b9b39dcc3a066c2df856c81e73634`, arbre `78c8fc3af1c34e288e9d06bed269f4320b636efc`. Worktree distinct. Handoff Claude du 11/10 relu : périmètre libéré ; ce lot conserve les règles SQL du parent et n’intègre pas implicitement sa branche séparée ni ses évolutions Paddle/guilde/brouillons.

## Défaillance et correction

Le formulaire lisait le client au moment de l’envoi puis le propriétaire après la réponse. Une confirmation ouverte sous A pouvait donc agir sous B ; après une réponse retardée, une déconnexion SDK et un nettoyage global pouvaient viser le nouveau contexte. Le bouton désactivé ne bloquait pas plusieurs événements submit synthétiques et les fermetures de fenêtre restaient possibles pendant l’attente.

Le dialogue capture maintenant le contexte propriétaire/client/epoch du Profil à son ouverture. Une seule fenêtre par contexte et une opération par page peuvent s’exécuter. L’envoi exige encore SUPPRIMER ; il réserve avant tout await, vérifie une session de ce propriétaire et fixe son bearer sur le vrai builder RPC. La réponse doit porter le userId capturé. Anciennes réponses, sessions différées et retours A→B→A observés ne déclenchent aucun nettoyage ou navigation du nouveau contexte.

Le compte serveur n’est supprimé qu’une fois après confirmation reçue dans ce dialogue. Les lectures de session et les gardes sont répétées avant le nettoyage local puis après son attente. TitanQueue.deleteOwner reçoit toujours le propriétaire capturé. En cas de panne locale après confirmation serveur, le formulaire propose « Réessayer le nettoyage » sans renvoyer delete_own_account. Une perte de réponse serveur reste un résultat incertain ; ce lot ne crée pas d’idempotence serveur.

Les champs et quatre voies de fermeture utilisateur (boutons, Échap et fond de fenêtre) sont bloqués pendant l’opération ; l’attente est annoncée par role=status. À la fin d’une ancienne opération, sa propre fenêtre peut seulement afficher un message de changement de compte et permettre sa fermeture. Elle ne libère pas l’opération d’un autre contexte.

## Pourquoi ne plus appeler auth.signOut après le RPC

Le contrat versionné `sql/titan_privacy_account_rpc.sql` supprime profiles et auth.users et renvoie userId. Le SDK épinglé relit sa session dans signOut avant l’appel serveur puis supprime la session courante : un appel dynamique après la réponse pouvait donc viser B. Le code n’appelle plus ce signOut après suppression ; il relit la session, nettoie le propriétaire A, relit encore la session, puis utilise le helper existant titanSafeClearCache de façon synchrone et navigue immédiatement vers l’accueil. Ce helper retire le cache Auth persistant du navigateur ; le contexte JS courant est détruit par la navigation.

Cela n’ajoute pas de broadcast SDK SIGNED_OUT vers d’autres onglets, ne promet pas d’invalidation immédiate des JWT déjà émis et ne teste aucun compte réel. Les autres sessions/onglets et l’exhaustivité des données locales restent des points d’intégration à vérifier avant production. Le bouton Déconnexion est inchangé. Aucun accès au provider Auth réel n’est effectué.

## Vérification

- Baseline et correctif : pnpm verify, 183 tests réussis, build et audit sans erreur ; 16 avertissements préexistants.
- RED initial : 14 échecs/un positif, dont navigation inattendue et attente d’un formulaire déjà fermé. Le helper a ensuite rendu ces navigations observables par assertions, au lieu d’un échec technique de page.evaluate.
- Les attentes/rollovers de session de la fixture sont armés à la soumission, pour ne pas être consommés par les lectures initiales de Profil. Deux premiers contrôles GREEN de préparation ont ainsi été corrigés sans modifier le transport ciblé.
- RED final contre le module parent dans dist : 16 échecs attendus et un positif sur 17 cas, puis reconstruction complète du produit.
- GREEN final : 70/70 ciblés, zéro échec/skipped : 17 suppressions, 17 modifications de carte, dix lectures, quatorze exports, onze radios et PWA.
- Le vrai builder/transport SDK est intercepté au niveau HTTP. Bearer réellement transmis, réponse userId, effets de queue/cache/déconnexion et navigation observés ; le vrai helper de cache retire une clé Auth synthétique. La queue est simulée pour tenir son attente ou produire une panne, sans données réelles. Erreurs JavaScript contrôlées et trafic tiers bloqué.
- Profil300.7 ; anciencache300.6 ajouté au test PWA, autres générations préservées.
- CI exacte et revue indépendante consignées dans la PR avant passage en prête.

Scénarios : succès A/clé Auth locale retirée sans déconnexion dynamique ; validation ; ouvertures/submits répétés et fermetures bloquées ; confirmation A utilisée sous B ; réponses tardives après propriétaire/aller-retour/epoch/client ; session préflight différée/étrangère ; rollover SDK ; réponse étrangère ; panne RPC/retry ; changement public ou silencieux pendant nettoyage ; retry local sans second RPC.

## Limites conservées

Aucune annulation d’une requête déjà partie, nouvelle expiration/timeout, idempotence serveur/inter-onglets ou garantie sur un aller-retour entièrement silencieux restauré avant observation. Une opération A déjà envoyée peut supprimer A malgré une bascule B ; le client abandonne alors ses continuations. Une suppression partiellement nettoyée n’est pas présentée comme un échec serveur. La reprise locale n’est mémorisée que dans ce dialogue tant qu’il reste dans le même contexte observé.

Le helper de cache et le contrat de purge locale ne sont pas réécrits ; nettoyage exhaustif des brouillons/minuteurs du lot Claude, avertissement Paddle et intégration de sa branche restent à rapprocher séparément. Aucun SQL, règle de suppression, logique juridique/économique, fonction JSON/CSV/carte publique, Android ou image étrangère n’est modifié. SEC01/SEC04/QA08 restent partiels ; aucune clôture globale RGPD, fusion ou mise en production.

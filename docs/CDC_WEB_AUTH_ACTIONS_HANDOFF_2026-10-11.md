# Accès au compte pendant une réponse retardée — handoff du 11 octobre 2026

Suite de la PR #40 : parent publié `218b8f1fb8b4facd6ba479bfc3ba175d5fa0b33e`, parent local `c5508a48af6d6806d1864ef4c975ed13ae9a07b2`, arbre commun `25a0709d0695bc77ad1e4ae1b9ee3086ba41d2f9`. Branche `codex/web-auth-actions-cdc` dans le worktree isolé existant. Le [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) et la PR enregistrent les SHAs publiés, la revue unique et la CI finale de ce lot.

## Problème et résultat

La page protégeait seulement la soumission principale avec une variable busy. Une connexion pouvait encore partir avec une récupération ou une déconnexion vers le mode découverte. Changer d'onglet remplaçait le formulaire avant la réponse. Les champs et le choix de statistiques restaient modifiables pendant l'inscription. Trois activations synthétiques pouvaient demander trois e-mails de récupération ou de confirmation, ou trois déconnexions. Un renvoi échoué imposait le même délai de 30 secondes qu'un renvoi réussi. L'ancienne erreur persistait pendant une nouvelle tentative et une connexion échouée perdait son focus clavier.

Une réservation commune à cette instance de page précède maintenant les appels d'accès au compte. Les boutons, champs et cases de Connexion sont gelés pendant une opération ; le handler refuse aussi les activations synthétiques et les boutons désactivés. Les valeurs envoyées sont capturées avant ce gel. Connexion, inscription, récupération, renvoi et découverte ne peuvent donc pas se déclencher ensemble depuis cette page. Les liens vers l'accueil et les textes légaux restent disponibles.

L'attente utilise `role=status`, près de l'action et hors du formulaire ou bouton `aria-busy`. Le texte dit si la page connecte, crée le compte, envoie un e-mail ou ouvre la découverte. Une nouvelle tentative efface l'ancienne erreur. À l'échec, les états disabled et aria-busy initiaux sont restaurés et les valeurs restent dans le formulaire. Le focus revient au bouton de l'action si le navigateur l'a perdu vers le body ; un focus déplacé sur un lien n'est pas repris. Un formulaire remplacé après réussite n'est pas restauré depuis ses anciens nœuds.

La récupération retient l'e-mail normalisé pour le retour à la connexion. Un renvoi échoué peut être relancé explicitement sans le délai local arbitraire ; les refus et limites du serveur continuent de s'appliquer. Le renvoi réussi garde les 30 secondes de délai existantes. Pendant ce délai, le handler refuse également un événement synthétique dirigé vers son bouton disabled ; les autres actions redeviennent disponibles.

Les appels du SDK, leurs paramètres et les redirections restent ceux du parent. La création du profil reste serveur. Le suivi signup garde le propriétaire de son reçu et les protections de consentement existantes, notamment l'avertissement lorsqu'un choix n'est pas enregistré. Le passage en découverte garde sa déconnexion locale, son identifiant de découverte et son comportement de reprise existants. Aucune nouvelle règle de compte ou de session n'est ajoutée côté serveur.

Le script `auth.js` passe de 300.2 à 300.3 dans `login.html`. Le test PWA injecte maintenant aussi l'ancienne génération 300.2 d'auth, en plus des 300.0/300.1.

## Fichiers et validation

Les quatre fichiers du lot sont `js/app/auth.js`, `login.html`, `tests/e2e/smoke.e2e.mjs` et ce handoff.

- Huit contrôles ont échoué sur le parent avant correction : récupération répétée, conflit connexion/autres actions, champs d'inscription non gelés, renvoi répété, délai après échec, ancienne erreur pendant le retry, découvertes répétées et perte de focus clavier. Sept RED initiaux et un RED séparé pour le focus, puis GREEN.
- Dix nouveaux tests au total : les huit régressions, les validations d'inscription suivies d'une correction valide, et la connexion réussie avec une destination locale ou externe. La destination externe doit rester rejetée par la garde existante. Le renvoi réussi est vérifié avec l'horloge du navigateur : le délai reste actif, le bouton synthétique ne contourne pas ce délai, puis le bouton redevient disponible.
- Les tests conduisent le vrai module et le navigateur avec transport SDK synthétique, réponses retardées et données fictives. Aucun e-mail réellement envoyé, compte créé, connexion réelle ou déconnexion d'un utilisateur réel. Les anciens tests d'attribution signup et de consentement font partie de la suite complète.
- La découverte attend sa navigation depuis Playwright lors de la résolution du transport. Le helper des opérations sans navigation peut attendre un frame dans la page ; attendre ce frame dans l'ancien document de découverte provoquait un `Execution context was destroyed`. Le transport de ce cas a été corrigé, sans changer le comportement applicatif, puis les tests ciblés et complets ont été relancés.
- Inscription et connexion en attente inspectées à 360 et 1280 px : statut visible, aucun débordement horizontal, erreur réseau et focus de reprise. Les captures sont des intermédiaires de QA ; aucun nouvel asset applicatif.
- Exécuter `pnpm verify` et `pnpm test:e2e` sur le contenu final. Attendre 141 tests internes et 147 E2E ; consigner les résultats constatés et les trois logs CI sur le HEAD/base exacts dans la PR et le cahier. Une seule revue indépendante Sol 6.1 high avant livraison.

## Décisions et limites

1. Une seule opération d'accès au compte par instance de page. Ce verrou règle les conflits d'interface et activations répétées locales ; il ne rend pas le serveur idempotent et ne sérialise pas plusieurs onglets ou appareils. Le SDK reste responsable de l'authentification et de ses effets sur la session.
2. Aucun timeout, abort, annulation de requête ou nouvel essai automatique. Une requête qui ne répond jamais garde le verrou. Un rechargement ou une navigation ne garantit pas l'annulation d'un appel déjà expédié ni l'absence d'e-mail reçu ; la gestion d'un résultat réseau incertain reste ouverte.
3. Le délai après renvoi réussi est local au bouton et à cette vue. Il ne remplace pas les limites serveur et ne survit pas à un rechargement ou une reconstruction de l'écran. Aucun délai automatique après erreur ajouté ; la reprise reste volontaire.
4. La réservation ne constitue pas un nouveau protocole d'isolation des événements auth venant d'un autre onglet ou d'un client remplacé. Les gardes des autres modules restent celles du parent. Le parcours `/update-password`, le profil, la suppression de compte et les règles de stockage SDK sont hors du lot.
5. QA08/UX09/UX10 restent partiels : Chromium et fixtures, sans recette de vrais comptes, envoi/réception de mails, TalkBack/VoiceOver, Firefox/Safari ni audit complet de tous les parcours. La connexion simulée vérifie la navigation, pas une session serveur réellement adoptée.
6. WORK/Play Console et l'audit RPG01 restent indépendants. Le fichier image étranger du checkout d'origine est exclu. Aucun Android, image, CSS, SQL, migration, données réelles, prix, coins/XP, Premium ou paiement modifié.
7. Aucune fusion sur main ni déploiement. La recette globale et la passe Astra maximale requise par le cahier restent nécessaires avant une mise en production majeure.

## Retour arrière et suite

Restaurer les trois fichiers applicatifs/test depuis le parent PR #40 et retirer ce handoff pour annuler cette couche. Aucun rollback de données nécessaire. Libérer le claim après revue et lecture de la CI finale, puis sélectionner le prochain lot web disponible dans le cahier actualisé.

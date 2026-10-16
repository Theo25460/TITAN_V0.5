# Carte publique — modifications isolées par compte

Lot SEC01/SEC04/QA08. Parent PR #61, HEAD publié `3bdaef4b7a5c51382d560d6d0ed02139cf6617b2`, arbre `7742df3a501b9fcdd2a1e51e053c79e6e0d66878`. Worktree distinct ; images étrangères et chantiers WORK/RPG01 préservés.

## Résultat fonctionnel

Activation, blocs visibles et renouvellement de lien partagent une réservation synchrone avant Auth/RPC. Une seule modification part à la fois ; les contrôles concernés sont désactivés, l’attente est annoncée hors de la région aria-busy et résiste aux autres rendus de Profil. Les valeurs affichées restent celles du dernier résultat confirmé jusqu’à la réponse serveur.

L’opération capture le contexte des lectures Profil (propriétaire/client/epoch). Une session du même propriétaire est nécessaire avant l’appel ; son bearer est fixé sur le vrai builder SDK. La session et le contexte sont contrôlés avant d’appliquer la réponse, de réinitialiser le lien en mémoire ou de montrer une notification. Une ancienne réponse/erreur/finally ne modifie ni les données et notifications Profil du nouveau contexte ni sa réservation. Exception UI intentionnelle : l’ancienne fenêtre de renouvellement peut afficher « Le compte a changé… » et réactiver uniquement ses propres boutons pour permettre sa fermeture. Elle conserve le contexte A et ne peut pas envoyer une commande pour B.

La demande de nouveau lien capture aussi son contexte à l’ouverture de la confirmation : une fenêtre ouverte sous A ne peut pas modifier B. Les clics répétés n’ouvrent qu’une confirmation ; son envoi conserve les protections existantes du shell. Une panne courante garde la fenêtre et permet une nouvelle tentative explicite.

Les messages parlent de modification « non confirmée » : une réponse perdue peut correspondre à un changement déjà appliqué côté serveur. Le clavier retrouve le réglage courant après confirmation ; les identifiants stables permettent aux rafraîchissements déjà en attente de conserver ce focus via le mécanisme existant. Un focus déplacé vers la recherche des sports est conservé.

## Preuves

- Baseline et correctif : `pnpm verify`, 183 tests unitaires, build/audit sans erreur ; 16 avertissements de métadonnées préexistants.
- Premier RED réel : 13 échecs attendus et deux positifs sur les modifications simples. Variante finale (clic natif, deux contrôles de focus ajoutés) rejouée contre le module du parent dans dist : 14 échecs, trois positifs sur 17 scénarios.
- Premier passage GREEN interrompu : le helper Playwright `uncheck` attendait un changement optimiste, alors que le rendu conserve volontairement la valeur confirmée pendant l’attente. Les tests utilisent désormais le clic natif, sans imposer cet état intermédiaire.
- Un contrôle clavier a ensuite révélé un vrai défaut : le focus restauré était perdu au rendu Profil déjà en file. Diagnostic temporaire dans dist, aucun probe conservé ; identifiants stables ajoutés aux contrôles et assertion après rafraîchissement.
- Ciblage final : 53/53 réussis, zéro échec/skipped : 17 modifications, dix lectures, quatorze exports, onze radios et un cache PWA. Les rendus d’attente à 360/1280 px ont été inspectés sans débordement (QR synthétique pour ce contrôle de mise en page). CI exacte et revue consignées dans la PR avant passage en prête.
- Vrai builder et transport SDK pour mutations/lectures/export, interception HTTP, bearer et paramètres reçus par le serveur simulé, liens/états/notices/focus observés. Comptes/tokens synthétiques, trafic tiers coupé, erreurs JavaScript contrôlées.
- Minor de la revue PR61 corrigé : les RPC non export de sa fixture acceptent maintenant setHeader et terminent sur le PGRST202 voulu ; plus de TypeError de préparation. Le transport et les assertions de l’export restent réels.
- Profil 300.6, ancienne génération 300.5 ajoutée au test PWA ; autres générations conservées.

Scénarios : activation et visibilité simples ; doubles changements/contradictions pendant attente ; focus clavier et focus déplacé ; panne/retry ; propriétaire, A→B→A, epoch et client remplacé ; ancienne erreur face à la réservation suivante ; session différée/étrangère ; rollover SDK ; ouvertures et confirmations répétées ; confirmation A utilisée après passage B ; panne et retry du renouvellement.

## Limites

La réservation est locale à la page : aucune idempotence serveur, inter-onglets ou inter-appareils n’est ajoutée. Une mutation déjà envoyée peut être exécutée pour A ; le client abandonne son résultat sous B, sans annuler ou inverser le changement. Une perte de réponse laisse le résultat incertain et aucun retry automatique n’est ajouté. L’attente Auth/RPC des mutations n’introduit pas de nouveau timeout ; les lectures gardent leur timeout existant. Un aller-retour entièrement silencieux restauré avant chaque observation n’est pas détectable.

Les lectures du lot PR61 sont conservées ; JSON/CSV, suppression de compte, consentement, règles de partage, économie, schéma, droits SQL et backend sont inchangés. Les règles de suspension et les champs autorisés restent ceux du serveur. Ce lot ne clôture pas SEC01/SEC04/QA08 ni l’audit global sécurité/accessibilité. Aucune base ou session réelle utilisée, fusion ni mise en production.

## Références

Contrat `supabase/migrations/20261005220000_ascension_public_card.sql` : user_id lié à auth.uid(), paramètres p_enabled/p_show/p_new_link, réponse canonique de carte ; wrapper Communauté et SDK épinglé 2.111.0 relus.

- https://supabase.com/docs/reference/javascript/rpc
- https://docs-supabase.vercel.app/docs/reference/javascript/using-modifiers-setheader
- Changelog Supabase relu le 16/10/2026 ; notice TLS CBC https://supabase.com/changelog/cbc-tls-ciphers-deprecated consultée (anciens clients TLS, aucune modification de cette signature RPC).

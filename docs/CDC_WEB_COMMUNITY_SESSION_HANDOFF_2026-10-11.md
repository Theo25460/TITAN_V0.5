# Isolation de la communauté web — handoff du 11 octobre 2026

Suite de la PR #37, parent publié `2d64e689d3028da5375b85ec91fb9c2db54c2346`, arbre `a59dd7c8692f980e8ec9b42f778825ef7967f5f9`. Le parent local `174bf4295422d53428512880e94425072c7d26fd` a le même arbre. Branche isolée `codex/web-community-session-cdc`. Le [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) et la PR consignent le commit publié, la revue et la CI propres à ce lot.

## Problème et résultat

La communauté conservait ses données et ses dialogues sans écouter les transitions de compte. Une ancienne réponse d'aperçu ou de guilde pouvait afficher les amis, Moments, code ami ou discussion de la session précédente. Une confirmation encore ouverte pouvait envoyer son action depuis le nouveau compte. Deux lectures concurrentes pouvaient aussi laisser une ancienne erreur remplacer un aperçu plus récent.

Le module capture maintenant le propriétaire, l'instance de client et l'epoch de session. Il vérifie ces trois valeurs avant et après chaque appel. Chaque chargement possède aussi une séquence ; seul le dernier peut publier son aperçu et sa guilde. Les résultats restent locaux au chargement jusqu'à leur validation, dont `overview.me.id === owner`. Ce champ est fourni par la fonction SQL existante, sans changement d'interface serveur.

Les mutations et lectures vérifient la session authentifiée avant l'envoi. Elles fixent son jeton dans le header Authorization du builder PostgREST, dont `setHeader` clone les headers dans le SDK versionné 2.111.0. Le SDK peut relire sa session pendant `fetchWithAuth` : cette relecture ne doit pas substituer le jeton d'un autre compte. Aucun jeton ajouté au stockage, aux logs ou à l'analytics.

`titan:account-changing` retire immédiatement les données, dialogues et anciennes notifications de la page. `titan:account-changed` recharge le compte adopté. Les actions, formulaires de défi et confirmations conservent leur contexte d'origine ; un ancien callback ne peut plus démarrer une opération dans une nouvelle session. Les réponses tardives n'affichent pas de succès/erreur pour le nouveau compte et ne relancent pas sa lecture. Le contrôle d'epoch couvre aussi un retour au même identifiant après une transition.

La reprise hors ligne, les états découverte/erreur/chargement et `aria-busy` sont cohérents. Focus, pageshow et historique permettent de reprendre une session devenue différente ; les mêmes événements ne rechargent pas inutilement un compte déjà courant. Une actualisation du même compte conserve les dialogues et leur liste d'invités capturée. Les règles, textes et sections communautaires existants restent conservés. Seule la référence de `communaute.js` dans `social.html` passe de 300.0 à 300.1 pour la PWA.

## Preuves et vérification

- Six reproductions navigateur échouaient sur le parent : données/dialogue conservés lors de transition, aperçu tardif, guilde tardive après nouvel epoch, ancienne erreur gagnant une course, mauvais propriétaire dans l'aperçu et confirmation envoyée après changement de compte. Ces six cas passent après correction.
- Deux reproductions supplémentaires ont échoué avant leur correction : notification avec ancien code ami conservée, et authentification tardive du SDK choisissant un autre jeton. Le test SDK final exerce une mutation réelle du builder, avec transport synthétique, et vérifie explicitement son header.
- **19 parcours communautaires ciblés passent** dans Chromium avec les surfaces du build et le module réel. Ils couvrent aussi le formulaire conservé après fermeture, confirmation déjà envoyée, encouragement tardif, remplacement de client, session absente/non correspondante/erreur puis retry, mode découverte, reprise réseau et actions normales ami/défi/guilde. Les fixtures isolent les RPC sociaux des autres refreshs de l'application ; aucune requête vers un compte réel.
- Parcours normaux et viewport 360/1280 px ; absence d'erreur JavaScript et de débordement desktop vérifiée. Les dimensions mobiles restent également dans le test général des pages.
- Le test PWA existant insère l'ancien script 300.0 en cache et vérifie que la première visite de `/social` utilise 300.1, avec état découverte non occupé.
- Exécuter `pnpm verify` et `pnpm test:e2e` sur le contenu final, puis vérifier les trois jobs de CI et leurs logs sur le HEAD publié exact. Résultats finaux consignés dans la PR et le cahier ; les contrôles des PR précédentes ne remplacent pas ces preuves.
- Une seule revue indépendante Sol 6.1 high, contexte propre, du parent local au commit `987c6d75597188ba8553c6715cf3301e122d3a85` : 16 cas ciblés/PWA rejoués verts ; aucun Critical/Minor confirmé, un Important reproduit avec le SDK réel. Une transition placée entre le contrôle de retour de `rpc` et la reprise de son appelant permettait encore une notification/lecture/analytics de l'ancien compte.
- Ce finding a été confirmé dans quatre régressions RED, puis corrigé : chaque callback revérifie son contexte avant ses effets, et les confirmations ne rechargent qu'un contexte encore courant. Les quatre cas couvrent défi créé, demande d'ami, relecture après confirmation et analytics de défi ; ils passent avec les 15 précédents. Le reviewer n'a modifié aucun fichier. Résultats complets du contenu corrigé consignés dans la PR et le cahier.

## Décisions et limites

1. SEC01 et QA08 restent partiels. Cette protection frontend complète les RLS/RPC existants, elle ne constitue pas un audit complet des policies ou de tous les écrans. Les modifications de schéma et les endpoints restent hors lot.
2. Une mutation déjà envoyée peut aboutir pour son propriétaire initial malgré la fermeture du dialogue. Le jeton fixé protège le compte suivant, mais ne prétend pas annuler le travail serveur, révoquer un jeton ou garantir une exécution exactement une fois. Les erreurs tardives sont ignorées côté nouvelle session.
3. Pas de nouveau timeout/abort ni de reprise métier des requêtes indéfiniment pendantes. L'idempotence et les protections contre doubles activations de formulaires spécifiques restent un lot distinct. Les confirmations partagées bénéficient déjà de la PR #37.
4. Les transitions réelles entre comptes/appareils et les autres navigateurs nécessitent la recette finale. Le test du SDK utilise bien le bundle versionné, mais les comptes, sessions et transport sont synthétiques. Les droits serveur sont contrôlés séparément par la CI sur répliques.
5. L'effacement des notifications et la fermeture de toutes les sheets de cette page à la transition sont volontaires : elles peuvent contenir un nom, un code ou une action de l'ancien compte. Une copie déjà effectuée dans le presse-papiers n'est pas effacée ; seule sa notification tardive est protégée.
6. UX02/UX03, nouveaux classements, audit RPG01 et Play Console restent ouverts et indépendants. Le lot Claude suppression de compte, sur une autre branche, reste à intégrer avec cette stack avant release. Aucune fusion implicite ni modification de ses fichiers métier.
7. Aucun changement de main, production, données réelles, migrations, RLS, droits, prix, paiements, récompenses, Android ou images applicatives. Audit transversal Astra et recette complète restent requis avant une mise en production majeure.

## Retour arrière et reprise

Retour arrière de code : restaurer `js/app/communaute.js`, sa référence dans `social.html` et les tests ajoutés depuis le parent. Aucun rollback de données nécessaire ; cela réintroduirait les défauts prouvés. Aucun retour arrière exécuté en production.

Libérer le claim après publication et lecture de la CI finale. Poursuivre ensuite les autres exigences web, dont la hiérarchie de Communauté, à partir de cette base isolée et selon les chantiers encore actifs.

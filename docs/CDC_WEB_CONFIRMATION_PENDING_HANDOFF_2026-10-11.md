# Confirmations web pendant une action — handoff du 11 octobre 2026

Suite de la PR #36, parent `c425e7b4877e575cba48a60354dae29231dd05e3`, arbre `6c23a6ee8a079d867cd338194910c2483605c41c`. Branche isolée `codex/web-confirmation-pending-cdc`. Le [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) et la PR du lot consignent le commit publié, l'arbre et la CI propres à cette livraison.

## Problème et correction

Une confirmation pouvait se fermer par Annuler, la croix, Échap ou le fond pendant que son action continuait. Sa promesse renvoyait alors `false`, malgré une action encore susceptible d'aboutir. Désactiver seulement le bouton de confirmation ne protégeait pas non plus son handler contre une activation répétée ou conservée après fermeture. Les confirmations destructives déplaçaient le focus sur l'action destructive après un délai de 30 ms.

Le composant partagé `titanShell.confirm` garde maintenant un état `pending` : les trois boutons sont désactivés, les fermetures utilisateur sont bloquées, et « Action en cours… » apparaît dans un statut accessible. Le handler ignore une activation pendant l'action, après sa réussite ou quand le dialogue est fermé. La confirmation renvoie `true` après réussite. Une erreur rend les boutons utilisables, expose le message et replace le focus sur la possibilité de réessayer. La prochaine tentative efface ce message.

Une fermeture **programmatique** reste autorisée. Le journal peut ainsi fermer une confirmation d'archive lors d'un changement de compte. Fermer le dialogue ne prétend pas interrompre une requête déjà envoyée ; les contrôles de propriétaire restent la responsabilité des fonctions métier existantes. Une réponse tardive ne rouvre pas le dialogue.

Le focus initial est synchrone : Annuler si `danger: true`, sinon Confirmer comme auparavant. Les 14 pages utilisant le shell référencent `shell.js?v=300.3`, au lieu de `300.2`. Aucun changement du service worker ni des règles serveur.

## Vérification

- Baseline du parent : `pnpm verify`, 141 tests réussis, build/audit sans erreur, 16 avertissements préexistants.
- RED avant correction : les cinq nouveaux tests échouaient sur fermeture pendant l'action, trois invocations au lieu d'une, absence d'état accessible/reprise, focus destructif et activation d'un élément conservé après fermeture. Après correction : 5/5 réussis.
- Vérification finale : `pnpm verify`, **141/141** ; `pnpm test:e2e`, **107/107**, aucun échec. Les sept nouveaux parcours couvrent les quatre voies de fermeture utilisateur, répétition, erreur/retry, annulation après erreur, focus destructif, fermeture programmatique et changement de compte dans le vrai journal. UI et composants réels ; action asynchrone/transport synthétiques, aucun compte réel modifié.
- La régression PWA existante couvre désormais aussi le shell `300.2` en cache. La première navigation utilise le nouveau composant sans attendre une actualisation de fond.
- Rendu contrôlé à 360 et 1280 px : aucune largeur débordante ; statut et commandes tiennent dans le dialogue.
- Une seule revue indépendante GPT-6.1 Sol, effort high : aucun Critical, Important ou Minor confirmé. Les sept parcours ciblés, la PWA et `git diff --check` rejoués verts ; aucun fichier changé par le reviewer.
- La CI distante doit être vérifiée sur le commit final de cette PR, avec les trois jobs et les deux voies PostgreSQL 16. Les résultats des PR précédentes ne constituent pas une preuve pour ce lot. Résultat final consigné dans la PR et le cahier, sans recréer un commit uniquement pour recopier le numéro de CI.

## Décisions et limites

1. QA08 et UX09 restent partiels : cette livraison ne vaut pas recette exhaustive du produit, Android ou test de lecteur d'écran réel. L'annonce effective de `role=status` sous `aria-busy`, VoiceOver/TalkBack et les autres navigateurs restent à vérifier.
2. Une action qui ne se règle jamais laisse le dialogue en attente. Aucun délai artificiel n'affirme que le serveur a annulé l'action. La gestion de timeout et la reprise des opérations métier doivent avoir un lot distinct ; ce patch n'invente pas une annulation réseau.
3. Les erreurs avalées par certains appelants, les dialogues qui n'utilisent pas `titanShell.confirm`, l'idempotence serveur et les limites inter-onglets restent hors de ce composant. Pas de garantie globale exactement-une-fois.
4. Le lot Claude de suppression de compte, publié sur sa branche séparée, n'est ni réécrit ni fusionné ici. Son intégration avec cette stack reste à vérifier avant release. L'audit RPG01 actif et le chantier WORK Play Console sont conservés.
5. Aucune modification de main, de production, des données réelles, des migrations, des paiements, des prix, des droits ou des récompenses. Aucun déploiement ni action métier réelle. Les images applicatives restent identiques au parent.

## Retour arrière et reprise

Retour arrière de code : rétablir `js/app/shell.js`, ses 14 références HTML et les tests concernés depuis le parent. Aucune restauration de données nécessaire. Cela réintroduirait les défauts reproduits ; aucun retour arrière exécuté en production.

Le claim de ce lot se libère après publication et lecture de la CI finale. Le chantier global reste ouvert. Poursuivre les exigences web selon le cahier, puis recette réelle et audit transversal Astra avant une mise en production majeure.

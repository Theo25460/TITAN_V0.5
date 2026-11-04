# Hiérarchie de Communauté web — handoff du 11 octobre 2026

Suite de la PR #38 : parent publié `712b7ba9169ce157f53c050ce1a56af2b7f074ad`, parent local `c6bd021b13f4c89d4c2a36f1e66aa36757f4f725`, arbre commun `4622f8cbf0bbde7861881b26efc867f97ba0625e`. Branche isolée `codex/web-community-ux-cdc`. Le [cahier maître](https://docs.google.com/document/d/1zCzsHyIlSFxa_6Y8x6LbPWbvOhUiSue3u4yAPvFsl8M) et la PR consignent le commit publié, la revue unique et les contrôles finaux propres à ce lot.

## Problème et résultat

La page enchaînait expédition, demandes, liens d’ancres puis quatre sections sur une seule colonne. La navigation venait après les premiers blocs et ne disait pas ce que chaque section proposait. Les demandes d’amis étaient détachées des amis et les champs de création/rejoindre une guilde n’avaient pas de label associé.

La page commence maintenant par quatre accès : Moments, Amis, Défis, Guilde. Chaque lien explique sa destination et affiche un repère calculé depuis l’aperçu existant : nombre de Moments reçus sur les 30 derniers jours, demandes à traiter ou nombre d’amis, nombre de défis, équipe existante ou possibilité de rejoindre. Aucun nombre, activité ou classement supplémentaire n’est inventé.

Sur desktop, le fil (expédition et Moments) et le cercle d’amis sont côte à côte ; les espaces Défis et Guilde forment ensuite la zone « Avancer en équipe ». Sur mobile, ces mêmes sections restent dans leur ordre de lecture, sans contenu masqué ni navigation secondaire à gérer. Les demandes se trouvent dans Amis et restent signalées dans le raccourci du haut.

Les titres, descriptions, cartes et états vides donnent des points d’entrée vers les actions existantes. Les Moments vides renvoient vers les records ; l’absence d’amis dans Défis renvoie vers Amis. L’erreur de lecture de guilde permet de relancer la lecture existante. La progression triée de chaque défi reste à l’intérieur de ce défi ; aucun classement public global n’est ajouté. Expéditions, confidentialité et règles sociales restent celles du parent.

Les quatre ancres sont des liens natifs. Leurs destinations sont des sections nommées, avec `tabindex=-1` et une marge de défilement tenant compte de l’en-tête. Un lien entrant tel que `/social#guilde` rejoint sa section au premier rendu connecté, après le chargement asynchrone. Cette unique restauration vérifie encore le propriétaire/client/epoch, le nœud et le fragment avant de déplacer le focus ; elle ne se répète pas à chaque action ou relecture.

Le mode découverte conserve inscription/connexion et présente brièvement les quatre espaces. Il ne fabrique ni compte social ni données. Le CTA est placé avant l’explication détaillée. Les styles de ce lot se trouvent exclusivement dans `css/communaute.css`, chargé par `social.html`, avec les tokens et icônes Ascension existants. Le script passe de 300.1 à 300.2 pour éviter l’ancienne génération en cache PWA.

## Fichiers et validation

Les cinq fichiers du lot sont `js/app/communaute.js`, `social.html`, `css/communaute.css`, `tests/e2e/smoke.e2e.mjs` et ce handoff.

- Trois contrôles nouveaux ont échoué sur le parent avant implementation : absence des raccourcis explicites, absence du point d’entrée depuis les Moments vides, lien de guilde ne rejoignant pas la section après chargement. Ils passent après le changement.
- Le contrôle de hiérarchie exerce les quatre liens au clavier à 360 et 1280 px : fragment, focus natif, section visible hors de l’en-tête, actions existantes, champs nommés et absence de débordement horizontal. Il vérifie aussi le repère de demande et celui des Moments.
- Le contrôle des états vides vérifie des repères sans faux nombres et suit réellement le lien Records. Le lien entrant de guilde vérifie ensuite une vraie soumission du formulaire du module avec le transport de test.
- Les 19 parcours d’isolation de session du parent restent dans la suite : anciens résultats/dialogues/notifications/actions, compte/client/epoch, token Authorization du SDK réel avec transport synthétique, reprises et actions normales.
- Le test PWA insère les générations de script 300.0 et 300.1 en cache. La première visite doit charger 300.2 et les quatre explications de découverte, avec la feuille dédiée appliquée.
- Rendu inspecté à 360 et 1280 px avec expédition, Moments, amis, demande et défi ; découverte mobile inspectée. Ces données sont des fixtures de QA. Aucun compte réel utilisé ; aucune image applicative ajoutée.
- Exécuter `pnpm verify` et `pnpm test:e2e` sur le contenu final, puis lire les trois logs CI sur son HEAD publié exact. La PR et le cahier enregistrent les résultats et les SHAs finaux ; les tests des PR antérieures ne remplacent pas cette validation.
- Une seule revue indépendante Sol 6.1 high, sur la couche depuis le parent PR #38, avant livraison. Les findings et leurs suites sont consignés dans la PR et le cahier.

## Décisions et limites

1. UX02/UX03 avancent sur la page web existante et restent partiels : l’évaluation avec de vrais utilisateurs, les évolutions sociales futures et l’audit global UX restent à faire. Le regroupement visible est livré sur branche, pas en production.
2. Les repères décrivent la réponse reçue, pas un total serveur non fourni : Moments de l’aperçu et défis retournés, qui peuvent inclure des défis terminés. Le texte ne les appelle pas « actifs » ou « non lus ». Aucun nouvel appel serveur.
3. Une guilde connue mais non chargée conserve son état d’erreur et n’affiche pas les formulaires d’une personne sans équipe. La relance réutilise le chargement et ses gardes de session existantes.
4. Pas de tabs dynamiques, mémorisation de sélection, scrollspy ou nouvelle sous-route. Les liens peuvent fonctionner avec historique et clavier natifs. La seule restauration asynchrone est le fragment reconnu du premier rendu connecté ; aucune nouvelle politique de restauration sur les actions ou transitions de compte.
5. Les actions, confirmations, RPC, protections de session et calculs existants sont conservés. Les mutations déjà expédiées, doubles activations spécifiques et timeouts métier gardent les limites du parent ; ce lot ne prétend pas les résoudre.
6. Les tests fonctionnels utilisent Chromium, identités et transport synthétiques. Labels, focus et tailles sont vérifiés, sans revendiquer une recette TalkBack/VoiceOver, Safari/Firefox ou une validation avec comptes/appareils réels. QA13/UX09 restent partiels.
7. L’audit RPG01 et WORK/Play Console restent indépendants ; le lot Claude de suppression de compte n’est pas intégré ici. Aucune modification de leurs fichiers, Android, SQL, RLS, données réelles, XP/crédits/Premium/paiements ou images.
8. Aucune fusion ni publication en production. L’intégration finale, la recette globale et la passe Astra maximale restent requises avant une mise en production majeure.

## Retour arrière et suite

Restaurer les deux fichiers applicatifs et les tests depuis le parent PR #38, retirer la feuille dédiée et ce handoff pour annuler la couche. Aucun rollback de données requis ; les gardes de session du parent restent en place. Aucun retour arrière effectué en production.

Libérer le claim après publication et lecture de la CI finale. Poursuivre les exigences web indépendantes à partir de cette base en relisant les claims actifs.

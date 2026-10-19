# Assistance web et hors ligne — handoff du 11 octobre 2026

## Résultat et périmètre

Suite de PR #44 : parent publié `eaf1293419cda7d611e7e69302865fbdc5467092`, parent local `5f9694622c79755b2eacab3f24024525bc548589`, arbre commun `ee2e3c0fc10dcc9e9d91c085fd49154140640321`. Lot UX13, avec accès UX12 et contrôles UX09/QA18. Sept fichiers : service.html, profile.html (en-tête seulement), network-error.html, css/assistance.css, tools/build-public.mjs (précache seulement), tests/e2e/smoke.e2e.mjs et ce handoff.

L’aide existante devient une Assistance structurée sur la même URL publique `/service`, accessible sans connexion. Six catégories conduisent à des réponses et actions existantes, puis à un contact volontaire par e-mail : bug/problème technique, compte/connexion, TITAN+/remboursement, données/confidentialité, communauté/signalement, autre. Les neuf réponses de FAQ et leurs données structurées sont conservées. Les guides et destinations existants restent accessibles. Titre, descriptions et nom WebPage sont cohérents avec cette Assistance ; canonical, indexabilité et URL inchangés.

Un lien Assistance apparaît dans l’en-tête Profil, au-dessus du contenu chargé, et dans la page de secours hors ligne. Le moteur Profil, ses réglages et la suppression de compte ne sont pas modifiés. Navigation native par ancres, focus sur les titres, retour aux catégories et accordéons details/summary utilisables au clavier, même sans JavaScript. Cartes, boutons et FAQ reprennent les styles Titan existants ; le nouveau CSS est limité à l’Assistance et à ses ancres. Le repère Contact reste visible sous l’en-tête fixe.

`/service` et ses ressources locales entrent dans la précache existante. Le build passe de 94 à 97 ressources hors ligne, avec public.css et assistance.css ; aucune nouvelle bibliothèque, aucune modification du protocole service worker. Après installation complète, la page de secours ouvre les réponses d’aide même si l’Assistance n’a jamais été visitée. Les actions vers les pages applicatives utilisent leur cache existant ; les guides publics non précachés et la transmission d’un e-mail nécessitent encore le réseau.

## Contact et limites produit

Les six liens mailto gardent `titanteam.app@gmail.com` et ajoutent uniquement un sujet statique contenant la catégorie. Aucun corps ni diagnostic, identité de compte, note, GPS, token ou donnée de stockage/URL n’est prérempli. Une adresse visible peut être copiée si aucune application de messagerie ne s’ouvre. Le texte explique que le lien prépare un e-mail et que l’utilisateur doit le valider dans sa messagerie. Une demande de remboursement n’est pas présentée comme automatiquement accordée.

Ce lot livre la base d’orientation et le secours e-mail, pas le canal automatisé décrit par UX14/UX15/SEC12. Il ne crée ni ticket serveur, référence de réception, alerte d’équipe, pièce jointe, capture de diagnostic ou événement analytics de support. Aucun e-mail réellement envoyé pendant le développement ou la recette. Les instructions sur les secrets et captures n’ajoutent pas de contrôle sur ce que l’utilisateur écrit ensuite dans sa messagerie.

## Preuves reproductibles

Baseline propre : 141/141 tests. Huit nouveaux parcours `assistance:` : accès Profil visible à 360/1280, six ancres et action avant contact, neuf FAQ conformes au JSON-LD, sujet d’e-mail sans données privées de l’app/URL, remboursement et limite de livraison, repère Contact, clavier sans JavaScript et aide PWA avant première visite hors ligne. Le test PWA existant place aussi un ancien HTML d’aide dans le cache et exige la nouvelle Assistance dès la première visite en ligne.

Sept preuves RED retenues : six manques d’orientation/accès/contact/précache sur le parent, puis le repère Contact masqué sous l’en-tête fixe découvert en recette. Le contrôle des neuf FAQ passait déjà sur le parent et constitue une conservation, pas un défaut produit. La première fixture PWA n’activait pas l’opt-in local `titan_sw_dev` ; corrigée avant la preuve RED de précache manquante. Deux autres erreurs de fixture ont été corrigées : le texte de contact était cherché sur son titre et l’émulation offline seule laissait le service worker contacter le serveur. Ces erreurs ne comptent pas comme défauts produit.

Le test hors ligne utilise son propre serveur et port, active le vrai service worker, vérifie la précache avant toute visite d’aide, puis arrête réellement son serveur. Une URL jamais visitée retourne la vraie page de secours ; son lien Assistance ouvre ensuite la vraie page et ses styles en cache. Le serveur partagé des autres tests reste disponible. Aucun mock de page, cache, service worker, compte de production ou messagerie.

Après correction : 9/9 ciblés (huit nouveaux plus le test PWA), syntaxe du build et `git diff --check` verts. `pnpm verify` : 141/141 tests, build réussi, audit 0 erreur et 16 avertissements préexistants. `pnpm test:e2e` : 182/182 parcours verts sur le correctif final du repère Contact. Résultats de revue/CI et identité du HEAD publié à consigner dans la PR et le CDC avant livraison.

Huit rendus de viewport Profil, catégories, TITAN+/remboursement et Contact à 360/1280 inspectés. Correction du repère Contact revue dans les deux captures finales. Aucun débordement horizontal, actions et adresse lisibles. Script QA temporaire supprimé ; captures et logs hors commit. Une revue indépendante unique et les trois jobs CI du HEAD final sont requis avant livraison ; deux voies PostgreSQL16 avec 18 suites SQL et quatre contrats concurrents par voie, transaction appelante et refus non-test à vérifier.

## Reprise du chantier Assistance

| Exigence | Livraison de ce lot et suite |
| --- | --- |
| UX12 | Accès direct Profil et secours hors ligne ; autres états d’erreur pertinents à intégrer avec le canal de rapport volontaire. |
| UX13 | Six catégories, réponses/actions existantes et contact e-mail ; raccordement au backend d’Assistance encore ouvert. |
| UX14 | Aucun diagnostic capturé. Prévisualisation minimale, consentement explicite et gestion des rapports à réaliser dans le lot de transport. |
| UX15 / SEC12 | Backend contrôlé, validation, rattachement fiable, isolation, débit limité, référence reçue et notification d’équipe non implémentés ici. Le mailto reste le secours explicite. |
| LEG15 | Information sur les secrets et remboursement non automatique ; finalités/rétention du futur ticket et documents juridiques encore à traiter. |
| DATA11 | Aucune nouvelle collecte. Catalogue d’événements et contrat minimal de métadonnées de support encore à définir. |
| QA18 | Base publique, clavier, PWA et confidentialité des liens vérifiés ; comptes réels, changement de compte pendant envoi, double envoi/retry, backend, e-mails et pièces jointes ouverts. |

Les 265 formulations du CDC sont conservées. UX12/UX13/QA18 sont partiels ; UX09 reste partiel. Chantiers WORK et RPG01 conservés, image étrangère du checkout original intacte. Ce lot ne permet pas de marquer l’Assistance globale terminée.

## Rollback

Restaurer service.html, profile.html, network-error.html, tools/build-public.mjs et tests/e2e/smoke.e2e.mjs depuis le parent ; retirer css/assistance.css et ce handoff puis reconstruire. Aucun retrait de ticket, migration ou restauration de données requis. Main non fusionné, aucun déploiement ni base réelle touchée ; audit transversal Astra maximal avant publication majeure toujours ouvert.

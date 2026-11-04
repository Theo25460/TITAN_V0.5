# V1.1 — Trois avancées Coach — 31 octobre 2026

Base : PR #123, commit GitHub 8e6cad04831799b11c9ae51491a4d85cdc673ac0. Branche : codex/v11-coach-workspace-20261031. Demande de Théo : sauvegarder sur GitHub puis traiter trois nouveaux points ; déploiement Netlify explicitement interdit. Aucun changement de main, SQL distant, droit commercial ou application Android.

## 1. COACH-03 — Vue d’ensemble des athlètes

Les relations actives du snapshot existant sont regroupées en cartes, avec recherche du nom insensible à la casse/aux accents et filtre par sport autorisé. Un partage de tous les sports reste compatible avec chaque filtre. Le filtre n’affirme pas qu’un athlète a réellement pratiqué ce sport ; aucune statistique ni alerte de santé/charge n’est inventée. Les relations étrangères/révoquées et les doublons ne passent pas dans le noyau.

Choisir une carte ouvre le suivi existant ; filtrer ne déclenche aucune lecture supplémentaire. Saisie et focus conservés lors d’une actualisation des drapeaux ; compte/mode changés réinitialisent le filtre. Le menu précédent reste utilisable lorsque le nouveau drapeau est désactivé à chaud. Drapeau indépendant `screens.coachworkspace`, faux par défaut, non créé ni activé à distance.

## 2. COACH-04 — Calendrier des propositions

Vue mensuelle par date UTC des propositions chargées du suivi sélectionné, mois précédent/suivant/actuel et filtre par statut. Les propositions acceptées, réalisées, déclinées, annulées et en attente gardent des libellés distincts. Les jours sans proposition chargée ne sont jamais présentés comme des journées d’inactivité.

Couverture chargée/total toujours visible ; calendrier partiel annoncé si pages absentes, doublons ou données invalides. Les boutons existants de pagination complètent les données sans nouveau mécanisme de lecture. Navigation clavier et focus conservés. Drapeau `screens.coachcalendar`, faux par défaut, non créé/activé à distance.

Il s’agit du calendrier des propositions existantes, pas de cycles multi-athlètes, glisser-déposer, copie de semaine ou bibliothèque d’exercices.

## 3. COACH-06 / COACH-08 — Export CSV privé

Téléchargement explicite réservé au mode Coach, derrière `screens.coachexport` faux par défaut. Le clic relit un snapshot d’autorisations, vérifie propriétaire/relation/athlète/révision/périmètre, relit toutes les pages de séances de la période appliquée puis revérifie le partage juste avant de produire le fichier. Même authentification et RPC existantes, aucune nouvelle permission/table. Pagination bornée à 100 pages de 100 séances ; arrêt si compte, client, epoch, athlète, mode, période, drapeau ou partage change. Double clic bloqué pendant la tâche.

Le fichier contient uniquement date UTC, identifiant de sport, valeur numérique, unité, durée directement fournie, bornes effectives et origine « journal partagé ». Pas de nom, note, GPS, donnée de santé, ressenti ou propriétés arbitraires. Durée absente = cellule vide, zéro connu = 0 ; aucune estimation depuis km/répétitions/kg. BOM UTF-8, séparateur point-virgule, CRLF, échappement des guillemets et neutralisation des formules. Données uniquement en mémoire ; URL de téléchargement immédiatement libérée. Aucune copie côté serveur/cache/analytics. Le texte explique qu’une copie déjà téléchargée ne peut pas être rappelée après révocation.

Refus de téléchargement en cas de pages absentes, total ou périmètre modifié, doublon, provenance étrangère, date/valeur invalide, révocation ou panne. La lecture paginée n’est pas un instantané transactionnel de tout le journal : ne pas annoncer cette garantie.

## Validation

`pnpm run verify` : 420 tests unitaires, types/build/audit/release verts ; sept nouveaux tests du noyau workspace. Les avertissements éditoriaux préexistants restent distincts du SEO final.

56 parcours navigateur ciblés : 16 workspace, 7 analyses, 15 contextes, 18 formulaires. Données synthétiques et RPC interceptées. Lecture du CSV réellement téléchargé (101 séances/2 pages), permissions fraîches avant/après, refus/révocation/révision/propriétaire/doublon/panne, annulation des réponses tardives, états défaut-off et mode Sportif, filtres sans lectures supplémentaires, calendrier/pagination, navigation après bascule du drapeau, axe A/AA et captures à 360/1280 px. Suite globale navigateur, service worker réel, appareils Android/Safari iPhone et backend distant non revendiqués.

Revue indépendante : aucun constat critique ou important. Un point mineur différé : après export au clavier, remettre explicitement le focus sur le bouton Export plutôt que laisser le focus revenir au document. Aucun arbitrage de périmètre rejeté, aucun autre constat mineur retenu.

## Intégration et limites

PR empilée après #123 et #118–122. Les travaux Claude plus récents sur la branche V1.1 ne sont pas fusionnés dans ce lot. Les trois drapeaux nouveaux restent éteints ; recette sur candidate intégrée et contrôle réel avant activation/publication.

COACH-03/04/06 restent partiels : objectifs/check-ins et actions consolidées, cycles/programmes, communication avancée, PDF, charge sRPE consentie, offres 5/15 places à 20/40 € et facturation/Titan+ à poursuivre ; contrat historique 3/20 distinct. Recette métier avec 3–5 coachs non effectuée. Aucune modification Netlify ou de production ; FIN-CHEAT/FIN-SEC/FIN-SEO toujours différés.

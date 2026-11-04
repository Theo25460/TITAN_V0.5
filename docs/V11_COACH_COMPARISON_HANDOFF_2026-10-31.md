# V1.1 — Comparaison du suivi Coach — 31 octobre 2026

Continuation de COACH-03/06 sur la PR #122, base 370fa6797a12e0ebd995601de62b90a3411b7ba0. Code sur branche isolée ; aucune fusion, publication ou modification distante de données.

## Comportement

Le bilan Coach compare les sept derniers jours complets aux sept jours précédents, en UTC. La fin est la plus ancienne entre la fin sélectionnée/retournée par le serveur et hier. Les quatorze jours doivent entrer entièrement dans le partage effectif et la période sélectionnée. Les dates exactes sont affichées ; la journée en cours est exclue.

Comparaisons : séances, jours actifs, durée renseignée, prévu/réalisé et évolution par discipline. Écarts absolus, pas de pourcentage de hausse depuis zéro. Le prévu/réalisé garde les règles existantes (propositions acceptées échues seulement) ; son écart est exprimé en points lorsque les deux dénominateurs existent. Un sport absent d'une des deux périodes reste visible.

Toutes les pages de séances et de propositions doivent être reçues et cohérentes avant de comparer. Des limites explicites de période retournées par le serveur sont obligatoires. Aucune page manquante n'est traitée comme une semaine vide. Les durées absentes n'annulent pas les séances : elles suppriment l'écart de durée concerné. Une période entièrement chargée sans séance vaut zéro uniquement pour ce journal partagé ; aucune affirmation sur l'activité réelle hors TITAN.

Le calcul consomme exclusivement les enveloppes déjà autorisées de la relation sélectionnée. Aucun accès à l'historique personnel du coach, aucune RPC, permission, donnée de santé, charge sRPE, export, analytics ou persistance supplémentaire. Même drapeau `screens.coachanalysis`, désactivé par défaut, et même invalidation propriétaire/client/epoch/révision. Les tableaux conservent toutes leurs colonnes à 360 px ; leurs régions sont nommées et accessibles au clavier. Versions des trois ressources de la page Coaching incrémentées pour éviter l'ancien cache.

## Vérification

- Baseline : 406 tests unitaires réussis avant changement.
- Final : `pnpm run verify`, 413 tests unitaires réussis, types/build/audit/release réussis. Avertissements éditoriaux préexistants conservés.
- 16 tests du noyau Coach, dont 7 nouveaux : UTC/minuit/changement d'année, dates choisies et consentement, pagination, doublons, données invalides, total incohérent, durées absentes/zéro, semaines vides, sports nouveaux/disparus et absence de mutation des entrées.
- 40 parcours navigateur ciblés réussis : 7 Coach analysis, 15 coaching-context, 18 coaching-forms. Sept Coach analysis rejoués après correction de revue et versions de cache. Axe A/AA à 360/1280 px, absence de débordement, captures inspectées ; refus/révocation, changement de compte et drapeau désactivé couverts.
- Revue indépendante : une anomalie importante confirmée et corrigée rouge/vert. Une enveloppe contenant une date invalide avec un total nul passait l'ancien contrôle de couverture puis provoquait une RangeError ; la comparaison exige maintenant que les nombres de lignes chargées et les totaux concordent aussi. Aucun autre constat critique, important ou mineur retenu.

## Limites et reprise

COACH reste partiel : vue multi-athlètes, offres 5/15 places à 20/40 €, facturation/Titan+, programmation et communication avancées, charge consentie, export et recette avec 3–5 coachs restent ouverts. Comparaison fixe 7/7 jours, pas encore d'évolution arbitraire ou de tendance longue. Capacités historiques distinctes des futures offres. Réponses RPC simulées en tests ; aucune validation de compte réel, appareil natif/Safari iPhone, synchronisation distante ou suite navigateur globale revendiquée.

Intégration empilée après #122 et ses dépendances #118–121. Travaux Claude plus récents non fusionnés dans ce lot. Aucun SQL, secret, Android, main ou production modifié ; drapeaux distants non activés. FIN-CHEAT, FIN-SEC et FIN-SEO toujours différés.

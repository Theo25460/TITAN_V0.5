# V1.1 — Analyse d'un suivi Coach — 30 octobre 2026

Code testé sur branche isolée, non fusionné et non déployé. Base PR #121 / 07e88744c541524c6ebca6d2582b97a234a028e3. Première synthèse consentie pour COACH-03/06, protections COACH-08 conservées ; pas une livraison complète du Coach MVP.

## Fonctionnement

L'espace Coach existant affiche, pour l'athlète sélectionné et derrière `screens.coachanalysis` (défaut false), un bilan de la période réellement partagée : séances, durée renseignée, jours de pratique UTC et répartition par sport. Un tableau sépare les disciplines ; aucun total mélangeant kilomètres, kilogrammes et répétitions.

Le calcul ne reçoit que les réponses déjà retournées par `titan_coach_portal` pour la relation choisie. Aucun appel nouveau, aucune lecture de l'historique personnel du coach, aucune nouvelle permission ou donnée de santé. Le début effectif respecte le consentement retourné par le serveur ; les dates sont UTC comme le contrat RPC. Le résumé reste en mémoire, sans cache, export, analytics ni fichier de données.

Les durées proviennent du champ partagé explicite ou d'une valeur directement libellée en minutes/heures. Les distances, répétitions et poids ne deviennent pas des durées estimées. Les séances sans durée exploitable sont comptées à part ; une durée connue à zéro affiche 0 min, pas « indisponible ».

Le prévu/réalisé compte seulement les propositions acceptées ou réalisées, dans la période sélectionnée, dont la date prévue précède aujourd'hui en UTC. Une proposition refusée, annulée, non encore acceptée, future ou prévue aujourd'hui n'est pas un échec. Le statut réalisé vient du contrat existant de proposition reliée au journal ; aucun rapprochement de séance nouveau n'est déduit par ce moteur.

Les pages de séances et de propositions sont chargées séparément. Un bilan partiel le dit et donne la couverture ; le taux prévu/réalisé est indisponible tant que toutes les propositions ne sont pas reçues. Les boutons de pagination existants complètent le bilan sans appel automatique supplémentaire. Les doublons, dates invalides/futures et valeurs non numériques ne gonflent pas les totaux.

## Limites importantes

- Le contrat de partage actuel ne transmet pas le RPE/ressenti. La charge sRPE reste donc explicitement indisponible ; aucune tentative de récupération d'une donnée privée ou d'estimation.
- Les durées connues ne sont pas une charge d'entraînement, un score de récupération, des calories ou de l'XP.
- Le bilan concerne le suivi sélectionné, pas une vue consolidée de tous les clients ; pas de comparaison historique, programmation avancée ou rapport PDF/CSV nouveau.
- Aucun changement de capacité, invitation, facture, offre ou attribution Titan+. Le contrat historique de capacité (3/20) reste un chantier distinct des futures offres Coach validées (5/15). Ne pas annoncer leur mise en service à partir de ce lot.
- Aucun drapeau distant créé/activé, aucune modification SQL/API, aucun accès à des comptes sportifs réels.

## Validation exécutée

`pnpm run verify` vert : 406 tests unitaires, dont 9 nouveaux pour l'analyse, vérification de types du nouveau noyau, build, audit de publication et garde de release. Les avertissements éditoriaux préexistants ne constituent pas une validation SEO.

39 parcours navigateur ciblés verts : 6 nouveaux Coach analysis, 15 coaching-context et 18 coaching-forms. Données synthétiques, réponses RPC interceptées, aucun appel réel à des comptes. Ils couvrent : résumé exact sans historique local, pagination et taux non prématuré, zéro connu, défaut-off/mode Coach uniquement, changement de drapeau sans requête ni perte de saisie/focus, révocation/refus et changement de compte. Suites existantes de consentement, requêtes tardives, client/epoch/propriétaire et formulaires conservées.

Lisibilité contrôlée à 360 et 1280 px, absence de débordement et axe A/AA sur le bilan. Capture mobile inspectée. Revue indépendante : un défaut confirmé (zéro connu rendu comme valeur absente) reproduit rouge puis corrigé vert, sans modifier le formatage global. Aucun autre défaut significatif confirmé par la revue.

Pas de validation distante des migrations/RLS, de paiement Play réel, d'appareil Safari/iPhone/Android ou de suite navigateur globale revendiquée.

## Suite

COACH-01/02 (offres/places/Titan+ réellement facturés), COACH-03 (tableau de travail multi-athlètes), COACH-04/05 (programmes, retours/communication), COACH-06 (historique, charges avec consentements adéquats, exports) et COACH-09 (recette métier/3–5 coachs) restent ouverts. FIN-CHEAT/FIN-SEC/FIN-SEO restent différés. Aucune publication ni fusion main ; V1, production, secrets, SQL distant, mobile et travaux parallèles préservés.

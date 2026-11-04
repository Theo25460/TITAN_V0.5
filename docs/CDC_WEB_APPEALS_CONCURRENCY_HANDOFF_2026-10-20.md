# Recours : concurrence réelle — 20 octobre 2026

Priorité unique CHEAT19 / QA08 / QA05 : compléter la réserve de concurrence à deux connexions du serveur de recours livré. Sources explicitement réunies : PR106 `ab34554f273e0c39c17b2a5a2dd0d83a806709bd` et source livrée PR105 `c5e55464af26e227f028f82a7cd628603f82c8c2`. Pas de nouvelle tête absorbée ; la retenue des récompenses, encore active chez Claude, reste exclue. Vingt et une migrations, PostgreSQL17.6, CSP et activation préservés ; fusion sans conflit.

## Contrats ajoutés

`tools/db/test-appeals-concurrency.py` appelle les vraies RPC avec des identités synthétiques et le rôle authenticated. Chaque course doit observer dans pg_stat_activity un verrou réellement attendu et son bloqueur via pg_blocking_pids. Deux appels simplement successifs ne suffisent pas.

- Deux dépôts sur le même objet : un seul recours, doublon explicitement refusé.
- Deux dépôts pour la dernière place : cinq ouverts au maximum ; après refus concurrent et libération d'une place, le dépôt peut reprendre.
- Premier dépôt annulé : la requête en attente aboutit et reste la seule persistante.
- Acceptation puis refus concurrent, et ordre inverse : une seule décision, un seul audit, effet d'exclusion cohérent et note lisible par le joueur.
- Première décision annulée : l'autre administrateur décide ; effet et audit de la transaction abandonnée absents.
- Profil/XP/crédits et autres séances restent strictement identiques.

Une sonde affaiblit délibérément le plafond5→6 dans la seule base jetable et exige que le scénario de dernière place échoue pour la raison attendue. La définition exacte de la RPC est restaurée dans finally, puis les scénarios normaux passent. Aucune mutation de ce genre sur une base réelle.

Le banc refuse d'abord les bases dont le nom ne commence pas par titan_test_, impose ON_ERROR_STOP et des délais, termine les processus en échec et supprime ses identités/audits synthétiques. Le runner est branché dans les deux voies natives existantes ; le refus de postgres est vérifié avant fixtures.

## Validation et limites

Avant publication : baseline et verify255/255 ; syntaxe Python compatible3.11 et bash vérifiées, refus préalable exercé avec un adaptateur local de commande. PostgreSQL natif absent du poste : cette vérification locale ne prouve ni course ni sensibilité SQL. La CI17.6 doit confirmer les deux voies, les sondes RED→GREEN et tous les parcours avant PR prête.

Aucune règle produit modifiée, aucune nouvelle migration, aucun compte réel ou déploiement. CHEAT19 reste partiel pour le formulaire joueur et l'information après exclusion. QA05 reste partiel pour appareils/Android ; QA08 ne devient pas une preuve de reprise réseau réelle.

Bloquant avant PR prête : deux voies PostgreSQL17.6 et CI complète, revue indépendante. Non bloquant : pg_cron fournisseur, données/appareils réels et interfaces joueur. Prochain macro-bloc : terminer le parcours de recours côté joueur quand le claim Profil est libéré, puis intégrer explicitement les retenues après leur passation ; pas de nouvelle boucle de libellés.

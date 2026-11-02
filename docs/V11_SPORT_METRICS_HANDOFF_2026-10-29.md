# V1.1 — métriques multisport et correction des séances

Ce lot avance **V11-09R et REC-07**, selon le cahier Google Docs du 29 octobre. Base : `claude/titan-cahier-charges-0k7cdn` à `37c46dd`. Branche de continuation : `codex/v11-sport-metrics-20261029`. Aucune modification de main, du client Android, des secrets ni de la production.

## Comportement obtenu sur branche

- Les **260 sports actifs**, lus en production sans écriture, ont un schéma de métriques versionné : identifiants, libellés, types, unités, bornes, précision et priorités. Associations explicites par discipline/famille, avec adaptations des cas atypiques : apnée/plongée/plongeon, pentathlon, biathlon/combiné nordique, ski de randonnée, dressage, courses hippiques, sauvetage, etc.
- L'instantané hors ligne contient les champs, y compris pour les sports déjà créés par les anciens catalogues de secours. Les lignes réellement reçues du serveur restent prioritaires pour rester compatibles avec son schéma.
- Trois mesures supplémentaires au premier niveau ; toutes les autres restent accessibles dans les détails facultatifs. La limite des huit détails est retirée. Les formulaires musculation et escalade sauvegardent aussi leurs précisions. L'absence reste distincte de zéro et de faux.
- Le Journal permet de corriger les mesures, effacer une valeur optionnelle et conserver les identifiants historiques inconnus. Les champs conditionnels suivent leur contrôleur. Les bornes et valeurs historiques, le sens des statistiques et les métadonnées économiques sont préservés.
- La validation serveur des corrections utilise le catalogue du sport. La RPC conserve ses contrôles d'identité, propriétaire, suspension, révision et tailles. Aucun gain d'XP/crédit par édition ; aucun nouvel endpoint public.

## Preuves et limites

`pnpm run verify` : **376 tests unitaires**, contrôle de types, build public, audit de publication et contrôle de release verts. Les avertissements de longueurs de métadonnées SEO préexistants ne sont pas traités dans ce lot.

`tests/e2e/sport-measures.e2e.mjs` vérifie des parcours réels de saisie/sauvegarde/correction, données absentes, champ faux, conditions, plus de onze métriques et les **260 formulaires à 360 px**, avec comparaison du schéma effectivement chargé. Les champs métier ne sont pas remplacés par des fixtures dans le parcours de couverture. Captures yoga/musculation relues à 360 px ; espacement des résumés corrigé.

SQL vérifié sur **PostgreSQL embarqué PGlite**, avec 260 lignes publiques et comptes fictifs : migration 31 puis 50, anciens tests des 81 sports, nouveaux contrats de métriques, édition par la vraie définition de RPC, refus inter-comptes et de révision périmée, XP inchangée, rejeu idempotent, conservation des IDs historiques/personnalisés. Reproduction rouge de la RPC ancienne avant correction puis verte avec le lot. Aucun accès d'écriture à Supabase distant.

Le banc complet PostgreSQL natif de toutes les migrations et ses tests de concurrence n'a pas été exécuté ici. Les suites navigateur complètes lancées sur une candidate intermédiaire ont été arrêtées ; elles ne constituent pas une validation finale globale. Les parcours ciblés de la tête finale sont distingués dans la PR.

## Intégration et reprise

Migration préparée **50** : `20261029160655_sport_metrics_260.sql`. Générateur : `tools/build-sport-metrics.mjs --sql`. Les portes du lot passent à **21 migrations V1.1** (30 à 50). Appliquer d'abord sur copie restaurée ; la migration 50 doit précéder le nouveau formulaire de correction. Retour arrière décrit dans `V11_RELEASE_PLAN.md`.

Matrice consultable : [les 260 sports](qa/V11_SPORT_METRICS_MATRIX.md), avec [schémas détaillés](qa/V11_SPORT_METRICS_MATRIX.json). Génération : `node tools/build-sports-catalog.mjs` puis `node tools/build-sport-metrics.mjs`. Le test de parité détecte un instantané non régénéré.

**V11-09R reste ouvert** pour la recette Android native, la synchronisation sur téléphone réel, la revue métier par des athlètes et le déploiement autorisé. La couverture des schémas web n'est pas une livraison complète des 260 disciplines sur tous supports. Restent également GPS/GPX enrichi, Health Connect, Coach et RPG suivant le cahier. FIN-CHEAT, FIN-SEC et FIN-SEO demeurent différés.

# CHEAT16 / CHEAT17 / CHEAT18 — quotas de séances

## Livraison locale, publication bloquée

Branche `codex/web-training-rate-limits-cdc`, issue de Claude `dbdc91d` et du checkpoint PR102 `ddff513` réunis par le merge local `0f9445b`. Reproduction initiale `0f55ccc`. Aucun changement de production, aucune fusion main. L'envoi GitHub a été rejeté par la revue automatique : elle demande une autorisation explicite pour divulguer les fichiers du projet vers ce dépôt. Aucune autre voie d'envoi n'a été utilisée ; aucune PR ni CI de ce lot n'est revendiquée.

## Comportement

- Une treizième création dans une heure reste refusée même après suppression physique des douze premières. Les quotas existants restent 12 créations/heure et 40/24 h ; les imports historiques, sans gains, gardent leur propre quota de 300/24 h.
- Les modifications, y compris archivage/restauration, ont une fenêtre roulante de 120/heure et 600/24 h. Un refus annule aussi le snapshot de révision et tous les effets de la transaction.
- Le reçu existant est relu avant toute mutation : le rejeu conserve exactement sa réponse sans dépenser de quota ni créditer de nouveau. Le serveur décide de la catégorie historique ; le client ne choisit pas le compteur.
- `private.titan_training_rate_state` contient uniquement UUID, catégorie fermée, horodatages serveur et date de mise à jour. Trois lignes maximum par compte, 940 horodatages maximum. Aucune lecture/modification API ni appel direct du trigger. Les horodatages antérieurs à 24 h sont retirés à la prochaine mutation de cette catégorie ; une purge quotidienne élimine les lignes inactives si pg_cron existe (sinon maintenance SQL à configurer). La suppression du compte supprime aussi son état.
- Le verrou de ligne du compteur sérialise les mutations d'une catégorie. L'horloge est lue après attente. Les RPC conservent leurs verrous de profil et leur contrat.
- À quota plein, un signal faible ne contient que l'opération et quatre compteurs/limites. Un nouveau refus émet `TITAN_TRAINING_RATE_LIMIT` par PostgreSQL LOG, hors rollback. Un INSERT en table suivi d'une exception n'aurait pas persisté.

**Décision :** aucun trigger DELETE. Les clients n'ont pas ce privilège sur les séances ; le compteur survit aux suppressions privilégiées. Le droit à la suppression de compte doit rester utilisable, même à quota épuisé. Coût : maintenance service et modération d'un autre compte restent des chemins de confiance hors quota. Aucun nouvel avantage sportif, retrait de gain, bannissement ou exclusion automatique.

## Fichiers

- `supabase/migrations/20261019122259_training_mutation_rate_limits.sql`, généré par la CLI Supabase, n'applique rien à une base réelle.
- `sql/tests/300_training_rate_limits.sql` : suppression/recréation, reçu, rollback, modifications, seuils quotidiens, expiration/purge, ACL/RLS, séparation des propriétaires, effacement à quota épuisé.
- `sql/tests/300_z_training_rate_migration.sql` : réapplication sans remise à zéro, un seul trigger, timeout et transaction appelante préservés.
- `tools/db/test-training-rate-concurrency.py` et son branchement dans `tools/db/test-migrations.sh` : deux connexions réelles, dernier quota puis rejeux concurrents ; refuse tout nom de base hors `titan_test_`. Préparé, syntaxe vérifiée, exécution native en attente.
- Deux fixtures RPG seulement : la compression administrative de quatre jours vieillit également le compteur dans `300_adventure_multisport.sql` ; le lot d'historique synthétique dans `300_adventure_personal_targets.sql` utilise explicitement service_role. Ni condition de victoire, ni cible, ni récompense, ni exemption de test produit modifiée.
- Plan de production porté à 17 migrations et version ajoutée aux deux listes du SELECT préalable, sans changement de ses autres conditions ni du rollback RPG.

## Vérification et limites

`pnpm run verify` : 238/238 tests, build, audit avec 16 avertissements existants et garde de publication réussis. Pas de code client modifié.

SQL local : PGlite 0.5.10 / PostgreSQL 18.6, base éphémère `titan_test_rate`, schéma de référence sans données utilisateurs et migrations natives du dépôt. La reproduction a échoué avant correction avec « thirteenth recreated session was accepted », puis passe avec la migration. Les deux nouveaux fichiers SQL passent ; une revue indépendante Astra élevée les a aussi exécutés, sans Critical/Important confirmé. Le test d'effacement a ensuite été renforcé avec un compteur effectivement saturé.

Le banc étendu local n'est **pas intégralement vert** : quatre échecs de compatibilité/harness également reproduits sur le parent, dans `300_adventure_quests.sql` (UTC daily grouping), `300_training_anticheat.sql` (before date floor), `300_z_analytics_migration.sql` (setting vide) et `300_z_cosmetic_migration.sql` (commande psql non interprétée). Ce résultat n'est pas une validation PostgreSQL 16. Les fichiers SQL sont exécutés via un wrapper de scratch qui développe les `\ir` et utilise une connexion embarquée ; il ne remplace pas le banc officiel avec des processus psql séparés.

Non vérifiés : PostgreSQL 16 natif, concurrence de connexions réelles, E2E complet sur cette tête, installation/exécution pg_cron, paramètres de journalisation du fournisseur et conservation de ses logs. Les champs de nos messages sont minimaux ; le contexte/statement éventuellement ajouté par PostgreSQL dépend de sa configuration et n'est pas certifié. Les refus de l'ancien garde, exécuté avant ce nouveau trigger, conservent leur comportement antérieur.

## Retour arrière

Dans une transaction opérateur, avec `lock_timeout='5s'`, désactiver uniquement le trigger `titan_limit_training_mutation` sur `public.training_logs`. S'il a été installé, désactiver le job pg_cron nommé `titan_purge_training_rate_state`. Conserver la table, ses compteurs et les fonctions : aucun solde, reçu, séance ou snapshot n'a besoin d'être restauré. Réactiver le même trigger pour reprendre. Le retrait de cette protection rétablit la limite antérieure fondée sur les séances restantes ; aucune promesse de protection pendant cette suspension. Ne pas tronquer les compteurs pour tester la reprise. La migration se réapplique sans effacer l'état.

## Statuts et suite

- **CHEAT16 [~]** : correctif et contrats locaux prêts ; validation native/concurrente avant clôture.
- **CHEAT17 [~]** : séances couvertes ; les autres endpoints sensibles restent à inventorier, aucun achèvement global revendiqué.
- **CHEAT18 [~]** : signaux minimaux de ce lot ; visibilité des refus de l'ancien garde, rétention fournisseur et autres signaux anti-triche restent ouverts.

**Bloquant maintenant :** autorisation explicite d'envoi de la branche GitHub pour PR et CI officielle. Ne pas déployer ce lot sur les seules preuves locales.

**Non bloquant / backlog finition :** seuils d'édition conservateurs à observer, autres endpoints et journalisation globale à poursuivre dans leur macro-bloc ; pas de nouvelle micro-PR UX.

**Prochain lot :** publier cette branche après autorisation, faire passer les deux voies PostgreSQL16 et le contrat de concurrence, puis reprendre ACT01/ACT02/ACT04, les trois frictions déjà documentées par PR102. Préserver les chantiers actifs déclarés entre-temps. Périmètre d'implémentation de ce lot libérable après handoff ; aucune reprise silencieuse de publication.

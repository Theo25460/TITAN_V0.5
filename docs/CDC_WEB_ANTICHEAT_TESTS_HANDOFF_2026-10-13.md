# Passation — QA03, contrats anti-triche serveur existants

## Résultat et périmètre

Nouvelle suite transactionnelle `sql/tests/300_training_anticheat.sql`, découverte automatiquement par les deux voies du runner PostgreSQL16 existant. 32 cas : 18 refus métriques/date/diagnostics, neuf acceptations normales/aux bornes, trois limites de fréquence/import et deux seuils de signalement qui acceptent encore la séance. Les appels exécutent le RPC réel sous `authenticated` ; les fixtures initiales sont synthétiques. `plpgsql.check_asserts` est forcé à `on`, chaque erreur attendue vérifie SQLSTATE et message, le helper temporaire garde les droits de l'appelant. L'intégralité est annulée à la fin.

Les refus précoces et ceux du trigger doivent ne laisser ni séance, reçu, balance modifiée ni consommation d'allocation hebdomadaire. Les limites de fréquence utilisent `created_at` distinct de la date de séance. Chaque cas accepté utilise un propriétaire neuf pour éviter qu'une limite d'envois masque une borne. Import ancien accepté sans XP/coins et marqué inéligible ; points GPS1200 acceptés/1201 refusés, bornes date/distance/durée/valeur/élévation testées.

Les seuils souples journalisent un signal et acceptent la séance selon le contrat actuel ; ce test ne promet pas une exclusion des récompenses que le code n'applique pas. Les bornes sont celles du moteur versionné, pas des références à des records humains. Score de risque modulaire, chevauchements, faux positifs sportifs, recours et journalisation persistante d'un refus après rollback restent ouverts. QA03 avance seulement en `[~]` après preuve ; aucun CHEATxx n'est clôturé.

## Isolation et invariants

Branche `codex/web-anticheat-tests-cdc` dans le worktree lié déjà isolé. Parent PR #54 prête/ouverte/non fusionnée, publié41fa269ade3050e68e5f9cb1279680e402b75f94, localef7feff33de315f324fabcf613c6e1e440d6316f ; arbre identiquede646380a7858e95b997442f3f2a8b114c5e4c59. Deux fichiers propres au lot : SQL de test et présente passation. Aucun moteur, migration, règle économique, frontend, asset, compte/base réelle, Android, main, fusion ou déploiement modifié. Les claims WORK et audit RPG01, 307 formulations et42 ajouts juridiques sont conservés.

## Validation

Baseline du parent : verify183/183, E2E257/257, CI #71 trois jobs/deux voies SQL verts. Nouveau lot : `pnpm verify` exit0,183/183 ; source produit inchangée. PostgreSQL local absent ; installation système refusée par les permissions setgroups/seteuid. Aucun passage SQL local revendiqué. La CI du HEAD publié doit confirmer explicitement l'exécution de cette nouvelle suite et les deux messages `OK: migrations and tests passed on a clean replica.` avant remise.

C'est une suite ajoutée sur un comportement existant : aucune modification produit n'est justifiée par un RED artificiel. Une revue indépendante unique est demandée ; ses remarques et la preuve CI sont consignées dans la PR et le CDC après résolution. Aucun résultat de mutation ou de conformité globale non exécuté n'est revendiqué.

Références techniques : fonctions versionnées `titan_submit_training_session`/`titan_guard_training_log` dans `20261005160000_ascension_progression_v300.sql`, migrations correctives suivantes, runner `tools/db/test-migrations.sh`, [ASSERT PostgreSQL16](https://www.postgresql.org/docs/16/plpgsql-errors-and-messages.html#PLPGSQL-STATEMENTS-ASSERT).

# Passation — QA03 / SEC10, ingestion et autorité des récompenses

## Contrats ajoutés

La nouvelle suite transactionnelle `300_training_trust.sql` appelle le vrai RPC de séance sous le rôle `authenticated`, avec des identités synthétiques et rollback intégral. Aucun moteur, règle économique, migration ou droit n'est modifié.

Trois familles de parcours :

- Métadonnées forgées sur séance actuelle puis ancienne : les récompenses, éligibilité, version, effort, quota et marqueurs historiques persistés viennent du serveur. Les balances et le quota correspondent aux récompenses retournées. Ces contrôles concernent les champs canoniques, pas une suppression globale des champs libres client.
- Refus par le trigger après calcul du quota : aucune séance, reçu, balance ou allocation ; le même UUID peut être corrigé puis rejoué. Un seul log/reçu et balances/quota inchangés après le rejeu exact.
- Treize imports anciens sans récompense n'occupent pas les douze places de fréquence réelle. Douze séances actuelles portant `historical=true` falsifié restent classées actuelles ; la treizième est refusée sans séance/reçu/consommation de balance ou quota.

Les deux assertions persistées `profiles` et `training_logs.xp` manquantes sur l'ancien import accepté de la suite précédente sont ajoutées. Elles traitent le Minor de la revue PR #55 sans toucher aux autres 32 cas.

Ces tests ne prouvent pas la véracité d'un effort déclaré, la provenance d'un import externe, une déduplication multi-source, un score de risque par sport, ni une journalisation des refus durable après rollback. Les limites restent celles du moteur versionné. QA03 et SEC10 restent partiels ; aucun CHEATxx n'est clôturé.

## Isolation et vérification

Worktree `titan-training-trust`, branche `codex/web-training-trust-cdc`, parent PR #55 prête/ouverte/non fusionnée, HEAD3974616cd847794ba8ee6646d4b1ebbca35a2cd1, arbre3853d33c4d26e58b4765362302da791c155fd393. Trois fichiers propres au lot : nouvelle suite SQL, deux assertions dans la suite anti-triche précédente, présente passation. Backend déployé, frontend, assets, Android, main, fusion/déploiement et données réelles inchangés. Les claims WORK/RPG01,307 formulations et42 ajouts juridiques sont préservés.

Baseline locale `pnpm verify` sur le parent :183/183, build/audit réussis ; PostgreSQL absent ici. Aucun passage SQL local ni mutation du moteur revendiqué. La preuve SQL doit venir des deux répliques PostgreSQL16 de la CI exacte, lesquelles découvrent automatiquement la nouvelle suite. Le parent CI #72 possède183/257 et deux voies SQL vertes ; cela ne remplace pas les checks du nouveau HEAD.

Une revue indépendante unique est exigée avant remise ; détails de ses conclusions, CI exacte, SHA et lecture native du CDC consignés dans la PR. Les assertions sont activées explicitement. Les callbacks utilisateur passent sous authenticated ; seul le montage/contrôle des fixtures est privilégié. Toutes les données sont annulées en fin de test.

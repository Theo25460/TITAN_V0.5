# V1.3 — Vérifications serveur

Les essais du 9 novembre 2026 utilisent une base jetable reconstruite depuis `tools/db/baseline`. Le banc embarqué utilise PGlite 0.3.14 avec des données de recette synthétiques.

| Commande | Résultat |
| --- | --- |
| `node --test tests/production-plan.test.mjs` | 6 tests réussis. La borne V1.1 conserve ses 34 migrations. La V1.3 a son propre lot et son contrôle en lecture seule. |
| `node tools/db/test-journey-pglite.mjs /chemin/vers/@electric-sql/pglite` | Replay intégral, réapplication et tests des sentiers réussis. Snapshot testé dans une transaction `READ ONLY`. Dix synchronisations identiques, isolation, MAX par jour, consentement, bornes, catalogue retiré, dates conservées, export, suppression de compte et XP/crédits vérifiés. |
| `tools/db/postflight-v13.sql` dans ce même banc | Structure migrée acceptée. Neuf mutations bloquées, couvrant historique absent ou inconnu, accès direct, RLS, volatilité du snapshot, droits RPC, unicité des acquis et chaîne d’export. |
| `node tools/db/test-sql-security-pglite.mjs /chemin/vers/@electric-sql/pglite` | Contrôle historique V1.1 réussi avec V1.3 présente. Dix mutations bloquées, dont une version inconnue V1.1 et des ruptures de la chaîne d’export RPG. |
| `node tools/db/test-adventure-rpg-pglite.mjs /chemin/vers/@electric-sql/pglite` | Simulation de 28 jours et réapplication réussies. |
| `node tools/db/test-session-holds-pglite.mjs /chemin/vers/@electric-sql/pglite` | Durées, récompenses, révisions et isolation vérifiées. |

Le scénario d’horizon complet atteint 30 millions de pas sur 150 jours acceptés et révèle les 304 découvertes et sept titres. Les fixtures multi-sources étendent les contraintes uniquement dans une transaction annulée. Le canal quotidien réel reste Santé Connect.

La régression `test-journey-pglite.mjs … --regression` a exécuté 85 autres scripts SQL. 79 ont réussi et six échouent dans le banc embarqué. Dix-huit scripts demandant des méta-commandes `psql` sont exclus de ce banc et listés dans sa sortie.

| Scripts | Cause observée |
| --- | --- |
| `300_account_deletion.sql`, `300_coach_seats.sql`, `300_coach_tools.sql` | `extensions.gen_random_bytes()` requiert `pgcrypto`, absent du banc embarqué. |
| `300_adventure_multisport.sql`, `300_adventure_personal_targets.sql` | La garde exige une base `titan_test_*` et PGlite utilise `template1`. |
| `300_risk_analysis.sql` | L’assertion de visibilité du verrou consultatif dans `pg_locks` échoue dans ce moteur. |

Le banc PostgreSQL natif reste nécessaire pour ces six scripts, les méta-commandes `psql` et les épreuves multi-connexions. La recette d’ingestion sur téléphone et les vérifications après application relèvent de la préparation de release. [V13_RELEASE_PLAN.md](V13_RELEASE_PLAN.md)

# Répétition sauvegarde → restauration → migrations

Reproduit l'opération documentée dans `docs/REPETITION_RESTAURATION_2026-10-21.md`. **Aucune donnée ici** : ces
fichiers ne contiennent que des requêtes et un script.

| Fichier | Rôle |
|---|---|
| `export-production.sql` | **un seul `SELECT`** (lecture seule) : instantané de 40 tables + nombre de lignes et empreinte de chacune dans le même instantané. À exécuter sur la production ; garder le résultat **hors dépôt, chiffré**. |
| `restore.py <sauvegarde.json>` | produit un `restore.sql` : tables `auth` typées, métadonnées `storage`, chargement table par table, déclencheurs désactivés pendant le chargement, séquences recalées. À jouer en une transaction sur une base **distincte**, vidée au préalable. |
| `structure-fingerprint.sql` | empreinte par objet (colonnes, contraintes, index, fonctions, politiques, déclencheurs, droits). À exécuter sur la production et sur la copie : elles doivent coïncider. |
| `all-table-sums.sql` | nombre de lignes et empreinte de **toutes** les tables : photo avant/après les migrations. |

Points d'attention (mesurés, voir le document) : les fonctions de production contiennent des fins de ligne `\r\n`
(normaliser avant de comparer) ; le tri dépend de la locale (comparer avec `collate "C"`) ; PostgreSQL 17 ajoute le droit
`MAINTAIN` absent de la 16 (l'ignorer) ; l'API d'export renvoie `1.0` sous la forme `1`.

N'exportez ni `auth.sessions` ni `auth.refresh_tokens` : ce sont des jetons actifs.

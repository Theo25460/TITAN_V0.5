# Migrations Supabase

`supabase/migrations/` reproduit **exactement** l'historique appliqué au projet `oubmftfufwwzwpgvrcag`
(table `supabase_migrations.schema_migrations`). Chaque fichier porte la version enregistrée en production ;
le contenu a été vérifié par empreinte MD5 le 2026-10-05 (37/37).

Règles :

1. Une évolution de schéma = un nouveau fichier `AAAAMMJJHHMMSS_nom.sql`, jamais la modification d'un fichier existant.
2. Une migration est non destructive par défaut, idempotente quand c'est possible, et compatible avec le front déjà déployé.
3. Avant application : exécution dans une transaction annulée avec les tests de `sql/tests/`.
4. Après application en production, la version enregistrée par Supabase fait foi : renommer le fichier local si elle diffère.
5. `sql/` est un historique (scripts, audits, anciennes versions). Il n'est plus la source de vérité du schéma.

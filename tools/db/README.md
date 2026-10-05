# Local migration bench

`tools/db/test-migrations.sh` builds a throwaway Postgres 16 database from the **production
structure snapshot** in `tools/db/baseline/` (tables, constraints, indexes, functions, triggers,
RLS policies and grants, read-only from `pg_catalog` on 2026-10-05, **no user data**), replays the
pending migrations from `supabase/migrations/` and runs `sql/tests/300_*.sql`.

```bash
pnpm run test:db            # pending migrations from 20261005150000
tools/db/test-migrations.sh 20261005200000   # replay from a given version
```

- `supabase-shim.sql` stands in for the pieces of Supabase the migrations rely on: API roles,
  `auth.users` and `auth.uid()/role()/jwt()` reading `request.jwt.claims`.
- `baseline/06-reference-data.sql` holds catalogue rows only (adventure worlds, sports).
- Refresh the snapshot after each production deploy: rerun the catalogue queries documented in
  `docs/DEPLOYMENT.md` and extract them with `extract-mcp-result.py`.

This bench never connects to the real project. A green run is required before applying a
migration to production.

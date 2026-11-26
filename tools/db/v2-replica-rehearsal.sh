#!/usr/bin/env bash
# V2.0 (A2) — rehearse the canonical packages release-v2-* on a SYNTHETIC replica of the current production state: the structure
# snapshot, every migration up to the production head (tools/db/production-head.txt) and a registry seeded like production's,
# then synthetic old accounts in every table (tools/db/v2-replica-rehearsal.py). Never connects to the real project.
# Usage: tools/db/v2-replica-rehearsal.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-54329}"
DIR="${TITAN_PG_DIR:-/tmp/titan-pg}"
DB="titan_test_replica_$$"
HEAD="$(cat "$ROOT/tools/db/production-head.txt")"
if ! "$PGBIN/pg_isready" -h "$DIR" -p "$PORT" >/dev/null 2>&1; then
  rm -rf "$DIR"; mkdir -p "$DIR"
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown postgres:postgres "$DIR"
  su postgres -c "$PGBIN/initdb -D $DIR/data -A trust -U postgres >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log.txt start >/dev/null"
  sleep 2
fi
PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null
trap '"${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT
echo "Replica at the production head $HEAD (structure snapshot, no data)"
"${PSQL[@]}" -d "$DB" -f "$ROOT/tools/db/supabase-shim.sql" >/dev/null
for f in "$ROOT"/tools/db/baseline/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null; done
values=""
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"; n="$(basename "$f" .sql | cut -d_ -f2-)"
  [[ "$v" > "$HEAD" ]] && continue
  values+="${values:+,}('$v','$n')"
  [[ "$v" < "20261005150000" ]] && continue
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>&1
done
"${PSQL[@]}" -d "$DB" -c "insert into supabase_migrations.schema_migrations(version, name) values $values on conflict do nothing" >/dev/null
echo "  · registry (migrations, head): $("${PSQL[@]}" -d "$DB" -At -F ', ' -c 'select count(*), max(version) from supabase_migrations.schema_migrations')"
python3 "$ROOT/tools/db/v2-replica-rehearsal.py" "${PSQL[@]}" -d "$DB"

#!/usr/bin/env bash
# Replay TITAN's pending migrations on a throwaway local Postgres built from the production
# structure snapshot (tools/db/baseline, no data), then run the SQL tests in sql/tests.
# Usage: tools/db/test-migrations.sh [first-migration-version]   (default: 20261005150000)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-54329}"
DIR="${TITAN_PG_DIR:-/tmp/titan-pg}"
FROM="${1:-20261005150000}"
DB="titan_test_$$"

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

run() { echo "  · $(basename "$1")"; "${PSQL[@]}" -d "$DB" -f "$1"; }
echo "Baseline (production structure, no data)"
run "$ROOT/tools/db/supabase-shim.sql"
for f in "$ROOT"/tools/db/baseline/*.sql; do run "$f"; done
echo "Pending migrations from $FROM"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" < "$FROM" ]] && continue
  run "$f"
done
echo "SQL tests"
for f in "$ROOT"/sql/tests/300_*.sql; do run "$f"; done
echo "OK: migrations and tests passed on a clean replica."

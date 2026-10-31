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

TITAN_PG_VERSION_NUM="$("${PSQL[@]}" -d "$DB" -At -c "show server_version_num")"
echo "Disposable PostgreSQL server_version_num=$TITAN_PG_VERSION_NUM"
if [[ -n "${TITAN_EXPECT_PG_VERSION_NUM:-}" && "$TITAN_PG_VERSION_NUM" != "$TITAN_EXPECT_PG_VERSION_NUM" ]]; then
  echo "Unexpected PostgreSQL version: expected $TITAN_EXPECT_PG_VERSION_NUM, got $TITAN_PG_VERSION_NUM"; exit 1
fi

run() { echo "  · $(basename "$1")"; "${PSQL[@]}" -d "$DB" -f "$1"; }
echo "Baseline (production structure, no data)"
run "$ROOT/tools/db/supabase-shim.sql"
for f in "$ROOT"/tools/db/baseline/*.sql; do run "$f"; done
if [[ -n "${RELEASE_SQL:-}" ]]; then
  echo "One-shot release file $RELEASE_SQL"
  run "$ROOT/$RELEASE_SQL"
  echo "  · second run must refuse and change nothing"
  if "${PSQL[@]}" -d "$DB" -f "$ROOT/$RELEASE_SQL" >/dev/null 2>&1; then echo "release file ran twice"; exit 1; fi
  echo "Follow-up migrations not included in the historical release file"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    v="$(basename "$f" | cut -d_ -f1)"
    [[ "$v" < "$FROM" ]] && continue
    [[ "$v" =~ ^[0-9]{14}$ ]] || { echo "invalid migration version"; exit 1; }
    included=$("${PSQL[@]}" -d "$DB" -At -c "select exists(select 1 from supabase_migrations.schema_migrations where version='$v')")
    [[ "$included" == "t" ]] || run "$f"
  done
else
  echo "Pending migrations from $FROM"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    v="$(basename "$f" | cut -d_ -f1)"
    [[ "$v" < "$FROM" ]] && continue
    run "$f"
  done
fi
echo "SQL tests"
for f in "$ROOT"/sql/tests/300_*.sql; do run "$f"; done
echo "Economy migration preserves caller transaction"
run "$ROOT/tools/db/test-economy-migration.sql"
echo "Release preflight and postflight gates (rollback-only disposable fixtures)"
if guard=$(python3 "$ROOT/tools/db/test-release-gates.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "release gate runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: release gate tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · release gate non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-release-gates.py" "${PSQL[@]}" -d "$DB"
echo "V1.1 postflight gate (rollback-only)"
if guard=$(python3 "$ROOT/tools/db/test-v11-gates.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "V1.1 gate runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: the V1.1 gate tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
python3 "$ROOT/tools/db/test-v11-gates.py" "${PSQL[@]}" -d "$DB"
echo "Economy concurrency contracts (two real connections)"
if guard=$(python3 "$ROOT/tools/db/test-economy-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "concurrency runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: economy concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-economy-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Entitlement ownership concurrency contract (two real service-role connections)"
if guard=$(python3 "$ROOT/tools/db/test-entitlement-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "entitlement runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: entitlement concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · entitlement non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-entitlement-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Analysis views concurrency contracts (two real connections)"
if guard=$(python3 "$ROOT/tools/db/test-analysis-views-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "analysis views runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: analysis views concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · analysis views non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-analysis-views-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Support concurrency contracts (two real connections)"
if guard=$(python3 "$ROOT/tools/db/test-support-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "support runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: support concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · support non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-support-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Adventure concurrency contracts (two real connections)"
if guard=$(python3 "$ROOT/tools/db/test-adventure-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "adventure runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: adventure concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · adventure non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-adventure-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Training rate concurrency contracts (two real connections)"
if guard=$(python3 "$ROOT/tools/db/test-training-rate-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "training rate runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: training rate concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
python3 "$ROOT/tools/db/test-training-rate-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Appeals concurrency contracts (two real connections, with cap sensitivity probe)"
if guard=$(python3 "$ROOT/tools/db/test-appeals-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "appeals runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: appeals concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
echo "  · appeals non-test database refused before fixtures"
python3 "$ROOT/tools/db/test-appeals-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "Reward hold and appeal concurrency contracts (real overlapping connections)"
if guard=$(python3 "$ROOT/tools/db/test-reward-appeal-concurrency.py" "${PSQL[@]}" -d postgres 2>&1); then
  echo "reward/appeal runner accepted a non-test database"; exit 1
fi
[[ "$guard" == "Refused: reward and appeal concurrency tests require a titan_test_ disposable database" ]] || { echo "$guard"; exit 1; }
python3 "$ROOT/tools/db/test-reward-appeal-concurrency.py" "${PSQL[@]}" -d "$DB"
echo "OK: migrations and tests passed on a clean replica."

#!/usr/bin/env bash
# V1.9.5 — two real connections at the same time (a double tap, or a retry while the first answer is still on its way):
#   1. the same validation (same op_id) twice: one version, the second waits for the link lock and answers « already » with that version;
#   2. another validation from the same (now stale) reading: refused (COACH_CONFLICT), still one version;
#   3. the next cycle prepared twice at once: one draft, the second answers « already » with it.
# Usage: tools/db/test-coach-cycle-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the coach cycle report concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/coach-cycle/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cy_ids to authenticated" >/dev/null
q() { "${PSQL[@]}" -At -c "$1"; }
versions() { q "select string_agg(version::text, ',' order by version) from private.titan_coach_cycle_report_versions where report_id = (select v::uuid from public.cy_ids where k = 'r')"; }
# 1. Same validation twice.
"${PSQL[@]}" -At -v op=op -f "$HERE/coach-cycle/validate.sql" >"$OUT/v1.txt" 2>&1 &
"${PSQL[@]}" -At -v op=op -f "$HERE/coach-cycle/validate.sql" >"$OUT/v2.txt" 2>&1 &
wait
created=$(grep -l '|true|false|1' "$OUT/v1.txt" "$OUT/v2.txt" | wc -l); already=$(grep -l '|true|true|1' "$OUT/v1.txt" "$OUT/v2.txt" | wc -l); v=$(versions)
[[ "$created" == 1 && "$already" == 1 && "$v" == "1" ]] || { echo "validate: created=$created already=$already versions=$v"; cat "$OUT"/v*.txt; exit 1; }
echo "  same validation, two connections: $(grep -E '[|]true[|]' "$OUT/v1.txt" | cut -d'|' -f1-4) / $(grep -E '[|]true[|]' "$OUT/v2.txt" | cut -d'|' -f1-4)"
# 2. Another validation from the same reading.
"${PSQL[@]}" -At -v op=op2 -f "$HERE/coach-cycle/validate.sql" >"$OUT/v3.txt" 2>&1 || true
grep -q COACH_CONFLICT "$OUT/v3.txt" && [[ "$(versions)" == "1" ]] || { echo "stale reading not refused"; cat "$OUT/v3.txt"; exit 1; }
echo "  another validation from the same reading: COACH_CONFLICT, still version $(versions)"
# 3. Next cycle twice.
"${PSQL[@]}" -At -f "$HERE/coach-cycle/next.sql" >"$OUT/n1.txt" 2>&1 &
"${PSQL[@]}" -At -f "$HERE/coach-cycle/next.sql" >"$OUT/n2.txt" 2>&1 &
wait
created=$(grep -l '|true|false|Courir 12 km' "$OUT/n1.txt" "$OUT/n2.txt" | wc -l); already=$(grep -l '|true|true|Courir 12 km' "$OUT/n1.txt" "$OUT/n2.txt" | wc -l)
drafts=$(q "select count(*) from private.titan_coach_plans where origin->>'report_id' = (select v from public.cy_ids where k = 'r')")
[[ "$created" == 1 && "$already" == 1 && "$drafts" == 1 ]] || { echo "next: created=$created already=$already drafts=$drafts"; cat "$OUT"/n*.txt; exit 1; }
echo "  next cycle, two connections: $(grep -E '[|]true[|]' "$OUT/n1.txt" | cut -d'|' -f1-4) / $(grep -E '[|]true[|]' "$OUT/n2.txt" | cut -d'|' -f1-4)"
"${PSQL[@]}" -q -c "drop table public.cy_ids" >/dev/null
echo "OK: concurrent validations of a report create one version, a stale reading is refused, the next cycle is created once."

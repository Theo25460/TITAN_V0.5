#!/usr/bin/env bash
# V1.9.4 — two real connections at the same time (a double tap, or a retry while the first answer is still on its way):
#   1. the same programme sent twice: its sessions are created once, the second send waits for the link lock and answers « already »;
#   2. the same revision (same op_id) applied twice: one new version, the second waits and answers « already » with that version;
#   3. two different revisions from the same preview: the first applies, the second is refused (COACH_CONFLICT, the preview is stale).
# Usage: tools/db/test-coach-program-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the coach programme concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/coach-program/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cp_ids to authenticated" >/dev/null
q() { "${PSQL[@]}" -At -c "$1"; }
plan_rows() { q "select count(*) from public.coach_assignments where plan_id = (select v::uuid from public.cp_ids where k = '$1')"; }
versions() { q "select string_agg(version || ':' || kind, ',' order by version) from private.titan_coach_plan_versions where plan_id = (select v::uuid from public.cp_ids where k = '$1')"; }
# 1. Same send twice.
"${PSQL[@]}" -At -f "$HERE/coach-program/send.sql" >"$OUT/s1.txt" 2>&1 &
"${PSQL[@]}" -At -f "$HERE/coach-program/send.sql" >"$OUT/s2.txt" 2>&1 &
wait
created=$(grep -l '|true|false|3' "$OUT/s1.txt" "$OUT/s2.txt" | wc -l); already=$(grep -l '|true|true|3' "$OUT/s1.txt" "$OUT/s2.txt" | wc -l)
rows=$(plan_rows d); v=$(versions d)
[[ "$created" == 1 && "$already" == 1 && "$rows" == 3 && "$v" == "1:sent" ]] || { echo "send: created=$created already=$already rows=$rows versions=$v"; cat "$OUT"/s*.txt; exit 1; }
echo "  same programme, two sends: $(grep -E '[|]true[|]' "$OUT/s1.txt" | cut -d'|' -f1-4) / $(grep -E '[|]true[|]' "$OUT/s2.txt" | cut -d'|' -f1-4)"
# 2. Same revision (same op_id) twice.
"${PSQL[@]}" -At -v op=op -f "$HERE/coach-program/revise.sql" >"$OUT/r1.txt" 2>&1 &
"${PSQL[@]}" -At -v op=op -f "$HERE/coach-program/revise.sql" >"$OUT/r2.txt" 2>&1 &
wait
applied=$(grep -l '|true|false|2' "$OUT/r1.txt" "$OUT/r2.txt" | wc -l); replay=$(grep -l '|true|true|2' "$OUT/r1.txt" "$OUT/r2.txt" | wc -l); v=$(versions p)
pending=$(q "select count(*) from public.coach_assignments where plan_id = (select v::uuid from public.cp_ids where k = 'p') and pending_change is not null")
[[ "$applied" == 1 && "$replay" == 1 && "$v" == "1:sent,2:revision" && "$pending" == 2 ]] || { echo "revise: applied=$applied replay=$replay versions=$v pending=$pending"; cat "$OUT"/r*.txt; exit 1; }
echo "  same revision, two applications: $(grep -E '[|]true[|]' "$OUT/r1.txt" | cut -d'|' -f1-4) / $(grep -E '[|]true[|]' "$OUT/r2.txt" | cut -d'|' -f1-4)"
# 3. Another revision from the same (now stale) preview.
"${PSQL[@]}" -At -v op=op2 -f "$HERE/coach-program/revise.sql" >"$OUT/r3.txt" 2>&1 || true
grep -q COACH_CONFLICT "$OUT/r3.txt" && [[ "$(versions p)" == "1:sent,2:revision" ]] || { echo "stale preview not refused"; cat "$OUT/r3.txt"; exit 1; }
echo "  another revision from the same preview: COACH_CONFLICT, still $(versions p)"
"${PSQL[@]}" -q -c "drop table public.cp_ids" >/dev/null
echo "OK: concurrent sends and replayed revisions of a programme create one set of proposals and one version; a stale preview is refused."

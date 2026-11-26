#!/usr/bin/env bash
# V1.9.6 — two real connections at the same time (a double tap on « Envoyer », or a retry while the first answer is still on its way):
#   1. the same send (same op_id) twice: three programmes, the second waits for the block's lock and answers « already » with the same results;
#   2. another send (new op_id) from the same, now stale, preview: refused (COACH_CONFLICT), still three programmes and six proposals.
# Usage: tools/db/test-coach-group-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the coach group concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/coach-group/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.gr_ids to authenticated" >/dev/null
q() { "${PSQL[@]}" -At -c "$1"; }
counts() { q "select (select count(*) from private.titan_coach_plans where basis->>'dispatch' = (select v from public.gr_ids where k = 'd')) || '/' ||
                     (select count(*) from public.coach_assignments a join private.titan_coach_plans p on p.id = a.plan_id where p.basis->>'dispatch' = (select v from public.gr_ids where k = 'd'))"; }
"${PSQL[@]}" -At -v op=op -f "$HERE/coach-group/send.sql" >"$OUT/s1.txt" 2>&1 &
"${PSQL[@]}" -At -v op=op -f "$HERE/coach-group/send.sql" >"$OUT/s2.txt" 2>&1 &
wait
first=$(grep -l '|true|false|3' "$OUT/s1.txt" "$OUT/s2.txt" | wc -l); already=$(grep -l '|true|true|3' "$OUT/s1.txt" "$OUT/s2.txt" | wc -l); n=$(counts)
[[ "$first" == 1 && "$already" == 1 && "$n" == "3/6" ]] || { echo "send: first=$first already=$already counts=$n"; cat "$OUT"/s*.txt; exit 1; }
echo "  same send, two connections: $(grep -E '[|]true[|]' "$OUT/s1.txt" | cut -d'|' -f1-4) / $(grep -E '[|]true[|]' "$OUT/s2.txt" | cut -d'|' -f1-4)"
"${PSQL[@]}" -At -v op=op2 -f "$HERE/coach-group/send.sql" >"$OUT/s3.txt" 2>&1 || true
grep -q COACH_CONFLICT "$OUT/s3.txt" && [[ "$(counts)" == "3/6" ]] || { echo "stale preview not refused"; cat "$OUT/s3.txt"; exit 1; }
echo "  another send from the same preview: COACH_CONFLICT, still $(counts) programmes/proposals"
"${PSQL[@]}" -q -c "drop table public.gr_ids" >/dev/null
echo "OK: concurrent sends of a group block create each programme once, a stale preview is refused."

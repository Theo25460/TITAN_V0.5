#!/usr/bin/env bash
# V1.9.3 — two real connections send the same prepared proposal at the same time (a double tap, or a retry while the first answer is
# still on its way): one proposal is created, the other send waits for the link lock and is answered « already » with the same proposal.
# Usage: tools/db/test-coach-review-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the coach review concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/coach-review/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cr_ids to authenticated" >/dev/null
q() { "${PSQL[@]}" -At -c "$1"; }
"${PSQL[@]}" -At -f "$HERE/coach-review/send.sql" >"$OUT/a.txt" 2>&1 &
"${PSQL[@]}" -At -f "$HERE/coach-review/send.sql" >"$OUT/b.txt" 2>&1 &
wait
created=$(grep -l '|true|false|' "$OUT/a.txt" "$OUT/b.txt" | wc -l)
already=$(grep -l '|true|true|' "$OUT/a.txt" "$OUT/b.txt" | wc -l)
rows=$(q "select count(*) from public.coach_assignments where link_id = (select v from public.cr_ids where k = 'l')")
same=$(cat "$OUT/a.txt" "$OUT/b.txt" | grep -E '[|]true[|]' | cut -d'|' -f4 | sort -u | wc -l)
state=$(q "select state from private.titan_coach_review_drafts where id = (select v from public.cr_ids where k = 'd')")
[[ "$created" == 1 && "$already" == 1 && "$rows" == 1 && "$same" == 1 && "$state" == sent ]] || { echo "created=$created already=$already rows=$rows same=$same state=$state"; cat "$OUT"/*.txt; exit 1; }
echo "  same draft, two sends: $(grep -E '[|]true[|]' "$OUT/a.txt" | cut -d'|' -f1-3) / $(grep -E '[|]true[|]' "$OUT/b.txt" | cut -d'|' -f1-3)"
"${PSQL[@]}" -q -c "drop table public.cr_ids" >/dev/null
echo "OK: two concurrent sends of a prepared proposal create one proposal; the second waits for the lock and is answered « already »."

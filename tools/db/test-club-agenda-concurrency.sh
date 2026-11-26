#!/usr/bin/env bash
# V1.8.6 — two real connections answer « yes » to the last place of a meeting at the same moment: j answers and keeps her transaction
# open 1.5 s, k answers 0.3 s later. k waits for the club row lock, then finds the meeting full and is put on the waiting list: the number
# of « yes » never exceeds the capacity, and exactly one of the two waits.
# Usage: tools/db/test-club-agenda-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the club agenda concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/club-agenda/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cag_ids to authenticated" >/dev/null
"${PSQL[@]}" -At -v who=j -v hold=1.5 -f "$HERE/club-agenda/answer.sql" >"$OUT/j.txt" 2>&1 &
sleep 0.3
"${PSQL[@]}" -At -v who=k -v hold=0 -f "$HERE/club-agenda/answer.sql" >"$OUT/k.txt" 2>&1 &
wait
first=$(grep -c '|j|yes|2$' "$OUT/j.txt" || true)
second=$(grep -c '|k|waitlist|2$' "$OUT/k.txt" || true)
yes=$("${PSQL[@]}" -At -c "select count(*) from private.titan_club_event_answers where slot_id = (select v from public.cag_ids where k = 'slot') and answer = 'yes'")
waiting=$("${PSQL[@]}" -At -c "select count(*) from private.titan_club_event_answers where slot_id = (select v from public.cag_ids where k = 'slot') and answer = 'waitlist'")
"${PSQL[@]}" -q -c "drop table public.cag_ids" >/dev/null
[[ "$first" == 1 && "$second" == 1 && "$yes" == 2 && "$waiting" == 1 ]] || {
  echo "club agenda concurrency: first=$first second=$second yes=$yes waiting=$waiting"; cat "$OUT"/*.txt; exit 1; }
echo "OK: two « yes » for the last place at the same moment are serialised by the club lock; 2 places for a capacity of 2, the second one waits."
cat "$OUT"/*.txt | grep -E '^[0-9]{4}-' | sort

#!/usr/bin/env bash
# V1.9.1 — two real connections link at the same time. (1) the same proposal with two different sessions: one link, the other attempt
# waits for the row lock and is answered ALREADY_LINKED; (2) the same session on proposals of two different coaches: one link, the other
# waits for the session lock and is answered SESSION_ALREADY_LINKED. Both refusals are in the proposals' history.
# Usage: tools/db/test-coach-followup-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the coach follow-up concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/coach-followup/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cf_ids to authenticated" >/dev/null
q() { "${PSQL[@]}" -At -c "$1"; }
# (1) same proposal p1, sessions t1 and t2 at once.
"${PSQL[@]}" -At -v p=p1 -v t=t1 -f "$HERE/coach-followup/link.sql" >"$OUT/1a.txt" 2>&1 &
"${PSQL[@]}" -At -v p=p1 -v t=t2 -f "$HERE/coach-followup/link.sql" >"$OUT/1b.txt" 2>&1 &
wait
won=$(grep -l '|true|-$' "$OUT/1a.txt" "$OUT/1b.txt" | wc -l)
lost=$(grep -l '|false|ALREADY_LINKED$' "$OUT/1a.txt" "$OUT/1b.txt" | wc -l)
links=$(q "select count(*) from public.coach_assignments where id = (select v from public.cf_ids where k = 'p1') and session_id is not null")
refused=$(q "select count(*) from public.coach_assignments x, jsonb_array_elements(x.history) e where x.id = (select v from public.cf_ids where k = 'p1') and e->>'code' = 'ALREADY_LINKED'")
[[ "$won" == 1 && "$lost" == 1 && "$links" == 1 && "$refused" == 1 ]] || { echo "same proposal: won=$won lost=$lost links=$links refused=$refused"; cat "$OUT"/1*.txt; exit 1; }
echo "  same proposal, two sessions: $(grep -E '[|](true|false)[|]' "$OUT/1a.txt") / $(grep -E '[|](true|false)[|]' "$OUT/1b.txt")"
# (2) free session: which one p1 did NOT take; proposals p2 (coach 2) and p1's sibling are told apart by the coach.
free=$(q "select k from public.cf_ids where k in ('t1','t2') and v <> (select session_id from public.coach_assignments where id = (select v from public.cf_ids where k = 'p1'))")
q "update public.coach_assignments set status = 'accepted', session_id = null, revision = 2 where id = (select v from public.cf_ids where k = 'p1')" >/dev/null
taken=$(q "select k from public.cf_ids where k in ('t1','t2') and k <> '$free'")
"${PSQL[@]}" -At -v p=p1 -v t="$free" -f "$HERE/coach-followup/link.sql" >"$OUT/2a.txt" 2>&1 &
"${PSQL[@]}" -At -v p=p2 -v t="$free" -f "$HERE/coach-followup/link.sql" >"$OUT/2b.txt" 2>&1 &
wait
won=$(grep -l '|true|-$' "$OUT/2a.txt" "$OUT/2b.txt" | wc -l)
lost=$(grep -l '|false|SESSION_ALREADY_LINKED$' "$OUT/2a.txt" "$OUT/2b.txt" | wc -l)
links=$(q "select count(*) from public.coach_assignments where session_id = (select v from public.cf_ids where k = '$free')")
[[ "$won" == 1 && "$lost" == 1 && "$links" == 1 ]] || { echo "same session: won=$won lost=$lost links=$links (taken=$taken)"; cat "$OUT"/2*.txt; exit 1; }
echo "  same session, two coaches: $(grep -E '[|](true|false)[|]' "$OUT/2a.txt") / $(grep -E '[|](true|false)[|]' "$OUT/2b.txt")"
"${PSQL[@]}" -q -c "drop table public.cf_ids" >/dev/null
echo "OK: concurrent link attempts keep one coherent link; the second waits for the lock and is answered, not applied."

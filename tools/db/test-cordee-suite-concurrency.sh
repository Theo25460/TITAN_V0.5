#!/usr/bin/env bash
# V1.8.3 — two real connections propose the same route, pace and duration for the same finished cordée at the same time: exactly one
# canonical proposal, the second proposer waits for the row lock and accepts it, the group sets off once with both of them.
# Usage: tools/db/test-cordee-suite-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the proposal concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/cordee-suite/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cs_ids to authenticated" >/dev/null
"${PSQL[@]}" -At -v who=b -f "$HERE/cordee-suite/propose.sql" >"$OUT/b.txt" 2>&1 &
"${PSQL[@]}" -At -v who=c -f "$HERE/cordee-suite/propose.sql" >"$OUT/c.txt" 2>&1 &
wait
first=$(grep -l '|false|open$' "$OUT/b.txt" "$OUT/c.txt" | wc -l)
canonical=$(grep -l '|true|started$' "$OUT/b.txt" "$OUT/c.txt" | wc -l)
proposals=$("${PSQL[@]}" -At -c "select count(*) from private.titan_cordee_suites where from_id = (select v from public.cs_ids where k = 'id')")
started=$("${PSQL[@]}" -At -c "select count(*) from private.titan_cordee_suites where from_id = (select v from public.cs_ids where k = 'id') and status = 'started' and started_id is not null")
joined=$("${PSQL[@]}" -At -c "select count(*) from public.titan_challenge_members m join private.titan_cordee_suites s on s.started_id = m.challenge_id join public.cs_ids i on i.k in ('b', 'c') and i.v = m.user_id where s.from_id = (select v from public.cs_ids where k = 'id') and m.status = 'joined'")
cordees=$("${PSQL[@]}" -At -c "select count(*) from public.titan_challenges c join public.cs_ids i on i.k in ('b', 'c') and i.v = c.creator_id where c.kind = 'cordee'")
"${PSQL[@]}" -q -c "drop table public.cs_ids" >/dev/null
[[ "$first" == 1 && "$canonical" == 1 && "$proposals" == 1 && "$started" == 1 && "$joined" == 2 && "$cordees" == 1 ]] || {
  echo "proposal concurrency: first=$first canonical=$canonical proposals=$proposals started=$started joined=$joined cordees=$cordees"; cat "$OUT"/*.txt; exit 1; }
echo "OK: two simultaneous identical proposals give one canonical proposal; the second waits for the lock, accepts it, and one cordée sets off with both."
cat "$OUT"/*.txt | grep -E '^[0-9]{4}-' | sort

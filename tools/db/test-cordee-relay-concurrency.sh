#!/usr/bin/env bash
# V1.8.1 — two real connections transmit the relay of the same cordée at the same time: exactly one opener, the other is refused
# with RELAY_ALREADY_OPEN after waiting for the row lock. Usage: tools/db/test-cordee-relay-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the relay concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/cordee-relay/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cc_ids to authenticated" >/dev/null
"${PSQL[@]}" -At -v who=a -f "$HERE/cordee-relay/transmit.sql" >"$OUT/a.txt" 2>&1 &
"${PSQL[@]}" -At -v who=b -f "$HERE/cordee-relay/transmit.sql" >"$OUT/b.txt" 2>&1 &
wait
won=$(grep -l '|true$' "$OUT/a.txt" "$OUT/b.txt" | wc -l)
lost=$(grep -l 'RELAY_ALREADY_OPEN' "$OUT/a.txt" "$OUT/b.txt" | wc -l)
rows=$("${PSQL[@]}" -At -c "select count(*) from private.titan_cordee_relays where challenge_id = (select v from public.cc_ids where k = 'id')")
"${PSQL[@]}" -q -c "drop table public.cc_ids" >/dev/null
[[ "$won" == 1 && "$lost" == 1 && "$rows" == 1 ]] || { echo "relay concurrency: won=$won lost=$lost rows=$rows"; cat "$OUT"/*.txt; exit 1; }
echo "OK: two simultaneous transmissions give one opener; the second waits for the lock and is refused (RELAY_ALREADY_OPEN)."

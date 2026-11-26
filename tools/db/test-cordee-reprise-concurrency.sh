#!/usr/bin/env bash
# V1.8.2 — two real connections accept the same open handover at the same time: exactly one new holder, the other is refused with
# RELAY_HANDOVER_TAKEN after waiting for the row lock. Usage: tools/db/test-cordee-reprise-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the handover concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/cordee-reprise/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cr_ids to authenticated" >/dev/null
"${PSQL[@]}" -At -v who=c -f "$HERE/cordee-reprise/accept.sql" >"$OUT/c.txt" 2>&1 &
"${PSQL[@]}" -At -v who=d -f "$HERE/cordee-reprise/accept.sql" >"$OUT/d.txt" 2>&1 &
wait
won=$(grep -l '|true$' "$OUT/c.txt" "$OUT/d.txt" | wc -l)
lost=$(grep -l 'RELAY_HANDOVER_TAKEN' "$OUT/c.txt" "$OUT/d.txt" | wc -l)
holder=$("${PSQL[@]}" -At -c "select count(*) from private.titan_cordee_relays r join public.cr_ids i on i.k in ('c', 'd') and i.v = r.holder_id where r.challenge_id = (select v from public.cr_ids where k = 'id')")
accepted=$("${PSQL[@]}" -At -c "select count(*) from private.titan_cordee_relay_turns where challenge_id = (select v from public.cr_ids where k = 'id') and status = 'accepted'")
pending=$("${PSQL[@]}" -At -c "select count(*) from private.titan_cordee_relay_turns where challenge_id = (select v from public.cr_ids where k = 'id') and status = 'pending'")
"${PSQL[@]}" -q -c "drop table public.cr_ids" >/dev/null
[[ "$won" == 1 && "$lost" == 1 && "$holder" == 1 && "$accepted" == 1 && "$pending" == 0 ]] || {
  echo "handover concurrency: won=$won lost=$lost holder=$holder accepted=$accepted pending=$pending"; cat "$OUT"/*.txt; exit 1; }
echo "OK: two simultaneous acceptances give one holder; the second waits for the lock and is refused (RELAY_HANDOVER_TAKEN)."

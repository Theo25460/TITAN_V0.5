#!/usr/bin/env bash
# V1.8.4 — two real connections act on the same club season at the same moment: j joins and keeps his transaction open 1.5 s, the
# organiser stops the season 0.3 s later. The stop waits for the club row lock, then freezes a report that counts j: an explicit
# participation is never lost by a concurrent stop, and the season is stopped once.
# Usage: tools/db/test-club-season-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the club season concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/club-season/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.csn_ids to authenticated" >/dev/null
"${PSQL[@]}" -At -v who=j -v action=join -v hold=1.5 -f "$HERE/club-season/act.sql" >"$OUT/j.txt" 2>&1 &
sleep 0.3
"${PSQL[@]}" -At -v who=o -v action=stop -v hold=0 -f "$HERE/club-season/act.sql" >"$OUT/o.txt" 2>&1 &
wait
joined=$(grep -c '|join|1$' "$OUT/j.txt" || true)
stopped=$(grep -c '|stop|stopped:1$' "$OUT/o.txt" || true)
seasons=$("${PSQL[@]}" -At -c "select count(*) from private.titan_club_seasons where club_id = (select v from public.csn_ids where k = 'club') and status = 'stopped' and (summary->>'participants')::integer = 1")
open=$("${PSQL[@]}" -At -c "select count(*) from private.titan_club_seasons where club_id = (select v from public.csn_ids where k = 'club') and status = 'open'")
"${PSQL[@]}" -q -c "drop table public.csn_ids" >/dev/null
[[ "$joined" == 1 && "$stopped" == 1 && "$seasons" == 1 && "$open" == 0 ]] || {
  echo "club season concurrency: joined=$joined stopped=$stopped seasons=$seasons open=$open"; cat "$OUT"/*.txt; exit 1; }
echo "OK: a join and a stop at the same moment are serialised by the club lock; the stopped season's report counts the participant who joined."
cat "$OUT"/*.txt | grep -E '^[0-9]{4}-' | sort

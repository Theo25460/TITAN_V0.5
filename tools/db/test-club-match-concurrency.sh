#!/usr/bin/env bash
# V1.8.5 — two real connections accept the same meeting proposal at the same moment: a (club A) accepts and keeps the transaction open
# 1.5 s, b (club B) accepts 0.3 s later. Both clubs' rows are locked in a fixed order, so b waits for a, then reads a proposal already
# accepted and is refused (MATCH_CODE): a proposal is accepted once, by one club, and no club ends up in two meetings.
# Usage: tools/db/test-club-match-concurrency.sh <psql command…> -d <titan_test_ db>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=("$@")
DB="${PSQL[-1]}"
[[ "$DB" == titan_test_* ]] || { echo "Refused: the club match concurrency test requires a titan_test_ disposable database"; exit 1; }
OUT="$(mktemp -d)"
"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/club-match/setup.sql" >/dev/null
"${PSQL[@]}" -q -c "grant select on public.cmt_ids to authenticated" >/dev/null
"${PSQL[@]}" -At -v who=a -v hold=1.5 -f "$HERE/club-match/accept.sql" >"$OUT/a.txt" 2>&1 &
sleep 0.3
"${PSQL[@]}" -At -v who=b -v hold=0 -f "$HERE/club-match/accept.sql" >"$OUT/b.txt" 2>&1 &
wait
accepted=$(grep -c '|a|upcoming$' "$OUT/a.txt" || true)
refused=$(grep -c 'MATCH_CODE' "$OUT/b.txt" || true)
guest=$("${PSQL[@]}" -At -c "select count(*) from private.titan_club_matches where id = (select v from public.cmt_ids where k = 'match') and status = 'accepted' and guest_club = (select v from public.cmt_ids where k = 'ca')")
other=$("${PSQL[@]}" -At -c "select count(*) from private.titan_club_matches where guest_club = (select v from public.cmt_ids where k = 'cb')")
"${PSQL[@]}" -q -c "drop table public.cmt_ids" >/dev/null
[[ "$accepted" == 1 && "$refused" == 1 && "$guest" == 1 && "$other" == 0 ]] || {
  echo "club match concurrency: accepted=$accepted refused=$refused guest=$guest other=$other"; cat "$OUT"/*.txt; exit 1; }
echo "OK: two clubs accepting the same proposal at the same moment are serialised by the clubs' locks; one is accepted, the other refused."
cat "$OUT"/*.txt | grep -E '^[0-9]{4}-|MATCH_CODE' | sort

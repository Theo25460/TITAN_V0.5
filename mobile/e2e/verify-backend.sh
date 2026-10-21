#!/usr/bin/env bash
# Server-side proof after the emulator journey: what the app did must be in the database, exactly once.
set -euo pipefail
q() { psql "$E2E_DB_URL" -tAX -c "$1"; }
A=$(q "select id from auth.users where email='e2e-a@titan.test'")
B=$(q "select id from auth.users where email='e2e-b@titan.test'")
fail() { echo "::error::$1"; exit 1; }

logs=$(q "select count(*) from training_logs where user_id='$A'")
distinct=$(q "select count(distinct client_event_id) from training_logs where user_id='$A'")
xp_logs=$(q "select coalesce(sum(xp),0) from training_logs where user_id='$A'")
xp_profile=$(q "select p.xp + (select coalesce(sum(public.titan_level_requirement(l)),0) from generate_series(1, p.level-1) l) from profiles p where p.id='$A'")
# After the server migration 20261020000000, a reward can be held for review (up to 24 h): the journal records the session,
# the profile only counts the XP already confirmed. Before it, nothing is ever held.
held=0
if [[ "$(q "select to_regclass('private.titan_reward_holds') is not null")" == "t" ]]; then
  held=$(q "select coalesce(sum(xp),0) from private.titan_reward_holds where user_id='$A' and status='held'")
fi
onboarded=$(q "select game_state->'user'->>'onboardedAt' is not null from profiles where id='$A'")
favorite=$(q "select game_state->'user'->'favoriteSports'->>0 from profiles where id='$A'")
reward=$(q "select count(*) from adventure_rewards where user_id='$A' and world_id='aube' and chapter=1")
offline=$(q "select count(*) from training_logs where user_id='$A' and details->>'note' = 'E2E hors ligne'")
b_logs=$(q "select count(*) from training_logs where user_id='$B'")

echo "Account A: $logs sessions ($distinct distinct client_event_id), $xp_logs XP in the journal, $xp_profile cumulated XP on the profile, $held XP held for review"
echo "Account A: onboarded=$onboarded favorite=$favorite aube chapter 1 reward=$reward offline session=$offline"
echo "Account B: $b_logs sessions"
[[ "$logs" -ge 3 ]] || fail "expected at least 3 sessions for A, got $logs"
[[ "$logs" == "$distinct" ]] || fail "duplicate sessions: $logs rows for $distinct events"
[[ "$xp_logs" -gt 0 ]] || fail "no XP granted"
[[ "$xp_profile" == "$((xp_logs - held))" ]] || fail "profile XP ($xp_profile) differs from the journal ($xp_logs) minus the held XP ($held)"
[[ "$onboarded" == "t" && "$favorite" == "running" ]] || fail "onboarding preferences not saved"
[[ "$reward" == "1" ]] || fail "adventure chapter 1 not validated server-side"
[[ "$offline" == "1" ]] || fail "offline session not synchronised exactly once"
[[ "$b_logs" == "0" ]] || fail "account B has sessions it never recorded"
echo "Server-side checks passed"

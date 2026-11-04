#!/usr/bin/env bash
# Local replica of the TITAN production backend for the emulator tests (CI only, never touches the real project):
# Supabase stack (Postgres 17, GoTrue, PostgREST, Kong) + production structure snapshot (tools/db/baseline) +
# the same migrations as production up to 20261005230000 (plus, on request, the pending ones). Writes the API keys to $GITHUB_ENV.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${RUNNER_TEMP:-/tmp}/titan-supabase"
CLI="npx --yes supabase@2.121.0"
PROD_HEAD="20261005230000"

rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK"
$CLI init --force >/dev/null
sed -i 's/^major_version = .*/major_version = 17/' supabase/config.toml
$CLI start -x studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
eval "$($CLI status -o env | sed 's/^/export /')"
psql_() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

echo "Production structure snapshot"
for f in "$ROOT"/tools/db/baseline/*.sql; do echo "  · $(basename "$f")"; psql_ -f "$f"; done
echo "Migrations up to the production head $PROD_HEAD"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" < "20261005150000" || "$v" > "$PROD_HEAD" ]] && continue
  echo "  · $(basename "$f")"; psql_ -f "$f"
done
# Optional: also apply the migrations that are NOT in production yet (the Web candidate's), to prove the app still works after them.
if [ -n "${E2E_PENDING_MIGRATIONS_DIR:-}" ]; then
  echo "Pending migrations of the Web candidate (after the production head)"
  for f in "$E2E_PENDING_MIGRATIONS_DIR"/*.sql; do
    v="$(basename "$f" | cut -d_ -f1)"
    [[ "$v" > "$PROD_HEAD" ]] || continue
    echo "  · $(basename "$f")"; psql_ -f "$f"
  done
fi
psql_ -c "notify pgrst, 'reload schema';"
sleep 2

# Same function set as production must be callable by an authenticated client.
for fn in titan_submit_training_session titan_adventure_snapshot titan_adventure_action titan_save_profile_state titan_social_overview titan_atelier; do
  psql_ -tAc "select has_function_privilege('authenticated', 'public.$fn'::regproc, 'execute')" | grep -qx t || { echo "::error::$fn not executable by authenticated"; exit 1; }
done

{
  echo "E2E_API_URL=$API_URL"
  echo "E2E_ANON_KEY=$ANON_KEY"
  echo "E2E_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "E2E_DB_URL=$DB_URL"
} >> "${GITHUB_ENV:-/dev/null}"
echo "::add-mask::$SERVICE_ROLE_KEY"

# Two accounts: A runs the journey, B checks that nothing from A leaks after switching accounts.
for who in a b; do
  curl -fsS "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"e2e-$who@titan.test\",\"password\":\"TitanE2E-$who-2026\",\"data\":{\"full_name\":\"Athlete ${who^^}\",\"username\":\"Athlete ${who^^}\"}}" >/dev/null
done
psql_ -tAc "select count(*) from public.profiles where username like 'Athlete %'" | grep -qx 2 || { echo "::error::profiles not created by the signup trigger"; exit 1; }
echo "Backend ready at $API_URL"

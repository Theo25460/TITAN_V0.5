#!/usr/bin/env bash
# Runs inside the Android emulator job: install the test build, play the Maestro journey, collect proof.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/e2e-out"
mkdir -p "$OUT"
APK="$ROOT/mobile/android/app/build/outputs/apk/release/app-release.apk"
adb wait-for-device
adb install -r "$APK"
adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT=$!
adb shell am start -W -n fr.titanapp.app/.MainActivity >/dev/null 2>&1 || true
sleep 3
adb shell am force-stop fr.titanapp.app
cd "$OUT"
status=0
"$HOME/.maestro/bin/maestro" test "$ROOT/mobile/e2e/flows" --format junit --output "$OUT/maestro-report.xml" --test-output-dir "$OUT/maestro" || status=$?
adb shell dumpsys meminfo fr.titanapp.app > "$OUT/meminfo.txt" 2>&1 || true
kill "$LOGCAT" 2>/dev/null || true
# A crash or an uncaught JavaScript error fails the run even if every screen was reached.
if grep -E "FATAL EXCEPTION|AndroidRuntime: Process: fr.titanapp.app|ReactNativeJS.*(TypeError|ReferenceError|Unhandled)" "$OUT/logcat.txt" > "$OUT/crashes.txt"; then
  echo "::error::crash or JavaScript error in logcat (see crashes.txt)"; cat "$OUT/crashes.txt" | head -40; status=1
fi
exit $status

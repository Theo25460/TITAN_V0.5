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
# On failure, print what the device was showing and the app's errors, so the cause is readable in the job log itself.
if [ "$status" -ne 0 ]; then
  echo "::group::Diagnostic : écran de l'appareil et erreurs de l'application"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  echo "--- éléments visibles (texte, identifiant, description) ---"
  adb shell cat /sdcard/ui.xml 2>/dev/null | sed 's/></>\n</g' | grep -oE '(text|resource-id|content-desc)="[^"]+"' | sort -u | head -80 || true
  echo "--- journal de l'application ---"
  grep -E "ReactNativeJS|AndroidRuntime|ReactNative|fr\.titanapp" "$OUT/logcat.txt" | grep -vE "chatty|ActivityManager" | tail -70 || true
  echo "::endgroup::"
fi
kill "$LOGCAT" 2>/dev/null || true
# A crash or an uncaught JavaScript error fails the run even if every screen was reached.
if grep -E "FATAL EXCEPTION|AndroidRuntime: Process: fr.titanapp.app|ReactNativeJS.*(TypeError|ReferenceError|Unhandled)" "$OUT/logcat.txt" > "$OUT/crashes.txt"; then
  echo "::error::crash or JavaScript error in logcat (see crashes.txt)"; cat "$OUT/crashes.txt" | head -40; status=1
fi
exit $status

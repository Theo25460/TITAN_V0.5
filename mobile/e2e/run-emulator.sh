#!/usr/bin/env bash
# Runs inside the Android emulator job: install the test build, play the Maestro journey, collect proof.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/e2e-out"
mkdir -p "$OUT"
APK="$ROOT/mobile/android/app/build/outputs/apk/release/app-release.apk"
adb wait-for-device
# The CI emulator is slow right after boot: Android may show "Pixel Launcher isn't responding" over the app and hide it from the test.
adb shell settings put global hide_error_dialogs 1 || true
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb install -r "$APK"
{
  adb shell getprop ro.product.model
  adb shell getprop ro.build.version.sdk
  adb shell wm size
  adb shell wm density
  printf 'Test APK bytes: %s\n' "$(wc -c < "$APK")"
} > "$OUT/device.txt" 2>&1
adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT=$!
adb shell am force-stop fr.titanapp.app
adb shell am start -W -n fr.titanapp.app/.MainActivity > "$OUT/startup-cold.txt" 2>&1 || true
sleep 3
adb shell input keyevent KEYCODE_HOME || true
adb shell am start -W -n fr.titanapp.app/.MainActivity > "$OUT/startup-resume.txt" 2>&1 || true
adb shell am force-stop fr.titanapp.app
cd "$OUT"
status=0
"$HOME/.maestro/bin/maestro" test "$ROOT/mobile/e2e/flows" --format junit --output "$OUT/maestro-report.xml" --test-output-dir "$OUT/maestro" || status=$?
# Exercise the same installed APK at 320 and 800 dp, including search with the keyboard open.
if [ "$status" -eq 0 ]; then
  for viewport in 640x1136 1600x2560; do
    adb shell wm size "$viewport"
    adb shell wm density 320
    "$HOME/.maestro/bin/maestro" test "$ROOT/mobile/e2e/layout/catalogue.yaml" \
      --test-output-dir "$OUT/layout-$viewport" || { status=$?; break; }
  done
  adb shell wm size reset
  adb shell wm density reset
fi
adb shell dumpsys meminfo fr.titanapp.app > "$OUT/meminfo.txt" 2>&1 || true
adb shell dumpsys gfxinfo fr.titanapp.app framestats > "$OUT/framestats.txt" 2>&1 || true
# Keep the previous aggregate samples above at the historical checkpoint (after restoring
# the viewport). Measure navigation separately in the same process, with a primed cache.
journeys="$ROOT/mobile/e2e/journeys"
maestro="$HOME/.maestro/bin/maestro"
if [ "$status" -eq 0 ]; then
  "$maestro" test "$journeys/prepare-tabs.yaml" --test-output-dir "$OUT/perf/prepare" || status=$?
fi
if [ "$status" -eq 0 ]; then
  for pass in warmup 1 2 3; do
    adb shell dumpsys gfxinfo fr.titanapp.app reset > /dev/null
    "$maestro" test "$journeys/tabs.yaml" --test-output-dir "$OUT/perf/$pass" || { status=$?; break; }
    adb shell dumpsys gfxinfo fr.titanapp.app framestats > "$OUT/perf/tabs-$pass.txt"
    adb shell dumpsys meminfo fr.titanapp.app > "$OUT/perf/memory-$pass.txt"
  done
fi
if [ "$status" -eq 0 ]; then
  "$maestro" test "$journeys/social.yaml" --test-output-dir "$OUT/social" || status=$?
fi
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
# Only a crash of OUR process counts: a generic "FATAL EXCEPTION" also matches the test driver's own threads (Maestro), which is not the app.
if grep -E "AndroidRuntime: Process: fr.titanapp.app|ReactNativeJS.*(TypeError|ReferenceError|Unhandled)" "$OUT/logcat.txt" > "$OUT/crashes.txt"; then
  echo "::error::crash or JavaScript error in logcat (see crashes.txt)"; cat "$OUT/crashes.txt" | head -40; status=1
fi
exit $status

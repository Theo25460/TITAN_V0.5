#!/usr/bin/env bash
# Installs the NDK version the generated Android project asks for, with retries: Gradle's own one-shot
# download sometimes receives a truncated archive ("Archive is not a ZIP archive") and fails the build.
set -euo pipefail
cd "$(dirname "$0")/../android"
# React Native declares it in its version catalog; the generated project inherits it.
version=$(grep -hoE '^ndkVersion[[:space:]]*=[[:space:]]*"[0-9.]+"' ../node_modules/react-native/gradle/libs.versions.toml 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)+' | head -1 || true)
if [ -z "$version" ]; then echo "ndkVersion introuvable : Gradle choisira lui-même"; exit 0; fi
if [ -f "${ANDROID_SDK_ROOT:-$ANDROID_HOME}/ndk/$version/source.properties" ]; then echo "NDK $version déjà présent"; exit 0; fi
sdk="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
# Licences first, on their own: piping `yes` into the install itself breaks under pipefail (SIGPIPE, 141).
(yes 2>/dev/null | sdkmanager --licenses > /dev/null 2>&1) || true
for attempt in 1 2 3; do
  sdkmanager --install "ndk;$version" > /tmp/ndk-install.log 2>&1 || true
  # Success is judged on what is on disk, not on the tool's exit code.
  if [ -f "$sdk/ndk/$version/source.properties" ]; then echo "NDK $version installé (tentative $attempt)"; exit 0; fi
  echo "Tentative $attempt échouée :"; tail -5 /tmp/ndk-install.log
  rm -rf "$sdk/ndk/$version"
  sleep $((attempt * 10))
done
exit 1

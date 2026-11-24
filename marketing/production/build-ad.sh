#!/usr/bin/env bash
# Builds the hero ad end to end: cue sheet -> original soundtrack at -14 LUFS -> 1080x1920 master (+ silent copy).
# Usage: build-ad.sh <outDir> [play|web]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); OUT=$1; V=${2:-play}; NAME="HERO-les-20-premiers-$V"; TMP=$(mktemp -d)
cd "$HERE"
node render-ad.mjs ad-20-premiers.html "$TMP" cue --variant "$V" --stills 0 >/dev/null
python3 ad-audio.py "$TMP/cue.cues.json" "$TMP/raw.wav" >/dev/null
I=$(ffmpeg -hide_banner -nostats -i "$TMP/raw.wav" -af ebur128 -f null - 2>&1 | awk '/^ +I:/{v=$2} END{print v}')
G=$(python3 -c "print(round(-14 - ($I), 2))")
ffmpeg -v error -y -i "$TMP/raw.wav" -af "volume=${G}dB,alimiter=limit=0.87:level=false" "$TMP/track.wav"
node render-ad.mjs ad-20-premiers.html "$OUT" "$NAME" --variant "$V" --audio "$TMP/track.wav"
ffmpeg -v error -y -i "$OUT/$NAME.mp4" -c:v copy -an "$OUT/$NAME-sans-son.mp4"
cp "$TMP/track.wav" "$OUT/$NAME-bande-son.wav"; rm -f "$OUT/$NAME.cues.json"; rm -rf "$TMP"
ffmpeg -hide_banner -nostats -i "$OUT/$NAME.mp4" -af ebur128=peak=true -f null - 2>&1 | grep -E "^ +I:|Peak:" | tr -s ' ' | tr '\n' ' '; echo

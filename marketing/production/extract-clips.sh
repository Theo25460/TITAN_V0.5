#!/usr/bin/env bash
# Turns captured mp4 clips into 30 fps JPEG frame folders read by composer.html. Usage: extract-clips.sh <dir-with-mp4> [trimStartSeconds:name ...]
set -euo pipefail
SRC=$1; shift; HERE=$(cd "$(dirname "$0")" && pwd)
for f in "$SRC"/*.mp4; do n=$(basename "$f" .mp4); ss=0
  for a in "$@"; do [[ "${a#*:}" == "$n" ]] && ss=${a%%:*}; done
  rm -rf "$HERE/clips/$n"; mkdir -p "$HERE/clips/$n"
  ffmpeg -v error -y -ss "$ss" -i "$f" -vf fps=30 -q:v 2 "$HERE/clips/$n/%04d.jpg"; echo "$n $(ls "$HERE/clips/$n" | wc -l)"
done

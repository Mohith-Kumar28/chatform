#!/usr/bin/env bash
# Encodes record.mjs's .webm into the home page's builder demo: an h264 mp4
# that plays everywhere (faststart, no audio) and a webp poster from the builder.
# Usage: tooling/builder-recording/encode.sh <recording.webm> [outdir] [poster-second]
set -euo pipefail
in="$1"; out="${2:-/tmp/lp/landing}"; poster_at="${3:-33}"
mkdir -p "$out"
ffmpeg -v error -y -i "$in" -an -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart \
  -vf "scale=1600:900:flags=lanczos,fps=30" "$out/builder-demo.mp4"
ffmpeg -v error -y -ss "$poster_at" -i "$in" -frames:v 1 "$out/poster.png"
cwebp -quiet -q 82 "$out/poster.png" -o "$out/builder-demo-poster.webp" && rm "$out/poster.png"
ls -lh "$out"

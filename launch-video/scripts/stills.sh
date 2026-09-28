#!/bin/sh
# Render a contact sheet of the given frames: sh scripts/stills.sh name 100 200 300 400
set -e
cd "$(dirname "$0")/.."
name=$1; shift
npx remotion bundle src/index.ts --out-dir out/bundle --log=error >/dev/null
mkdir -p out/stills
for f in "$@"; do npx remotion still out/bundle Launch out/stills/$f.png --frame=$f --log=error & done; wait
set -- $(for f in "$@"; do echo out/stills/$f.png; done)
inputs=""; for p in "$@"; do inputs="$inputs -i $p"; done
n=$#
if [ $n -eq 4 ]; then
  ffmpeg -loglevel error -y $inputs -filter_complex "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1920:-1" out/stills/$name.png
else
  ffmpeg -loglevel error -y $inputs -filter_complex "hstack=inputs=$n,scale=1920:-1" out/stills/$name.png
fi
echo out/stills/$name.png

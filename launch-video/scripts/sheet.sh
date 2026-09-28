#!/bin/sh
# Contact sheet of many frames: sh scripts/sheet.sh name COLS f1 f2 f3 ...
# Bundles once, renders every frame in parallel, tiles them 480px wide each.
set -e
cd "$(dirname "$0")/.."
name=$1; cols=$2; shift 2
npx remotion bundle src/index.ts --out-dir out/bundle --log=error >/dev/null
dir=out/sheet-$name; rm -rf $dir; mkdir -p $dir
i=0
for f in "$@"; do
  n=$(printf "%03d" $i)
  npx remotion still out/bundle Launch $dir/$n.png --frame=$f --scale=0.25 --log=error &
  i=$((i+1))
  if [ $((i % 8)) -eq 0 ]; then wait; fi
done
wait
rows=$(( (i + cols - 1) / cols ))
ffmpeg -loglevel error -y -framerate 1 -pattern_type glob -i "$dir/*.png" -vf "tile=${cols}x${rows}:padding=4:color=white" -frames:v 1 out/stills/$name.png
echo out/stills/$name.png

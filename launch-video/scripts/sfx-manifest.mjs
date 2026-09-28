// Measures every file in public/sfx: when it starts sounding (onset), when it
// is loudest (peak) and how long it lasts. The timeline places a whoosh so
// its PEAK lands on the cut and a click so its ONSET lands on the press;
// without this, sounds drift 50-300ms off the picture and read as late.
//
//   node scripts/sfx-manifest.mjs   → src/sfx-manifest.json
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";

const DIR = new URL("../public/sfx/", import.meta.url);
const SR = 22050;
const WIN = Math.round(SR * 0.01);
const out = {};
for (const f of readdirSync(DIR).sort()) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", new URL(f, DIR).pathname, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const rms = [];
  for (let i = 0; i + WIN <= x.length; i += WIN) {
    let s = 0;
    for (let j = 0; j < WIN; j++) s += x[i + j] ** 2;
    rms.push(Math.sqrt(s / WIN));
  }
  const peak = Math.max(...rms);
  const peakAt = rms.indexOf(peak) * 0.01;
  const onset = rms.findIndex((v) => v > peak * 0.1) * 0.01;
  let end = rms.length - 1;
  while (end > 0 && rms[end] < peak * 0.03) end--;
  out[f.replace(/\.(mp3|wav)$/, "")] = { file: f, onset: +onset.toFixed(2), peak: +peakAt.toFixed(2), end: +(end * 0.01).toFixed(2), level: +(20 * Math.log10(peak)).toFixed(1) };
}
writeFileSync(new URL("../src/sfx-manifest.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, v]) => `${k.padEnd(18)} on ${v.onset}  peak ${v.peak}  end ${v.end}  ${v.level}dB`).join("\n"));

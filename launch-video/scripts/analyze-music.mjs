// Finds a track's tempo, beat grid and energy map, so the edit can be cut to
// the music instead of the music being laid under the edit.
//
//   node scripts/analyze-music.mjs public/music/track.mp3 [--json]
//
// Prints BPM, the time of the first downbeat, how strongly the onsets sit on
// the grid (0-1, higher is steadier), and loudness per bar with the drops
// marked. Needs ffmpeg on the PATH; nothing else.
import { execFileSync } from "node:child_process";

const file = process.argv[2];
const asJson = process.argv.includes("--json");
const SR = 22050;
const HOP = 256;

const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);

// Band energies per hop: full band, and a low band for the kick.
const n = Math.floor(x.length / HOP);
const full = new Float32Array(n);
const low = new Float32Array(n);
let lp = 0;
const a = 1 - Math.exp((-2 * Math.PI * 150) / SR);
for (let i = 0; i < n; i++) {
  let ef = 0, el = 0;
  for (let j = 0; j < HOP; j++) {
    const v = x[i * HOP + j];
    lp += a * (v - lp);
    ef += v * v;
    el += lp * lp;
  }
  full[i] = Math.log10(1e-9 + ef / HOP);
  low[i] = Math.log10(1e-9 + el / HOP);
}
// Onset strength: rectified rise in log energy, kick weighted double.
const env = new Float32Array(n);
for (let i = 1; i < n; i++) env[i] = Math.max(0, full[i] - full[i - 1]) + 2 * Math.max(0, low[i] - low[i - 1]);
const mean = env.reduce((s, v) => s + v, 0) / n;
for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i] - mean);

const hopSec = HOP / SR;
// Tempo: autocorrelation over 90-180 BPM, favouring the 110-140 range a
// launch cut wants.
let best = { bpm: 0, score: -1 };
for (let bpm = 90; bpm <= 180; bpm += 0.1) {
  const lag = 60 / bpm / hopSec;
  let s = 0;
  for (let i = 0; i + lag * 4 < n; i++) {
    const l1 = Math.round(i + lag), l2 = Math.round(i + 2 * lag), l4 = Math.round(i + 4 * lag);
    s += env[i] * (env[l1] + 0.5 * env[l2] + 0.25 * env[l4]);
  }
  const w = bpm >= 110 && bpm <= 140 ? 1.08 : 1;
  if (s * w > best.score) best = { bpm, score: s * w };
}
const bpm = Math.round(best.bpm * 10) / 10;
const period = 60 / bpm / hopSec;

// Phase: where the grid collects the most onset energy.
let phase = 0, phaseScore = -1;
for (let p = 0; p < period; p += 0.25) {
  let s = 0;
  for (let t = p; t < n; t += period) s += env[Math.round(t)] || 0;
  if (s > phaseScore) { phaseScore = s; phase = p; }
}
// Steadiness: share of onset energy within ±40ms of a beat.
let on = 0, all = 0;
const tol = 0.04 / hopSec;
for (let i = 0; i < n; i++) {
  all += env[i];
  const d = ((i - phase) % period + period) % period;
  if (Math.min(d, period - d) <= tol) on += env[i];
}

// Loudness per bar (4 beats), and bars where it jumps: the drops.
const beat = period * hopSec;
const firstBeat = phase * hopSec;
const bars = [];
for (let t = firstBeat; t + beat * 4 <= x.length / SR; t += beat * 4) {
  const i0 = Math.floor((t * SR) / HOP), i1 = Math.floor(((t + beat * 4) * SR) / HOP);
  let s = 0, sl = 0;
  for (let i = i0; i < i1; i++) { s += 10 ** full[i]; sl += 10 ** low[i]; }
  bars.push({ t: +t.toFixed(3), db: +(10 * Math.log10(s / (i1 - i0))).toFixed(1), lowDb: +(10 * Math.log10(sl / (i1 - i0))).toFixed(1) });
}
bars.forEach((b, i) => { b.drop = i > 0 && b.db - bars[i - 1].db >= 3; });

const out = { file, seconds: +(x.length / SR).toFixed(2), bpm, beat: +beat.toFixed(4), firstBeat: +firstBeat.toFixed(3), steadiness: +(on / all).toFixed(2), bars };
if (asJson) console.log(JSON.stringify(out));
else {
  console.log(`${file}  ${out.seconds}s  ${bpm} BPM  first beat ${out.firstBeat}s  steadiness ${out.steadiness}`);
  console.log(bars.map((b) => `${b.t.toFixed(1)}:${b.db}${b.drop ? "!" : ""}`).join("  "));
}

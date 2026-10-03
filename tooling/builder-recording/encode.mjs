/**
 * Edits record.mjs's raw .webm into the home page's builder demo.
 *
 *   node tooling/builder-recording/encode.mjs <recording.webm> [outdir]
 *
 * Reads the .events.json written beside the recording and:
 *  - speeds up the slow stretches (typing ~2x, the AI drafting the form ~4x),
 *  - zooms in on the prompt while it is typed, and back out,
 *  - lays a click on every click, keys under every typing stretch, a whoosh as
 *    the AI starts and a ding when the form lands (Kenney CC0 sounds from
 *    launch-video/public), and
 *  - writes builder-demo.mp4 (h264 + aac, faststart) and a webp poster.
 *
 * Needs ffmpeg and cwebp on PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [input, outArg] = process.argv.slice(2);
if (!input) throw new Error("usage: encode.mjs <recording.webm> [outdir]");
const out = resolve(outArg ?? "/tmp/lp/landing");
mkdirSync(out, { recursive: true });

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SFX = join(root, "launch-video/public");
const events = JSON.parse(readFileSync(input.replace(/\.webm$/, ".events.json"), "utf8"));
const at = (type) => events.find((e) => e.type === type);

const duration = Number(
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input]).toString(),
);

const W = 1600;
const H = 900;
const FPS = 30;
const LEAD = 2.5; // the dashboard loading, cut
const TAIL = 0.4;

const typeStart = at("type-start");
const typeEnd = at("type-end");
const waitStart = at("wait-start");
const waitEnd = at("wait-end");

/** [start, end, speed, zoom?] in source seconds. */
const segments = [
  [LEAD, typeStart.t, 1],
  [typeStart.t, typeEnd.t, 2.1, { x: typeStart.x, y: typeStart.y, z: 1.55 }],
  [typeEnd.t, waitStart.t, 1],
  [waitStart.t, waitEnd.t, 4],
  [waitEnd.t, duration - TAIL, 1],
].filter(([a, b]) => b - a > 0.05);

/** Source time to edited time. */
function warp(t) {
  let acc = 0;
  for (const [a, b, speed] of segments) {
    if (t <= a) return acc;
    if (t < b) return acc + (t - a) / speed;
    acc += (b - a) / speed;
  }
  return acc;
}
const total = warp(duration);

// ── video ────────────────────────────────────────────────────────────────
const v = [`[0:v]fps=${FPS},scale=${W}:${H},split=${segments.length}${segments.map((_, i) => `[s${i}]`).join("")}`];
segments.forEach(([a, b, speed, zoom], i) => {
  let chain = `[s${i}]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${speed},fps=${FPS}`;
  if (zoom) {
    const frames = Math.round(((b - a) / speed) * FPS);
    const ease = 12; // frames to zoom in, and out
    const z = `1+${zoom.z - 1}*min(1\\,min(on/${ease}\\,(${frames}-on)/${ease}))`;
    chain +=
      `,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${FPS}` +
      `:x='max(0\\,min(iw-iw/zoom\\,${zoom.x.toFixed(0)}-iw/zoom/2))'` +
      `:y='max(0\\,min(ih-ih/zoom\\,${zoom.y.toFixed(0)}-ih/zoom/2))'`;
  }
  v.push(`${chain}[v${i}]`);
});
v.push(`${segments.map((_, i) => `[v${i}]`).join("")}concat=n=${segments.length}:v=1:a=0[vout]`);

// ── sound ────────────────────────────────────────────────────────────────
const inputs = ["-i", input];
const a = [];
let n = 0;
function sound(file, t, { volume = 1, length } = {}) {
  inputs.push("-i", join(SFX, file));
  n += 1;
  const ms = Math.max(0, Math.round(warp(t) * 1000));
  const trim = length ? `atrim=0:${length.toFixed(3)},afade=t=out:st=${Math.max(0, length - 0.15).toFixed(3)}:d=0.15,` : "";
  a.push(`[${n}:a]${trim}aformat=sample_rates=48000:channel_layouts=stereo,volume=${volume},adelay=${ms}|${ms}[a${n}]`);
}

for (const e of events) if (e.type === "click" && e.t > LEAD) sound("sfx-k/click.wav", e.t, { volume: 0.7 });
sound("sfx/typing-fast.mp3", typeStart.t, { volume: 0.45, length: warp(typeEnd.t) - warp(typeStart.t) });
const keys = [at("keys-start"), at("keys-end")];
if (keys[0] && keys[1]) sound("sfx/typing-fast.mp3", keys[0].t, { volume: 0.4, length: Math.max(0.3, keys[1].t - keys[0].t) });
sound("sfx/rm-whoosh.wav", waitStart.t, { volume: 0.35 });
sound("sfx/rm-ding.wav", waitEnd.t, { volume: 0.4 });

a.push(
  `${Array.from({ length: n }, (_, i) => `[a${i + 1}]`).join("")}amix=inputs=${n}:normalize=0:duration=longest,` +
    `apad,atrim=0:${total.toFixed(3)}[aout]`,
);

const mp4 = join(out, "builder-demo.mp4");
execFileSync(
  "ffmpeg",
  [
    "-v", "error", "-y", ...inputs,
    "-filter_complex", [...v, ...a].join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-shortest", mp4,
  ],
  { stdio: "inherit" },
);

// The poster: a moment after the form lands in the builder.
const png = join(out, "poster.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (warp(waitEnd.t) + 3).toFixed(2), "-i", mp4, "-frames:v", "1", png]);
execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", join(out, "builder-demo-poster.webp")]);
rmSync(png);

console.log(`${mp4}  ${total.toFixed(1)}s (from ${duration.toFixed(1)}s)`);

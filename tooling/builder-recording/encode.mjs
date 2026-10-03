/**
 * Edits record.mjs's raw .webm into the home page's builder demo.
 *
 *   node tooling/builder-recording/encode.mjs <recording.webm> [outdir]
 *
 * Reads the .events.json written beside the recording and:
 *  - speeds up the slow stretches (typing ~2x, the AI drafting the form ~4x,
 *    the tour after it 1.4x) and cuts the hop to the seeded form,
 *  - zooms in on the prompt while it is typed, and back out,
 *  - lays a soft click on every click, keys under every typing stretch, a
 *    whoosh as the AI starts and a ding when the form lands (sounds from
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
const cutStart = at("cut-start");
const cutEnd = at("cut-end");
/* Everything after the form is built runs a little fast: it is a tour, and
   nobody needs to watch a cursor cross the screen in real time. */
const TOUR = 1.4;

/** [start, end, speed, zoom?] in source seconds. The hop between the two forms is simply not in the list. */
const segments = (
  typeStart
    ? [
        [LEAD, typeStart.t, 1],
        [typeStart.t, typeEnd.t, 2.1, { x: typeStart.x, y: typeStart.y, z: 1.55 }],
        [typeEnd.t, waitStart.t, 1],
        [waitStart.t, waitEnd.t, 4],
        [waitEnd.t, cutStart.t, 1],
        [cutEnd.t, duration - TAIL, TOUR],
      ]
    : [[cutEnd.t, duration - TAIL, TOUR]]
).filter(([a, b]) => b - a > 0.05);

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
function sound(file, t, { volume = 1, length, lowpass, skip = 0 } = {}) {
  inputs.push("-i", join(SFX, file));
  n += 1;
  const ms = Math.max(0, Math.round(warp(t) * 1000));
  // `skip` drops a sample's leading silence, so the sound lands on its event.
  const fade = length ? Math.min(0.15, length / 2) : 0;
  const trim = length
    ? `atrim=${skip.toFixed(3)}:${(skip + length).toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade.toFixed(3)},`
    : "";
  // A low-pass takes the bright edge off a sample, so it sits under the picture.
  const soften = lowpass ? `lowpass=f=${lowpass},` : "";
  a.push(`[${n}:a]${trim}${soften}aformat=sample_rates=48000:channel_layouts=stereo,volume=${volume},adelay=${ms}|${ms}[a${n}]`);
}

// Quiet on purpose. The first mix used Kenney's click, an 11 ms tick at full
// brightness, and it was harsh at any volume: a real mouse click, rolled off
// and well under the typing, is felt more than heard.
const kept = (t) => segments.some(([a, b]) => t >= a && t < b);
for (const e of events)
  if (e.type === "click" && kept(e.t)) sound("sfx/rm-mouse-click.wav", e.t, { volume: 0.5, skip: 0.095, length: 0.08, lowpass: 4500 });
if (typeStart) {
  sound("sfx/typing-soft.mp3", typeStart.t, { volume: 0.5, length: warp(typeEnd.t) - warp(typeStart.t), lowpass: 5000 });
  sound("sfx/rm-whoosh.wav", waitStart.t, { volume: 0.14, lowpass: 4000 });
  sound("sfx/rm-ding.wav", waitEnd.t, { volume: 0.16 });
}
events.forEach((e, i) => {
  if (e.type !== "keys-start" || !kept(e.t)) return;
  const end = events.slice(i).find((x) => x.type === "keys-end");
  if (end) sound("sfx/typing-soft.mp3", e.t, { volume: 0.45, length: Math.max(0.3, warp(end.t) - warp(e.t)), lowpass: 5000 });
});

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

// The poster: the builder, a moment into the tour.
const png = join(out, "poster.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (warp(cutEnd.t) + 2).toFixed(2), "-i", mp4, "-frames:v", "1", png]);
execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", join(out, "builder-demo-poster.webp")]);
rmSync(png);

console.log(`${mp4}  ${total.toFixed(1)}s (from ${duration.toFixed(1)}s)`);

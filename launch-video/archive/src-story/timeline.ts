// The single source of timing: everything is counted in BEATS of the music.
// "Take This Higher" (Mixkit, free licence), 124.0 BPM, measured with
// scripts/analyze-music.mjs: first beat at 0.003s, no drift over the track.
export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const BPM = 124;
export const BEAT = 60 / BPM; // 0.4839s
export const BAR = BEAT * 4;
// The cut uses the track from its bar 2 (the quiet build), so our beat 16 is
// the track's first drop, 48-52 its one-bar break, 52 the harder second
// drop, 84-100 the breakdown and 100 the last drop.
// +1 frame: measured on the master, the kicks landed ~35ms behind the picture.
export const MUSIC_START = 0.003 + 2 * BAR + 2 / 60;
export const TOTAL_BEATS = 132;
export const TOTAL_SECONDS = TOTAL_BEATS * BEAT;

/** beats → seconds / frames */
export const bs = (beats: number) => beats * BEAT;
export const bf = (beats: number) => Math.round(beats * BEAT * FPS);
export const s = (seconds: number) => Math.round(seconds * FPS);

// Transitions straddle the beat: the outgoing scene leaves in the PRE frames
// before it, the incoming one lands in the frames just after.
export const PRE = 7;
export const POST = 7;

export type Trans = "zoom" | "whipL" | "whipR" | "whipUp" | "whipDown" | "spin" | "flip" | "iris" | "glitch" | "cut" | "punch";

export type SceneDef = {
  id: string;
  at: number; // beat
  len: number; // beats
  enter: Trans;
  exit: Trans;
  bg: "cream" | "gradient" | "night" | "violet" | "orange" | "black" | "sunset";
  pulse?: boolean; // camera bumps on the beat
  flash?: boolean; // white flash on the landing
};

// Drops in the track, where the white flash hits.
export const FLASH_BEATS = [16, 52, 100];

// The story: the problem, meet chatform, three reasons you get better
// answers, how little it takes to set up, the result, the offer.
export const SCENES: SceneDef[] = [
  // Act 1: the problem (the track's build)
  { id: "longform", at: 0, len: 8, enter: "cut", exit: "cut", bg: "cream" },
  { id: "nobody", at: 8, len: 4, enter: "cut", exit: "cut", bg: "cream" },
  { id: "thin", at: 12, len: 4, enter: "punch", exit: "zoom", bg: "night" },
  // Act 2: meet chatform (first drop)
  { id: "reveal", at: 16, len: 4, enter: "punch", exit: "whipUp", bg: "gradient" },
  { id: "reasons", at: 20, len: 8, enter: "whipUp", exit: "zoom", bg: "night" },
  // Act 3: reason 1, better questions
  { id: "chat", at: 28, len: 12, enter: "zoom", exit: "zoom", bg: "sunset" },
  { id: "understand", at: 40, len: 8, enter: "zoom", exit: "whipL", bg: "night" },
  { id: "knowledge", at: 48, len: 8, enter: "whipL", exit: "iris", bg: "violet" },
  // reason 2, follow-ups; reason 3, proof it worked
  { id: "followup", at: 56, len: 8, enter: "iris", exit: "whipR", bg: "night" },
  { id: "proof", at: 64, len: 8, enter: "whipR", exit: "flip", bg: "cream" },
  { id: "results", at: 72, len: 8, enter: "flip", exit: "glitch", bg: "sunset" },
  // Act 4: setting it up (the breakdown)
  { id: "setup", at: 80, len: 4, enter: "glitch", exit: "zoom", bg: "orange" },
  { id: "build", at: 84, len: 8, enter: "zoom", exit: "whipUp", bg: "cream" },
  { id: "edit", at: 92, len: 8, enter: "whipUp", exit: "spin", bg: "night" },
  { id: "share", at: 100, len: 8, enter: "punch", exit: "zoom", bg: "sunset" },
  { id: "montage", at: 108, len: 4, enter: "zoom", exit: "whipDown", bg: "night" },
  // Act 5: the result, the offer
  { id: "result", at: 112, len: 8, enter: "whipDown", exit: "glitch", bg: "cream" },
  { id: "offer", at: 120, len: 4, enter: "glitch", exit: "zoom", bg: "orange" },
  { id: "outro", at: 124, len: 8, enter: "punch", exit: "cut", bg: "gradient" },
];

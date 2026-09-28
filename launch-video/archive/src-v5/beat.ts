// Beat grid for "Take This Higher" (Mixkit, Mixkit Stock Music Free License):
// 124.0 BPM, first drop at 11.616s, measured with scripts/analyze-music.mjs.
// Every scene boundary and nearly every cue sits on this grid.
export const FPS = 60;
export const BPM = 124;
export const BEAT = (FPS * 60) / BPM; // 29.03 frames
export const DROP = Math.round(8 * BEAT); // frame the drop lands on, after 8 beats of build-up
// +47ms: measured on the master (AAC priming, frame rounding); kicks now land ~17ms after the cut.
export const MUSIC_DROP_SEC = 11.616 + 0.047;
export const MUSIC_START_SEC = MUSIC_DROP_SEC - DROP / FPS;
/** Frame of beat n (n = 0 is the drop; negative = build-up). Fractions allowed (0.5 = an 8th). */
export const b = (n: number) => Math.round(DROP + n * BEAT);
export const TOTAL = b(148); // 37 bars after the drop, about 75s

/** Scene start beats (v5). One bar = 4 beats. */
export const AT = {
  logo: 0, chat: 4, extract: 16, answers: 24,
  types: 32, // the track's break
  followA: 36, followB: 44, // second drop: the reminders, then they come back
  ask: 52, stream: 60, edit: 68, // AI builds it, then you change it by asking
  branch: 76,
  blocksA: 84, blocksB: 100, // third drop: one block per bar, then every way to answer
  logic: 108, verify: 116, share: 124, dropoff: 132,
  outro: 140, end: 148,
};
/**
 * How much each scene's internal timing is stretched: a scene written in
 * 4 beats plays over 4 x STRETCH beats, so everything has time to be read.
 */
export const STRETCH: Record<keyof typeof AT, number> = {
  logo: 1, chat: 3, extract: 2, answers: 2, types: 1, followA: 2, followB: 2, ask: 2, stream: 2, edit: 2,
  branch: 1, blocksA: 4, blocksB: 2, logic: 2, verify: 2, share: 2, dropoff: 2, outro: 1, end: 1,
};
/** Absolute beat of scene-relative (unstretched) beat n. */
export const S = (scene: keyof typeof AT, n: number) => AT[scene] + n * STRETCH[scene];

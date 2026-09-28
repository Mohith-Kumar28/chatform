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
export const TOTAL = b(78); // 19.5 bars after the drop, about 42s

/** Scene start beats (v4). One bar = 4 beats. */
export const AT = {
  logo: 0, chat: 4, extract: 8, answers: 12,
  followA: 16, followB: 20, // follow-ups: the reminders, then they come back
  ask: 24, stream: 28, // AI builds the form
  types: 32, // the track's break
  blocksA: 36, blocksB: 40, // second drop: payments, signatures, bookings, then every way to answer
  branch: 44, // 2 bars: different answers, different paths
  edit: 52, logic: 56, verify: 60, share: 64, dropoff: 68,
  outro: 72, end: 78,
};

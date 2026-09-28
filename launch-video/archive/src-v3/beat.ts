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
export const TOTAL = b(58); // 14.5 bars after the drop, about 32s

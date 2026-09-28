// Beat grid for "Take This Higher" (Mixkit, Mixkit Stock Music Free License):
// 124.0 BPM, first drop at 11.616s, measured with scripts/analyze-music.mjs.
// Every scene boundary and nearly every cue sits on this grid.
export const FPS = 60;
export const BPM = 124;
export const BEAT = (FPS * 60) / BPM; // 29.03 frames
export const DROP = Math.round(16 * BEAT); // frame the drop lands on, after 16 beats of build-up (the problem)
// +47ms: measured on the master (AAC priming, frame rounding); kicks now land ~17ms after the cut.
export const MUSIC_DROP_SEC = 11.616 + 0.047;
export const MUSIC_START_SEC = MUSIC_DROP_SEC - DROP / FPS;
/** Frame of beat n (n = 0 is the drop; negative = build-up). Fractions allowed (0.5 = an 8th). */
export const b = (n: number) => Math.round(DROP + n * BEAT);

/** Scene start beats (v7), after the drop. One bar = 4 beats. `s*` scenes are full-frame statements. */
export const AT = {
  logo: 0,
  sChat: 4, chat: 8,
  sExtract: 20, extract: 24,
  sFollow: 32, // the track's break
  followA: 36, followB: 44, // second drop
  sKB: 52, answers: 56,
  sAI: 64, ask: 68, stream: 76, edit: 84,
  sBlocks: 92, blocks: 96, // one 3D wall of every block type
  sBranch: 112, branch: 116,
  sShare: 128, share: 132,
  recap: 140, end: 148, fin: 154,
};
/** How much each scene's internal (4-beat) timing is stretched. */
export const STRETCH: Record<keyof typeof AT, number> = {
  logo: 1, sChat: 1, chat: 3, sExtract: 1, extract: 2, sFollow: 1, followA: 2, followB: 2, sKB: 1, answers: 2,
  sAI: 1, ask: 2, stream: 2, edit: 2, sBlocks: 1, blocks: 1, sBranch: 1, branch: 1,
  sShare: 1, share: 1, recap: 2, end: 1, fin: 1,
};
/** Absolute beat of scene-relative (unstretched) beat n. */
export const S = (scene: keyof typeof AT, n: number) => AT[scene] + n * STRETCH[scene];

export const TOTAL = b(AT.fin); // 16 build-up beats + 154 beats, about 82s

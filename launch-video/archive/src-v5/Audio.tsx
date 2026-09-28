import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";
import { AT, S, b, FPS, MUSIC_START_SEC, TOTAL } from "./beat";
import { INTRO_CHIPS, INTRO_WORDS } from "./scenes/A";
import { EDIT } from "./scenes/B";
import { LOGIC, VERIFY } from "./scenes/C";
import { ASK_T, BRANCH, STREAM_AT } from "./scenes/D";

type Cue = [beat: number, file: string, volume: number, rate?: number];
const keys = ["key1", "key2", "key3"];
/** Key clicks on the 16ths between two absolute beats. */
const typing = (from: number, to: number, vol = 0.45): Cue[] => Array.from({ length: Math.max(0, Math.round((to - from) * 4)) }, (_, i) => [from + i * 0.25, keys[i % 3], vol, 0.95 + (i % 4) * 0.05]);

// Cues are written in each scene's own (unstretched) beats and placed with
// S(scene, n), so the sound stretches exactly as the picture does.
const CUES: Cue[] = [
  // build-up: the problem
  ...INTRO_WORDS.map(([n], i): Cue => [n, "select", 0.55, 0.9 + i * 0.05]),
  ...INTRO_CHIPS.map(([n], i): Cue => [n, "drop", 0.6, 0.9 + i * 0.07]),
  [-1, "whip", 0.5, 0.9], [-0.6, "pluck", 0.4, 1.2],
  // drop: logo
  [0, "stamp", 0.55], [0, "glass", 0.35], [0.6, "pop", 0.4, 1.3], [1, "whoosh", 0.3, 1.3], [2.3, "pop", 0.45], [3.55, "rise", 0.45],
  // chat: type, send, reply
  [S("chat", 0), "land", 0.35, 1.1], ...typing(S("chat", 0.45), S("chat", 0.95)), [S("chat", 1), "click", 0.6], [S("chat", 1), "pop", 0.45, 1.2],
  [S("chat", 1.9), "pop", 0.55, 0.95], ...typing(S("chat", 2.4), S("chat", 2.95)), [S("chat", 3), "click", 0.6], [S("chat", 3), "pop", 0.45, 1.3], [S("chat", 3.3), "whoosh", 0.3, 1.2], [S("chat", 3.72), "rise", 0.4, 1.2],
  // extract
  [S("extract", 0), "land", 0.45], [S("extract", 1), "select", 0.5, 1.1], [S("extract", 1.15), "drop", 0.45, 1.2], [S("extract", 2), "select", 0.5, 1.2], [S("extract", 2.15), "drop", 0.45, 1.3], [S("extract", 3), "confirm", 0.5], [S("extract", 3.6), "whoosh", 0.45, 0.9],
  // answers
  [S("answers", 0), "whip", 0.5, 1.1], [S("answers", 0.05), "pop", 0.45], [S("answers", 1), "switch", 0.55], [S("answers", 2), "switch", 0.55, 1.1], [S("answers", 2.05), "confirm", 0.45, 1.1], [S("answers", 3), "pop", 0.45, 1.2], [S("answers", 3.6), "fall", 0.45],
  // the break: question types
  [AT.types, "glitch", 0.3], [AT.types + 1, "switch", 0.6], [AT.types + 2, "switch", 0.6, 1.08], [AT.types + 3, "switch", 0.6, 1.16], [AT.types + 3.55, "fall", 0.5],
  // second drop: follow-ups
  [S("followA", 0), "stamp", 0.5], [S("followA", 0), "glass", 0.3], ...[1, 2, 3].flatMap((n, i): Cue[] => [[S("followA", n), "pop", 0.6, 1 + i * 0.12], [S("followA", n), "whoosh", 0.3, 1.3 + i * 0.1], [S("followA", n) + 0.5, "drop", 0.45, 1.1 + i * 0.1]]), [S("followA", 3.6), "whoosh", 0.4, 0.9],
  [S("followB", 0), "whoosh", 0.35, 1.1], ...[1, 1.5, 2, 2.5, 3, 3.25].map((n, i): Cue => [S("followB", n) + 0.4, "confirm", 0.35, 1 + i * 0.06]), [S("followB", 3.3), "pop", 0.45], [S("followB", 3.6), "rise", 0.45],
  // AI builds it
  [S("ask", 0), "land", 0.4], ...typing(S("ask", ASK_T.typeFrom), S("ask", ASK_T.typeTo), 0.4), [S("ask", ASK_T.send), "click", 0.7], [S("ask", ASK_T.send) + 0.4, "pop", 0.45, 1.2], [S("ask", 3.5), "rise", 0.35, 1.3],
  ...STREAM_AT.map((n, i): Cue => [S("stream", n), "drop", 0.5, 1 + i * 0.07]), [S("stream", 3.6), "fall", 0.4],
  [S("edit", 0), "whoosh", 0.35, 1.2], ...typing(S("edit", 0.1), S("edit", EDIT.typeTo), 0.4), [S("edit", EDIT.send), "click", 0.7], [S("edit", EDIT.send) + 0.3, "pop", 0.55], [S("edit", EDIT.tag), "toggle", 0.6], [S("edit", 3.6), "whip", 0.45],
  // branching
  [S("branch", 0), "land", 0.45], [S("branch", BRANCH.a1), "pop", 0.55, 1.1], [S("branch", BRANCH.a2), "pop", 0.55, 1.3], [S("branch", BRANCH.lines), "whoosh", 0.35, 1.2], [S("branch", BRANCH.n1), "drop", 0.5, 1.1], [S("branch", BRANCH.n2), "drop", 0.5, 1.25], [S("branch", BRANCH.pill), "confirm", 0.45], [S("branch", 7.6), "fall", 0.45],
  // third drop: one block per bar
  [S("blocksA", 0), "stamp", 0.5], [S("blocksA", 0), "glass", 0.3], [b2(S("blocksA", 0), 60), "click", 0.65], [b2(S("blocksA", 0), 66), "confirm", 0.55],
  [S("blocksA", 1), "whip", 0.4, 1.2], [b2(S("blocksA", 1), 12), "scroll", 0.45], [S("blocksA", 2), "whip", 0.4, 1.3], [b2(S("blocksA", 2), 52), "toggle", 0.6], [S("blocksA", 3), "whip", 0.4, 1.4], [b2(S("blocksA", 3), 56), "click", 0.6], [b2(S("blocksA", 3), 58), "select", 0.5], [S("blocksA", 3.6), "whoosh", 0.45, 1.1],
  [S("blocksB", 0), "whip", 0.45, 0.9], ...[0, 1, 2, 3].map((n, i): Cue => [S("blocksB", n), "pop", 0.5, 1 + i * 0.1]), ...[0, 1, 2, 3, 4].map((k): Cue => [S("blocksB", 2) + (4 + k * 3) / 29, "tick", 0.35, 1 + k * 0.08]), [S("blocksB", 3.6), "fall", 0.4],
  // logic, verify, share, drop-off
  [S("logic", 0), "whoosh", 0.4, 1.2], [S("logic", LOGIC.walk), "tick", 0.4], [S("logic", LOGIC.dead), "glitch", 0.55], [S("logic", LOGIC.fix), "confirm", 0.55], [S("logic", 3.6), "whip", 0.5],
  [S("verify", 0), "whip", 0.4, 1.2], ...VERIFY.digits.map((d, i): Cue => [S("verify", d), keys[i % 3], 0.6]), [S("verify", VERIFY.ok), "confirm", 0.55], [S("verify", 3.6), "whoosh", 0.45],
  [S("share", 0), "land", 0.4], ...[1, 2, 3].flatMap((n, i): Cue[] => [[S("share", n), "click", 0.7, 1 + i * 0.05], [S("share", n) + 0.1, "select", 0.35, 1.1 + i * 0.1]]), [S("share", 0.5), "tick", 0.4, 1.3], [S("share", 2.3), "shutter-modern", 0.4], [S("share", 3.6), "rise", 0.45],
  [S("dropoff", 0), "land", 0.4], ...Array.from({ length: 8 }, (_, i): Cue => [S("dropoff", 0) + i * 0.1, "tick", 0.3, 0.9 + i * 0.05]), [S("dropoff", 2), "click", 0.5], [S("dropoff", 2.1), "pop", 0.5], [S("dropoff", 3.4), "whoosh", 0.45, 0.8],
  // recap + end card
  [AT.outro, "whoosh", 0.4, 1.2], [AT.outro + 0.2, "glitch", 0.3], [AT.outro + 1.2, "rise", 0.45, 1.1], [AT.outro + 1.5, "land", 0.6], [AT.outro + 1.6, "glass", 0.45], [AT.outro + 2.8, "pop", 0.5],
];
/** A beat plus a number of frames, as a fractional beat. */
function b2(beat: number, frames: number) {
  return beat + frames / (FPS * 60 / 124);
}

export const SoundTrack: React.FC = () => (
  <>
    <Audio src={staticFile("music/take-this-higher.mp3")} trimBefore={Math.round(MUSIC_START_SEC * FPS)} volume={(f) => interpolate(f, [0, 6, TOTAL - 90, TOTAL], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    {CUES.map(([n, file, volume, rate], i) => (
      <Sequence key={i} from={b(n)} durationInFrames={Math.max(1, TOTAL - b(n))} layout="none">
        <Audio src={staticFile(`sfx-k/${file}.wav`)} volume={volume} playbackRate={rate ?? 1} />
      </Sequence>
    ))}
  </>
);

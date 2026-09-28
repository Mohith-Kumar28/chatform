import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";
import { AT, b, FPS, MUSIC_START_SEC, TOTAL } from "./beat";
import { INTRO_CHIPS, INTRO_WORDS } from "./scenes/A";
import { EDIT } from "./scenes/B";
import { LOGIC, VERIFY } from "./scenes/C";
import { ASK_T, BRANCH, STREAM_AT } from "./scenes/D";

type Cue = [beat: number, file: string, volume: number, rate?: number];
const keys = ["key1", "key2", "key3"];
/** Key clicks on the 16ths between two beats. */
const typing = (from: number, to: number, vol = 0.5): Cue[] => Array.from({ length: Math.max(0, Math.round((to - from) * 4)) }, (_, i) => [from + i * 0.25, keys[i % 3], vol, 0.95 + (i % 4) * 0.05]);

// Every cue is a beat number, so the sound lands exactly where the picture does.
const CUES: Cue[] = [
  // build-up: the problem
  ...INTRO_WORDS.map(([n], i): Cue => [n, "select", 0.55, 0.9 + i * 0.05]),
  ...INTRO_CHIPS.map(([n], i): Cue => [n, "drop", 0.6, 0.9 + i * 0.07]),
  [-1, "whip", 0.5, 0.9], [-0.6, "pluck", 0.4, 1.2],
  // drop: logo
  [0, "stamp", 0.55], [0, "glass", 0.35], [0.6, "pop", 0.4, 1.3], [1, "whoosh", 0.3, 1.3], [2.3, "pop", 0.45], [3.55, "rise", 0.45],
  // chat: a message per beat
  [4, "land", 0.4, 1.1], [5, "pop", 0.5, 1.2], [6, "pop", 0.5, 0.95], [7, "pop", 0.5, 1.3], [7.55, "rise", 0.4, 1.2],
  // extract
  [8, "land", 0.45], [9, "select", 0.5, 1.1], [9.3, "drop", 0.45, 1.2], [10, "select", 0.5, 1.2], [10.3, "drop", 0.45, 1.3], [11, "confirm", 0.5], [11.6, "whoosh", 0.45, 0.9],
  // answers
  [12, "whip", 0.5, 1.1], [12.1, "pop", 0.45], [13, "switch", 0.55], [14, "switch", 0.55, 1.1], [14.1, "confirm", 0.45, 1.1], [15, "pop", 0.45, 1.2], [15.6, "fall", 0.45],
  // follow-ups: three reminders, then they come back
  [AT.followA, "land", 0.45], ...[1, 2, 3].flatMap((n, i): Cue[] => [[AT.followA + n, "pop", 0.6, 1 + i * 0.12], [AT.followA + n, "whoosh", 0.3, 1.3 + i * 0.1], [AT.followA + n + 0.25, "drop", 0.45, 1.1 + i * 0.1]]), [AT.followA + 3.6, "whoosh", 0.4, 0.9],
  [AT.followB, "whoosh", 0.35, 1.1], ...[1, 1.5, 2, 2.5, 3, 3.25].map((n, i): Cue => [AT.followB + n + 0.2, "confirm", 0.35, 1 + i * 0.06]), [AT.followB + 3.3, "pop", 0.45], [AT.followB + 3.6, "rise", 0.45],
  // AI builds it
  [AT.ask, "land", 0.4], ...typing(AT.ask + ASK_T.typeFrom, AT.ask + ASK_T.typeTo, 0.45), [AT.ask + ASK_T.send, "click", 0.7], [AT.ask + ASK_T.send + 0.2, "pop", 0.45, 1.2], [AT.ask + 3.5, "rise", 0.35, 1.3],
  ...STREAM_AT.map((n, i): Cue => [AT.stream + n, "drop", 0.5, 1 + i * 0.07]), [AT.stream + 3.6, "fall", 0.4],
  // the break: question types
  [AT.types, "glitch", 0.3], [AT.types + 1, "switch", 0.6], [AT.types + 2, "switch", 0.6, 1.08], [AT.types + 3, "switch", 0.6, 1.16], [AT.types + 3.55, "fall", 0.5],
  // second drop: blocks, one per beat
  [AT.blocksA, "stamp", 0.5], [AT.blocksA, "glass", 0.3], [AT.blocksA + 0.4, "click", 0.6], [AT.blocksA + 0.62, "confirm", 0.55],
  [AT.blocksA + 1, "whip", 0.4, 1.2], [AT.blocksA + 1.1, "scroll", 0.4], [AT.blocksA + 2, "whip", 0.4, 1.3], [AT.blocksA + 2.35, "toggle", 0.6], [AT.blocksA + 3, "whip", 0.4, 1.4], [AT.blocksA + 3.35, "select", 0.55], [AT.blocksA + 3.6, "whoosh", 0.45, 1.1],
  [AT.blocksB, "whip", 0.45, 0.9], ...[0, 1, 2, 3].map((n, i): Cue => [AT.blocksB + n, "pop", 0.5, 1 + i * 0.1]), ...[0, 1, 2, 3, 4].map((s): Cue => [AT.blocksB + 2 + (4 + s * 3) / 29, "tick", 0.35, 1 + s * 0.08]), [AT.blocksB + 3.7, "confirm", 0.4], [AT.blocksB + 3.6, "fall", 0.4],
  // branching
  [AT.branch, "land", 0.45], [AT.branch + BRANCH.a1, "pop", 0.55, 1.1], [AT.branch + BRANCH.a2, "pop", 0.55, 1.3], [AT.branch + BRANCH.lines, "whoosh", 0.35, 1.2], [AT.branch + BRANCH.n1, "drop", 0.5, 1.1], [AT.branch + BRANCH.n2, "drop", 0.5, 1.25], [AT.branch + BRANCH.pill, "confirm", 0.45], [AT.branch + 7.6, "fall", 0.45],
  // edit
  [AT.edit, "whoosh", 0.35, 1.2], ...typing(AT.edit + 0.1, AT.edit + EDIT.typeTo, 0.45), [AT.edit + EDIT.send, "click", 0.7], [AT.edit + EDIT.send + 0.15, "pop", 0.55], [AT.edit + EDIT.tag, "toggle", 0.6], [AT.edit + 3.6, "whip", 0.45],
  // logic
  [AT.logic, "whoosh", 0.4, 1.2], [AT.logic + LOGIC.walk, "tick", 0.4], [AT.logic + LOGIC.dead, "glitch", 0.55], [AT.logic + LOGIC.fix, "confirm", 0.55], [AT.logic + 3.6, "whip", 0.5],
  // verify
  [AT.verify, "whip", 0.4, 1.2], ...VERIFY.digits.map((d, i): Cue => [AT.verify + d, keys[i % 3], 0.6]), [AT.verify + VERIFY.ok, "confirm", 0.55], [AT.verify + 3.6, "whoosh", 0.45],
  // share
  [AT.share, "land", 0.4], ...[1, 2, 3].flatMap((n, i): Cue[] => [[AT.share + n, "click", 0.7, 1 + i * 0.05], [AT.share + n + 0.05, "select", 0.35, 1.1 + i * 0.1]]), [AT.share + 0.5, "tick", 0.4, 1.3], [AT.share + 2.3, "shutter-modern", 0.4], [AT.share + 3.6, "rise", 0.45],
  // drop-off
  [AT.dropoff, "land", 0.4], ...Array.from({ length: 8 }, (_, i): Cue => [AT.dropoff + i * 0.1, "tick", 0.3, 0.9 + i * 0.05]), [AT.dropoff + 2, "click", 0.5], [AT.dropoff + 2.1, "pop", 0.5], [AT.dropoff + 3.4, "whoosh", 0.45, 0.8],
  // recap + end card
  [AT.outro, "whoosh", 0.4, 1.2], [AT.outro + 0.2, "glitch", 0.3], [AT.outro + 1.2, "rise", 0.45, 1.1], [AT.outro + 1.5, "land", 0.6], [AT.outro + 1.6, "glass", 0.45], [AT.outro + 2.8, "pop", 0.5],
];

export const SoundTrack: React.FC = () => (
  <>
    <Audio src={staticFile("music/take-this-higher.mp3")} trimBefore={Math.round(MUSIC_START_SEC * FPS)} volume={(f) => interpolate(f, [0, 6, TOTAL - 70, TOTAL], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    {CUES.map(([n, file, volume, rate], i) => (
      <Sequence key={i} from={b(n)} durationInFrames={Math.max(1, TOTAL - b(n))} layout="none">
        <Audio src={staticFile(`sfx-k/${file}.wav`)} volume={volume} playbackRate={rate ?? 1} />
      </Sequence>
    ))}
  </>
);

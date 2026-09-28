import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";
import { b, FPS, MUSIC_START_SEC, TOTAL } from "./beat";
import { INTRO_CHIPS, INTRO_WORDS } from "./scenes/A";
import { DESCRIBE, EDIT, FOLLOW, SITE } from "./scenes/B";
import { LOGIC, VERIFY } from "./scenes/C";

type Cue = [beat: number, file: string, volume: number, rate?: number];
const keys = ["key1", "key2", "key3"];
/** Key clicks on the 16ths between two beats. */
const typing = (from: number, to: number, vol = 0.55): Cue[] => Array.from({ length: Math.max(0, Math.round((to - from) * 4)) }, (_, i) => [from + i * 0.25, keys[i % 3], vol, 0.95 + (i % 4) * 0.05]);

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
  // follow-up
  [16, "land", 0.45], [16 + FOLLOW.toast, "pop", 0.55, 1.1], [16 + FOLLOW.toast, "whoosh", 0.3, 1.4], [16 + FOLLOW.click, "click", 0.7], [16 + FOLLOW.click + 0.1, "rise", 0.4, 1.3], [16 + FOLLOW.stamp, "stamp", 0.8], [19.6, "whoosh", 0.45, 1.1],
  // describe
  [20, "whoosh", 0.35, 0.9], ...typing(20 + DESCRIBE.typeFrom, 20 + DESCRIBE.typeTo), [20 + DESCRIBE.send, "click", 0.7], ...[0, 1, 2, 3].map((i): Cue => [20 + DESCRIBE.send + 0.5 + i * 0.25, "pop", 0.45, 1 + i * 0.1]), [23.6, "rise", 0.45],
  // website
  [24, "land", 0.4], ...typing(24, 24 + SITE.typeTo, 0.5), [24 + SITE.enter, "select", 0.55], ...Array.from({ length: 6 }, (_, i): Cue => [24 + SITE.pages + i * 0.25, "drop", 0.4, 1 + i * 0.07]), [24 + SITE.scan, "scroll", 0.45], [27.4, "confirm", 0.45], [27.6, "fall", 0.4],
  // edit
  [28, "whoosh", 0.35, 1.2], ...typing(28.1, 28 + EDIT.typeTo, 0.5), [28 + EDIT.send, "click", 0.7], [28 + EDIT.send + 0.15, "pop", 0.55], [28 + EDIT.tag, "toggle", 0.6], [31.6, "whip", 0.45],
  // the break: question types
  [32, "glitch", 0.3], [33, "switch", 0.6], [34, "switch", 0.6, 1.08], [35, "switch", 0.6, 1.16], [35.55, "fall", 0.5],
  // second drop: logic
  [36, "stamp", 0.5], [36, "glass", 0.3], [36 + LOGIC.walk, "tick", 0.4], [36 + LOGIC.dead, "glitch", 0.55], [36 + LOGIC.fix, "confirm", 0.55], [39.6, "whip", 0.5],
  // verify
  [40, "whip", 0.4, 1.2], ...VERIFY.digits.map((d, i): Cue => [40 + d, keys[i % 3], 0.65]), [40 + VERIFY.ok, "confirm", 0.55], [43.6, "whoosh", 0.45],
  // share
  [44, "land", 0.4], ...[45, 46, 47].flatMap((n, i): Cue[] => [[n, "click", 0.7, 1 + i * 0.05], [n + 0.05, "select", 0.35, 1.1 + i * 0.1]]), [44.5, "tick", 0.4, 1.3], [46.3, "shutter-modern", 0.4], [47.6, "rise", 0.45],
  // drop-off
  [48, "land", 0.4], ...Array.from({ length: 8 }, (_, i): Cue => [48 + i * 0.1, "tick", 0.3, 0.9 + i * 0.05]), [50, "click", 0.5], [50.1, "pop", 0.5], [51.4, "whoosh", 0.45, 0.8],
  // recap + end card
  [52, "whoosh", 0.4, 1.2], [52.2, "glitch", 0.3], [53.2, "rise", 0.45, 1.1], [53.5, "land", 0.6], [53.6, "glass", 0.45], [54.8, "pop", 0.5],
];

export const SoundTrack: React.FC = () => (
  <>
    <Audio src={staticFile("music/take-this-higher.mp3")} trimBefore={Math.round(MUSIC_START_SEC * FPS)} volume={(f) => interpolate(f, [0, 6, TOTAL - 60, TOTAL], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
    {CUES.map(([n, file, volume, rate], i) => (
      <Sequence key={i} from={b(n)} durationInFrames={Math.max(1, TOTAL - b(n))} layout="none">
        <Audio src={staticFile(`sfx-k/${file}.wav`)} volume={volume} playbackRate={rate ?? 1} />
      </Sequence>
    ))}
  </>
);

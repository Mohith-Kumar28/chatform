import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";
import { AT, S, b, FPS, MUSIC_START_SEC, TOTAL } from "./beat";
import { EDIT } from "./scenes/B";
import { LOGIC } from "./scenes/C";
import { ASK_T, BRANCH, STREAM_AT } from "./scenes/D";
import { HOOK, RESUME } from "./scenes/E";

type Cue = [beat: number, file: string, volume: number, rate?: number];
const keys = ["key1", "key2", "key3"];
/** Key clicks on the 16ths between two absolute beats. */
const typing = (from: number, to: number, vol = 0.45): Cue[] => Array.from({ length: Math.max(0, Math.round((to - from) * 4)) }, (_, i) => [from + i * 0.25, keys[i % 3], vol, 0.95 + (i % 4) * 0.05]);
const f2b = (frames: number) => frames / ((FPS * 60) / 124);

const CUES: Cue[] = [
  // the problem
  ...typing(HOOK.type1, HOOK.type1 + 0.6, 0.55), [HOOK.page, "whoosh", 0.45, 0.9],
  ...Array.from({ length: 16 }, (_, i): Cue => [HOOK.page + 0.5 + i * 0.42, "tick", 0.22 + i * 0.01, 0.9 + i * 0.02]),
  [HOOK.slam1, "stamp", 0.45], [HOOK.slam2, "select", 0.55], [HOOK.close, "click", 0.7], [HOOK.close + 0.1, "fall", 0.5],
  [HOOK.leave, "stamp", 0.55, 0.9], ...typing(HOOK.stay, HOOK.stay + 0.9, 0.4),
  ...HOOK.chips.map((n, i): Cue => [n, "drop", 0.6, 0.9 + i * 0.07]), [-1, "whip", 0.5, 0.9], [-0.6, "pluck", 0.4, 1.2],
  // drop: logo
  [0, "stamp", 0.55], [0, "glass", 0.35], [0.6, "pop", 0.4, 1.3], [1, "whoosh", 0.3, 1.3], [2.3, "pop", 0.45], [3.55, "rise", 0.45],
  // statements
  ...typing(AT.sChat, AT.sChat + 1.2, 0.5), [S("sChat", 3.6), "rise", 0.4, 1.2],
  [AT.sExtract, "stamp", 0.4, 1.1], [S("sExtract", 1.4), "stamp", 0.45, 1.25], [S("sExtract", 3.6), "rise", 0.4],
  [AT.sFollow, "glitch", 0.3], [AT.sFollow, "stamp", 0.4], [S("sFollow", 1.4), "stamp", 0.5, 1.2], [S("sFollow", 3.6), "rise", 0.45],
  [AT.sKB, "select", 0.5], [S("sKB", 1.4), "whoosh", 0.35, 1.4], [S("sKB", 1.5), "pop", 0.45], [S("sKB", 3.6), "rise", 0.4],
  [AT.sAI, "glass", 0.35], ...typing(AT.sAI, AT.sAI + 1, 0.5), [S("sAI", 3.6), "rise", 0.4],
  ...[0, 0.75, 1.5, 2.25].map((n, i): Cue => [S("sBlocks", n), "stamp", 0.4, 1 + i * 0.1]), [S("sBlocks", 3.6), "rise", 0.45],
  ...typing(AT.sShare, AT.sShare + 1, 0.5), [S("sShare", 3.6), "rise", 0.4],
  [AT.sBranch, "whoosh", 0.4, 1.1], [S("sBranch", 1.2), "whoosh", 0.4, 1.3], [S("sBranch", 3.6), "rise", 0.4],
  // chat: type, send, reply
  [S("chat", 0), "land", 0.35, 1.1], ...typing(S("chat", 0.45), S("chat", 0.95)), [S("chat", 1), "click", 0.6], [S("chat", 1), "pop", 0.45, 1.2],
  [S("chat", 1.9), "pop", 0.55, 0.95], ...typing(S("chat", 2.4), S("chat", 2.95)), [S("chat", 3), "click", 0.6], [S("chat", 3), "pop", 0.45, 1.3], [S("chat", 3.3), "whoosh", 0.3, 1.2], [S("chat", 3.72), "rise", 0.4, 1.2],
  // extract
  [S("extract", 0), "land", 0.45], [S("extract", 1), "select", 0.5, 1.1], [S("extract", 1.15), "drop", 0.45, 1.2], [S("extract", 2), "select", 0.5, 1.2], [S("extract", 2.15), "drop", 0.45, 1.3], [S("extract", 3), "confirm", 0.5], [S("extract", 3.6), "whoosh", 0.45, 0.9],
  // follow-ups
  [S("followA", 0), "stamp", 0.5], [S("followA", 0), "glass", 0.3], ...[1, 2, 3].flatMap((n, i): Cue[] => [[S("followA", n), "pop", 0.6, 1 + i * 0.12], [S("followA", n), "whoosh", 0.3, 1.3 + i * 0.1], [S("followA", n) + 0.5, "drop", 0.45, 1.1 + i * 0.1]]), [S("followA", 3.6), "whoosh", 0.4, 0.9],
  [S("followB", 0), "pop", 0.5], [S("followB", RESUME.click), "click", 0.7], [S("followB", RESUME.click) + 0.2, "whoosh", 0.35, 1.2], [S("followB", RESUME.answer), "pop", 0.55, 1.2], [S("followB", RESUME.done), "stamp", 0.8], [S("followB", 3.65), "whoosh", 0.4],
  // answers
  [S("answers", 0), "whip", 0.5, 1.1], [S("answers", 0.05), "pop", 0.45], [S("answers", 1), "switch", 0.55], [S("answers", 2), "switch", 0.55, 1.1], [S("answers", 2.05), "confirm", 0.45, 1.1], [S("answers", 3), "pop", 0.45, 1.2], [S("answers", 3.6), "fall", 0.45],
  // AI builds it
  [S("ask", 0), "land", 0.4], ...typing(S("ask", ASK_T.typeFrom), S("ask", ASK_T.typeTo), 0.4), [S("ask", ASK_T.send), "click", 0.7], [S("ask", ASK_T.send) + 0.4, "pop", 0.45, 1.2], [S("ask", 3.5), "rise", 0.35, 1.3],
  ...STREAM_AT.map((n, i): Cue => [S("stream", n), "drop", 0.5, 1 + i * 0.07]), [S("stream", 3.6), "fall", 0.4],
  [S("edit", 0), "whoosh", 0.35, 1.2], ...typing(S("edit", 0.1), S("edit", EDIT.typeTo), 0.4), [S("edit", EDIT.send), "click", 0.7], [S("edit", EDIT.send) + 0.3, "pop", 0.55], [S("edit", EDIT.tag), "toggle", 0.6], [S("edit", 3.6), "whip", 0.45],
  // blocks, one per bar
  [S("blocksA", 0), "land", 0.45], [S("blocksA", 0) + f2b(60), "click", 0.65], [S("blocksA", 0) + f2b(66), "confirm", 0.55],
  [S("blocksA", 1), "whip", 0.4, 1.2], [S("blocksA", 1) + f2b(12), "scroll", 0.45], [S("blocksA", 2), "whip", 0.4, 1.3], [S("blocksA", 2) + f2b(52), "toggle", 0.6], [S("blocksA", 3), "whip", 0.4, 1.4], [S("blocksA", 3) + f2b(56), "click", 0.6], [S("blocksA", 3) + f2b(58), "select", 0.5], [S("blocksA", 3.6), "whoosh", 0.45, 1.1],
  [S("blocksB", 0), "whip", 0.45, 0.9], ...[0, 1, 2, 3].map((n, i): Cue => [S("blocksB", n), "pop", 0.5, 1 + i * 0.1]), ...[0, 1, 2, 3, 4].map((k): Cue => [S("blocksB", 2) + f2b(4 + k * 3), "tick", 0.35, 1 + k * 0.08]), [S("blocksB", 3.6), "fall", 0.4],
  // branching + no dead ends
  [S("branch", 0), "land", 0.45], [S("branch", BRANCH.a1), "pop", 0.55, 1.1], [S("branch", BRANCH.a2), "pop", 0.55, 1.3], [S("branch", BRANCH.lines), "whoosh", 0.35, 1.2], [S("branch", BRANCH.n1), "drop", 0.5, 1.1], [S("branch", BRANCH.n2), "drop", 0.5, 1.25], [S("branch", BRANCH.pill), "confirm", 0.45], [S("branch", 7.6), "fall", 0.45],
  [S("logic", 0), "whoosh", 0.4, 1.2], [S("logic", LOGIC.walk), "tick", 0.4], [S("logic", LOGIC.dead), "glitch", 0.55], [S("logic", LOGIC.fix), "confirm", 0.55], [S("logic", 3.6), "whip", 0.5],
  // share
  [S("share", 0), "land", 0.4], ...[1, 2, 3].flatMap((n, i): Cue[] => [[S("share", n), "click", 0.7, 1 + i * 0.05], [S("share", n) + 0.1, "select", 0.35, 1.1 + i * 0.1]]), [S("share", 0.5), "tick", 0.4, 1.3], [S("share", 2.3), "shutter-modern", 0.4], [S("share", 3.6), "rise", 0.45],
  // recap + end card
  [AT.recap, "whoosh", 0.4, 0.9], ...Array.from({ length: 12 }, (_, i): Cue => [AT.recap + i * 0.5, "tick", 0.2, 1 + (i % 4) * 0.08]), [S("recap", 2.6), "pop", 0.5], [S("recap", 3.55), "rise", 0.45, 1.1],
  [AT.end, "land", 0.6], [AT.end + 0.1, "glass", 0.45], [AT.end + 1.2, "pop", 0.5],
];

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

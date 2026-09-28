import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./beat";

// ---- tokens, from apps/web/src/app/globals.css ----
export const C = {
  paper: "#FBF8F1", // warm cream
  card: "#FFFFFF",
  ink: "#2A2521",
  muted: "#7A7168",
  border: "#EAE3D7",
  secondary: "#F4EFE6",
  orange: "#FD6F29",
  orangeSoft: "#FFE9DC",
  orangeFg: "#C24A17",
  violet: "#9769DC",
  violetSoft: "#F0E8FC",
  violetFg: "#6B45B0",
  green: "#3FA565",
  greenSoft: "#E3F4E8",
  red: "#E5484D",
  night: "#1B1714",
  chat: "#211C19",
  bubble: "#2E2824",
  bubbleLine: "#3A332E",
  // question-type families
  text: "#5B8FE6",
  contact: "#2CA6B0",
  number: "#E0A92E",
  choice: "#4CB86A",
  scale: "#9A6BE0",
  file: "#E9785F",
  content: "#E77AA6",
};

export const SHADOW_SM = "0 1px 2px #0000000a, 0 4px 16px -6px #0000000f";
export const SHADOW_MD = "0 2px 4px #0000000a, 0 14px 36px -12px #3a200a26";
export const SHADOW_LG = "0 4px 10px #0000000d, 0 34px 80px -24px #5a2a0a38";

export const { fontFamily: DISPLAY } = loadBricolage("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
export const { fontFamily: FONT } = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["500"], subsets: ["latin"] });

// ---- motion helpers ----
export const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_IN = Easing.bezier(0.55, 0, 0.75, 0.2);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** 0→1 between frames a and b. */
export const ramp = (frame: number, a: number, b: number, easing = EASE_OUT) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Slow sine drift so nothing is ever perfectly still. */
export const drift = (frame: number, amp = 1, period = 240, phase = 0) => Math.sin((frame / period) * Math.PI * 2 + phase) * amp;
export const smooth = (frame: number, delay: number, dur = 30) => spring({ frame: frame - delay, fps: FPS, config: { damping: 200 }, durationInFrames: dur });

import React from "react";
import { AbsoluteFill, spring, useCurrentFrame } from "remotion";
import { b, FPS } from "./beat";
import { C, DISPLAY, EASE_IN_OUT, ramp } from "./brand";

/** Scene window in beats. `lf` = frames since the scene's first beat; `bt(n)` = local frame of relative beat n. */
export const useBeatScene = (s: number, e: number, pre = 10, post = 8, stretch = 1) => {
  const f = useCurrentFrame();
  const start = b(s);
  const end = b(s + (e - s) * stretch);
  return { f, lf: f - start, visible: f >= start - pre && f <= end + post, bt: (n: number) => b(s + n * stretch) - start };
};

/**
 * The focus camera. Keys are [beat, x, y, zoom] in scene beats (the same
 * units as `bt`); at each key the camera eases so stage point (x, y) sits at
 * the frame centre at that zoom. The eye stays on whatever just happened.
 */
export type CamKey = [number, number, number, number];
export const Cam: React.FC<{ lf: number; bt: (n: number) => number; keys: CamKey[]; dur?: number; rx?: number; ry?: number; children: React.ReactNode }> = ({ lf, bt, keys, dur = 26, rx = 0, ry = 0, children }) => {
  let [, x, y, z] = keys[0];
  for (let i = 1; i < keys.length; i++) {
    const [at, kx, ky, kz] = keys[i];
    const p = ramp(lf, bt(at), bt(at) + dur, EASE_IN_OUT);
    if (p <= 0) break;
    x += (kx - x) * p;
    y += (ky - y) * p;
    z += (kz - z) * p;
  }
  return <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `perspective(2600px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${z}) translate(${-x}px, ${-y}px)` }}>{children}</div>;
};

/** A soft band of the background colour behind the headline, so zoomed UI never fights it. */
export const TopScrim: React.FC<{ color?: string; h?: number }> = ({ color = C.paper, h = 330 }) => (
  <div style={{ position: "absolute", left: -960, top: -540, width: 1920, height: h, background: `linear-gradient(${color} 0%, ${color} 58%, ${color}00 100%)` }} />
);

export const popSpring = (t: number, damping = 12, stiffness = 220, mass = 0.7) => (t < 0 ? 0 : spring({ frame: t, fps: FPS, config: { damping, stiffness, mass } }));
export const smoothSpring = (t: number, dur = 16) => (t < 0 ? 0 : spring({ frame: t, fps: FPS, config: { damping: 200 }, durationInFrames: dur }));

/** A centred stage: children are placed relative to the frame centre. */
export const Stage: React.FC<{ children: React.ReactNode; scale?: number; style?: React.CSSProperties }> = ({ children, scale = 1, style }) => (
  <AbsoluteFill style={{ overflow: "hidden", ...style }}>
    <div style={{ position: "absolute", left: 960, top: 540, width: 0, height: 0, scale: String(scale) }}>{children}</div>
  </AbsoluteFill>
);

/** Absolutely centred box at (x, y) from the stage centre. */
export const At: React.FC<{ x?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x = 0, y = 0, children, style }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

/**
 * The scene headline: ink, with the last phrase in orange. Words pop in one
 * by one (scale and fade, no masks) and leave with a soft blur.
 */
export const Title: React.FC<{ lf: number; a: string; b?: string; at?: number; out?: number; y?: number; size?: number; light?: boolean }> = ({ lf, a, b: accent, at = 2, out, y = -372, size = 68, light }) => {
  const words = [...a.split(" ").map((w) => [w, light ? "#fff" : C.ink] as const), ...(accent ? accent.split(" ").map((w) => [w, light ? "#FFD2B8" : C.orange] as const) : [])];
  const o = out === undefined ? 0 : ramp(lf, out - 6, out + 2);
  return (
    <At y={y}>
      <div style={{ display: "flex", gap: size * 0.24, fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.05, whiteSpace: "nowrap", opacity: 1 - o, filter: o ? `blur(${o * 10}px)` : undefined }}>
        {words.map(([w, color], i) => {
          const t = lf - at - i * 3;
          const p = popSpring(t, 13, 260, 0.6);
          return (
            <span key={i} style={{ display: "inline-block", color, opacity: ramp(t, 0, 4), scale: String(0.6 + 0.4 * p), filter: t < 4 ? `blur(${(4 - Math.max(0, t)) * 1.5}px)` : undefined }}>
              {w}
            </span>
          );
        })}
      </div>
    </At>
  );
};

/** Warm paper with a soft brand glow behind the centre. */
export const Paper: React.FC<{ glow?: string; bg?: string; children?: React.ReactNode }> = ({ glow = "rgba(253,111,41,.13)", bg = C.paper, children }) => (
  <AbsoluteFill style={{ background: bg }}>
    <AbsoluteFill style={{ background: `radial-gradient(48% 58% at 50% 52%, ${glow}, transparent 72%)` }} />
    {children}
  </AbsoluteFill>
);

import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { C, heroGradient } from "./theme";
import { clamp, ease } from "./lib";
import { BEAT, FLASH_BEATS, FPS, POST, PRE, SCENES, SceneDef, Trans, bf, s } from "./timeline";

// ---------- transitions: everything moves through the centre ----------
function enterStyle(type: Trans, p: number): React.CSSProperties {
  const q = 1 - p; // 1 → 0 as it lands
  switch (type) {
    case "zoom":
      return { transform: `scale(${0.25 + 0.75 * p})`, opacity: Math.min(1, p * 2.5), filter: `blur(${q * 16}px)` };
    case "punch":
      return { transform: `scale(${1 + 0.6 * q})`, opacity: Math.min(1, p * 3), filter: `blur(${q * 20}px)` };
    case "whipL":
      return { transform: `translateX(${q * 1900}px) skewX(${-q * 18}deg)` };
    case "whipR":
      return { transform: `translateX(${-q * 1900}px) skewX(${q * 18}deg)` };
    case "whipUp":
      return { transform: `translateY(${q * 1100}px) skewY(${q * 6}deg)` };
    case "whipDown":
      return { transform: `translateY(${-q * 1100}px) skewY(${-q * 6}deg)` };
    case "spin":
      return { transform: `rotate(${q * -80}deg) scale(${0.3 + 0.7 * p})`, opacity: Math.min(1, p * 2.5) };
    case "flip":
      return { transform: `perspective(1600px) rotateY(${q * -90}deg)`, opacity: p > 0.05 ? 1 : 0 };
    case "iris":
      return { clipPath: `circle(${p * 1200}px at 960px 540px)` };
    case "glitch": {
      const j = q > 0.02 ? (random(`g${Math.round(q * 100)}`) - 0.5) * 80 * q : 0;
      return { transform: `translateX(${j}px) scale(${1 + 0.08 * q})`, filter: q > 0.05 ? `drop-shadow(${12 * q}px 0 0 rgba(255,0,80,0.7)) drop-shadow(${-12 * q}px 0 0 rgba(0,220,255,0.7))` : undefined };
    }
    default:
      return {};
  }
}

function exitStyle(type: Trans, p: number): React.CSSProperties {
  switch (type) {
    case "zoom":
      return { transform: `scale(${1 + 5 * p * p})`, opacity: 1 - interpolate(p, [0.4, 1], [0, 1], clamp), filter: `blur(${p * 18}px)` };
    case "punch":
      return { transform: `scale(${1 - 0.3 * p})`, opacity: 1 - p };
    case "whipL":
      return { transform: `translateX(${-p * 1900}px) skewX(${p * 18}deg)` };
    case "whipR":
      return { transform: `translateX(${p * 1900}px) skewX(${-p * 18}deg)` };
    case "whipUp":
      return { transform: `translateY(${-p * 1100}px) skewY(${-p * 6}deg)` };
    case "whipDown":
      return { transform: `translateY(${p * 1100}px) skewY(${p * 6}deg)` };
    case "spin":
      return { transform: `rotate(${p * 80}deg) scale(${1 + 2 * p})`, opacity: 1 - p };
    case "flip":
      return { transform: `perspective(1600px) rotateY(${p * 90}deg)`, opacity: p < 0.95 ? 1 : 0 };
    case "iris":
      return { clipPath: `circle(${(1 - p) * 1200}px at 960px 540px)` };
    case "glitch": {
      const j = p > 0.02 ? (random(`x${Math.round(p * 100)}`) - 0.5) * 120 * p : 0;
      return { transform: `translateX(${j}px) scaleY(${1 + 0.1 * p})`, opacity: 1 - p * p, filter: `drop-shadow(${16 * p}px 0 0 rgba(255,0,80,0.8)) drop-shadow(${-16 * p}px 0 0 rgba(0,220,255,0.8))` };
    }
    default:
      return {};
  }
}

/** Wraps a scene: enter/exit transitions around the beat, centred origin. */
export function SceneShell({ def, children }: { def: SceneDef; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const len = bf(def.len);
  const pin = def.enter === "cut" ? 1 : interpolate(frame, [0, PRE + 8], [0, 1], { ...clamp, easing: ease.out });
  const pout = def.exit === "cut" ? 0 : interpolate(frame, [PRE + len - PRE, PRE + len + POST], [0, 1], { ...clamp, easing: ease.in });
  const a = enterStyle(def.enter, pin);
  const b = pout > 0 ? exitStyle(def.exit, pout) : {};
  return (
    <AbsoluteFill style={{ transformOrigin: "960px 540px", ...a }}>
      <AbsoluteFill style={{ transformOrigin: "960px 540px", ...b }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------- background: a new colour world every bar, opened from centre ----------
const BG: Record<SceneDef["bg"], (d: number) => string> = {
  cream: () => `radial-gradient(70% 70% at 50% 45%, #FFFDF7 0%, ${C.cream} 60%, #F1EADC 100%)`,
  gradient: (d) => heroGradient(d),
  sunset: (d) => `radial-gradient(60% 70% at ${30 + d * 10}% 40%, #FF8A3D 0%, rgba(255,138,61,0) 70%), radial-gradient(60% 80% at ${75 - d * 8}% 70%, #B07CF0 0%, rgba(176,124,240,0) 70%), linear-gradient(160deg, #F3785A, #D884B8)`,
  night: () => `radial-gradient(70% 60% at 50% 40%, #2C2420 0%, ${C.night} 70%)`,
  violet: (d) => `radial-gradient(60% 70% at ${50 + d * 12}% 40%, #B391F0 0%, rgba(179,145,240,0) 70%), linear-gradient(150deg, #7F55CF, #5A3AA8)`,
  orange: (d) => `radial-gradient(60% 70% at ${50 - d * 12}% 35%, #FFB07A 0%, rgba(255,176,122,0) 70%), linear-gradient(150deg, #FD6F29, #F0501C)`,
  black: () => `radial-gradient(60% 60% at 50% 50%, #1A1512 0%, #0B0908 80%)`,
};

export function Background() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const d = Math.sin(t * 0.9);
  return (
    <>
      {SCENES.map((sc, i) => {
        const start = bf(sc.at);
        const end = bf(sc.at + sc.len);
        const next = SCENES[i + 1];
        if (frame < start - PRE - 2 || frame > end + POST + 12) return null;
        // opens from the centre just before its beat
        const r = i === 0 ? 3000 : interpolate(frame, [start - 3, start + 5], [0, 2300], { ...clamp, easing: ease.out });
        const hidden = next && frame > bf(next.at) + 8;
        if (hidden) return null;
        return <AbsoluteFill key={sc.id} style={{ background: BG[sc.bg](d), clipPath: `circle(${r}px at 960px 540px)` }} />;
      })}
      <Dots />
    </>
  );
}

/** A slowly drifting dot grid over every background: the frame is never dead. */
function Dots() {
  const frame = useCurrentFrame();
  const x = (frame * 0.6) % 40;
  const y = (frame * 0.35) % 40;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1.4px, transparent 1.6px)",
        backgroundSize: "40px 40px",
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: "soft-light",
        maskImage: "radial-gradient(60% 60% at 50% 50%, black 0%, transparent 100%)",
      }}
    />
  );
}

/** Camera bump on every beat of the groove sections; bigger on the "one". */
export function usePulse() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const beat = Math.floor(t / BEAT);
  const sc = [...SCENES].reverse().find((x) => beat >= x.at);
  if (!sc?.pulse) return 1;
  const since = t - beat * BEAT;
  const amp = beat % 4 === 0 ? 0.03 : 0.014;
  return 1 + amp * Math.exp(-since * 14);
}

export function Flashes() {
  const frame = useCurrentFrame();
  return (
    <>
      {FLASH_BEATS.map((at) => {
        const o = interpolate(frame, [bf(at) - 1, bf(at) + 1, bf(at) + 12], [0, 0.8, 0], clamp);
        return o > 0 ? <AbsoluteFill key={at} style={{ background: "#fff", opacity: o, mixBlendMode: "screen" }} /> : null;
      })}
    </>
  );
}

export const sceneFrom = (sc: SceneDef) => bf(sc.at) - PRE;
export const sceneDur = (sc: SceneDef) => bf(sc.len) + PRE + POST;
export { s };

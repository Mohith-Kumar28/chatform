import React, { createContext, useContext } from "react";
import { Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import manifest from "./sfx-manifest.json";
import { BEAT, FPS, PRE, s } from "./timeline";
import { C, DISPLAY } from "./theme";

export const SPRING = {
  snappy: { damping: 16, stiffness: 260, mass: 0.6 },
  pop: { damping: 10, stiffness: 240, mass: 0.6 }, // overshoots: chips, icons
  smooth: { damping: 24, stiffness: 150, mass: 0.9 },
  heavy: { damping: 14, stiffness: 120, mass: 1.2 },
} as const;

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  back: Easing.bezier(0.34, 1.56, 0.64, 1),
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Seconds since this scene's beat (scene Sequences start PRE frames early). */
export function useT() {
  return (useCurrentFrame() - PRE) / FPS;
}
/** Beats since this scene's beat. */
export function useB() {
  return useT() / BEAT;
}

/** Spring that starts at `atBeat` (scene-local beats). */
export function useBeatSpring(atBeat: number, cfg: keyof typeof SPRING = "snappy") {
  const frame = useCurrentFrame();
  return spring({ frame: frame - PRE - s(atBeat * BEAT), fps: FPS, config: SPRING[cfg] });
}
export function spr(frame: number, atBeat: number, cfg: keyof typeof SPRING = "snappy") {
  return spring({ frame: frame - PRE - s(atBeat * BEAT), fps: FPS, config: SPRING[cfg] });
}
/** Eased 0→1 between two scene-local beats. */
export function tw(b: number, from: number, to: number, easing = ease.out) {
  return interpolate(b, [from, to], [0, 1], { ...clamp, easing });
}

// ---------- sound ----------
// Scenes render twice: once for pictures inside the motion blur (which replays
// its children several times per frame), once for sound only. Only the sound
// pass emits audio, so nothing plays twice.
export const SoundPass = createContext(false);
type SfxName = keyof typeof manifest;
/**
 * A sound effect placed on a scene-local beat. `align` says which moment of
 * the file lands on that beat: "peak" for whooshes and impacts (the loudest
 * point hits the cut), "onset" for clicks, pops and typing.
 */
export function Sfx({ name, at, align = "onset", volume = 0.7, maxSeconds }: { name: SfxName; at: number; align?: "onset" | "peak"; volume?: number; maxSeconds?: number }) {
  const on = useContext(SoundPass);
  const m = manifest[name];
  if (!on) return null;
  const from = PRE + s(at * BEAT) - s(m[align]);
  const len = maxSeconds ? s(maxSeconds) : s(m.end + 0.3);
  const fade = (f: number) => (maxSeconds ? interpolate(f, [len - 6, len], [1, 0], clamp) : 1);
  return (
    <Sequence from={from} durationInFrames={len} layout="none">
      <Audio src={staticFile(`sfx/${m.file}`)} volume={(f) => 0.75 * volume * fade(f)} />
    </Sequence>
  );
}

/** A slice of a real typing recording under a typed line. */
export function Typing({ at, seconds, volume = 0.5, name = "typing-fast" as SfxName, offset = 3 }: { at: number; seconds: number; volume?: number; name?: SfxName; offset?: number }) {
  const on = useContext(SoundPass);
  const len = s(seconds);
  if (!on) return null;
  return (
    <Sequence from={PRE + s(at * BEAT)} durationInFrames={len} layout="none">
      <Audio src={staticFile(`sfx/${manifest[name].file}`)} trimBefore={s(offset)} volume={(f) => 0.75 * volume * interpolate(f, [0, 3, len - 5, len], [0, 1, 1, 0], clamp)} />
    </Sequence>
  );
}

/** Characters typed from `atBeat` at `cps`. */
export function typed(text: string, b: number, atBeat: number, cps = 30) {
  const n = Math.max(0, Math.min(text.length, Math.floor((b - atBeat) * BEAT * cps)));
  return text.slice(0, n);
}

export function Caret({ color = C.orange, h = 30 }: { color?: string; h?: number }) {
  const on = Math.floor(useCurrentFrame() / 16) % 2 === 0;
  return <span style={{ display: "inline-block", width: 3, height: h, marginLeft: 3, background: color, opacity: on ? 1 : 0, verticalAlign: "middle", borderRadius: 2 }} />;
}

// ---------- type animations (each scene uses a different one) ----------
type TextProps = { text: string; at: number; size?: number; color?: string; weight?: number; out?: number; style?: React.CSSProperties; accent?: string; accentColor?: string };

const base = (size: number, color: string, weight: number): React.CSSProperties => ({
  fontFamily: DISPLAY,
  fontWeight: weight,
  fontSize: size,
  lineHeight: 1.02,
  letterSpacing: "-0.035em",
  color,
  textAlign: "center",
  whiteSpace: "pre",
});

function outStyle(frame: number, out?: number): React.CSSProperties {
  if (out === undefined) return {};
  const p = interpolate(frame - PRE, [s(out * BEAT) - 8, s(out * BEAT)], [0, 1], clamp);
  return { opacity: 1 - p, transform: `scale(${1 - 0.15 * p})`, filter: `blur(${p * 10}px)` };
}

/** Slams in from big and blurred, like a camera punch. */
export function Slam({ text, at, size = 150, color = C.ink, weight = 800, out, style }: TextProps) {
  const frame = useCurrentFrame();
  const p = spr(frame, at, "snappy");
  if (p <= 0.001) return null;
  return (
    <div style={{ ...outStyle(frame, out), ...style }}>
      <div style={{ ...base(size, color, weight), transform: `scale(${mix(2.6, 1, p)})`, opacity: Math.min(1, p * 3), filter: `blur(${(1 - Math.min(1, p)) * 24}px)` }}>{text}</div>
    </div>
  );
}

/** Letters spring up one by one, no masks. */
export function Rise({ text, at, size = 120, color = C.ink, weight = 800, out, style, accent, accentColor = C.orange }: TextProps) {
  const frame = useCurrentFrame();
  let k = 0;
  return (
    <div style={{ ...outStyle(frame, out), ...style }}>
      {text.split("\n").map((line, li) => (
        <div key={li} style={{ ...base(size, color, weight), display: "flex", justifyContent: "center" }}>
          {line.split("").map((ch, i) => {
            const p = spr(frame, at + (k++ * 0.018) / BEAT, "pop");
            const inAccent = accent && line.includes(accent) && i >= line.indexOf(accent) && i < line.indexOf(accent) + accent.length;
            return (
              <span key={i} style={{ display: "inline-block", color: inAccent ? accentColor : color, transform: `translateY(${(1 - p) * 60}px) rotate(${(1 - p) * 14}deg) scale(${0.4 + 0.6 * p})`, opacity: Math.min(1, p * 2), whiteSpace: "pre" }}>
                {ch}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Words pop in with a bounce and a tilt. */
export function Pop({ text, at, size = 96, color = C.ink, weight = 800, out, style, accent, accentColor = C.orange }: TextProps) {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ ...outStyle(frame, out), display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.26}px`, maxWidth: 1500, ...style }}>
      {words.map((w, i) => {
        const p = spr(frame, at + (i * 0.06) / BEAT, "pop");
        return (
          <span key={i} style={{ ...base(size, accent && accent.split(" ").includes(w) ? accentColor : color, weight), display: "inline-block", transform: `scale(${p}) rotate(${(1 - p) * (i % 2 ? 10 : -10)}deg)`, opacity: Math.min(1, p * 3) }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/** Letter-spacing collapses from wide to tight while it sharpens. */
export function Track({ text, at, size = 90, color = C.ink, weight = 700, out, style }: TextProps) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - PRE, [s(at * BEAT), s(at * BEAT) + 22], [0, 1], { ...clamp, easing: ease.out });
  if (frame - PRE < s(at * BEAT)) return null;
  return (
    <div style={{ ...outStyle(frame, out), ...style }}>
      <div style={{ ...base(size, color, weight), letterSpacing: `${mix(0.5, -0.03, p)}em`, opacity: p, filter: `blur(${(1 - p) * 12}px)` }}>{text}</div>
    </div>
  );
}

/** A marker swipe behind the text, then the text. */
export function Marker({ text, at, size = 88, color = C.ink, weight = 800, out, style, accentColor = C.orange }: TextProps) {
  const frame = useCurrentFrame();
  const sw = interpolate(frame - PRE, [s(at * BEAT), s(at * BEAT) + 12], [0, 1], { ...clamp, easing: ease.out });
  const tx = spr(frame, at + 0.15, "snappy");
  if (frame - PRE < s(at * BEAT)) return null;
  return (
    <div style={{ ...outStyle(frame, out), display: "flex", justifyContent: "center", ...style }}>
      <div style={{ position: "relative", padding: "6px 28px 14px" }}>
        <div style={{ position: "absolute", inset: 0, background: accentColor, borderRadius: 14, transform: `scaleX(${sw}) skewX(-8deg)`, transformOrigin: "0% 50%" }} />
        <div style={{ ...base(size, color, weight), position: "relative", transform: `translateY(${(1 - tx) * 30}px)`, opacity: tx }}>{text}</div>
      </div>
    </div>
  );
}

/** Scales a group of absolutely placed things about the frame centre. */
export function Stage({ children, scale = 1, y = 0 }: { children: React.ReactNode; scale?: number; y?: number }) {
  return <div style={{ position: "absolute", inset: 0, transform: `translateY(${y}px) scale(${scale})`, transformOrigin: "960px 540px" }}>{children}</div>;
}

/** "1 of 3 · Better questions": the chapter marker over a headline. */
export function Kicker({ n, label, at = 0, dark = true }: { n?: number; label: string; at?: number; dark?: boolean }) {
  const frame = useCurrentFrame();
  const p = spr(frame, at, "pop");
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 16, display: "flex", justifyContent: "center", zIndex: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, transform: `scale(${p})`, opacity: Math.min(1, p * 3), fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, letterSpacing: "0.12em", color: dark ? C.white : C.ink, background: dark ? "rgba(27,23,20,0.6)" : "rgba(255,255,255,0.75)", backdropFilter: "blur(16px)", padding: "7px 20px 7px 8px", borderRadius: 999 }}>
        {n !== undefined && <span style={{ width: 32, height: 32, borderRadius: 16, background: C.orange, color: C.ink, display: "grid", placeItems: "center", letterSpacing: 0, fontSize: 22 }}>{n}</span>}
        {label.toUpperCase()}
      </div>
    </div>
  );
}

/** Centered block, the default place for a scene's headline. It sits outside
 * the camera, so a frosted backdrop keeps it readable over zoomed UI. */
export function Headline({ children, y = 120, backdrop, at = 0, out }: { children: React.ReactNode; y?: number; backdrop?: "dark" | "light"; at?: number; out?: number }) {
  const frame = useCurrentFrame();
  const f = frame - PRE;
  // the frosted pill arrives with its text and leaves with it, never empty
  const vis = Math.min(interpolate(f, [s(at * BEAT) - 2, s(at * BEAT) + 8], [0, 1], clamp), out === undefined ? 1 : interpolate(f, [s(out * BEAT) - 8, s(out * BEAT)], [1, 0], clamp));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", zIndex: 5 }}>
      <div style={backdrop ? { padding: "10px 34px 18px", borderRadius: 28, background: backdrop === "dark" ? `rgba(27,23,20,${0.55 * vis})` : `rgba(255,253,247,${0.6 * vis})`, backdropFilter: vis > 0.02 ? `blur(${18 * vis}px)` : undefined } : undefined}>{children}</div>
    </div>
  );
}

/**
 * The camera. Keys are [beat, x, y, zoom]: at each beat the camera starts
 * moving so that world point (x, y) ends up at the frame centre, at that
 * zoom. Whatever just happened is always brought to the same place.
 */
export type CamKey = [number, number, number, number];
export function Cam({ keys, children, dur = 0.9, tilt = 0 }: { keys: CamKey[]; children: React.ReactNode; dur?: number; tilt?: number }) {
  const b = useB();
  let [, x, y, z] = keys[0];
  for (let i = 1; i < keys.length; i++) {
    const [at, kx, ky, kz] = keys[i];
    const p = interpolate(b, [at, at + dur], [0, 1], { ...clamp, easing: ease.inOut });
    if (p <= 0) break;
    x = mix(x, kx, p);
    y = mix(y, ky, p);
    z = mix(z, kz, p);
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(960px, 560px) scale(${z}) rotate(${tilt}deg) translate(${-x}px, ${-y}px)` }}>
      {children}
    </div>
  );
}

export function Center({ children, y = 0, scale = 1, style }: { children: React.ReactNode; y?: number; scale?: number; style?: React.CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: `translateY(${y}px) scale(${scale})`, ...style }}>{children}</div>;
}

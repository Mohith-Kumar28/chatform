import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, DISPLAY, FONT } from "./brand";

// ---------- icons (lucide paths) ----------
const ICONS: Record<string, React.ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  mail: (<><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>),
  link: (<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>),
  qr: (<><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M21 21v.01" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /><path d="M3 12h.01" /><path d="M12 3h.01" /><path d="M12 16v.01" /><path d="M16 12h1" /><path d="M21 12v.01" /><path d="M12 21v-1" /></>),
  code: (<><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></>),
  window: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M2 8h20" /><path d="M6 4v4" /></>),
  globe: (<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>),
  sparkles: <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
  arrowUp: (<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>),
  arrowRight: (<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  file: (<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>),
  shield: (<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>),
  star: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />,
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>),
  pen: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  calendar: (<><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>),
  list: (<><path d="M3 12h.01" /><path d="M3 18h.01" /><path d="M3 6h.01" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M8 6h13" /></>),
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  hash: (<><line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" /></>),
  grid: (<><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>),
  gauge: (<><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>),
  toggle: (<><rect width="20" height="12" x="2" y="6" rx="6" /><circle cx="16" cy="12" r="2" /></>),
  chart: (<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>),
  x: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
};

export const Icon: React.FC<{ name: string; size?: number; color?: string; fill?: string; stroke?: number; style?: React.CSSProperties }> = ({ name, size = 20, color = "currentColor", fill = "none", stroke = 2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
    {ICONS[name]}
  </svg>
);

// ---------- brand ----------
const L = "M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z";
const R = "M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z";
/** The chatform mark: two speech-bubble halves. `join` 0→1 brings them together. */
export const Mark: React.FC<{ size: number; join?: number; mono?: string; style?: React.CSSProperties }> = ({ size, join = 1, mono, style }) => {
  const q = 1 - join;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible", ...style }}>
      <path d={L} fill={mono ?? C.orange} transform={`translate(${-9 * q} ${3 * q}) rotate(${-24 * q} 12 16)`} />
      <path d={R} fill={mono ?? C.violet} transform={`translate(${9 * q} ${-3 * q}) rotate(${24 * q} 20 16)`} />
    </svg>
  );
};

// ---------- chat ----------
export const Bubble: React.FC<{ from: "bot" | "user"; children: React.ReactNode; size?: number; light?: boolean; style?: React.CSSProperties }> = ({ from, children, size = 26, light, style }) => {
  const bot = from === "bot";
  const r = size * 0.8;
  return (
    <div
      style={{
        padding: `${size * 0.6}px ${size * 0.82}px`,
        background: bot ? (light ? C.card : C.bubble) : C.orange,
        color: bot ? (light ? C.ink : "#F6F1EA") : "#231A14",
        border: bot ? `1px solid ${light ? C.border : C.bubbleLine}` : "none",
        borderRadius: bot ? `${r}px ${r}px ${r}px ${size * 0.22}px` : `${r}px ${r}px ${size * 0.22}px ${r}px`,
        fontFamily: FONT,
        fontSize: size,
        lineHeight: 1.36,
        fontWeight: bot ? 450 : 560,
        whiteSpace: "nowrap",
        boxShadow: light ? SHADOW_BUBBLE_LIGHT : "0 16px 36px -16px rgba(0,0,0,0.55)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
const SHADOW_BUBBLE_LIGHT = "0 2px 4px #0000000a, 0 14px 30px -14px #3a200a33";

export const TypeChip: React.FC<{ label: string; color: string; size?: number }> = ({ label, color, size = 18 }) => (
  <div style={{ fontFamily: FONT, fontSize: size, fontWeight: 600, color, background: `${color}1F`, border: `1px solid ${color}55`, padding: `${size * 0.32}px ${size * 0.72}px`, borderRadius: 999, whiteSpace: "nowrap" }}>{label}</div>
);

// ---------- interaction ----------
/** macOS-like pointer. `press` 0→1 squishes it. */
export const Cursor: React.FC<{ x: number; y: number; press?: number; size?: number; opacity?: number }> = ({ x, y, press = 0, size = 50, opacity = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity, scale: String(1 - press * 0.16), transformOrigin: "0 0", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.28))", zIndex: 50 }}>
    <svg width={size} height={size * 1.25} viewBox="0 0 24 30">
      <path d="M2 1.5v23.2l6.1-5.7 3.9 9 4.1-1.8-3.9-8.8h8.3z" fill={C.ink} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </div>
);

export const Ripple: React.FC<{ x: number; y: number; t: number; color?: string }> = ({ x, y, t, color = C.orange }) =>
  t <= 0 || t >= 1 ? null : <div style={{ position: "absolute", left: x - 40, top: y - 40, width: 80, height: 80, borderRadius: 999, border: `3px solid ${color}`, opacity: 1 - t, scale: String(0.2 + t * 1.3), zIndex: 49 }} />;

/** Radial particle burst; t = frames since it fired. */
export const Burst: React.FC<{ t: number; n?: number; r?: number; color?: string; size?: number; seed?: number }> = ({ t, n = 12, r = 220, color = C.orange, size = 12, seed = 0 }) => {
  if (t < 0 || t > 30) return null;
  const p = 1 - Math.pow(1 - t / 30, 3);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + seed;
        const rr = r * (0.7 + ((i * 37) % 10) / 25) * p;
        return <div key={i} style={{ position: "absolute", left: Math.cos(a) * rr - size / 2, top: Math.sin(a) * rr - size / 2, width: size, height: size, borderRadius: 999, background: i % 3 === 0 ? C.violet : color, opacity: 1 - t / 30, scale: String(1 - p * 0.6) }} />;
      })}
    </>
  );
};

export const Ring: React.FC<{ t: number; max?: number; color?: string; width?: number; dur?: number }> = ({ t, max = 900, color = C.orange, width = 6, dur = 28 }) => {
  if (t < 0 || t > dur) return null;
  const p = 1 - Math.pow(1 - t / dur, 3);
  const d = max * p;
  return <div style={{ position: "absolute", left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: 999, border: `${width * (1 - p) + 1}px solid ${color}`, opacity: 1 - p }} />;
};

/** Directional motion blur through an SVG filter. */
export const MotionBlur: React.FC<{ id: string; x?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ id, x = 0, y = 0, children, style }) => {
  const on = x > 0.3 || y > 0.3;
  return (
    <div style={{ ...style, filter: on ? `url(#${id})` : undefined }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={`${x} ${y}`} />
        </filter>
      </svg>
      {children}
    </div>
  );
};

/** Subtle film grain, re-seeded each frame. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.035 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, mixBlendMode: "multiply" }}>
      <svg width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 12} stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

/** A white card, the base of most product UI. */
export const Card: React.FC<{ w?: number; h?: number; pad?: number; children: React.ReactNode; style?: React.CSSProperties; dark?: boolean }> = ({ w, h, pad = 28, children, style, dark }) => (
  <div style={{ width: w, height: h, boxSizing: "border-box", padding: pad, borderRadius: 26, background: dark ? C.chat : C.card, border: `1px solid ${dark ? C.bubbleLine : C.border}`, boxShadow: dark ? "0 40px 90px -30px rgba(0,0,0,.6)" : "0 2px 4px #0000000a, 0 30px 70px -26px #5a2a0a33", fontFamily: FONT, color: dark ? "#F6F1EA" : C.ink, ...style }}>
    {children}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({ children, color = C.muted, size = 15 }) => (
  <div style={{ fontFamily: FONT, fontSize: size, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color }}>{children}</div>
);

export const Display: React.FC<{ children: React.ReactNode; size?: number; color?: string; weight?: number; style?: React.CSSProperties }> = ({ children, size = 64, color = C.ink, weight = 800, style }) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: weight, fontSize: size, letterSpacing: "-0.04em", color, whiteSpace: "nowrap", lineHeight: 1, ...style }}>{children}</div>
);

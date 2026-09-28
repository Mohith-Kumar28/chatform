import React from "react";
import { C, DISPLAY, MONO, SANS } from "./theme";

// Product UI rebuilt from apps/web: the chat window, bubbles, question rows,
// type chips. Real copy only.

export const LOGO_LEFT = "M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z";
export const LOGO_RIGHT = "M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z";

export function Mark({ size, fly = 1, style }: { size: number; fly?: number; style?: React.CSSProperties }) {
  const q = 1 - fly;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible", flexShrink: 0, ...style }}>
      <path d={LOGO_LEFT} fill={C.orange} transform={`translate(${-60 * q} ${10 * q}) rotate(${-40 * q} 12 16)`} />
      <path d={LOGO_RIGHT} fill={C.violet} transform={`translate(${60 * q} ${-10 * q}) rotate(${40 * q} 20 16)`} />
    </svg>
  );
}

export function Bubble({ from, children, size = 30, style }: { from: "bot" | "user"; children: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  const bot = from === "bot";
  return (
    <div
      style={{
        padding: `${size * 0.62}px ${size * 0.85}px`,
        background: bot ? C.bubble : C.orange,
        color: bot ? "#F6F1EA" : C.ink,
        border: bot ? `1px solid ${C.bubbleLine}` : "none",
        borderRadius: bot ? `${size * 0.8}px ${size * 0.8}px ${size * 0.8}px ${size * 0.22}px` : `${size * 0.8}px ${size * 0.8}px ${size * 0.22}px ${size * 0.8}px`,
        fontFamily: SANS,
        fontSize: size,
        lineHeight: 1.35,
        fontWeight: bot ? 450 : 600,
        whiteSpace: "nowrap",
        boxShadow: "0 18px 40px -14px rgba(0,0,0,0.45)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Dots3({ t }: { t: number }) {
  return (
    <div style={{ display: "flex", gap: 9, padding: "22px 26px", background: C.bubble, borderRadius: "24px 24px 24px 7px", border: `1px solid ${C.bubbleLine}` }}>
      {[0, 1, 2].map((i) => {
        const k = Math.max(0, Math.sin(t * 14 - i * 0.9));
        return <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: "#A89E94", transform: `translateY(${-6 * k}px)`, opacity: 0.5 + 0.5 * k }} />;
      })}
    </div>
  );
}

export function Field({ n, label, w = 820, kind = 0 }: { n: number; label: string; w?: number; kind?: number }) {
  return (
    <div style={{ width: w, padding: "22px 30px", background: C.white, borderRadius: 22, border: `1px solid ${C.border}`, boxShadow: "0 20px 50px -24px rgba(60,40,20,0.35)", boxSizing: "border-box" }}>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 24, color: C.ink, marginBottom: 12 }}>
        <span style={{ color: C.inkSoft, marginRight: 10 }}>{n}.</span>
        {label}
        <span style={{ color: C.orange }}> *</span>
      </div>
      <div style={{ height: 48, borderRadius: 12, background: C.sand, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 16px", fontFamily: SANS, fontSize: 18, color: C.inkSoft }}>
        {kind === 1 ? "Select one  v" : kind === 2 ? "dd / mm / yyyy" : ""}
      </div>
    </div>
  );
}

export function TypeChip({ label, color, size = 20 }: { label: string; color: string; size?: number }) {
  return <div style={{ fontFamily: SANS, fontSize: size, fontWeight: 650, color, background: `${color}22`, border: `1.5px solid ${color}66`, padding: `${size * 0.35}px ${size * 0.75}px`, borderRadius: 999, whiteSpace: "nowrap" }}>{label}</div>;
}

export function QuestionRow({ n, q, type, color, w = 760, dark = true }: { n: number; q: string; type: string; color: string; w?: number; dark?: boolean }) {
  return (
    <div style={{ width: w, height: 96, borderRadius: 24, background: dark ? "#29221E" : C.white, border: `1px solid ${dark ? C.bubbleLine : C.border}`, display: "flex", alignItems: "center", gap: 20, padding: "0 26px", boxSizing: "border-box", boxShadow: "0 20px 50px -20px rgba(0,0,0,0.4)" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: color, color: C.night, display: "grid", placeItems: "center", fontFamily: SANS, fontWeight: 800, fontSize: 22 }}>{n}</div>
      <div style={{ flex: 1, fontFamily: SANS, fontSize: 28, fontWeight: 600, color: dark ? "#F6F1EA" : C.ink }}>{q}</div>
      <TypeChip label={type} color={color} />
    </div>
  );
}

/** A window frame: the chat card, a browser, a terminal. */
export function Window({ w, h, dark = true, title, children, style }: { w: number; h: number; dark?: boolean; title?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ width: w, height: h, borderRadius: 34, background: dark ? C.card : C.white, overflow: "hidden", position: "relative", boxShadow: "0 60px 120px -30px rgba(30,10,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)", ...style }}>
      {title}
      {children}
    </div>
  );
}

export function ChatHeader({ q = 2 }: { q?: number }) {
  return (
    <div style={{ height: 90, display: "flex", alignItems: "center", gap: 16, padding: "0 28px", borderBottom: `1px solid ${C.bubbleLine}` }}>
      <div style={{ width: 48, height: 48, borderRadius: 24, background: C.orange, display: "grid", placeItems: "center", fontFamily: SANS, fontWeight: 800, fontSize: 22, color: C.ink }}>A</div>
      <div style={{ fontFamily: SANS, color: "#F6F1EA" }}>
        <div style={{ fontSize: 22, fontWeight: 650 }}>Ada · Northwind onboarding</div>
        <div style={{ fontSize: 17, color: "#9C9288", marginTop: 3 }}>Question {q} of 8</div>
      </div>
      <div style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 16, color: "#B9AEA3", border: `1px solid ${C.bubbleLine}`, borderRadius: 999, padding: "7px 15px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: "#F0564A" }} />
        Recording
      </div>
    </div>
  );
}

export function Mono({ children, size = 24, color = "#F6F1EA", style }: { children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }) {
  return <div style={{ fontFamily: MONO, fontSize: size, color, whiteSpace: "pre", lineHeight: 1.5, ...style }}>{children}</div>;
}

export function Label({ children, color = C.inkSoft, size = 18 }: { children: React.ReactNode; color?: string; size?: number }) {
  return <div style={{ fontFamily: SANS, fontSize: size, fontWeight: 750, letterSpacing: "0.16em", color }}>{children}</div>;
}

export const H = ({ children, size = 64, color = C.ink, style }: { children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, letterSpacing: "-0.035em", color, lineHeight: 1.02, ...style }}>{children}</div>
);

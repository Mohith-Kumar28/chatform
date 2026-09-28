import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { C, DISPLAY, SANS } from "../theme";
import { Cam, Headline, Pop, Rise, Sfx, Slam, Track, clamp, ease, mix, spr, useB, useT } from "../lib";
import { Field, Mark } from "../ui";

// The long form, in world coordinates: a white page with 25 questions.
const LABELS = [
  "Full name", "Work email", "Phone number", "Company name", "Company website",
  "Job title", "Department", "Team size", "Country", "City", "Industry",
  "Annual revenue", "Current tool", "How did you hear about us?", "What are your goals?",
  "Monthly budget", "Decision timeline", "Who else is involved?",
  "What went wrong with the last tool you tried?",
  "Must-have features", "Nice-to-have features", "Integrations needed",
  "Security requirements", "Preferred contact time", "Anything else?",
];
const PAGE_X = 510;
const PAGE_W = 900;
const PAGE_TOP = 120;
const HEAD = 190;
const ROW = 150;
const PAGE_H = HEAD + LABELS.length * ROW + 40;
const fieldY = (i: number) => PAGE_TOP + HEAD + i * ROW;
const SURVIVOR = 18;

function Page({ explode = 0, hide = -1 }: { explode?: number; hide?: number }) {
  const midY = PAGE_TOP + PAGE_H / 2;
  const e = explode;
  return (
    <>
      <div style={{ position: "absolute", left: PAGE_X, top: PAGE_TOP, width: PAGE_W, height: PAGE_H, background: C.white, borderRadius: 30, border: `1px solid ${C.border}`, boxShadow: "0 60px 140px -40px rgba(60,40,20,0.35)", opacity: 1 - e }}>
        <div style={{ height: 14, background: C.inkSoft, borderRadius: "30px 30px 0 0", opacity: 0.35 }} />
        <div style={{ padding: "34px 40px 0" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 48, color: C.ink, letterSpacing: "-0.02em" }}>Customer onboarding</div>
          <div style={{ fontFamily: SANS, fontSize: 22, color: C.inkSoft, marginTop: 10 }}>25 questions · about 12 minutes · all required</div>
        </div>
      </div>
      {LABELS.map((label, i) => {
        if (i === hide) return null;
        const y = fieldY(i);
        const dir = random(`a${i}`) * Math.PI * 2;
        const dx = Math.cos(dir) * 2600 * e * e;
        const dy = (y - midY) * 2.2 * e + Math.sin(dir) * 900 * e * e;
        return (
          <div key={i} style={{ position: "absolute", left: PAGE_X + 40, top: y, transform: `translate(${dx}px, ${dy}px) rotate(${(random(`r${i}`) - 0.5) * 120 * e}deg) scale(${1 + 1.5 * e})`, opacity: 1 - interpolate(e, [0.5, 1], [0, 1], clamp) }}>
            <Field n={i + 1} label={label} kind={i % 4 === 2 ? 1 : i % 5 === 4 ? 2 : 0} />
          </div>
        );
      })}
    </>
  );
}

// Beat 0-7: the problem, slowly. Scrolling a form that never ends.
export function LongForm() {
  const b = useB();
  const frame = useCurrentFrame();
  const scroll = interpolate(b, [0.5, 8], [0, 1], { ...clamp, easing: ease.in });
  const camY = mix(470, 2500, scroll);
  const tilt = interpolate(b, [0, 8], [0, -2], clamp);
  const q = Math.max(1, Math.min(25, Math.round((camY - PAGE_TOP - HEAD) / ROW) + 2));
  const pill = spr(frame, 0.6, "snappy");
  return (
    <>
      <Cam keys={[[0, 960, camY, 1.15]]} tilt={tilt}>
        <Page />
      </Cam>
      <Headline y={46} backdrop="light" at={0.2} out={4}>
        <Rise text="Ever filled out a long Google Form?" at={0.2} size={86} out={4} />
      </Headline>
      <Headline y={46} backdrop="light" at={4.2}>
        <Slam text="25 questions. All required." at={4.2} size={96} color={C.orange} />
      </Headline>
      <div style={{ position: "absolute", left: 0, right: 0, top: 960, display: "flex", justifyContent: "center", transform: `scale(${pill})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: SANS, fontWeight: 700, fontSize: 28, color: C.ink, background: C.white, border: `1px solid ${C.border}`, padding: "14px 28px", borderRadius: 999, boxShadow: "0 20px 40px -20px rgba(0,0,0,0.3)", fontVariantNumeric: "tabular-nums" }}>
          Question {q} of 25
          <div style={{ width: 220, height: 10, borderRadius: 5, background: C.sand }}>
            <div style={{ width: `${(q / 25) * 100}%`, height: "100%", borderRadius: 5, background: C.orange }} />
          </div>
        </div>
      </div>
      <Sfx name="whoosh-air" at={0} align="peak" volume={0.4} />
      {Array.from({ length: 22 }, (_, i) => {
        // a soft tick each time a question scrolls past, speeding up
        const at = 0.5 + 7.5 * Math.pow((i + 1) / 23, 0.55);
        return <Sfx key={i} name="click-check" at={at} volume={0.25 + i * 0.012} />;
      })}
      <Sfx name="pop-hard" at={4.2} volume={0.6} />
    </>
  );
}

// Beat 8-11: pull back to see the whole thing, then it falls apart.
export function Nobody() {
  const b = useB();
  const frame = useCurrentFrame();
  const out = interpolate(b, [0, 1.8], [0, 1], { ...clamp, easing: ease.inOut });
  const camY = mix(2500, PAGE_TOP + PAGE_H / 2, out);
  const z = mix(1.15, 0.255, out);
  const explode = interpolate(b, [3.0, 4.0], [0, 1], { ...clamp, easing: ease.in });
  const shake = b > 2.7 && b < 3.1 ? (random(`s${frame}`) - 0.5) * 18 : 0;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px)` }}>
        <Cam keys={[[0, 960, camY, z]]}>
          <Page explode={explode} />
        </Cam>
      </div>
      <Headline y={46} backdrop="light" at={0.5}>
        <Rise text="Nobody finishes them." at={0.5} size={110} accent="Nobody" />
      </Headline>
      <Sfx name="whoosh-cine" at={0.8} align="peak" volume={0.5} />
      <Sfx name="impact-zoom" at={3} align="peak" volume={0.9} />
      <Sfx name="whoosh-air" at={3.1} volume={0.5} />
    </>
  );
}

// Beat 12-15: and the few who do finish leave you this.
export const SHEET_COLS = ["Name", "Team size", "What went wrong?", "Budget"];
const THIN = [
  ["Maya", "", "it was bad", ""],
  ["J.", "12?", "ok", "-"],
  ["", "", "", ""],
  ["Sam", "", "idk", ""],
  ["Priya", "", "", "n/a"],
];
export function Sheet({ rows, at = 0, good = false, blanks = 0 }: { rows: string[][]; at?: number; good?: boolean; blanks?: number }) {
  const frame = useCurrentFrame();
  let k = 0;
  return (
    <div style={{ width: 1080, background: C.white, borderRadius: 24, overflow: "hidden", boxShadow: "0 50px 100px -40px rgba(0,0,0,0.6)", fontFamily: SANS }}>
      <div style={{ display: "grid", gridTemplateColumns: "180px 170px 1fr 190px", background: good ? `${C.choice}22` : C.sand, borderBottom: `1px solid ${C.border}` }}>
        {SHEET_COLS.map((c) => <div key={c} style={{ padding: "16px 20px", fontSize: 20, fontWeight: 800, color: C.inkSoft, letterSpacing: "0.04em" }}>{c}</div>)}
      </div>
      {rows.map((r, i) => {
        const p = spr(frame, at + i * 0.2, "snappy");
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 170px 1fr 190px", borderBottom: `1px solid ${C.border}`, transform: `translateY(${(1 - p) * 30}px)`, opacity: Math.min(1, p * 2) }}>
            {r.map((v, j) => {
              const empty = !good && (v === "" || v === "-" || v === "n/a" || v === "ok" || v === "idk" || v === "it was bad" || v === "12?");
              const flag = empty ? spr(frame, blanks + (k++ % 9) * 0.14, "pop") : 0;
              return (
                <div key={j} style={{ padding: "18px 20px", fontSize: 26, fontWeight: 600, color: C.ink, minHeight: 34, position: "relative" }}>
                  <div style={{ position: "absolute", inset: 6, borderRadius: 10, background: v === "" ? "rgba(229,72,77,0.16)" : "rgba(229,72,77,0.10)", border: "2px solid rgba(229,72,77,0.55)", transform: `scale(${flag})`, opacity: flag }} />
                  <span style={{ position: "relative" }}>{v || (good ? "" : "\u00a0")}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function Thin() {
  const b = useB();
  return (
    <>
      <Cam keys={[[0, 960, 600, 1.0], [2.2, 1080, 640, 1.45]]}>
        <div style={{ position: "absolute", left: 420, top: 330 }}>
          <Sheet rows={THIN} at={0.1} blanks={1.2} />
        </div>
      </Cam>
      <Headline y={60} backdrop="dark" at={0.2}>
        <Pop text="The few who finish leave you this." at={0.2} size={80} color={C.white} accent="this." />
      </Headline>
      <Sfx name="tech-slide" at={0} volume={0.9} />
      {Array.from({ length: 9 }, (_, i) => <Sfx key={i} name="pop-dry" at={1.2 + i * 0.14} volume={0.45} />)}
      <Sfx name="zoom-vacuum" at={4} align="peak" volume={0.8} />
      {void b}
    </>
  );
}

/** Mark + wordmark. The final layout is fixed; the word is revealed with a
 * clip, never a width, so it can never end up cropped. */
export function Lockup({ top, markFrom, markTo, font, lock, fly, squash }: { top: number; markFrom: number; markTo: number; font: number; lock: number; fly: number; squash: number }) {
  const m = mix(markFrom, markTo, lock);
  const gap = font * 0.16;
  const wordW = font * 4.62;
  const shift = ((1 - lock) * (wordW + gap)) / 2;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: top - markTo / 2, height: markTo, display: "flex", justifyContent: "center", alignItems: "center", gap }}>
      <div style={{ width: markTo, height: markTo, display: "grid", placeItems: "center", transform: `translateX(${shift}px)`, flexShrink: 0 }}>
        <Mark size={m} fly={fly} style={{ transform: `scale(${1 + 0.2 * squash}, ${1 - 0.14 * squash})` }} />
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: font, letterSpacing: "-0.045em", color: C.ink, lineHeight: 1, whiteSpace: "nowrap", paddingRight: 8, clipPath: `inset(-20% ${(1 - lock) * 100}% -20% 0)`, transform: `translateX(${(1 - lock) * -60}px)`, opacity: Math.min(1, lock * 3) }}>
        chatform
      </div>
    </div>
  );
}

// Beat 16-19: first drop. The mark's halves collide, the name slides out.
export function Reveal() {
  const b = useB();
  const t = useT();
  const fly = interpolate(t, [-0.2, 0], [0, 1], { ...clamp, easing: ease.in });
  const squash = t > 0 ? Math.sin(Math.min(1, t * 6) * Math.PI) * Math.exp(-t * 4) : 0;
  const lock = interpolate(b, [0.9, 1.6], [0, 1], { ...clamp, easing: ease.inOut });
  return (
    <>
      {[0, 0.12].map((d) => {
        const p = interpolate(t, [d, d + 0.7], [0, 1], { ...clamp, easing: ease.out });
        return t > d && p < 1 ? <div key={d} style={{ position: "absolute", left: 960 - 700 * p, top: 450 - 700 * p, width: 1400 * p, height: 1400 * p, borderRadius: "50%", border: `${10 * (1 - p)}px solid rgba(255,255,255,${0.8 * (1 - p)})` }} /> : null;
      })}
      <Lockup top={450} markFrom={380} markTo={190} font={190} lock={lock} fly={fly} squash={squash} />
      <Headline y={640}>
        <Track text="Conversational forms people actually finish." at={2} size={62} />
      </Headline>
      <Sfx name="impact-deep" at={0} align="peak" volume={1} />
      <Sfx name="whoosh-cine" at={1.3} align="peak" volume={0.6} />
      <Sfx name="tech-slide" at={2} volume={0.9} />
      <Sfx name="whoosh-fast" at={4} align="peak" volume={0.6} />
    </>
  );
}

export { Slam };

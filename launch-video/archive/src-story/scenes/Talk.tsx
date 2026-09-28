import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, DISPLAY, HAND, SANS } from "../theme";
import { Cam, Caret, Headline, Kicker, Marker, Pop, Rise, Sfx, Slam, Typing, clamp, ease, mix, spr, typed, useB } from "../lib";
import { Bubble, ChatHeader, Dots3, Label, Window } from "../ui";

// ---------- beat 20-31: the interview, the camera on every new message ----------
const WX = 580, WY = 100, WW = 760, WH = 920;
const AREA_TOP = WY + 96 + 28;
const MSGS = [
  { from: "bot" as const, text: <>What went wrong with the<br />last tool you tried?</>, at: -1, top: 0, h: 118, cx: 830 },
  { from: "user" as const, text: "it was bad", at: 1.9, top: 136, h: 78, cx: 1230 },
  { from: "bot" as const, text: <>Bad how? The price, or<br />something it couldn't do?</>, at: 3.0, top: 232, h: 118, cx: 840 },
  { from: "user" as const, text: "too pricey for a dozen of us", at: 6.2, top: 368, h: 78, cx: 1110 },
  { from: "bot" as const, text: <>Twelve seats, noted. What<br />would make it a fit?</>, at: 8.2, top: 464, h: 118, cx: 840 },
];
const TYPE = [
  { text: "it was bad", at: 0.9, send: 1.9, cps: 16 },
  { text: "too pricey for a dozen of us", at: 4.3, send: 6.2, cps: 26 },
];
const cy = (i: number) => AREA_TOP + MSGS[i].top + MSGS[i].h / 2;
const INPUT_Y = WY + WH - 48;

export function Chat() {
  const frame = useCurrentFrame();
  const b = useB();
  const cur = TYPE.find((x) => b >= x.at && b < x.send);
  const input = cur ? typed(cur.text, b, cur.at, cur.cps) : "";
  const dots = (b > 2.2 && b < 3.0) || (b > 7.5 && b < 8.2);
  const glow = interpolate(b, [3.0, 3.3, 4.4], [0, 1, 0], clamp);
  const chips = [
    { label: "Reason", value: "Price", x: WX - 300, at: 7.0 },
    { label: "Team size", value: "12", x: WX + WW + 300, at: 7.3 },
  ];
  return (
    <>
      <Cam
        keys={[
          [0, 830, 300, 1.55],
          [0.9, 960, INPUT_Y - 60, 1.35],
          [1.9, 1180, cy(1), 1.5],
          [3.0, 860, cy(2), 1.5],
          [4.3, 960, INPUT_Y - 60, 1.35],
          [6.2, 1080, cy(3), 1.5],
          [7.0, 960, 560, 0.86],
          [8.2, 900, cy(4) - 40, 1.2],
          [10, 960, 560, 0.95],
        ]}
      >
        <div style={{ position: "absolute", left: WX, top: WY }}>
          <Window w={WW} h={WH} title={<ChatHeader q={b > 6.2 ? 3 : 2} />}>
            <div style={{ position: "absolute", left: 28, right: 28, top: 124 }}>
              {MSGS.map((m, i) => {
                if (b < m.at) return null;
                const p = m.at < 0 ? 1 : spr(frame, m.at, "pop");
                return (
                  <div key={i} style={{ position: "absolute", top: m.top, left: 0, right: 0, display: "flex", justifyContent: m.from === "bot" ? "flex-start" : "flex-end" }}>
                    <div style={{ transform: `translateY(${(1 - p) * 40}px) scale(${0.5 + 0.5 * p})`, transformOrigin: m.from === "bot" ? "0% 100%" : "100% 100%", opacity: Math.min(1, p * 3) }}>
                      <Bubble from={m.from} size={30} style={i === 2 ? { boxShadow: `0 0 0 ${10 * glow}px rgba(253,111,41,${0.5 * glow}), 0 18px 40px -14px rgba(0,0,0,0.45)` } : undefined}>
                        {m.text}
                      </Bubble>
                    </div>
                  </div>
                );
              })}
              {dots && (
                <div style={{ position: "absolute", top: b < 5 ? 232 : 464, left: 0 }}>
                  <Dots3 t={b} />
                </div>
              )}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 96, borderTop: `1px solid ${C.bubbleLine}`, display: "flex", alignItems: "center", padding: "0 22px 0 30px" }}>
              <div style={{ flex: 1, fontFamily: SANS, fontSize: 28, color: input ? "#F6F1EA" : "#7D746B" }}>
                {input || "Type your answer..."}
                {cur && <Caret h={30} />}
              </div>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: C.orange, display: "grid", placeItems: "center", transform: `scale(${1 - 0.22 * Math.max(...TYPE.map((x) => interpolate(b, [x.send - 0.15, x.send, x.send + 0.35], [0, 1, 0], clamp)))})` }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </div>
            </div>
          </Window>
        </div>
        {/* chips thrown out of the sentence, either side of the window */}
        {chips.map((c) => {
          if (b < c.at) return null;
          const p = spr(frame, c.at, "pop");
          const fly = interpolate(b, [c.at, c.at + 0.8], [0, 1], { ...clamp, easing: ease.out });
          return (
            <div key={c.label} style={{ position: "absolute", left: mix(1080, c.x, fly) - 170, top: mix(cy(3), 560, fly) - 60 - 90 * Math.sin(fly * Math.PI), width: 340, display: "flex", justifyContent: "center", transform: `scale(${p}) rotate(${(c.x > 960 ? 6 : -6) * (1 - fly)}deg)` }}>
              <div style={{ background: C.white, borderRadius: 28, padding: "20px 34px", boxShadow: "0 30px 60px -16px rgba(40,10,0,0.5)", fontFamily: SANS, textAlign: "center" }}>
                <Label size={18}>{c.label.toUpperCase()}</Label>
                <div style={{ fontSize: 64, fontWeight: 800, color: C.ink, marginTop: 2 }}>{c.value}</div>
              </div>
            </div>
          );
        })}
      </Cam>
      <Kicker n={1} label="of 3 · Better questions" />
      <Headline y={82} backdrop="dark" at={0.2} out={2.9}>
        <Pop text="One question at a time." at={0.2} size={76} color={C.white} out={2.9} />
      </Headline>
      <Headline y={82} backdrop="dark" at={3.0} out={6.9}>
        <Pop text="Thin answer? It asks again." at={3.0} size={76} color={C.white} out={6.9} accent="again." />
      </Headline>
      <Headline y={82}>
        <Marker text="And records what it means." at={7.0} size={76} color={C.ink} accentColor={C.white} />
      </Headline>
      <Typing at={TYPE[0].at} seconds={0.55} name="typing-soft" offset={4} volume={0.7} />
      <Typing at={TYPE[1].at} seconds={0.9} name="typing-soft" offset={9} volume={0.7} />
      {TYPE.map((x) => (
        <React.Fragment key={x.text}>
          <Sfx name="click-tech" at={x.send} volume={0.7} />
          <Sfx name="swoosh-fast" at={x.send} volume={0.6} />
        </React.Fragment>
      ))}
      <Sfx name="pop-msg" at={3.0} volume={0.8} />
      <Sfx name="pop-msg" at={8.2} volume={0.8} />
      <Sfx name="whoosh-air" at={7.0} volume={0.35} />
      <Sfx name="pop-bubble" at={7.0} volume={0.7} />
      <Sfx name="pop-bubble" at={7.3} volume={0.7} />
      <Sfx name="whoosh-cine" at={12} align="peak" volume={0.55} />
    </>
  );
}

// ---------- beat 32-39: free text becomes data, one row at a time ----------
const ROWS = [
  { said: "we're about a dozen of us", label: "TEAM SIZE", value: "12" },
  { said: "somewhere between five and ten grand", label: "BUDGET", value: "$5k to $10k" },
  { said: "yeah we tried HubSpot, dropped it", label: "CURRENT CRM", value: "None" },
  { said: "right after the holidays", label: "TIMELINE", value: "January" },
];
const rowY = (i: number) => 360 + i * 170;
const rowAt = (i: number) => 0.5 + i * 1.5;

export function Understand() {
  const frame = useCurrentFrame();
  const b = useB();
  return (
    <>
      <Cam keys={[[0, 960, rowY(0), 1.35], [rowAt(1), 960, rowY(1), 1.35], [rowAt(2), 960, rowY(2), 1.35], [rowAt(3), 960, rowY(3), 1.35], [6.6, 960, 580, 0.95]]}>
        {ROWS.map((r, i) => {
          const at = rowAt(i);
          if (b < at - 0.05) return null;
          const said = typed(r.said, b, at, 48);
          const arrow = interpolate(b, [at + 0.6, at + 0.85], [0, 1], clamp);
          const chip = spr(frame, at + 0.85, "pop");
          const row = spr(frame, at, "snappy");
          const passed = b >= 6.6 ? 1 : i < ROWS.length - 2 && b > rowAt(i + 2) ? 0.06 : i < ROWS.length - 1 && b > rowAt(i + 1) ? 0.3 : 1;
          return (
            <div key={i} style={{ position: "absolute", left: 0, width: 1920, top: rowY(i) - 60, height: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 34, opacity: Math.min(1, row * 2) * passed }}>
              <div style={{ width: 800, textAlign: "right", fontFamily: SANS, fontSize: 42, fontWeight: 500, color: "#EDE5DA" }}>&ldquo;{said}&rdquo;</div>
              <svg width="100" height="34" viewBox="0 0 100 34"><path d="M4 17 H88 M72 5 L90 17 L72 29" fill="none" stroke={C.orange} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arrow} /></svg>
              <div style={{ width: 420 }}>
                <div style={{ display: "inline-block", transform: `scale(${chip})`, transformOrigin: "0% 50%", background: C.orange, borderRadius: 22, padding: "12px 26px" }}>
                  <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 800, letterSpacing: "0.16em", color: "rgba(42,37,33,0.7)" }}>{r.label}</div>
                  <div style={{ fontFamily: SANS, fontSize: 48, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{r.value}</div>
                </div>
              </div>
            </div>
          );
        })}
      </Cam>
      <Kicker n={1} label="of 3 · Better questions" />
      <Headline y={82} backdrop="dark" at={0}>
        <Rise text="It understands what people type." at={0} size={80} color={C.white} accent="understands" />
      </Headline>
      {ROWS.map((r, i) => (
        <React.Fragment key={i}>
          <Typing at={rowAt(i)} seconds={r.said.length / 48 + 0.05} name="typing-soft" offset={2 + i * 3} volume={0.55} />
          <Sfx name="tone-digital" at={rowAt(i) + 0.85} volume={0.55} />
        </React.Fragment>
      ))}
      <Sfx name="whoosh-cine" at={6.6} volume={0.35} />
      <Sfx name="rm-whip" at={8} align="peak" volume={0.8} />
    </>
  );
}

// ---------- beat 40-47: it answers from the knowledge base ----------
const DOCS = ["Pricing", "Onboarding guide", "Security & data", "Plans FAQ"];

export function Knowledge() {
  const frame = useCurrentFrame();
  const b = useB();
  const q = spr(frame, 0.3, "pop");
  const suck = interpolate(b, [3.2, 3.9], [0, 1], { ...clamp, easing: ease.in });
  const ans = spr(frame, 4.0, "pop");
  const pill = spr(frame, 4.8, "snappy");
  return (
    <>
      <Cam keys={[[0, 960, 420, 1.45], [1.4, 960, 540, 0.85], [3.9, 960, 600, 1.3], [6.2, 960, 560, 1.0]]}>
        {DOCS.map((d, i) => {
          const p = spr(frame, 1.4 + i * 0.2, "pop");
          const ang = (i / DOCS.length) * Math.PI * 2 + b * 0.9;
          const r = 520 * (1 - suck);
          return (
            <div key={d} style={{ position: "absolute", left: 960 + Math.cos(ang) * r - 150, top: 540 + Math.sin(ang) * r * 0.55 - 50, width: 300, transform: `scale(${p * (1 - suck * 0.8)})`, opacity: 1 - suck }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, background: C.white, borderRadius: 22, padding: "20px 24px", boxShadow: "0 24px 50px -16px rgba(20,0,40,0.5)" }}>
                <svg width="34" height="40" viewBox="0 0 30 36"><path d="M3 2h16l8 8v24H3z" fill={C.violetLight} /><path d="M19 2v8h8" fill="#fff" opacity="0.6" /><path d="M8 18h14M8 24h14M8 30h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 25, color: C.ink }}>{d}</div>
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 0, width: 1920, top: 380, display: "flex", justifyContent: "center" }}>
          <div style={{ transform: `scale(${q})`, opacity: Math.min(1, q * 3) }}>
            <Bubble from="user" size={44}>wait, is there a free plan?</Bubble>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, width: 1920, top: 540, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ transform: `scale(${ans})`, opacity: Math.min(1, ans * 3) }}>
            <Bubble from="bot" size={44}>Yes. Free forever, no card.</Bubble>
          </div>
          <div style={{ opacity: pill, transform: `translateY(${(1 - pill) * 20}px)`, fontFamily: SANS, fontSize: 28, fontWeight: 650, color: C.white, background: "rgba(255,255,255,0.16)", border: "1.5px solid rgba(255,255,255,0.45)", padding: "10px 22px", borderRadius: 999 }}>✓ Answered from your knowledge base</div>
          <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 46, color: C.white, transform: "rotate(-4deg)", opacity: interpolate(b, [5.6, 5.9], [0, 1], clamp) }}>nobody scripted that answer</div>
        </div>
      </Cam>
      <Kicker n={1} label="of 3 · Better questions" />
      <Headline y={82} backdrop="dark" at={0}>
        <Slam text="It answers their questions too." at={0} size={84} color={C.white} />
      </Headline>
      <Sfx name="pop-msg" at={0.3} volume={0.8} />
      {DOCS.map((_, i) => <Sfx key={i} name="pop-light" at={1.4 + i * 0.2} volume={0.5} />)}
      <Sfx name="zoom-vacuum" at={3.9} align="peak" volume={0.7} />
      <Sfx name="ding-correct" at={4.0} volume={0.5} />
      <Sfx name="pop-light" at={4.8} volume={0.5} />
      <Sfx name="whoosh-stutter" at={8} align="peak" volume={0.45} />
    </>
  );
}

export { DISPLAY };

import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { C, DISPLAY, HAND, MONO, SANS } from "../theme";
import { Cam, Caret, Center, Headline, Kicker, Marker, Pop, Rise, Sfx, Slam, Track, Typing, clamp, ease, mix, spr, typed, useB, useT } from "../lib";
import { Bubble, Label, Mark, Mono, QuestionRow, TypeChip } from "../ui";
import { Lockup, Sheet } from "./Open";

// ---------- beat 20-27: the promise, as three reasons ----------
const REASONS = [
  { t: "Better questions", s: "One at a time, and again when an answer is thin.", c: C.text },
  { t: "Follow-ups", s: "An email brings back the people who left.", c: C.choice },
  { t: "Proof it worked", s: "See exactly what the emails recovered.", c: C.violetLight },
];
const RX = [400, 960, 1520];

export function Reasons() {
  const frame = useCurrentFrame();
  return (
    <>
      <Cam keys={[[0, 960, 600, 0.95], [1.4, RX[0], 610, 1.12], [2.4, RX[1], 610, 1.12], [3.4, RX[2], 610, 1.12], [4.6, 960, 600, 0.95], [6.8, RX[0], 610, 1.5]]}>
        {REASONS.map((r, i) => {
          const p = spr(frame, 1.4 + i, "pop");
          return (
            <div key={r.t} style={{ position: "absolute", left: RX[i] - 250, top: 430, width: 500, height: 360, transform: `scale(${p}) rotate(${(1 - p) * (i - 1) * 10}deg)`, opacity: Math.min(1, p * 3) }}>
              <div style={{ width: "100%", height: "100%", boxSizing: "border-box", background: "#2A231F", border: `2px solid ${r.c}66`, borderRadius: 36, padding: 36, display: "flex", flexDirection: "column", gap: 18, boxShadow: `0 40px 80px -30px rgba(0,0,0,0.7), 0 0 60px -20px ${r.c}55` }}>
                <div style={{ width: 76, height: 76, borderRadius: 38, background: r.c, color: C.night, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 44 }}>{i + 1}</div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 50, color: C.white, letterSpacing: "-0.03em" }}>{r.t}</div>
                <div style={{ fontFamily: SANS, fontSize: 26, lineHeight: 1.35, color: "#CFC6BB" }}>{r.s}</div>
              </div>
            </div>
          );
        })}
      </Cam>
      <Headline y={80} backdrop="dark" at={0.1}>
        <Rise text="Three reasons you get better answers." at={0.1} size={80} color={C.white} accent="better answers." />
      </Headline>
      {[0, 1, 2].map((i) => <Sfx key={i} name="pop-hard" at={1.4 + i} volume={0.65} />)}
      <Sfx name="whoosh-cine" at={4.6} volume={0.35} />
      <Sfx name="whoosh-fast" at={8} align="peak" volume={0.6} />
    </>
  );
}

// ---------- beat 56-63: reason 2, the ones who left come back ----------
export function Followup() {
  const frame = useCurrentFrame();
  const b = useB();
  const card = spr(frame, 0.3, "pop");
  const line = interpolate(b, [1.3, 2.3], [0, 1], { ...clamp, easing: ease.out });
  const stops = [
    { x: 980, label: "4h", at: 1.5 },
    { x: 1230, label: "1 day", at: 1.9 },
    { x: 1480, label: "3 days", at: 2.3 },
  ];
  const fly = interpolate(b, [2.8, 3.8], [0, 1], { ...clamp, easing: ease.inOut });
  const back = interpolate(b, [4.2, 5.4], [0.5, 1], { ...clamp, easing: ease.inOut });
  const done = b > 5.4;
  const doneP = spr(frame, 5.4, "pop");
  return (
    <>
      <Cam keys={[[0, 560, 560, 1.4], [1.3, 1230, 480, 1.25], [2.8, 900, 560, 1.0], [4.0, 560, 600, 1.45], [6.2, 960, 560, 0.95]]}>
        {/* the respondent who left */}
        <div style={{ position: "absolute", left: 300, top: 420, width: 520, transform: `scale(${card})`, opacity: card }}>
          <div style={{ background: C.white, borderRadius: 30, padding: 30, boxShadow: "0 40px 80px -30px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: 30, background: C.violetLight, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, color: C.ink }}>M</div>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, color: C.ink }}>Maya</div>
                <div style={{ fontFamily: SANS, fontSize: 22, color: done ? C.choice : "#D9534F", fontWeight: 700 }}>{done ? "Completed" : b > 4.2 ? "Back at question 4" : "Left at question 4 of 8"}</div>
              </div>
              <div style={{ marginLeft: "auto", transform: `scale(${doneP})`, width: 56, height: 56, borderRadius: 28, background: C.choice, color: C.white, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 800, fontFamily: SANS }}>✓</div>
            </div>
            <div style={{ marginTop: 22, height: 16, borderRadius: 8, background: C.sand }}>
              <div style={{ width: `${back * 100}%`, height: "100%", borderRadius: 8, background: done ? C.choice : b > 4.2 ? C.orange : "#D9534F" }} />
            </div>
          </div>
        </div>
        {/* the follow-up schedule */}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <line x1={900} y1={480} x2={mix(900, 1560, line)} y2={480} stroke="#5A4E46" strokeWidth={6} strokeLinecap="round" />
        </svg>
        {stops.map((st) => {
          const p = spr(frame, st.at, "pop");
          return (
            <React.Fragment key={st.label}>
              <div style={{ position: "absolute", left: st.x - 24, top: 456, width: 48, height: 48, borderRadius: 24, background: C.orange, transform: `scale(${p})`, boxShadow: `0 0 0 ${12 * p}px rgba(253,111,41,0.25)` }} />
              <div style={{ position: "absolute", left: st.x - 100, top: 390, width: 200, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 32, color: C.white, transform: `scale(${p})` }}>{st.label}</div>
            </React.Fragment>
          );
        })}
        {fly > 0 && fly < 1 && (
          <svg width="96" height="70" viewBox="0 0 70 52" style={{ position: "absolute", left: mix(980, 560, fly) - 48, top: mix(480, 470, fly) - 35 - Math.sin(fly * Math.PI) * 180, transform: `rotate(${-20 * (1 - fly)}deg)` }}>
            <rect x="2" y="2" width="66" height="48" rx="8" fill={C.white} />
            <path d="M4 6 L35 30 L66 6" fill="none" stroke={C.orange} strokeWidth="5" strokeLinejoin="round" />
          </svg>
        )}
      </Cam>
      <Kicker n={2} label="of 3 · Follow-ups" />
      <Headline y={82} backdrop="dark" at={0.1}>
        <Rise text="It brings back the ones who left." at={0.1} size={80} color={C.white} accent="back" />
      </Headline>
      <Sfx name="pop-dry" at={0.3} volume={0.6} />
      {stops.map((st) => <Sfx key={st.label} name="pop-light" at={st.at} volume={0.55} />)}
      <Sfx name="whoosh-air" at={2.8} volume={0.5} />
      <Sfx name="notify-positive" at={3.8} volume={0.45} />
      <Sfx name="tech-slide" at={4.2} volume={0.8} />
      <Sfx name="ding-correct" at={5.4} volume={0.55} />
      <Sfx name="rm-whip" at={8} align="peak" volume={0.8} />
    </>
  );
}

// ---------- beat 64-71: reason 3, proof: reminded vs held back ----------
function Dots({ x, fill, color, at }: { x: number; fill: number; color: string; at: number }) {
  const frame = useCurrentFrame();
  const b = useB();
  return (
    <div style={{ position: "absolute", left: x - 210, top: 380, width: 420, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 18 }}>
      {Array.from({ length: 20 }, (_, i) => {
        const p = spr(frame, at + i * 0.03, "pop");
        const on = i < fill && b > at + 1 + i * 0.08;
        return <div key={i} style={{ width: 66, height: 66, borderRadius: 33, background: on ? color : "#E4DDD1", transform: `scale(${p * (on ? 1.06 : 1)})` }} />;
      })}
    </div>
  );
}

export function Proof() {
  const b = useB();
  const brace = interpolate(b, [4.6, 5.3], [0, 1], { ...clamp, easing: ease.out });
  return (
    <>
      <Cam keys={[[0, 620, 560, 1.2], [2.4, 1300, 560, 1.2], [4.4, 960, 580, 0.95]]}>
        <div style={{ position: "absolute", left: 410, top: 300, width: 420, textAlign: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color: C.ink }}>Reminded</div>
        <div style={{ position: "absolute", left: 1090, top: 300, width: 420, textAlign: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color: C.inkSoft }}>Held back</div>
        <Dots x={620} fill={15} color={C.choice} at={0.3} />
        <Dots x={1300} fill={8} color={C.inkSoft} at={2.4} />
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <path d="M 470 860 C 470 900, 960 880, 960 920 C 960 880, 1450 900, 1450 860" fill="none" stroke={C.orange} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - brace} />
        </svg>
        <div style={{ position: "absolute", left: 0, width: 1920, top: 930, textAlign: "center", fontFamily: HAND, fontWeight: 700, fontSize: 56, color: C.ink, transform: "rotate(-2deg)", opacity: interpolate(b, [5.2, 5.5], [0, 1], clamp) }}>that gap is your real recovery</div>
      </Cam>
      <Kicker n={3} label="of 3 · Proof it worked" dark={false} />
      <Headline y={82} backdrop="light" at={0.1}>
        <Pop text="Hold some back. See the difference." at={0.1} size={76} />
      </Headline>
      <Sfx name="pop-light" at={0.3} volume={0.5} />
      <Sfx name="pop-light" at={2.4} volume={0.5} />
      {Array.from({ length: 15 }, (_, i) => <Sfx key={i} name="click-cool" at={1.3 + i * 0.08} volume={0.3} />)}
      {Array.from({ length: 8 }, (_, i) => <Sfx key={"h" + i} name="click-cool" at={3.4 + i * 0.08} volume={0.3} />)}
      <Sfx name="whoosh-air" at={4.6} volume={0.4} />
      <Sfx name="rm-ding" at={5.2} volume={0.5} />
      <Sfx name="whoosh-cine" at={8} align="peak" volume={0.5} />
    </>
  );
}

// ---------- beat 72-79: and you see why ----------
export function Results() {
  const frame = useCurrentFrame();
  const b = useB();
  const pop = spr(frame, 0, "smooth");
  const split = interpolate(b, [0.8, 1.4], [0, 1], { ...clamp, easing: ease.inOut });
  const chat = [
    { from: "bot" as const, text: <>How big is the team you're<br />setting this up for?</>, at: 1.6 },
    { from: "user" as const, text: "about a dozen right now", at: 2.1 },
    { from: "bot" as const, text: "Twelve, noted.", at: 2.6 },
  ];
  const fields = [
    { k: "Team size", v: "12", at: 3.9 },
    { k: "Reason", v: "Replacing a tool", at: 4.3 },
    { k: "Email", v: "maya@northwind.co", at: 4.7 },
  ];
  return (
    <>
      <Cam keys={[[0, 960, 590, 1.0], [1.5, 660, 590, 1.3], [3.6, 1290, 590, 1.3], [5.8, 960, 590, 0.98]]}>
        <div style={{ position: "absolute", left: 0, width: 1920, top: 320, display: "flex", justifyContent: "center", gap: mix(0, 44, split), transform: `scale(${0.6 + 0.4 * pop})`, opacity: pop }}>
          <div style={{ width: 640, height: 540, background: C.card, borderRadius: 32, padding: 32, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 50px 90px -40px rgba(40,20,0,0.6)" }}>
            <Label color="#9C9288" size={17}>RESPONSE #CF-4821 · COMPLETED</Label>
            {chat.map((c, i) => {
              const p = spr(frame, c.at, "pop");
              return b >= c.at ? (
                <div key={i} style={{ alignSelf: c.from === "bot" ? "flex-start" : "flex-end", transform: `scale(${p})`, transformOrigin: c.from === "bot" ? "0 100%" : "100% 100%" }}>
                  <Bubble from={c.from} size={26}>{c.text}</Bubble>
                </div>
              ) : null;
            })}
          </div>
          <div style={{ width: mix(0, 580, split), overflow: "hidden", borderRadius: 32 }}>
            <div style={{ width: 580, height: 540, background: C.white, padding: 34, boxSizing: "border-box", borderRadius: 32 }}>
              <Label size={17}>RECORDED</Label>
              {fields.map((f) => {
                const p = spr(frame, f.at, "pop");
                return (
                  <div key={f.k} style={{ marginTop: 24, padding: "20px 24px", borderRadius: 18, background: C.sand, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 26, color: C.inkSoft, fontWeight: 600 }}>{f.k}</span>
                    <span style={{ fontFamily: SANS, fontSize: 30, color: C.ink, fontWeight: 800, transform: `scale(${p})`, display: "inline-block", transformOrigin: "100% 50%" }}>{f.v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Cam>
      <Kicker n={3} label="of 3 · Proof it worked" />
      <Headline y={82} backdrop="dark" at={0.1}>
        <Track text="Read the conversation, not the row." at={0.1} size={74} color={C.white} />
      </Headline>
      <Sfx name="tech-slide" at={0.8} volume={1} />
      {chat.map((c, i) => <Sfx key={i} name="pop-msg" at={c.at} volume={0.6} />)}
      {fields.map((f) => <Sfx key={f.k} name="tone-digital" at={f.at} volume={0.45} />)}
      <Sfx name="whoosh-stutter" at={8} align="peak" volume={0.45} />
    </>
  );
}

// ---------- beat 80-83: act 4, the turn to setup ----------
export function Setup() {
  const b = useB();
  return (
    <>
      <Center y={-20}>{b < 1.95 && <Slam text="Setting it up?" at={0} size={160} color={C.white} />}</Center>
      <Center y={-20}>
        <Slam text="One sentence." at={2} size={180} color={C.ink} />
      </Center>
      <Sfx name="pop-hard" at={0} volume={0.6} />
      <Sfx name="rm-whip" at={2} align="peak" volume={0.6} />
      <Sfx name="pop-hard" at={2} volume={0.6} />
      <Sfx name="zoom-vacuum" at={4} align="peak" volume={0.7} />
    </>
  );
}

// ---------- beat 84-91: describe it, get the whole form ----------
const QS = [
  { q: "What should we call you?", type: "Short text", color: C.text },
  { q: "Your work email", type: "Email", color: C.contact },
  { q: "How big is your team?", type: "Number", color: C.number },
  { q: "Rough monthly budget?", type: "Single select", color: C.choice },
];

export function Build() {
  const frame = useCurrentFrame();
  const b = useB();
  const PROMPT = "Onboarding for a design agency";
  const txt = typed(PROMPT, b, 0.4, 26);
  const send = 3.0;
  const press = interpolate(b, [send - 0.12, send, send + 0.35], [0, 1, 0], clamp);
  return (
    <>
      <Cam keys={[[0, 960, 380, 1.5], [3.2, 960, 560, 0.92], [5.6, 960, 660, 1.08]]}>
        <div style={{ position: "absolute", left: 510, top: 330, width: 900, height: 104, borderRadius: 30, background: C.white, border: `2px solid ${b < send ? C.orange : C.border}`, boxShadow: `0 30px 70px -30px rgba(80,40,0,0.35), 0 0 0 ${b < send ? 8 : 0}px rgba(253,111,41,0.14)`, display: "flex", alignItems: "center", gap: 18, padding: "0 20px 0 32px", boxSizing: "border-box" }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill={C.orange}><path d="M12 2l1.8 5.6L19.5 9.5l-5.7 1.9L12 17l-1.8-5.6L4.5 9.5l5.7-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
          <div style={{ flex: 1, fontFamily: SANS, fontSize: 36, fontWeight: 550, color: txt ? C.ink : "#A89E94" }}>
            {txt || "Describe your form"}
            {b < send + 0.1 && <Caret h={36} />}
          </div>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: C.orange, display: "grid", placeItems: "center", transform: `scale(${1 - 0.2 * press})` }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </div>
        </div>
        {QS.map((q, i) => {
          const p = spr(frame, 3.3 + i * 0.22, "pop");
          const k = i - 1.5;
          return (
            <div key={i} style={{ position: "absolute", left: 960 - 200, top: 520, width: 400, height: 270, transform: `translate(${k * 430 * p}px, ${Math.abs(k) * 36 * p + (1 - p) * 60}px) rotate(${k * 6 * p}deg) scale(${0.3 + 0.7 * p})`, opacity: Math.min(1, p * 3), transformOrigin: "50% 100%" }}>
              <div style={{ width: "100%", height: "100%", background: C.white, borderRadius: 30, border: `1px solid ${C.border}`, boxShadow: "0 30px 60px -24px rgba(80,40,0,0.35)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ height: 14, background: q.color }} />
                <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                  <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 800, color: q.color, letterSpacing: "0.12em" }}>Q{i + 1}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: 700, color: C.ink, lineHeight: 1.05, letterSpacing: "-0.02em" }}>{q.q}</div>
                  <div style={{ marginTop: "auto" }}><TypeChip label={q.type} color={q.color} size={20} /></div>
                </div>
              </div>
            </div>
          );
        })}
      </Cam>
      <Headline y={60} backdrop="light" at={0} out={3.2}>
        <Pop text="Describe it." at={0} size={100} out={3.2} />
      </Headline>
      <Headline y={60} backdrop="light" at={3.3}>
        <Slam text="Get the whole form." at={3.3} size={100} color={C.orange} />
      </Headline>
      <Typing at={0.4} seconds={PROMPT.length / 26} name="typing-soft" offset={5} volume={0.7} />
      <Sfx name="click-tech" at={send} volume={0.8} />
      <Sfx name="whoosh-fast" at={3.3} align="peak" volume={0.4} />
      {QS.map((_, i) => <Sfx key={i} name="pop-hard" at={3.3 + i * 0.22} volume={0.55} />)}
      <Sfx name="rm-whip" at={8} align="peak" volume={0.8} />
    </>
  );
}

// ---------- beat 92-99: change it by saying so ----------
export function Edit() {
  const frame = useCurrentFrame();
  const b = useB();
  const cmd = "Add a budget question. Skip it under 10 people.";
  const txt = typed(cmd, b, 0.3, 40);
  const send = 3.0;
  const ins = spr(frame, 3.3, "pop");
  const tag = spr(frame, 4.4, "pop");
  const rows = [QS[0], QS[1], QS[2]];
  return (
    <>
      <Cam keys={[[0, 960, 800, 1.35], [3.3, 960, 460, 1.3], [4.4, 1180, 460, 1.3], [6, 960, 520, 0.95]]}>
        <div style={{ position: "absolute", left: 960 - 400, top: 200, width: 800 }}>
          {rows.map((q, i) => (
            <div key={i} style={{ marginBottom: 20, transform: `translateY(${i >= 2 ? ins * 120 : 0}px)` }}>
              <QuestionRow n={i >= 2 ? i + 2 : i + 1} q={q.q} type={q.type} color={q.color} w={800} />
            </div>
          ))}
          <div style={{ position: "absolute", top: 2 * 116, left: 0, transform: `scale(${ins}) translateX(${(1 - ins) * -200}px)`, opacity: Math.min(1, ins * 3), boxShadow: `0 0 0 ${6 * interpolate(b, [3.3, 5], [1, 0], clamp)}px rgba(253,111,41,0.6)`, borderRadius: 24 }}>
            <QuestionRow n={3} q="Rough monthly budget?" type="Single select" color={C.choice} w={800} />
          </div>
          <div style={{ position: "absolute", top: 2 * 116 + 22, left: 830, transform: `scale(${tag})`, transformOrigin: "0% 50%", whiteSpace: "nowrap", fontFamily: SANS, fontSize: 26, fontWeight: 750, color: C.night, background: C.number, padding: "12px 20px", borderRadius: 16 }}>Skipped under 10 people</div>
        </div>
        <div style={{ position: "absolute", left: 0, width: 1920, top: 760, display: "flex", justifyContent: "center" }}>
          <Bubble from="user" size={36}>
            {txt}
            {b < send && <Caret color={C.ink} h={36} />}
          </Bubble>
        </div>
      </Cam>
      <Headline y={60}>
        <Marker text="Change it by saying so." at={0} size={84} color={C.ink} />
      </Headline>
      <Typing at={0.3} seconds={cmd.length / 40} name="typing-soft" offset={11} volume={0.7} />
      <Sfx name="click-tech" at={send} volume={0.7} />
      <Sfx name="swoosh-fast" at={3.3} volume={0.7} />
      <Sfx name="pop-hard" at={3.35} volume={0.6} />
      <Sfx name="pop-electric" at={4.4} volume={0.5} />
      <Sfx name="whoosh-cine" at={8} align="peak" volume={0.5} />
    </>
  );
}

// ---------- beat 100-107 (last drop): put it anywhere ----------
function QR({ p }: { p: number }) {
  const N = 21;
  const cells: React.ReactNode[] = [];
  const box = [[0, 0], [0, N - 7], [N - 7, 0]];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const inF = box.find(([r0, c0]) => r - r0 >= 0 && r - r0 < 7 && c - c0 >= 0 && c - c0 < 7);
      let on: boolean;
      if (inF) {
        const rr = r - inF[0], cc = c - inF[1];
        on = rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
      } else on = random(`q${r}-${c}`) > 0.5;
      if (!on) continue;
      const s0 = random(`t${r}${c}`) * 0.6;
      const k = interpolate(p, [s0, s0 + 0.2], [0, 1], clamp);
      cells.push(<rect key={`${r}-${c}`} x={c * 12 + 6 * (1 - k)} y={r * 12 + 6 * (1 - k)} width={12 * k} height={12 * k} rx={2} fill={C.ink} />);
    }
  return <svg width={N * 12} height={N * 12}>{cells}</svg>;
}

export function Share() {
  const frame = useCurrentFrame();
  const b = useB();
  const idx = Math.min(3, Math.max(0, Math.floor(b / 2 + 0.03)));
  const local = b - idx * 2;
  const flipIn = interpolate(local, [-0.05, 0.3], [1, 0], { ...clamp, easing: ease.out });
  const names = ["A link", "A QR code", "An embed", "The API"];
  const subs = ["Send it, post it, sign with it.", "Download it, print it.", "Popup, side tab, inline, full page.", "Build your own front end."];
  const copied = idx === 0 && local > 1.0;
  const pop = spr(frame, 4.8, "pop");
  return (
    <>
      <Center y={40} scale={1.25}>
        <div style={{ width: 640, height: 440, background: C.white, borderRadius: 40, display: "grid", placeItems: "center", boxShadow: "0 60px 100px -40px rgba(80,10,40,0.7)", transform: `perspective(1600px) rotateY(${flipIn * 90}deg) scale(${1 + 0.05 * Math.exp(-local * 5)})` }}>
          {idx === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.sand, border: `1px solid ${C.border}`, borderRadius: 20, padding: "18px 18px 18px 26px", fontFamily: MONO, fontSize: 28, color: C.ink }}>
              chatform.in/f/nw8k
              <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, padding: "10px 16px", borderRadius: 12, background: copied ? C.choice : C.orange, color: C.white, whiteSpace: "nowrap" }}>{copied ? "✓ Copied" : "Copy"}</div>
            </div>
          )}
          {idx === 1 && <QR p={interpolate(local, [0.1, 1.4], [0, 1], clamp)} />}
          {idx === 2 && (
            <div style={{ width: 500, height: 310, background: C.cream, borderRadius: 18, position: "relative", overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{ height: 34, background: C.sand, display: "flex", gap: 8, alignItems: "center", paddingLeft: 14 }}>{["#F0564A", "#E0A92E", "#4CB86A"].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}</div>
              {[300, 380, 240, 330].map((w, l) => <div key={l} style={{ margin: "18px 24px 0", height: 14, width: w, borderRadius: 7, background: C.border }} />)}
              <div style={{ position: "absolute", right: 18, bottom: 18, width: 210, height: 176, background: C.card, borderRadius: 18, padding: 14, boxSizing: "border-box", transform: `translateY(${(1 - pop) * 230}px)` }}>
                <div style={{ width: 140, height: 36, borderRadius: 12, background: C.bubble }} />
                <div style={{ width: 96, height: 36, borderRadius: 12, background: C.orange, marginLeft: "auto", marginTop: 12 }} />
              </div>
            </div>
          )}
          {idx === 3 && (
            <div style={{ width: 540 }}>
              <Mono size={28} color={C.ink}><span style={{ color: C.orange, fontWeight: 700 }}>POST</span> /v1/chat/sessions</Mono>
              <div style={{ marginTop: 18, display: "inline-block", fontFamily: MONO, fontWeight: 700, fontSize: 28, padding: "8px 16px", borderRadius: 10, background: `${C.choice}33`, color: "#2F8A4C", transform: `scale(${spr(frame, 6.8, "pop")})`, transformOrigin: "0 50%" }}>200 OK</div>
              <Mono size={24} color="#8A8078" style={{ marginTop: 14, opacity: spr(frame, 7.0, "snappy") }}>{'{ "recorded": { "team_size": 12 } }'}</Mono>
            </div>
          )}
        </div>
      </Center>
      <div style={{ position: "absolute", left: 0, right: 0, top: 900, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: C.white, letterSpacing: "-0.03em", transform: `translateY(${(1 - Math.min(1, local * 4)) * 30}px)`, opacity: Math.min(1, local * 4 + 0.2) }}>{names[idx]}</div>
        <div style={{ fontFamily: SANS, fontSize: 30, color: "rgba(255,255,255,0.9)", marginTop: 4 }}>{subs[idx]}</div>
      </div>
      <Headline y={46} backdrop="dark" at={0}>
        <Slam text="Then put it anywhere." at={0} size={92} color={C.white} />
      </Headline>
      {[0, 2, 4, 6].map((i) => <Sfx key={i} name="rm-switch" at={i} volume={0.9} />)}
      <Sfx name="click-select" at={1.0} volume={0.6} />
      <Sfx name="rm-shutter-modern" at={3.4} volume={0.9} />
      <Sfx name="swoosh-fast" at={4.8} volume={0.6} />
      <Sfx name="ding-correct" at={6.8} volume={0.45} />
      <Sfx name="zoom-vacuum" at={8} align="peak" volume={0.6} />
    </>
  );
}

// ---------- beat 108-111: everything else, in one burst ----------
const EXTRAS = [
  { t: "27 question types", s: "Colour-coded by what they collect" },
  { t: "Logic that can't dead-end", s: "19 operators, every path checked" },
  { t: "Verified respondents", s: "Google sign-in or a texted code" },
  { t: "Webhooks and an API", s: "Every form is an endpoint" },
  { t: "Your brand", s: "Fonts, logo, colours" },
  { t: "CSV export", s: "One column per question" },
];

export function Montage() {
  const frame = useCurrentFrame();
  const b = useB();
  const mark = spr(frame, 0, "pop");
  return (
    <>
      <Center y={50}>
        <div style={{ transform: `scale(${mark}) rotate(${b * 25}deg)` }}>
          <Mark size={170} />
        </div>
      </Center>
      {EXTRAS.map((x, i) => {
        const p = spr(frame, 0.3 + i * 0.3, "pop");
        const ang = -Math.PI / 2 + (i / EXTRAS.length) * Math.PI * 2 + Math.PI / 6;
        return (
          <div key={x.t} style={{ position: "absolute", left: 960 + Math.cos(ang) * 620 * p - 230, top: 600 + Math.sin(ang) * 300 * p - 60, width: 460, transform: `scale(${p})`, opacity: Math.min(1, p * 3) }}>
            <div style={{ background: "#2A231F", border: `1px solid ${C.bubbleLine}`, borderRadius: 26, padding: "20px 26px", display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: [C.orange, C.violetLight, C.choice, C.text, C.number, C.content][i], flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: SANS, fontWeight: 750, fontSize: 30, color: C.white }}>{x.t}</div>
                <div style={{ fontFamily: SANS, fontSize: 22, color: "#A89E94", marginTop: 3 }}>{x.s}</div>
              </div>
            </div>
          </div>
        );
      })}
      <Headline y={60} backdrop="dark" at={0}>
        <Pop text="Plus the parts every form needs." at={0} size={80} color={C.white} />
      </Headline>
      {EXTRAS.map((_, i) => <Sfx key={i} name="pop-electric" at={0.3 + i * 0.3} volume={0.5} />)}
      <Sfx name="rm-whip" at={4} align="peak" volume={0.8} />
    </>
  );
}

// ---------- beat 112-119: the result, before and after ----------
const FULL = [
  ["Maya", "12", "Too pricey for a team our size", "$5k to $10k"],
  ["Jon", "40", "Couldn't branch on company size", "$10k+"],
  ["Ana", "8", "Setup took our whole week", "Under $5k"],
  ["Sam", "25", "No way to follow up on drop-offs", "$5k to $10k"],
  ["Priya", "15", "Answers were too vague to act on", "$10k+"],
];
const THIN_ROWS = [
  ["Maya", "", "it was bad", ""],
  ["J.", "12?", "ok", "-"],
  ["", "", "", ""],
  ["Sam", "", "idk", ""],
  ["Priya", "", "", "n/a"],
];

export function Result() {
  const b = useB();
  const slide = interpolate(b, [1.6, 2.3], [0, 1], { ...clamp, easing: ease.out });
  return (
    <>
      <Cam keys={[[0, 960, 580, 1.05], [5.5, 960, 600, 1.12]]}>
        <div style={{ position: "absolute", left: 420, top: 250, transform: `translateY(${-120 * slide}px) scale(${1 - 0.1 * slide})`, opacity: 1 - 0.85 * slide, transformOrigin: "50% 0%" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, color: C.inkSoft, marginBottom: 16 }}>Before</div>
          <Sheet rows={THIN_ROWS} at={0} blanks={0.4} />
        </div>
        <div style={{ position: "absolute", left: 390, top: 290, padding: 30, background: "#FFFDF8", borderRadius: 36, boxShadow: "0 60px 120px -40px rgba(60,40,20,0.45)", transform: `translateY(${(1 - slide) * 900}px) rotate(${(1 - slide) * 4}deg)` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, color: C.choice, marginBottom: 16 }}>With chatform</div>
          <Sheet rows={FULL} at={2.2} good />
        </div>
      </Cam>
      <Headline y={46} backdrop="light" at={0.1}>
        <Rise text="The result: answers you can use." at={0.1} size={84} accent="use." />
      </Headline>
      <Sfx name="tech-slide" at={0} volume={0.8} />
      <Sfx name="whoosh-cine" at={1.6} volume={0.45} />
      {FULL.map((_, i) => <Sfx key={i} name="tone-digital" at={2.0 + i * 0.2} volume={0.4} />)}
      <Sfx name="rm-ding" at={3.2} volume={0.5} />
      <Sfx name="whoosh-stutter" at={8} align="peak" volume={0.45} />
    </>
  );
}

// ---------- beat 120-123: the offer, one slam per beat ----------
export function Offer() {
  const b = useB();
  const words = ["Free forever.", "Unlimited responses.", "No card.", "Start today."];
  return (
    <>
      {words.map((w, i) => {
        const on = b >= i && b < i + 1.05;
        return on ? (
          <Center key={w}>
            <Slam text={w} at={i} size={i === 1 ? 130 : 170} color={C.white} />
          </Center>
        ) : null;
      })}
      {words.map((w, i) => {
        const age = b - (i + 1);
        if (age < 0 || age > 1) return null;
        return (
          <Center key={w + "e"}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 130, color: "rgba(255,255,255,0.25)", letterSpacing: "-0.035em", transform: `scale(${1 - age * 0.5}) translateY(${-age * 260}px)`, opacity: 1 - age }}>{w}</div>
          </Center>
        );
      })}
      {[0, 1, 2, 3].map((i) => <Sfx key={i} name="pop-hard" at={i} volume={0.7} />)}
      {[1, 2, 3].map((i) => <Sfx key={i + "w"} name="rm-whip" at={i} align="peak" volume={0.5} />)}
      <Sfx name="whoosh-air" at={4} align="peak" volume={0.6} />
    </>
  );
}

// ---------- beat 124-131: the end card ----------
export function Outro() {
  const frame = useCurrentFrame();
  const b = useB();
  const t = useT();
  const fly = interpolate(t, [-0.2, 0], [0, 1], { ...clamp, easing: ease.in });
  const squash = t > 0 ? Math.sin(Math.min(1, t * 6) * Math.PI) * Math.exp(-t * 4) : 0;
  const lock = interpolate(b, [0.8, 1.5], [0, 1], { ...clamp, easing: ease.inOut });
  const circle = interpolate(b, [2.6, 3.3], [0, 1], { ...clamp, easing: ease.inOut });
  const cta = spr(frame, 3.5, "pop");
  const drift = 1 + 0.03 * interpolate(b, [1, 8], [0, 1], clamp);
  const TAG = ["Conversational", "forms", "people", "actually", "finish."];
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${drift})` }}>
      {[0, 0.1].map((d) => {
        const p = interpolate(t, [d, d + 0.7], [0, 1], { ...clamp, easing: ease.out });
        return t > d && p < 1 ? <div key={d} style={{ position: "absolute", left: 960 - 700 * p, top: 400 - 700 * p, width: 1400 * p, height: 1400 * p, borderRadius: "50%", border: `${10 * (1 - p)}px solid rgba(255,255,255,${0.8 * (1 - p)})` }} /> : null;
      })}
      <Lockup top={400} markFrom={340} markTo={170} font={170} lock={lock} fly={fly} squash={squash} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 580, display: "flex", justifyContent: "center", gap: 18 }}>
        {TAG.map((w, i) => {
          const p = spr(frame, 1.7 + i * 0.12, "pop");
          const last = i === TAG.length - 1;
          return (
            <div key={w} style={{ position: "relative", fontFamily: DISPLAY, fontWeight: 750, fontSize: 64, letterSpacing: "-0.03em", color: C.ink, transform: `translateY(${(1 - p) * 40}px) scale(${0.5 + 0.5 * p})`, opacity: Math.min(1, p * 3) }}>
              {w}
              {last && (
                <svg width="250" height="124" viewBox="0 0 260 120" style={{ position: "absolute", left: -18, top: -26, overflow: "visible" }}>
                  <path d="M14 62 C 10 16, 160 2, 218 26 C 266 48, 244 108, 150 112 C 76 116, 6 102, 14 58 C 18 34, 60 18, 104 14" fill="none" stroke={C.ink} strokeWidth="5" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - circle} />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 770, display: "flex", justifyContent: "center", alignItems: "center", gap: 26, transform: `scale(${cta})` }}>
        <div style={{ background: C.ink, color: C.white, fontFamily: SANS, fontWeight: 700, fontSize: 38, padding: "22px 42px", borderRadius: 20 }}>Start free at chatform.in</div>
        <div style={{ fontFamily: SANS, fontSize: 30, color: C.ink, fontWeight: 600 }}>Free forever · No card</div>
      </div>
      <Sfx name="impact-deep" at={0} align="peak" volume={1} />
      <Sfx name="whoosh-cine" at={1.1} align="peak" volume={0.5} />
      {TAG.map((_, i) => <Sfx key={i} name="pop-light" at={1.7 + i * 0.12} volume={0.35} />)}
      <Sfx name="rm-ding" at={2.7} volume={0.6} />
      <Sfx name="click-select" at={3.5} volume={0.6} />
    </div>
  );
}

export { Label };

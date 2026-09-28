import React from "react";
import { AbsoluteFill } from "remotion";
import { AT } from "../beat";
import { C, DISPLAY, EASE_IN, EASE_IN_OUT, EXPO_OUT, FONT, MONO, lerp, ramp } from "../brand";
import { At, Cam, Paper, Stage, popSpring, useBeatScene } from "../kit";
import { Bubble, Icon } from "../ui";
import { Typed } from "./E";

// ============================ every block type, as a live mini question ============================
type BT = { type: string; label: string; q: string; color: string };
export const BLOCKS: BT[] = [
  { type: "payment", label: "Payment", q: "Pay the project deposit", color: C.green },
  { type: "signature", label: "Signature", q: "Sign the agreement", color: C.content },
  { type: "scheduling", label: "Scheduling", q: "Book a kickoff call", color: C.file },
  { type: "rating", label: "Rating", q: "How was onboarding?", color: C.scale },
  { type: "picture_choice", label: "Picture choice", q: "Pick a style", color: C.choice },
  { type: "poll", label: "Poll", q: "How often do you ship?", color: C.choice },
  { type: "nps", label: "NPS", q: "Would you recommend us?", color: C.scale },
  { type: "file_upload", label: "File upload", q: "Upload your brand kit", color: C.file },
  { type: "legal_consent", label: "Consent", q: "Accept the terms", color: C.contact },
  { type: "ranking", label: "Ranking", q: "Rank what matters", color: C.choice },
  { type: "date", label: "Date", q: "When do you start?", color: C.number },
  { type: "matrix", label: "Matrix", q: "Rate each tool", color: C.scale },
  { type: "yes_no", label: "Yes / No", q: "Do you have a designer?", color: C.choice },
  { type: "multi_select", label: "Multi select", q: "What do you need?", color: C.choice },
  { type: "opinion_scale", label: "Opinion scale", q: "How urgent is it?", color: C.scale },
  { type: "email", label: "Email", q: "Your work email", color: C.contact },
  { type: "number", label: "Number", q: "How big is your team?", color: C.number },
  { type: "dropdown", label: "Dropdown", q: "Which country?", color: C.choice },
  { type: "address", label: "Address", q: "Where should we ship?", color: C.contact },
  { type: "phone", label: "Phone", q: "Best number to reach you", color: C.contact },
  { type: "long_text", label: "Long text", q: "Tell us about the project", color: C.text },
  { type: "contact_info", label: "Contact info", q: "How do we reach you?", color: C.contact },
  { type: "single_select", label: "Single select", q: "Rough monthly budget?", color: C.choice },
  { type: "url", label: "Website", q: "Your website", color: C.contact },
  { type: "short_text", label: "Short text", q: "What should we call you?", color: C.text },
];

const Row: React.FC<{ children: React.ReactNode; on?: boolean; style?: React.CSSProperties }> = ({ children, on, style }) => (
  <div style={{ height: 40, borderRadius: 11, border: `1.5px solid ${on ? C.orange : C.border}`, background: on ? C.orangeSoft : C.card, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 18, fontWeight: 600, color: C.ink, gap: 10, ...style }}>{children}</div>
);

/** The answer area of one block; `t` = frames since it came alive (large = settled). */
function Answer({ type, t }: { type: string; t: number }) {
  const k = (a: number, b: number) => ramp(t, a, b, EXPO_OUT);
  switch (type) {
    case "payment":
      return t > 26 ? (
        <div style={{ height: 52, borderRadius: 13, background: C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 20, fontWeight: 700 }}><Icon name="check" size={22} color="#fff" stroke={3} /> Paid ₹25,000</div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, height: 52, borderRadius: 13, background: "#0C2451", color: "#fff", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700 }}>Pay with Razorpay</div>
          <div style={{ width: 110, height: 52, borderRadius: 13, background: "#635BFF", color: "#fff", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800 }}>stripe</div>
        </div>
      );
    case "signature":
      return (
        <div style={{ height: 110, borderRadius: 13, background: C.secondary }}>
          <svg viewBox="0 0 360 110" width="100%" height="100%"><path d="M20 70 C 40 20, 60 20, 70 64 S 100 100, 115 60 S 145 20, 160 66 C 170 90, 185 90, 200 62 C 215 40, 235 44, 242 70 L 262 62 C 290 58, 320 66, 340 60" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k(0, 30)} /></svg>
        </div>
      );
    case "scheduling":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {["Wed 9:00", "Wed 14:30", "Thu 10:30", "Thu 16:00", "Fri 11:00", "Fri 15:30"].map((s, i) => <Row key={s} on={i === 2 && t > 14} style={{ justifyContent: "center", fontSize: 16, padding: 0 }}>{s}</Row>)}
        </div>
      );
    case "rating":
      return <div style={{ display: "flex", gap: 8 }}>{[0, 1, 2, 3, 4].map((s) => <Icon key={s} name="star" size={52} color={t > 4 + s * 4 ? "#F2A516" : "#DDD3C5"} fill={t > 4 + s * 4 ? "#F7B731" : "none"} stroke={1.6} />)}</div>;
    case "picture_choice":
      return <div style={{ display: "flex", gap: 10 }}>{[["#FFB48C", "#FD6F29"], ["#C9B3EF", "#9769DC"], ["#A8DDB8", "#3FA565"]].map(([a, b2], i) => <div key={i} style={{ flex: 1, height: 96, borderRadius: 13, background: `linear-gradient(140deg, ${a}, ${b2})`, border: `4px solid ${i === 1 && t > 12 ? C.ink : "transparent"}` }} />)}</div>;
    case "poll":
      return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[["Weekly", 62], ["Monthly", 28], ["Rarely", 10]].map(([l, v], i) => <div key={l} style={{ height: 34, borderRadius: 9, background: C.secondary, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", inset: 0, width: `${(v as number) * k(i * 3, 24)}%`, background: i === 0 ? C.choice : "#D4ECDC" }} /><div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "0 12px", lineHeight: "34px", fontSize: 16, fontWeight: 650 }}><span>{l}</span><span>{Math.round((v as number) * k(i * 3, 24))}%</span></div></div>)}</div>;
    case "nps":
      return <div style={{ display: "flex", gap: 4 }}>{Array.from({ length: 11 }, (_, i) => <div key={i} style={{ flex: 1, height: 44, borderRadius: 8, border: `1.5px solid ${i === 9 && t > 10 ? C.scale : C.border}`, background: i === 9 && t > 10 ? C.scale : C.card, color: i === 9 && t > 10 ? "#fff" : C.muted, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700 }}>{i}</div>)}</div>;
    case "file_upload":
      return <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 13, background: C.secondary }}><Icon name="file" size={34} color={C.file} /><div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 650 }}>brand-kit.pdf</div><div style={{ marginTop: 8, height: 7, borderRadius: 4, background: "#E6DDD0" }}><div style={{ width: `${100 * k(0, 26)}%`, height: "100%", borderRadius: 4, background: t > 26 ? C.green : C.file }} /></div></div></div>;
    case "legal_consent":
      return <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 13, background: C.secondary }}><div style={{ width: 40, height: 40, borderRadius: 11, background: t > 10 ? C.orange : C.card, border: `2px solid ${t > 10 ? C.orange : C.border}`, display: "grid", placeItems: "center" }}>{t > 10 && <Icon name="check" size={26} color="#fff" stroke={3.2} />}</div><div style={{ fontSize: 18, fontWeight: 650 }}>I agree to the terms</div></div>;
    case "ranking":
      return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{["Speed", "Price", "Support"].map((l, i) => { const order = t > 12 ? [1, 0, 2] : [0, 1, 2]; return <Row key={l} style={{ translate: `0 ${(order[i] - i) * 47 * k(10, 22)}px` }}><span style={{ color: C.muted, fontWeight: 800 }}>≡</span>{l}</Row>; })}</div>;
    case "date":
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>{Array.from({ length: 14 }, (_, i) => <div key={i} style={{ height: 30, borderRadius: 7, background: i === 9 && t > 10 ? C.number : C.secondary, color: i === 9 && t > 10 ? "#fff" : C.muted, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700 }}>{i + 3}</div>)}</div>;
    case "matrix":
      return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{["Slack", "Notion", "Sheets"].map((r, ri) => <div key={r} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 600 }}><span style={{ width: 70 }}>{r}</span>{[0, 1, 2, 3].map((c) => <div key={c} style={{ width: 26, height: 26, borderRadius: 13, border: `2px solid ${C.border}`, background: t > 6 + ri * 5 && c === [3, 1, 2][ri] ? C.scale : C.card }} />)}</div>)}</div>;
    case "yes_no":
      return <div style={{ display: "flex", gap: 12 }}>{["Yes", "No"].map((l, i) => <div key={l} style={{ flex: 1, height: 56, borderRadius: 13, border: `2px solid ${i === 0 && t > 10 ? C.choice : C.border}`, background: i === 0 && t > 10 ? C.choice : C.card, color: i === 0 && t > 10 ? "#fff" : C.ink, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 700 }}>{l}</div>)}</div>;
    case "multi_select":
      return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{["Branding", "Website", "Copywriting"].map((l, i) => <Row key={l} on={(i === 0 && t > 8) || (i === 1 && t > 16)}><span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${C.border}`, background: (i === 0 && t > 8) || (i === 1 && t > 16) ? C.orange : C.card }} />{l}</Row>)}</div>;
    case "opinion_scale":
      return <div style={{ display: "flex", gap: 8 }}>{[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ flex: 1, height: 52, borderRadius: 12, border: `1.5px solid ${i === 4 && t > 10 ? C.scale : C.border}`, background: i === 4 && t > 10 ? C.scale : C.card, color: i === 4 && t > 10 ? "#fff" : C.ink, display: "grid", placeItems: "center", fontSize: 20, fontWeight: 700 }}>{i}</div>)}</div>;
    case "email":
      return <Row style={{ height: 52, fontSize: 19 }}>maya@northwind.co <span style={{ marginLeft: "auto" }}><Icon name="check" size={22} color={C.green} stroke={3} /></span></Row>;
    case "number":
      return <div style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 800, color: C.ink }}>{Math.round(12 * k(0, 18))}</div>;
    case "dropdown":
      return <div><Row style={{ height: 48 }}>India <span style={{ marginLeft: "auto", color: C.muted }}>▾</span></Row><div style={{ marginTop: 6, borderRadius: 11, border: `1px solid ${C.border}`, overflow: "hidden", height: 90 * k(4, 16) }}>{["India", "Singapore", "UAE"].map((l, i) => <div key={l} style={{ padding: "5px 14px", fontSize: 16, fontWeight: 600, background: i === 0 ? C.orangeSoft : C.card }}>{l}</div>)}</div></div>;
    case "address":
      return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}><Row>12 MG Road, Indiranagar</Row><div style={{ display: "flex", gap: 7 }}><Row style={{ flex: 1 }}>Bengaluru</Row><Row style={{ width: 110 }}>560038</Row></div></div>;
    case "phone":
      return <Row style={{ height: 52, fontSize: 19 }}>+91 98765 43210</Row>;
    case "long_text":
      return <div style={{ padding: "12px 14px", borderRadius: 13, background: C.secondary, fontSize: 16, lineHeight: 1.45, color: C.ink, height: 96, overflow: "hidden" }}>{"We need a new site before our spring launch, plus a brand refresh for the product line.".slice(0, Math.floor(85 * k(0, 30)))}</div>;
    case "contact_info":
      return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}><Row>Maya Rao</Row><Row>maya@northwind.co</Row></div>;
    case "single_select":
      return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{["Under $5k", "$5k to $10k", "$10k+"].map((l, i) => <Row key={l} on={i === 1 && t > 10}>{l}</Row>)}</div>;
    case "url":
      return <Row style={{ height: 52, fontSize: 19 }}><Icon name="globe" size={20} color={C.muted} /> northwind.co</Row>;
    default:
      return <Row style={{ height: 52, fontSize: 19 }}>Maya</Row>;
  }
}

export const BlockCard: React.FC<{ b: BT; t: number; focus?: number }> = ({ b, t, focus = 0 }) => (
  <div style={{ width: 440, height: 300, boxSizing: "border-box", borderRadius: 26, background: C.card, border: `1.5px solid ${focus > 0.5 ? C.orange : C.border}`, boxShadow: focus > 0.5 ? "0 0 0 6px rgba(253,111,41,.18), 0 40px 80px -30px rgba(90,40,0,.45)" : "0 2px 4px #0000000a, 0 24px 50px -26px #5a2a0a33", padding: 24, fontFamily: FONT, color: C.ink, display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 6, background: b.color }} />
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.12em", color: b.color, textTransform: "uppercase" }}>{b.label}</div>
    </div>
    <div style={{ fontSize: 24, fontWeight: 650, lineHeight: 1.2 }}>{b.q}</div>
    <div style={{ marginTop: "auto" }}><Answer type={b.type} t={t} /></div>
  </div>
);

// ============================ one 3D wall of every block, the tour speeding up ============================
const COLS = 7, ROWS = 5, W = 440, H = 300, G = 36;
const slot = (i: number) => ({ c: i % COLS, r: Math.floor(i / COLS) });
const pos = (i: number) => { const { c, r } = slot(i); return { x: (c - (COLS - 1) / 2) * (W + G), y: (r - (ROWS - 1) / 2) * (H + G) }; };
// focus order spirals out from the centre; each stop is shorter than the last
const TOUR = [17, 18, 11, 10, 16, 23, 24, 25, 19, 12, 4, 3, 9, 15, 22, 29, 30];
export const TOUR_AT = [0, 1.7, 3.1, 4.3, 5.3, 6.1, 6.75, 7.3, 7.75, 8.1, 8.4, 8.65, 8.87, 9.07, 9.25, 9.42, 9.57];
const OVERVIEW = 10;

export const BlocksWall: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.blocks, AT.blocks + 16, 0, 6);
  if (!visible) return null;
  // which card the camera is on, and the camera between stops
  let k = 0;
  for (let i = 0; i < TOUR_AT.length; i++) if (lf >= bt(TOUR_AT[i])) k = i;
  const cur = pos(TOUR[k]);
  const prev = pos(TOUR[Math.max(0, k - 1)]);
  const dwell = (TOUR_AT[Math.min(k + 1, TOUR_AT.length - 1)] - TOUR_AT[k]) || 0.4;
  const move = k === 0 ? 1 : ramp(lf, bt(TOUR_AT[k]), bt(TOUR_AT[k]) + Math.min(20, dwell * 29 * 0.55), EASE_IN_OUT);
  let x = lerp(prev.x, cur.x, move), y = lerp(prev.y, cur.y, move);
  const over = ramp(lf, bt(OVERVIEW - 0.6), bt(OVERVIEW + 2.2), EASE_IN_OUT);
  x = lerp(x, 0, over); y = lerp(y, 0, over);
  const z = lerp(lerp(1.45, 1.2, ramp(lf, bt(4), bt(9), EASE_IN)), 0.4, over);
  const rx = lerp(34, 52, over), rz = lerp(-8, -16, over);
  const drift = ramp(lf, bt(OVERVIEW - 1), bt(16), (v) => v);
  const exit = ramp(lf, bt(15.5), bt(16) + 4, EASE_IN);
  const inP = ramp(lf, -6, 12, EXPO_OUT);
  return (
    <AbsoluteFill>
      <Paper glow="rgba(253,111,41,.14)" />
      <Stage>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `perspective(2400px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${z * (1 + exit * 3) * lerp(1.4, 1, inP)}) translate(${-x}px, ${-y}px)`, opacity: 1 - ramp(lf, bt(15.8), bt(16) + 4) }}>
          {Array.from({ length: COLS * (ROWS + 4) }, (_, j) => {
            // extra rows above and below so the overview wall has no edge
            const i = j - COLS * 2;
            const { c, r } = { c: ((i % COLS) + COLS) % COLS, r: Math.floor(i / COLS) };
            const scroll = (c % 2 ? 1 : -1) * drift * 380;
            const px = (c - (COLS - 1) / 2) * (W + G), py = (r - (ROWS - 1) / 2) * (H + G) + scroll;
            const bi = ((i * 3) % BLOCKS.length + BLOCKS.length) % BLOCKS.length;
            const ti = TOUR.indexOf(i);
            const alive = ti >= 0 && ti <= k ? lf - bt(TOUR_AT[ti]) : ti === -1 ? 999 : -1;
            const focus = ti === k && over < 0.5 ? 1 : 0;
            return (
              <div key={j} style={{ position: "absolute", left: px - W / 2, top: py - H / 2, opacity: ti > k && over < 0.5 ? 0.55 : 1 }}>
                <BlockCard b={BLOCKS[bi]} t={alive < 0 ? 0 : alive} focus={focus} />
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ branching: two people, two conversations ============================
export const BR = { a1: 1.5, a2: 3, n1: 4.5, n2: 6, out: 7.4, text: 7.8 };
const Phone: React.FC<{ who: string; tint: string; lf: number; bt: (n: number) => number; answer: string; answerAt: number; next: React.ReactNode; nextAt: number; ry: number; accentBubble?: boolean }> = ({ who, tint, lf, bt, answer, answerAt, next, nextAt, ry, accentBubble }) => {
  const a = popSpring(lf - bt(answerAt), 12, 240, 0.6);
  const n = popSpring(lf - bt(nextAt), 12, 240, 0.6);
  return (
    <div style={{ transform: `perspective(1800px) rotateY(${ry}deg)` }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: tint, color: "#fff", fontFamily: FONT, fontSize: 22, fontWeight: 700 }}>
          <span style={{ width: 30, height: 30, borderRadius: 15, background: "rgba(255,255,255,.3)", display: "grid", placeItems: "center" }}>{who[0]}</span>{who}
        </div>
      </div>
      <div style={{ width: 560, height: 600, borderRadius: 34, background: C.chat, border: `1px solid ${C.bubbleLine}`, boxShadow: "0 50px 100px -30px rgba(0,0,0,.55)", padding: 28, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>
        <div style={{ fontSize: 16, color: "#9C9288", fontWeight: 600, letterSpacing: "0.1em" }}>NORTHWIND ONBOARDING</div>
        <div style={{ alignSelf: "flex-start" }}><Bubble from="bot" size={26}>How big is your team?</Bubble></div>
        {lf >= bt(answerAt) - 1 && <div style={{ alignSelf: "flex-end", scale: String(a), transformOrigin: "100% 100%" }}><Bubble from="user" size={26} style={accentBubble ? { background: C.violet, color: "#fff" } : undefined}>{answer}</Bubble></div>}
        {lf >= bt(nextAt) - 1 && <div style={{ alignSelf: "flex-start", scale: String(n), transformOrigin: "0% 100%" }}>{next}</div>}
      </div>
    </div>
  );
};

export const Branch2: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.branch, AT.branch + 12, 0, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 8, 14, 170, 0.8);
  const out = ramp(lf, bt(BR.out), bt(BR.out) + 20, EASE_IN_OUT);
  const exit = ramp(lf, bt(11.6), bt(12) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <div style={{ opacity: 1 - out * 0.85, filter: out ? `blur(${out * 6}px)` : undefined }}>
          <Cam lf={lf} bt={bt} keys={[[0, 0, 20, 0.92], [1.2, -380, 120, 1.25], [2.7, 380, 120, 1.25], [4.2, -380, 200, 1.3], [5.7, 380, 200, 1.3], [6.9, 0, 30, 0.9]]}>
            <At x={lerp(-380, -560, out)} y={30}>
              <div style={{ scale: String(0.85 + 0.15 * inP) }}>
                <Phone who="Maya" tint={C.orange} lf={lf} bt={bt} answer="just 8 of us" answerAt={BR.a1} nextAt={BR.n1} ry={lerp(14, 40, out)} next={<Bubble from="bot" size={26}>Nice. What are you using today?</Bubble>} />
              </div>
            </At>
            <At x={lerp(380, 560, out)} y={30}>
              <div style={{ scale: String(0.85 + 0.15 * inP) }}>
                <Phone who="Arjun" tint={C.violet} lf={lf} bt={bt} answer="around 40" answerAt={BR.a2} nextAt={BR.n2} ry={lerp(-14, -40, out)} accentBubble next={<div style={{ display: "flex", flexDirection: "column", gap: 12 }}><Bubble from="bot" size={26}>Want a quick call with our team?</Bubble><div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 14, background: C.orange, color: C.night, fontSize: 20, fontWeight: 700 }}><Icon name="calendar" size={20} color={C.night} /> Book a call</div></div>} />
              </div>
            </At>
          </Cam>
        </div>
        {lf >= bt(BR.text) && (
          <div style={{ position: "absolute", scale: String(1 + exit * 3), opacity: 1 - ramp(lf, bt(11.8), bt(12) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
            <At y={-70}><Typed text="One form." t={lf - bt(BR.text)} cps={0.9} size={120} color={C.ink} /></At>
            <At y={90}>{lf >= bt(BR.text + 1.2) && <Typed text="A different conversation for each person." t={lf - bt(BR.text + 1.2)} cps={1.4} size={86} color={C.ink} accent="each person." />}</At>
          </div>
        )}
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ share: an auto-turning carousel, then the API line ============================
function Qr({ p }: { p: number }) {
  const n = 17;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const fin = [[0, 0], [0, n - 5], [n - 5, 0]].find(([r0, c0]) => r - r0 >= 0 && r - r0 < 5 && c - c0 >= 0 && c - c0 < 5);
      const on = fin ? r - fin[0] === 0 || r - fin[0] === 4 || c - fin[1] === 0 || c - fin[1] === 4 || (r - fin[0] === 2 && c - fin[1] === 2) : ((r * 7 + c * 13 + r * c) % 5) < 2;
      if (!on) continue;
      const kk = ramp(p, ((r * 31 + c * 17) % 20) / 30, ((r * 31 + c * 17) % 20) / 30 + 0.25);
      cells.push(<rect key={`${r}-${c}`} x={c * 13 + 6.5 * (1 - kk)} y={r * 13 + 6.5 * (1 - kk)} width={13 * kk} height={13 * kk} rx={2} fill={C.ink} />);
    }
  return <svg width={n * 13} height={n * 13}>{cells}</svg>;
}
const WAYS = ["A link", "A QR code", "An embed", "The API"];
export const SHARE_TURNS = [1.4, 2.8, 4.2];

export const Share2: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.share, AT.share + 8, 0, 6);
  if (!visible) return null;
  let rot = 0;
  SHARE_TURNS.forEach((n) => { rot += popSpring(lf - bt(n), 16, 150, 0.9) * 90; });
  const front = SHARE_TURNS.filter((n) => lf >= bt(n) + 8).length;
  const lt = (i: number) => lf - (i === 0 ? 0 : bt(SHARE_TURNS[i - 1]));
  const back = ramp(lf, bt(5.2), bt(5.2) + 22, EASE_IN_OUT);
  const exit = ramp(lf, bt(7.6), bt(8) + 4, EASE_IN);
  const inP = popSpring(lf + 8, 13, 160, 0.8);
  const face = (i: number): React.ReactNode => {
    const t = lt(i);
    if (i === 0) return <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.secondary, border: `1px solid ${C.border}`, borderRadius: 18, padding: "16px 16px 16px 24px", fontFamily: MONO, fontSize: 26, color: C.ink }}>chatform.in/f/northwind<div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, padding: "9px 14px", borderRadius: 11, background: t > 16 ? C.green : C.orange, color: "#fff" }}>{t > 16 ? "Copied" : "Copy"}</div></div>;
    if (i === 1) return <Qr p={ramp(t, 4, 30)} />;
    if (i === 2) return <div style={{ width: 440, height: 260, background: C.paper, borderRadius: 16, position: "relative", overflow: "hidden", border: `1px solid ${C.border}` }}><div style={{ height: 30, background: C.secondary }} />{[300, 360, 220].map((w, l) => <div key={l} style={{ margin: "18px 22px 0", height: 13, width: w, borderRadius: 7, background: C.border }} />)}<div style={{ position: "absolute", right: 16, bottom: 16, translate: `0 ${(1 - popSpring(t - 6, 12, 220)) * 200}px`, width: 190, borderRadius: 16, background: C.chat, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}><div style={{ alignSelf: "flex-start", padding: "7px 11px", borderRadius: 11, background: C.bubble, color: "#F6F1EA", fontFamily: FONT, fontSize: 14 }}>Hi! What should I call you?</div><div style={{ alignSelf: "flex-end", padding: "7px 11px", borderRadius: 11, background: C.orange, fontFamily: FONT, fontSize: 14, fontWeight: 600 }}>Maya</div></div></div>;
    return <div style={{ fontFamily: MONO, fontSize: 24, color: C.ink, lineHeight: 1.7 }}><div><span style={{ color: C.orange }}>POST</span> /v1/chat/sessions</div><div style={{ display: "inline-block", padding: "2px 12px", borderRadius: 9, background: C.greenSoft, color: C.green, fontWeight: 600, scale: String(popSpring(t - 8, 12, 260)), transformOrigin: "0 50%" }}>200 OK</div><div style={{ color: C.muted }}>{'{ "recorded": { "team_size": 12 } }'}</div></div>;
  };
  return (
    <AbsoluteFill>
      <Paper bg={C.night} glow="rgba(253,111,41,.18)" />
      <Stage>
        {/* the carousel: four ways out, the front one alive */}
        <div style={{ position: "absolute", transform: `translateY(${lerp(20, -250, back)}px) perspective(2400px) rotateX(${lerp(-8, 28, back)}deg) scale(${lerp(1, 0.55, back) * (0.8 + 0.2 * inP)})`, opacity: 1 - back * 0.55 }}>
          {WAYS.map((w, i) => {
            const ang = i * 90 - rot;
            const a = (ang * Math.PI) / 180;
            const depth = Math.cos(a);
            return (
              <div key={w} style={{ position: "absolute", left: -290, top: -210, width: 580, height: 420, transform: `perspective(2400px) translateX(${Math.sin(a) * 560}px) translateZ(${(depth - 1) * 420}px) rotateY(${-ang}deg)`, opacity: depth > -0.2 ? 0.35 + 0.65 * Math.max(0, depth) : 0, zIndex: Math.round(depth * 10) + 10 }}>
                <div style={{ width: "100%", height: "100%", borderRadius: 34, background: C.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, boxShadow: "0 50px 100px -30px rgba(0,0,0,.6)" }}>
                  {face(i)}
                  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color: C.ink, letterSpacing: "-0.03em" }}>{w}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* developers get the same forms, headless */}
        {lf >= bt(5.4) && (
          <div style={{ position: "absolute", scale: String(1 + exit * 3), opacity: 1 - ramp(lf, bt(7.8), bt(8) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
            <At y={110}><Typed text="Every form is an API." t={lf - bt(5.4)} cps={1.1} size={110} color="#fff" accent="an API." /></At>
            <At y={250}>
              <div style={{ display: "flex", gap: 14 }}>
                {["Headless API", "Webhooks", "JS + React SDKs", "OpenAPI spec"].map((c, i) => {
                  const p = popSpring(lf - bt(6.4 + i * 0.2), 12, 260, 0.6);
                  return <div key={c} style={{ scale: String(p), padding: "12px 22px", borderRadius: 999, border: "1.5px solid #4A403A", background: "#241D19", color: "#F6F1EA", fontFamily: FONT, fontSize: 26, fontWeight: 650 }}>{c}</div>;
                })}
              </div>
            </At>
          </div>
        )}
        <At y={320}>{front >= 0 && lf < bt(5.2) && <div style={{ fontFamily: FONT, fontSize: 26, color: "rgba(255,255,255,.7)", fontWeight: 600 }}>{["Send it anywhere", "Print it on anything", "Popup, side tab, inline, full page", "Build your own front end"][front]}</div>}</At>
      </Stage>
    </AbsoluteFill>
  );
};

export { EASE_IN };

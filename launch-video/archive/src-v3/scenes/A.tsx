import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { b, DROP } from "../beat";
import { C, DISPLAY, EASE_IN, EXPO_OUT, FONT, lerp, ramp } from "../brand";
import { At, Paper, Stage, Title, popSpring, smoothSpring, useBeatScene } from "../kit";
import { Bubble, Burst, Card, Icon, Label, Mark, Ring } from "../ui";

// ---------- build-up: the problem, one word per beat ----------
export const INTRO_WORDS: [number, string][] = [[-8, "Your"], [-7, "form"], [-6.5, "asks"], [-6, "25"], [-5.5, "questions."], [-5, "People"], [-4.5, "answer:"]];
export const INTRO_CHIPS: [number, string][] = [[-3.5, "ok"], [-3, "idk"], [-2.5, "n/a"], [-2, "it was bad"], [-1.5, "fine"]];
const ROT = [-7, 5, -4, 8, -3];
const OFF: [number, number][] = [[-40, -24], [46, 12], [-26, 34], [34, -32], [0, 0]];

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  if (f > DROP + 2) return null;
  const glow = ramp(f, 0, DROP, EASE_IN);
  const word = [...INTRO_WORDS].reverse().find(([n]) => f >= b(n));
  const implode = ramp(f, b(-1), b(-0.35), EASE_IN);
  return (
    <AbsoluteFill style={{ background: "#120E0B" }}>
      <AbsoluteFill style={{ background: `radial-gradient(40% 50% at 50% 50%, rgba(253,111,41,${0.08 + glow * 0.45}), transparent 70%)` }} />
      <Stage>
        {word && f < b(-4) && (() => {
          const t = f - b(word[0]);
          const p = popSpring(t, 14, 300, 0.6);
          return (
            <At>
              <div style={{ scale: String(1.35 - 0.35 * p), fontFamily: DISPLAY, fontWeight: 700, fontSize: 200, letterSpacing: "-0.045em", color: word[1] === "25" ? C.orange : "#fff", filter: t < 3 ? `blur(${(3 - t) * 3}px)` : undefined, whiteSpace: "nowrap" }}>{word[1]}</div>
            </At>
          );
        })()}
        {/* the answers they actually get, slapped into a pile */}
        {INTRO_CHIPS.map(([n, text], i) => {
          const t = f - b(n);
          if (t < 0) return null;
          const p = popSpring(t, 15, 320, 0.6);
          const [ox, oy] = OFF[i];
          const age = INTRO_CHIPS.filter(([m]) => f >= b(m)).length - 1 - i;
          return (
            <At key={i} x={ox * (1 - implode)} y={oy * (1 - implode)}>
              <div style={{ scale: String((1.6 - 0.6 * p) * Math.pow(0.9, age) * (1 - implode)), rotate: `${ROT[i] + implode * 180}deg`, filter: `brightness(${1 - age * 0.12})`, opacity: ramp(t, 0, 2) }}>
                <Bubble from="user" size={64} style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,.7)" }}>{text}</Bubble>
              </div>
            </At>
          );
        })}
        {/* the dot the logo is born from */}
        {f >= b(-0.6) && (
          <At>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: C.orange, scale: String(popSpring(f - b(-0.6), 8, 200) * (1 + 0.25 * Math.sin((f - b(-0.6)) / 2.2))), boxShadow: "0 0 60px rgba(253,111,41,.9)" }} />
          </At>
        )}
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- drop: the mark joins, good answers explode outward ----------
const GOOD = ["Too pricey for a team our size", "12 of us", "Right after the holidays", "$5k to $10k", "We tried HubSpot, dropped it", "Replacing our onboarding form", "maya@northwind.co", "Setup took our whole week", "Couldn't branch on company size", "Booked for Thursday"];

export const Logo: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(0, 4, 0, 6);
  if (!visible) return null;
  const S = 210, WS = 150, gap = 30;
  const ww = WS * 4.62;
  const slide = smoothSpring(lf - bt(1), 18);
  const markX = lerp(0, -(S + gap + ww) / 2 + S / 2, slide);
  const wordX = markX + S / 2 + gap;
  const mark = popSpring(lf, 9, 180, 0.8);
  const join = ramp(lf, 0, 12, EXPO_OUT);
  const exit = ramp(lf, bt(3.55), bt(4) + 4, EASE_IN);
  const flash = 1 - ramp(lf, 0, 10);
  const WORD = "chatform";
  return (
    <AbsoluteFill>
      <Paper glow="rgba(253,111,41,.16)" />
      <Stage>
        {GOOD.map((text, i) => {
          const a = (i / GOOD.length) * Math.PI * 2 + 0.35;
          const e = 1 - Math.pow(1 - ramp(lf, 0, 60), 3);
          const d = lerp(60, 1150 + (i % 3) * 180, e);
          return (
            <At key={i} x={Math.cos(a) * d} y={Math.sin(a) * d * 0.62}>
              <div style={{ scale: String(lerp(0.6, 1.2, e)), rotate: `${(i % 2 ? 1 : -1) * (8 + e * 30)}deg`, opacity: Math.min(1, lf / 3) * (1 - ramp(lf, 45, 75)) }}>
                <Bubble from={i % 3 === 1 ? "bot" : "user"} light size={30}>{text}</Bubble>
              </div>
            </At>
          );
        })}
        <At><Ring t={lf} max={2000} width={10} dur={34} /></At>
        <At><Ring t={lf - 6} max={1400} width={6} color={C.violet} dur={30} /></At>
        <div style={{ position: "absolute", scale: String(1 + exit * 5), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 12}px)` : undefined }}>
          <At x={markX} y={-20}>
            <div style={{ scale: String(mark), filter: "drop-shadow(0 30px 50px rgba(120,40,0,.3))" }}>
              <Mark size={S} join={join} />
            </div>
          </At>
          <div style={{ position: "absolute", left: wordX, top: -20 - WS * 0.56, display: "flex", fontFamily: DISPLAY, fontSize: WS, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, whiteSpace: "pre", color: C.ink }}>
            {WORD.split("").map((ch, i) => {
              const t = lf - bt(1) - 3 - i * 1.4;
              const p = popSpring(t, 11, 260, 0.55);
              return <span key={i} style={{ display: "inline-block", scale: String(p), opacity: ramp(t, 0, 3), transformOrigin: "50% 80%" }}>{ch}</span>;
            })}
          </div>
          <At y={170}>
            {(() => {
              const p = popSpring(lf - bt(2.3), 14, 240);
              return <div style={{ scale: String(p), padding: "16px 34px", borderRadius: 999, background: C.orangeSoft, color: C.orangeFg, fontFamily: FONT, fontSize: 38, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>Conversational forms people actually finish</div>;
            })()}
          </At>
        </div>
      </Stage>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

// ---------- bar 1: the form becomes a conversation ----------
export const CHAT_MSGS: { from: "bot" | "user"; text: React.ReactNode; at: number; h: number }[] = [
  { from: "bot", text: <>What went wrong with<br />the last tool you tried?</>, at: -0.3, h: 104 },
  { from: "user", text: "it was bad", at: 1, h: 70 },
  { from: "bot", text: <>Bad how? The price, or<br />something it couldn't do?</>, at: 2, h: 104 },
  { from: "user", text: "too pricey for 12 of us", at: 3, h: 70 },
];
const WW = 780, WH = 560, AREA = 96;

export const Chat: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(4, 8, 10, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 8, 14, 170, 0.8);
  const exit = ramp(lf, bt(3.55), bt(4) + 2, EASE_IN);
  let y = 0;
  const placed = CHAT_MSGS.map((m) => { const top = y; y += m.h + 16; return { ...m, top }; });
  const target = placed[3];
  // the exit zooms into the last answer, which the next scene picks up
  const ox = WW / 2 - 150, oy = -WH / 2 + AREA + target.top + target.h / 2 + 40;
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <Title lf={lf} a="Your form," b="as a conversation." at={-4} />
        <div style={{ position: "absolute", scale: String(lerp(1.25, 1, inP) * (1 + exit * 3.4)), transformOrigin: `${ox}px ${oy}px`, opacity: Math.min(1, inP * 2) * (1 - ramp(lf, bt(3.85), bt(4) + 2)), filter: exit ? `blur(${exit * 8}px)` : undefined }}>
          <At y={50}>
            <Card dark w={WW} h={WH} pad={0} style={{ overflow: "hidden", position: "relative", scale: "1.16" }}>
              <div style={{ height: 80, display: "flex", alignItems: "center", gap: 14, padding: "0 26px", borderBottom: `1px solid ${C.bubbleLine}` }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: C.orange, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 20, color: C.ink }}>A</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>Ada · Northwind onboarding</div>
                  <div style={{ fontSize: 15, color: "#9C9288", marginTop: 2 }}>Question {lf >= bt(3) ? 3 : 2} of 8</div>
                </div>
                <div style={{ marginLeft: "auto", fontSize: 14, color: "#B9AEA3", border: `1px solid ${C.bubbleLine}`, borderRadius: 999, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: "#F0564A" }} /> Recording
                </div>
              </div>
              <div style={{ position: "absolute", left: 26, right: 26, top: AREA }}>
                {placed.map((m, i) => {
                  const t = lf - bt(m.at);
                  if (t < -1 && m.at > 0) return null;
                  const p = m.at < 0 ? 1 : popSpring(t, 12, 240, 0.6);
                  return (
                    <div key={i} style={{ position: "absolute", top: m.top, left: 0, right: 0, display: "flex", justifyContent: m.from === "bot" ? "flex-start" : "flex-end" }}>
                      <div style={{ scale: String(0.5 + 0.5 * p), opacity: ramp(t, 0, 3) || (m.at < 0 ? 1 : 0), transformOrigin: m.from === "bot" ? "0% 100%" : "100% 100%", translate: `0 ${(1 - p) * 24}px` }}>
                        <Bubble from={m.from} size={27}>{m.text}</Bubble>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </At>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 2: loose words in, clean data out ----------
export const Extract: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(8, 12, 6, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 6, 13, 200, 0.7);
  const hi1 = ramp(lf, bt(1) - 4, bt(1) + 4);
  const hi2 = ramp(lf, bt(2) - 4, bt(2) + 4);
  const rows = [
    { k: "Reason", v: "Price", at: 1, from: -150 },
    { k: "Team size", v: "12", at: 2, from: 190 },
  ];
  const saved = popSpring(lf - bt(3), 11, 240, 0.6);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <Title lf={lf} a="Loose words in." b="Clean data out." at={-2} />
        <div style={{ position: "absolute", translate: `${-exit * 2400}px 0`, filter: exit ? `blur(${exit * 6}px)` : undefined }}>
          <At y={-150}>
            <div style={{ scale: String(lerp(1.6, 1, inP)) }}>
              <Bubble from="user" size={50} style={{ boxShadow: "0 30px 60px -24px rgba(180,60,0,.5)" }}>
                <span style={{ background: `rgba(255,255,255,${0.42 * hi1})`, borderRadius: 12, padding: "0 6px", margin: "0 -6px" }}>too pricey</span> for{" "}
                <span style={{ background: `rgba(255,255,255,${0.42 * hi2})`, borderRadius: 12, padding: "0 6px", margin: "0 -6px" }}>12 of us</span>
              </Bubble>
            </div>
          </At>
          <At y={170}>
            <Card w={760} pad={30} style={{ scale: String(0.9 + 0.1 * inP) }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>Recorded as</Label>
                <div style={{ scale: String(saved), display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600, color: C.green, background: C.greenSoft, padding: "6px 14px", borderRadius: 999 }}>
                  <Icon name="check" size={20} color={C.green} stroke={3} /> Saved to your sheet
                </div>
              </div>
              {rows.map((r) => {
                const p = popSpring(lf - bt(r.at) - 8, 12, 240, 0.6);
                return (
                  <div key={r.k} style={{ marginTop: 18, height: 70, borderRadius: 16, background: C.secondary, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
                    <span style={{ fontSize: 26, color: C.muted, fontWeight: 500 }}>{r.k}</span>
                    <span style={{ fontSize: 34, fontWeight: 700, color: C.ink, scale: String(p), display: "inline-block", transformOrigin: "100% 50%" }}>{r.v}</span>
                  </div>
                );
              })}
            </Card>
          </At>
          {/* the chip that flies from the phrase to its row */}
          {rows.map((r, i) => {
            const t = ramp(lf, bt(r.at), bt(r.at) + 10, EXPO_OUT);
            if (lf < bt(r.at) || lf > bt(r.at) + 10) return null;
            const x = lerp(r.from, 250, t), yy = lerp(-150, 165 + i * 88, t) - Math.sin(t * Math.PI) * 90;
            return (
              <At key={r.k} x={x} y={yy}>
                <div style={{ padding: "10px 20px", borderRadius: 999, background: C.ink, color: "#fff", fontSize: 26, fontWeight: 600, fontFamily: FONT, whiteSpace: "nowrap", scale: String(1 + Math.sin(t * Math.PI) * 0.2) }}>{r.v}</div>
              </At>
            );
          })}
          <At x={330} y={80}><Burst t={lf - bt(3)} n={10} r={120} /></At>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 3: it answers their questions ----------
const DOCS = ["Pricing", "FAQ", "Onboarding", "Security", "Plans", "Help center"];

export const Answers: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(12, 16, 0, 6);
  if (!visible) return null;
  const whipIn = 1 - ramp(lf, -12, 3, EXPO_OUT);
  const q = popSpring(lf + 4, 13, 220, 0.7);
  // the ring of sources turns one notch per beat, then pulls in
  let rot = 0;
  for (let i = 1; i <= 2; i++) rot += popSpring(lf - bt(i), 14, 200, 0.7) * (Math.PI / 3);
  const pull = ramp(lf, bt(2) - 6, bt(2) + 4, EASE_IN);
  const ans = popSpring(lf - bt(2) - 2, 12, 220, 0.7);
  const src = popSpring(lf - bt(3), 12, 240, 0.6);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper glow="rgba(151,105,220,.18)" bg="#FAF7FD" />
      <Stage>
        <div style={{ position: "absolute", translate: `${whipIn * 2400}px 0`, scale: String(1 - exit * 0.9), opacity: 1 - exit }}>
          <Title lf={lf} a="Stuck on something?" b="It answers." at={0} />
          {DOCS.map((d, i) => {
            const a = (i / DOCS.length) * Math.PI * 2 + rot - Math.PI / 2;
            const r = 470 * (1 - pull * 0.9);
            return (
              <At key={d} x={Math.cos(a) * r} y={40 + Math.sin(a) * r * 0.46}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: 18, background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 16px 36px -18px rgba(60,20,100,.35)", fontFamily: FONT, fontSize: 24, fontWeight: 600, color: C.ink, scale: String(popSpring(lf + 6 - i * 2, 13, 220) * (1 - pull * 0.6)), opacity: 1 - pull }}>
                  <Icon name="file" size={26} color={C.violet} /> {d}
                </div>
              </At>
            );
          })}
          <At y={lerp(-60, -130, ans)}>
            <div style={{ scale: String(q) }}>
              <Bubble from="user" size={40}>wait, is there a free plan?</Bubble>
            </div>
          </At>
          <At y={40}>
            <div style={{ scale: String(ans), opacity: ramp(lf - bt(2), 0, 4) }}>
              <Bubble from="bot" light size={40}>Yes. Free forever, no card.</Bubble>
            </div>
          </At>
          <At y={170}>
            <div style={{ scale: String(src), display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 999, background: C.violetSoft, color: C.violetFg, fontFamily: FONT, fontSize: 26, fontWeight: 600, whiteSpace: "nowrap" }}>
              <Icon name="file" size={24} color={C.violetFg} /> From your pricing page
            </div>
          </At>
          <At y={40}><Burst t={lf - bt(2) - 2} n={12} r={260} color={C.violet} /></At>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

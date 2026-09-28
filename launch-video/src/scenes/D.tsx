import React from "react";
import { AbsoluteFill } from "remotion";
import { AT, STRETCH } from "../beat";
import { C, DISPLAY, EASE_IN, EXPO_OUT, FONT, lerp, ramp } from "../brand";
import { At, Paper, Stage, popSpring, useBeatScene, Cam } from "../kit";
import { Bubble, Burst, Card, Cursor, Icon, Label, Mark, MotionBlur, Ripple, TypeChip } from "../ui";

// ======================= follow-ups =======================
const STOPS = [
  { label: "4 hours later", x: -440 },
  { label: "1 day later", x: 0 },
  { label: "3 days later", x: 440 },
];

/** Bar A: they left at question 4; a reminder fires on each beat. */
export const FollowA: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.followA, AT.followA + 4, 0, 6, STRETCH.followA);
  if (!visible) return null;
  const inP = popSpring(lf + 8, 13, 200, 0.7);
  const line = ramp(lf, 0, bt(1), EXPO_OUT);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <Cam lf={lf} bt={bt} rx={24} ry={0} keys={[[0, 0, -120, 1.3], [0.7, -440, 200, 1.3], [1.7, 0, 200, 1.3], [2.7, 440, 200, 1.3], [3.35, 0, 40, 0.95]]}>
        <div style={{ position: "absolute", translate: `0 ${-exit * 1300}px` }}>
          <At y={-120}>
            <Card w={720} pad={30} style={{ scale: String((0.85 + 0.15 * inP) * 1.12) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 62, height: 62, borderRadius: 31, background: C.violetSoft, color: C.violetFg, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 30 }}>M</div>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700 }}>Maya</div>
                  <div style={{ fontSize: 21, fontWeight: 600, color: C.red }}>Stopped at question 4 of 8</div>
                </div>
                <div style={{ marginLeft: "auto", fontFamily: DISPLAY, fontSize: 42, fontWeight: 800 }}>50%</div>
              </div>
              <div style={{ marginTop: 20, height: 14, borderRadius: 7, background: C.secondary }}>
                <div style={{ width: "50%", height: "100%", borderRadius: 7, background: C.red }} />
              </div>
            </Card>
          </At>
          {/* the schedule */}
          <At y={200}>
            <div style={{ width: 880 * line, height: 6, borderRadius: 3, background: C.border }} />
          </At>
          {STOPS.map((s, i) => {
            const t = lf - bt(i + 1);
            const on = t >= 0;
            const p = popSpring(t, 10, 280, 0.6);
            const fly = ramp(t, 0, 14, EXPO_OUT);
            return (
              <React.Fragment key={s.label}>
                <At x={s.x} y={200}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, scale: String(popSpring(lf + 6 - i * 3, 13, 220)) }}>
                    <div style={{ width: 84, height: 84, borderRadius: 26, background: on ? C.orange : C.card, border: `2px solid ${on ? C.orange : C.border}`, display: "grid", placeItems: "center", scale: String(on ? 1 + 0.15 * Math.sin(Math.min(1, p) * Math.PI) : 1), boxShadow: on ? "0 16px 36px -14px rgba(253,111,41,.6)" : "none" }}>
                      <Icon name="mail" size={40} color={on ? "#fff" : C.muted} />
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 650, color: on ? C.ink : C.muted, whiteSpace: "nowrap" }}>{s.label}</div>
                  </div>
                </At>
                {on && fly < 1 && (
                  <At x={lerp(s.x, 0, fly)} y={lerp(200, -120, fly) - Math.sin(fly * Math.PI) * 120}>
                    <div style={{ width: 56, height: 42, borderRadius: 8, background: C.orange, display: "grid", placeItems: "center", rotate: `${(1 - fly) * (i - 1) * 20}deg`, boxShadow: "0 10px 20px -8px rgba(200,70,0,.6)" }}>
                      <Icon name="mail" size={28} color="#fff" />
                    </div>
                  </At>
                )}
                <At y={-120}><Burst t={t - 14} n={10} r={260} /></At>
              </React.Fragment>
            );
          })}
        </div>
      </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

const PEOPLE = [
  { n: "Maya", q: 4, at: 1 }, { n: "Jon", q: 2, at: 1.5 }, { n: "Priya", q: 6, at: 2 },
  { n: "Sam", q: 3, at: 2.5 }, { n: "Ana", q: 5, at: 3 }, { n: "Leo", q: 1, at: 3.25 },
];

/** Bar B: they come back to the question they stopped on, and finish. */
export const FollowB: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.followB, AT.followB + 4, 0, 6, STRETCH.followB);
  if (!visible) return null;
  const inY = 1 - ramp(lf, -12, 3, EXPO_OUT);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper glow="rgba(63,165,101,.14)" />
      <Stage>
        <Cam lf={lf} bt={bt} keys={[[0, 0, 0, 0.95], [0.9, -280, -150, 1.35], [1.9, -280, 0, 1.35], [2.9, 0, 80, 0.95]]}>
        <MotionBlur id="fb-in" y={inY * 40} style={{ position: "absolute", translate: `0 ${inY * 1300}px` }}>
          <div style={{ position: "absolute", scale: String(1 + exit * 4), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
            {PEOPLE.map((p, i) => {
              const col = i % 2, row = Math.floor(i / 2);
              const t = lf - bt(p.at);
              const fill = ramp(t, 0, 14, EXPO_OUT);
              const done = t >= 12;
              const pct = Math.round(lerp((p.q / 8) * 100, 100, fill));
              return (
                <At key={p.n} x={(col - 0.5) * 560} y={-150 + row * 150}>
                  <Card w={520} pad={22} style={{ scale: String(popSpring(lf + 8 - i * 2, 13, 220) * (done ? 1 + 0.04 * Math.sin(Math.min(1, (t - 12) / 8) * Math.PI) : 1)), borderColor: done ? `${C.green}88` : C.border }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 22, background: done ? C.greenSoft : C.secondary, color: done ? C.green : C.muted, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20 }}>{done ? <Icon name="check" size={24} color={C.green} stroke={3} /> : p.n[0]}</div>
                      <div style={{ fontSize: 24, fontWeight: 650 }}>{p.n}</div>
                      <div style={{ marginLeft: "auto", fontSize: 19, fontWeight: 650, color: done ? C.green : t >= 0 ? C.orangeFg : C.muted }}>{done ? "Completed" : t >= 0 ? `Back at question ${p.q}` : `Left at question ${p.q}`}</div>
                    </div>
                    <div style={{ marginTop: 14, height: 10, borderRadius: 5, background: C.secondary }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: done ? C.green : t >= 0 ? C.orange : "#D8CFC2" }} />
                    </div>
                  </Card>
                </At>
              );
            })}
            <At y={330}>
              <div style={{ scale: String(popSpring(lf - bt(3.3), 12, 240)), display: "flex", alignItems: "center", gap: 10, padding: "12px 26px", borderRadius: 999, background: C.ink, color: "#fff", fontFamily: FONT, fontSize: 26, fontWeight: 600, whiteSpace: "nowrap" }}>
                <Icon name="mail" size={26} color="#FFB48C" /> Back to the exact question they left
              </div>
            </At>
          </div>
        </MotionBlur>
      </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

// ======================= AI builds the form =======================
const ASK = "Onboarding for a design agency. Ask their budget and book a kickoff call.";
export const ASK_T = { typeFrom: 0.3, typeTo: 2.4, send: 2.6 };

export const AskAI: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.ask, AT.ask + 4, 8, 4, STRETCH.ask);
  if (!visible) return null;
  const inP = popSpring(lf + 8, 13, 180, 0.8);
  const n = Math.floor(ASK.length * ramp(lf, bt(ASK_T.typeFrom), bt(ASK_T.typeTo), (x) => x));
  const sent = lf >= bt(ASK_T.send);
  const think = popSpring(lf - bt(ASK_T.send) - 6, 12, 240, 0.6);
  const shimmer = ((lf * 2.2) % 200) - 50;
  return (
    <AbsoluteFill>
      <Paper glow="rgba(151,105,220,.16)" bg="#FAF7FD" />
      <Stage>
        <Cam lf={lf} bt={bt} rx={10} ry={8} keys={[[0, 0, 60, 0.95], [0.25, 0, 229, 1.45], [2.55, 150, -80, 1.35], [3.05, -240, 20, 1.35], [3.5, 0, 60, 1.0]]}>
        <At y={60}>
          <Card w={980} h={470} pad={0} style={{ scale: String(0.8 + 0.2 * inP), overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 72, display: "flex", alignItems: "center", gap: 14, padding: "0 28px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: C.violetSoft, display: "grid", placeItems: "center" }}><Icon name="sparkles" size={22} color={C.violet} fill={C.violet} stroke={1} /></div>
              <div style={{ fontSize: 22, fontWeight: 650 }}>Build with AI</div>
            </div>
            <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
              {sent && (
                <div style={{ alignSelf: "flex-end", scale: String(popSpring(lf - bt(ASK_T.send), 12, 240, 0.6)), transformOrigin: "100% 100%" }}>
                  <Bubble from="user" size={26} style={{ whiteSpace: "normal", maxWidth: 640 }}>{ASK}</Bubble>
                </div>
              )}
              {sent && (
                <div style={{ scale: String(think), transformOrigin: "0 100%", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderRadius: 20, background: C.violetSoft, fontSize: 24, fontWeight: 600 }}>
                  <Icon name="sparkles" size={24} color={C.violet} fill={C.violet} stroke={1} />
                  <span style={{ backgroundImage: `linear-gradient(90deg, ${C.violetFg} ${shimmer - 30}%, #C9B3EF ${shimmer}%, ${C.violetFg} ${shimmer + 30}%)`, WebkitBackgroundClip: "text", color: "transparent" }}>Writing your questions</span>
                </div>
              )}
            </div>
            <div style={{ margin: "0 24px 24px", height: 84, borderRadius: 22, border: `2px solid ${sent ? C.border : C.violet}`, display: "flex", alignItems: "center", gap: 14, padding: "0 16px 0 24px", boxShadow: sent ? "none" : "0 0 0 6px rgba(151,105,220,.14)" }}>
              <div style={{ flex: 1, fontSize: 26, fontWeight: 500, color: sent || !n ? "#A89E94" : C.ink, whiteSpace: "nowrap", overflow: "hidden" }}>
                {sent ? "Ask for a change..." : ASK.slice(Math.max(0, n - 52), n) || "Describe the form you need"}
                {!sent && <span style={{ display: "inline-block", width: 3, height: 28, marginLeft: 3, background: C.violet, opacity: Math.floor(lf / 14) % 2 ? 0 : 1, verticalAlign: "middle" }} />}
              </div>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: C.violet, display: "grid", placeItems: "center", scale: String(1 - 0.2 * Math.max(0, 1 - Math.abs(lf - bt(ASK_T.send)) / 5)) }}><Icon name="arrowUp" size={28} color="#fff" stroke={2.8} /></div>
            </div>
          </Card>
        </At>
      </Cam>
      </Stage>
    </AbsoluteFill>
  );
};

const DRAFT = [
  { q: "What should we call you?", type: "Short text", color: C.text },
  { q: "Your work email", type: "Email", color: C.contact },
  { q: "How big is your team?", type: "Number", color: C.number },
  { q: "Rough monthly budget?", type: "Single select", color: C.choice },
  { q: "Book a kickoff call", type: "Scheduling", color: C.file },
  { q: "Sign the agreement", type: "Signature", color: C.content },
];
export const STREAM_AT = DRAFT.map((_, i) => i * 0.5);

export const Stream: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.stream, AT.stream + 4, 0, 6, STRETCH.stream);
  if (!visible) return null;
  const exit = ramp(lf, bt(3.6), bt(4) + 2, EASE_IN);
  const count = STREAM_AT.filter((a) => lf >= bt(a)).length;
  return (
    <AbsoluteFill>
      <Paper glow="rgba(151,105,220,.14)" bg="#FAF7FD" />
      <Stage>
        <Cam lf={lf} bt={bt} rx={18} ry={-8} keys={[[0, 0, -205, 1.35], [0.75, 0, -105, 1.35], [1.25, 0, -5, 1.35], [1.75, 0, 95, 1.35], [2.25, 0, 195, 1.35], [2.75, 0, 295, 1.35], [3.3, 0, 40, 0.95]]}>
        <div style={{ position: "absolute", rotate: `${exit * 30}deg`, scale: String(1 - exit * 0.85), opacity: 1 - exit }}>
          <At x={420} y={-300}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: C.violetSoft, color: C.violetFg, fontFamily: FONT, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              <Icon name="sparkles" size={20} color={C.violet} fill={C.violet} stroke={1} /> {count} of 6 drafted
            </div>
          </At>
          {DRAFT.map((d, i) => {
            const t = lf - bt(STREAM_AT[i]);
            if (t < 0) return null;
            const p = popSpring(t, 13, 240, 0.6);
            return (
              <At key={i} y={-205 + i * 100}>
                <div style={{ scale: String(0.7 + 0.3 * p), opacity: ramp(t, 0, 4), translate: `${(1 - p) * 60}px 0` }}>
                  <div style={{ width: 900, height: 84, borderRadius: 22, background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 2px 4px #0000000a, 0 16px 36px -20px #3a1a6040", display: "flex", alignItems: "center", gap: 18, padding: "0 24px", boxSizing: "border-box", fontFamily: FONT }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, background: d.color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20 }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 28, fontWeight: 600, color: C.ink }}>{typedAt(d.q, t)}</div>
                    <TypeChip label={d.type} color={d.color} size={19} />
                  </div>
                </div>
              </At>
            );
          })}
        </div>
      </Cam>
      </Stage>
    </AbsoluteFill>
  );
};
/** The question text types itself in over ~12 frames. */
const typedAt = (s: string, t: number) => s.slice(0, Math.max(1, Math.floor(s.length * Math.min(1, t / 12))));


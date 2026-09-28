import React from "react";
import { AbsoluteFill } from "remotion";
import { AT } from "../beat";
import { C, DISPLAY, EASE_IN, EXPO_OUT, FONT, lerp, ramp } from "../brand";
import { At, Paper, Stage, Title, popSpring, useBeatScene } from "../kit";
import { Bubble, Burst, Card, Icon, Label, Mark, MotionBlur, TypeChip } from "../ui";

// ======================= follow-ups =======================
const STOPS = [
  { label: "4 hours later", x: -440 },
  { label: "1 day later", x: 0 },
  { label: "3 days later", x: 440 },
];

/** Bar A: they left at question 4; a reminder fires on each beat. */
export const FollowA: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.followA, AT.followA + 4, 0, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 8, 13, 200, 0.7);
  const line = ramp(lf, 0, bt(1), EXPO_OUT);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <div style={{ position: "absolute", translate: `0 ${-exit * 1300}px` }}>
          <Title lf={lf} a="Left halfway?" b="It follows up." at={-4} />
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
  const { lf, visible, bt } = useBeatScene(AT.followB, AT.followB + 4, 0, 6);
  if (!visible) return null;
  const inY = 1 - ramp(lf, -12, 3, EXPO_OUT);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper glow="rgba(63,165,101,.14)" />
      <Stage>
        <MotionBlur id="fb-in" y={inY * 40} style={{ position: "absolute", translate: `0 ${inY * 1300}px` }}>
          <div style={{ position: "absolute", scale: String(1 + exit * 4), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
            <Title lf={lf} a="They come back" b="and finish." at={-4} />
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
      </Stage>
    </AbsoluteFill>
  );
};

// ======================= AI builds the form =======================
const ASK = "Onboarding for a design agency. Ask their budget and book a kickoff call.";
export const ASK_T = { typeFrom: 0.3, typeTo: 2.4, send: 2.6 };

export const AskAI: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.ask, AT.ask + 4, 8, 4);
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
        <Title lf={lf} a="Don't build it." b="Just ask." at={-4} />
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
export const STREAM_AT = DRAFT.map((_, i) => 0.25 + i * 0.5);

export const Stream: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.stream, AT.stream + 4, 0, 6);
  if (!visible) return null;
  const exit = ramp(lf, bt(3.6), bt(4) + 2, EASE_IN);
  const count = STREAM_AT.filter((a) => lf >= bt(a)).length;
  return (
    <AbsoluteFill>
      <Paper glow="rgba(151,105,220,.14)" bg="#FAF7FD" />
      <Stage>
        <div style={{ position: "absolute", rotate: `${exit * 30}deg`, scale: String(1 - exit * 0.85), opacity: 1 - exit }}>
          <Title lf={lf} a="It writes" b="every question." at={-6} />
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
      </Stage>
    </AbsoluteFill>
  );
};
/** The question text types itself in over ~12 frames. */
const typedAt = (s: string, t: number) => s.slice(0, Math.max(1, Math.floor(s.length * Math.min(1, t / 12))));

// ======================= blocks =======================
function PayBlock({ t }: { t: number }) {
  const paid = t > 18;
  return (
    <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.muted }}>Project deposit</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 800 }}>₹25,000</div>
      </div>
      {paid ? (
        <div style={{ height: 76, borderRadius: 18, background: C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 28, fontWeight: 700, scale: String(popSpring(t - 18, 10, 280)) }}>
          <Icon name="check" size={30} color="#fff" stroke={3} /> Paid · verified with the gateway
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1, height: 76, borderRadius: 18, background: "#0C2451", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 26, fontWeight: 700, scale: String(1 - 0.06 * Math.max(0, 1 - Math.abs(t - 12) / 5)) }}>
            <span style={{ color: "#3395FF", fontWeight: 900 }}>/</span> Pay with Razorpay
          </div>
          <div style={{ width: 200, height: 76, borderRadius: 18, background: "#635BFF", color: "#fff", display: "grid", placeItems: "center", fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>stripe</div>
        </div>
      )}
    </div>
  );
}
function SignBlock({ t }: { t: number }) {
  const d = ramp(t, 2, 22, (x) => x);
  return (
    <div style={{ width: 640 }}>
      <div style={{ height: 200, borderRadius: 20, background: C.secondary, border: `2px dashed ${C.border}`, position: "relative" }}>
        <svg viewBox="0 0 600 200" width="100%" height="100%">
          <path d="M40 130 C 70 60, 100 60, 110 120 S 150 170, 170 110 S 210 50, 230 120 C 240 150, 260 150, 280 110 C 300 80, 330 80, 340 120 C 350 150, 380 140, 400 105 L 430 95 C 470 90, 520 110, 560 100" fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
        </svg>
        <div style={{ position: "absolute", left: 28, bottom: 26, right: 28, height: 2, background: C.border }} />
      </div>
      <div style={{ marginTop: 14, fontSize: 22, color: C.muted, fontWeight: 500 }}>Signed by Maya · timestamped</div>
    </div>
  );
}
function ConsentBlock({ t }: { t: number }) {
  const tick = popSpring(t - 10, 10, 300, 0.5);
  return (
    <div style={{ width: 640, display: "flex", alignItems: "center", gap: 22, padding: "28px 30px", borderRadius: 22, background: C.secondary }}>
      <div style={{ width: 58, height: 58, borderRadius: 16, background: t > 10 ? C.orange : C.card, border: `2px solid ${t > 10 ? C.orange : C.border}`, display: "grid", placeItems: "center" }}>
        <div style={{ scale: String(tick) }}><Icon name="check" size={36} color="#fff" stroke={3.4} /></div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 650 }}>I agree to the terms</div>
        <div style={{ fontSize: 21, color: C.muted, marginTop: 4 }}>Version 4 · accepted and timestamped</div>
      </div>
    </div>
  );
}
function BookBlock({ t }: { t: number }) {
  const slots = ["Wed 9:00", "Wed 14:30", "Thu 10:30", "Thu 16:00", "Fri 11:00", "Fri 15:30"];
  const pick = t > 10;
  return (
    <div style={{ width: 640 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {slots.map((s, i) => {
          const on = pick && i === 2;
          return <div key={s} style={{ height: 70, borderRadius: 16, border: `2px solid ${on ? C.orange : C.border}`, background: on ? C.orange : C.card, color: on ? "#fff" : C.ink, display: "grid", placeItems: "center", fontSize: 24, fontWeight: 650, scale: String(on ? 1 + 0.08 * Math.sin(Math.min(1, (t - 10) / 8) * Math.PI) : 1) }}>{s}</div>;
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: C.muted, fontWeight: 500 }}>
        <Icon name="calendar" size={24} color={C.muted} /> Your Cal.com, Calendly or Google Calendar link
      </div>
    </div>
  );
}
const BLOCKS_A = [
  { name: "Payments", sub: "Razorpay, Stripe and more", icon: "hash", El: PayBlock },
  { name: "Signatures", sub: "Drawn right in the chat", icon: "pen", El: SignBlock },
  { name: "Consent", sub: "Every version on record", icon: "shield", El: ConsentBlock },
  { name: "Bookings", sub: "A slot, then your calendar", icon: "calendar", El: BookBlock },
];

/** Second drop: one block per beat in the same card, flipping over. */
export const BlocksA: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.blocksA, AT.blocksA + 4, 0, 6);
  if (!visible) return null;
  const flash = 1 - ramp(lf, 0, 10);
  const punch = popSpring(lf, 10, 200, 0.8);
  const idx = Math.max(0, Math.min(3, Math.floor(lf / bt(1) + 0.001)));
  const local = lf - bt(idx);
  const flip = idx > 0 ? 1 - ramp(local, -2, 8, EXPO_OUT) : 0;
  const cur = BLOCKS_A[idx];
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <div style={{ position: "absolute", scale: String(lerp(1.25, 1, punch)), translate: `${-exit * 2400}px 0` }}>
          <Title lf={lf} a="Take payments," b="signatures, bookings." at={2} />
          <At y={-230}>
            <div style={{ display: "flex", gap: 12 }}>
              {BLOCKS_A.map((b, i) => (
                <div key={b.name} style={{ padding: "10px 20px", borderRadius: 999, background: i === idx ? C.ink : C.card, border: `1px solid ${i === idx ? C.ink : C.border}`, color: i === idx ? "#fff" : C.muted, fontFamily: FONT, fontSize: 22, fontWeight: 650, scale: String(i === idx ? 1.06 : 1) }}>{b.name}</div>
              ))}
            </div>
          </At>
          <At y={70}>
            <div style={{ transform: `perspective(1800px) rotateX(${flip * 80}deg)`, transformOrigin: "50% 0%" }}>
              <Card w={780} pad={40} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, minHeight: 380, justifyContent: "center" }}>
                <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: C.orangeSoft, display: "grid", placeItems: "center" }}><Icon name={cur.icon} size={24} color={C.orange} /></div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700 }}>{cur.name}</div>
                  <div style={{ fontSize: 21, color: C.muted, marginLeft: 6 }}>{cur.sub}</div>
                </div>
                <cur.El t={local} />
              </Card>
            </div>
          </At>
          <At y={70}><Burst t={lf - bt(0) - 18} n={12} r={420} color={C.green} /></At>
        </div>
      </Stage>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

/** Bar B: four more ways to answer, popping into a grid, one per beat. */
export const BlocksB: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.blocksB, AT.blocksB + 4, 10, 6);
  if (!visible) return null;
  const whip = 1 - ramp(lf, -12, 3, EXPO_OUT);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  const tile = (i: number) => popSpring(lf - bt(i) + 6, 12, 240, 0.6);
  const lt = (i: number) => lf - bt(i);
  const W = 470, H = 250;
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <MotionBlur id="bb-in" x={whip * 50} style={{ position: "absolute", translate: `${whip * 2400}px 0`, scale: String(1 - exit * 0.9), opacity: 1 - exit }}>
          <Title lf={lf} a="And every" b="way to answer." at={-4} />
          {/* poll */}
          <At x={-(W / 2 + 12)} y={-70}>
            <Card w={W} h={H} pad={26} style={{ scale: String(tile(0)) }}>
              <Label>Poll</Label>
              {[["Weekly", 62], ["Monthly", 28], ["Never", 10]].map(([k, v], i) => (
                <div key={k} style={{ marginTop: 14, height: 44, borderRadius: 12, background: C.secondary, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${(v as number) * ramp(lt(0), 4 + i * 2, 20)}%`, background: i === 0 ? C.choice : "#D9EFE0" }} />
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "0 16px", lineHeight: "44px", fontSize: 21, fontWeight: 650 }}><span>{k}</span><span>{Math.round((v as number) * ramp(lt(0), 4 + i * 2, 20))}%</span></div>
                </div>
              ))}
            </Card>
          </At>
          {/* picture choice */}
          <At x={W / 2 + 12} y={-70}>
            <Card w={W} h={H} pad={26} style={{ scale: String(tile(1)) }}>
              <Label>Picture choice</Label>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                {[["#FFB48C", "#FD6F29"], ["#C9B3EF", "#9769DC"], ["#A8DDB8", "#3FA565"]].map(([a, b2], i) => {
                  const on = i === 1 && lt(1) > 10;
                  return <div key={i} style={{ flex: 1, height: 130, borderRadius: 16, background: `linear-gradient(140deg, ${a}, ${b2})`, border: `4px solid ${on ? C.ink : "transparent"}`, scale: String(on ? 1.06 : 1), display: "grid", placeItems: "end center", paddingBottom: 8 }}>{on && <div style={{ width: 30, height: 30, borderRadius: 15, background: C.ink, display: "grid", placeItems: "center" }}><Icon name="check" size={18} color="#fff" stroke={3} /></div>}</div>;
                })}
              </div>
            </Card>
          </At>
          {/* rating */}
          <At x={-(W / 2 + 12)} y={200}>
            <Card w={W} h={H} pad={26} style={{ scale: String(tile(2)) }}>
              <Label>Rating</Label>
              <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                {[0, 1, 2, 3, 4].map((s) => {
                  const on = lt(2) > 4 + s * 3;
                  return <div key={s} style={{ scale: String(on ? popSpring(lt(2) - 4 - s * 3, 9, 300, 0.5) : 1) }}><Icon name="star" size={62} color={on ? "#F2A516" : "#DDD3C5"} fill={on ? "#F7B731" : "none"} stroke={1.6} /></div>;
                })}
              </div>
            </Card>
          </At>
          {/* file upload */}
          <At x={W / 2 + 12} y={200}>
            <Card w={W} h={H} pad={26} style={{ scale: String(tile(3)) }}>
              <Label>File upload</Label>
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", borderRadius: 16, background: C.secondary }}>
                <Icon name="file" size={40} color={C.file} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 650 }}>brand-guidelines.pdf</div>
                  <div style={{ marginTop: 10, height: 8, borderRadius: 4, background: "#E6DDD0" }}><div style={{ width: `${100 * ramp(lt(3), 2, 20)}%`, height: "100%", borderRadius: 4, background: lt(3) > 20 ? C.green : C.file }} /></div>
                </div>
              </div>
            </Card>
          </At>
        </MotionBlur>
      </Stage>
    </AbsoluteFill>
  );
};

// ======================= branching (2 bars) =======================
export const BRANCH = { q: 0.3, a1: 1, a2: 2, lines: 2.6, n1: 4.5, n2: 5.5, pill: 6.6 };

export const Branch: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.branch, AT.branch + 8, 10, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 8, 13, 200, 0.7);
  const a1 = popSpring(lf - bt(BRANCH.a1), 12, 240, 0.6);
  const a2 = popSpring(lf - bt(BRANCH.a2), 12, 240, 0.6);
  const lines = ramp(lf, bt(BRANCH.lines), bt(BRANCH.lines) + 16, EXPO_OUT);
  const n1 = popSpring(lf - bt(BRANCH.n1), 12, 220, 0.7);
  const n2 = popSpring(lf - bt(BRANCH.n2), 12, 220, 0.7);
  const pill = popSpring(lf - bt(BRANCH.pill), 12, 240);
  // camera: follow the question, pull back for both lanes
  const z = lerp(1.15, 0.95, ramp(lf, bt(2.4), bt(3.6), EXPO_OUT));
  const exit = ramp(lf, bt(7.6), bt(8) + 4, EASE_IN);
  const X = 420;
  return (
    <AbsoluteFill>
      <Paper />
      <Stage scale={z * (1 - exit * 0.9)}>
        <div style={{ opacity: 1 - exit, rotate: `${exit * -25}deg` }}>
          <Title lf={lf} a="Different answers." b="Different paths." at={-4} y={-392} />
          <At y={-220}>
            <div style={{ scale: String(0.85 + 0.15 * inP) }}>
              <Bubble from="bot" light size={32}>How big is your team?</Bubble>
            </div>
          </At>
          <svg width={1400} height={600} viewBox="-700 -300 1400 600" style={{ position: "absolute", left: -700, top: -300, overflow: "visible" }}>
            <path d={`M 0 -175 C 0 -80, ${-X} -120, ${-X} -30`} fill="none" stroke={C.orange} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(lines, a1 > 0.3 ? 1 : 0)} />
            <path d={`M 0 -175 C 0 -80, ${X} -120, ${X} -30`} fill="none" stroke={C.violet} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(lines, a2 > 0.3 ? 1 : 0)} />
            <path d={`M ${-X} 60 L ${-X} 150`} fill="none" stroke={C.orange} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(lf, bt(BRANCH.n1) - 10, bt(BRANCH.n1))} />
            <path d={`M ${X} 60 L ${X} 150`} fill="none" stroke={C.violet} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(lf, bt(BRANCH.n2) - 10, bt(BRANCH.n2))} />
          </svg>
          {/* two people, two answers */}
          <At x={-X} y={10}>
            <div style={{ scale: String(a1), display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: C.orangeSoft, color: C.orangeFg, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24, fontFamily: FONT }}>A</div>
              <Bubble from="user" size={32}>just 8 of us</Bubble>
            </div>
          </At>
          <At x={X} y={10}>
            <div style={{ scale: String(a2), display: "flex", alignItems: "center", gap: 14 }}>
              <Bubble from="user" size={32} style={{ background: C.violet, color: "#fff" }}>around 40</Bubble>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: C.violetSoft, color: C.violetFg, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24, fontFamily: FONT }}>B</div>
            </div>
          </At>
          <At x={-X} y={210}>
            <div style={{ scale: String(n1) }}>
              <Card w={520} pad={24} style={{ borderColor: `${C.orange}66` }}>
                <Label color={C.orangeFg}>Next for A</Label>
                <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 32, fontWeight: 700 }}>What are you using today?</div>
              </Card>
            </div>
          </At>
          <At x={X} y={210}>
            <div style={{ scale: String(n2) }}>
              <Card w={520} pad={24} style={{ borderColor: `${C.violet}66` }}>
                <Label color={C.violetFg}>Next for B</Label>
                <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 32, fontWeight: 700 }}>Want a call with our team?</div>
              </Card>
            </div>
          </At>
          <At y={375}>
            <div style={{ scale: String(pill), display: "flex", alignItems: "center", gap: 10, padding: "12px 26px", borderRadius: 999, background: C.ink, color: "#fff", fontFamily: FONT, fontSize: 26, fontWeight: 600, whiteSpace: "nowrap" }}>
              <Mark size={30} /> One form. A different interview for each person.
            </div>
          </At>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

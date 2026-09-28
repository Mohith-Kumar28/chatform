import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { AT, STRETCH, b, DROP } from "../beat";
import { C, DISPLAY, EASE_IN, EASE_IN_OUT, EXPO_OUT, FONT, lerp, ramp } from "../brand";
import { At, Cam, Paper, Stage, popSpring, useBeatScene } from "../kit";
import { Bubble, Card, Cursor, Icon, Mark, Ripple } from "../ui";

// ============================ the problem (16-beat build-up) ============================
const FIELDS = [
  "Full name", "Work email", "Phone number", "Company name", "Company website", "Job title", "Department", "Team size",
  "Country", "Industry", "Annual revenue", "Current tool", "How did you hear about us?", "What are your goals?", "Monthly budget",
  "Decision timeline", "Who else is involved?", "What went wrong last time?", "Must-have features", "Integrations needed",
  "Security requirements", "Preferred contact time", "Anything else?", "Referral code", "Consent",
];
export const HOOK = { type1: -16, page: -14, slam1: -10.5, slam2: -9.5, close: -7.4, leave: -6.6, stay: -5, chips: [-3.5, -3, -2.5, -2, -1.5] as const };
const CHIPS = ["ok", "idk", "n/a", "it was bad", "fine"];
const ROT = [-7, 5, -4, 8, -3];
const OFF: [number, number][] = [[-40, -24], [46, 12], [-26, 34], [34, -32], [0, 0]];

export function Typed({ text, t, cps = 0.9, size, color = "#fff", accent, accentColor = C.orange }: { text: string; t: number; cps?: number; size: number; color?: string; accent?: string; accentColor?: string }) {
  const n = Math.max(0, Math.min(text.length, Math.floor(t * cps)));
  const shown = text.slice(0, n);
  const ai = accent ? text.indexOf(accent) : -1;
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", color, whiteSpace: "nowrap", lineHeight: 1 }}>
      {ai >= 0 && n > ai ? (
        <>
          {shown.slice(0, ai)}
          <span style={{ color: accentColor }}>{shown.slice(ai)}</span>
        </>
      ) : (
        shown
      )}
      <span style={{ display: "inline-block", width: size * 0.06, height: size * 0.8, marginLeft: size * 0.05, background: C.orange, verticalAlign: "-0.08em", opacity: n < text.length || Math.floor(t / 14) % 2 === 0 ? 1 : 0 }} />
    </div>
  );
}

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  if (f > DROP + 2) return null;
  const glow = ramp(f, 0, DROP, EASE_IN);
  const B = (n: number) => b(n);
  // the long page
  const pageIn = ramp(f, B(HOOK.page) - 6, B(HOOK.page) + 14, EXPO_OUT);
  const scroll = ramp(f, B(HOOK.page), B(HOOK.close), EASE_IN);
  const dim = ramp(f, B(HOOK.slam1) - 4, B(HOOK.slam1) + 4) * (1 - ramp(f, B(HOOK.close - 1.1) + 6, B(HOOK.close - 0.6)));
  const closeP = ramp(f, B(HOOK.close), B(HOOK.close) + 16, EASE_IN);
  const qn = Math.max(1, Math.min(25, Math.round(1 + scroll * 24)));
  const cur = ramp(f, B(HOOK.close) - 26, B(HOOK.close) - 2, EXPO_OUT);
  const implode = ramp(f, b(-1), b(-0.35), EASE_IN);
  const t1 = f - B(HOOK.type1);
  const typeOut = ramp(f, B(HOOK.page) - 8, B(HOOK.page) + 2, EASE_IN);
  return (
    <AbsoluteFill style={{ background: "#120E0B" }}>
      <AbsoluteFill style={{ background: `radial-gradient(45% 55% at 50% 50%, rgba(253,111,41,${0.07 + glow * 0.4}), transparent 70%)` }} />
      <Stage>
        {/* 1. "This is a form." */}
        {f < B(HOOK.page) + 4 && (
          <At>
            <div style={{ scale: String(1 + typeOut * 1.5), opacity: 1 - typeOut, filter: typeOut ? `blur(${typeOut * 10}px)` : undefined }}>
              <Typed text="This is a form." t={t1} size={150} />
            </div>
          </At>
        )}
        {/* 2. the page: 25 required fields, scrolling past */}
        {f >= B(HOOK.page) - 6 && f < B(HOOK.leave) + 10 && (
          <div style={{ position: "absolute", scale: String((0.7 + 0.3 * pageIn) * (1 - closeP)), rotate: `${closeP * 8}deg`, opacity: (1 - closeP) * pageIn, translate: `0 ${(1 - pageIn) * 400}px` }}>
            <div style={{ position: "absolute", left: -470, top: -470, width: 940, height: 940, borderRadius: 28, background: C.card, overflow: "hidden", boxShadow: "0 40px 120px -30px rgba(0,0,0,.7)" }}>
              <div style={{ height: 54, background: C.secondary, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: `1px solid ${C.border}` }}>
                {["#F0564A", "#E0A92E", "#4CB86A"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
                <div style={{ marginLeft: 16, padding: "6px 16px", borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 17, color: C.muted, display: "flex", alignItems: "center", gap: 12 }}>
                  Customer onboarding form <Icon name="x" size={16} color={C.muted} />
                </div>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: 54, bottom: 0, overflow: "hidden" }}>
              <div style={{ translate: `0 ${-scroll * 2350}px`, padding: "30px 44px" }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 700, color: C.ink }}>Customer onboarding</div>
                <div style={{ fontFamily: FONT, fontSize: 20, color: C.muted, marginTop: 6, marginBottom: 24 }}>25 questions · all required</div>
                {FIELDS.map((l, i) => (
                  <div key={l} style={{ height: 100 }}>
                    <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.ink }}><span style={{ color: C.muted }}>{i + 1}. </span>{l}<span style={{ color: C.orange }}> *</span></div>
                    <div style={{ marginTop: 10, height: 44, borderRadius: 10, background: C.secondary, border: `1px solid ${C.border}` }} />
                  </div>
                ))}
              </div>
              </div>
            </div>
            <div style={{ position: "absolute", left: -140, top: 400, width: 280, padding: "12px 0", borderRadius: 999, background: C.ink, color: "#fff", textAlign: "center", fontFamily: FONT, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>Question {qn} of 25</div>
            {/* the cursor heads for the tab's close button */}
            <Cursor x={lerp(300, -216, cur)} y={lerp(300, -452, cur)} press={Math.max(0, 1 - Math.abs(f - B(HOOK.close)) / 5)} opacity={ramp(f, B(HOOK.close) - 30, B(HOOK.close) - 22)} />
            <Ripple x={-216} y={-446} t={(f - B(HOOK.close)) / 18} />
          </div>
        )}
        {/* 3. the verdict, slammed over the dimmed page */}
        {dim > 0.01 && <div style={{ position: "absolute", left: -960, top: -540, width: 1920, height: 1080, background: `rgba(18,14,11,${0.75 * dim})` }} />}
        {[
          { at: HOOK.slam1, text: "25 questions.", y: -85, until: HOOK.close - 1.1 },
          { at: HOOK.slam2, text: "One long page.", y: 85, until: HOOK.close - 1.1 },
          { at: HOOK.leave, text: "So people leave.", y: 0, until: HOOK.stay - 0.3, accent: true },
        ].map((l) => {
          const t = f - B(l.at);
          if (t < 0 || f > B(l.until) + 8) return null;
          const p = popSpring(t, 14, 300, 0.6);
          const o = ramp(f, B(l.until), B(l.until) + 8, EASE_IN);
          return (
            <At key={l.text} y={l.y}>
              <div style={{ scale: String((1.35 - 0.35 * p) * (1 - o * 0.3)), opacity: 1 - o, filter: t < 3 ? `blur(${(3 - t) * 3}px)` : o ? `blur(${o * 8}px)` : undefined, fontFamily: DISPLAY, fontWeight: 800, fontSize: 150, letterSpacing: "-0.045em", color: l.accent ? C.orange : "#fff", whiteSpace: "nowrap" }}>{l.text}</div>
            </At>
          );
        })}
        {/* 4. what the rest leave behind */}
        {f >= B(HOOK.stay) && f < b(-0.5) && (
          <At y={-190}>
            <div style={{ opacity: 1 - implode }}>
              <Typed text="The ones who stay write:" t={f - B(HOOK.stay)} cps={1.2} size={84} color="rgba(255,255,255,.9)" />
            </div>
          </At>
        )}
        {HOOK.chips.map((n, i) => {
          const t = f - b(n);
          if (t < 0) return null;
          const p = popSpring(t, 15, 320, 0.6);
          const [ox, oy] = OFF[i];
          const age = HOOK.chips.filter((m) => f >= b(m)).length - 1 - i;
          return (
            <At key={i} x={ox * (1 - implode)} y={40 + oy * (1 - implode)}>
              <div style={{ scale: String((1.6 - 0.6 * p) * Math.pow(0.9, age) * (1 - implode)), rotate: `${ROT[i] + implode * 180}deg`, filter: `brightness(${1 - age * 0.12})`, opacity: ramp(t, 0, 2) }}>
                <Bubble from="user" size={64} style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,.7)" }}>{CHIPS[i]}</Bubble>
              </div>
            </At>
          );
        })}
        {f >= b(-0.6) && (
          <At y={40}>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: C.orange, scale: String(popSpring(f - b(-0.6), 8, 200) * (1 + 0.25 * Math.sin((f - b(-0.6)) / 2.2))), boxShadow: "0 0 60px rgba(253,111,41,.9)" }} />
          </At>
        )}
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ full-frame statements ============================
type Kind = "type" | "slam2" | "stack" | "marker" | "split";
type StatementProps = { scene: keyof typeof AT; kind: Kind; a: string; bText?: string; words?: string[]; accent?: string; bg?: "paper" | "orange" | "night" | "violet"; icon?: React.ReactNode };

/** One idea, big, in the middle of the frame, in its own style. It gets out of the way before the demo. */
export const Statement: React.FC<StatementProps> = ({ scene, kind, a, bText, words, accent, bg = "paper", icon }) => {
  const { lf, visible, bt } = useBeatScene(AT[scene], AT[scene] + 4, 0, 6, STRETCH[scene]);
  if (!visible) return null;
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  const dark = bg !== "paper";
  const ink = dark ? "#fff" : C.ink;
  const acc = bg === "orange" ? C.night : C.orange;
  const bgStyle: Record<string, string> = {
    paper: C.paper,
    orange: `linear-gradient(135deg, #F0501C 0%, ${C.orange} 45%, #FF9A62 100%)`,
    night: `radial-gradient(60% 60% at 50% 50%, #2A221D, ${C.night})`,
    violet: `radial-gradient(60% 60% at 50% 50%, #A07CE8, #6D46B8)`,
  };
  const slam = (t: number) => popSpring(t, 14, 300, 0.6);
  const W = (text: string, size: number, color: string, extra?: React.CSSProperties) => (
    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, letterSpacing: "-0.045em", color, whiteSpace: "nowrap", lineHeight: 1.02, ...extra }}>{text}</div>
  );
  let body: React.ReactNode = null;
  if (kind === "type") {
    body = (
      <At>
        <Typed text={a} t={lf + 2} cps={1.1} size={Math.min(128, Math.floor(1640 / (a.length * 0.48)))} color={ink} accent={accent} accentColor={bg === "violet" ? "#FFD8C2" : C.orange} />
      </At>
    );
  } else if (kind === "slam2") {
    const p1 = slam(lf + 2), p2 = slam(lf - bt(1.4));
    body = (
      <>
        <At y={-80}><div style={{ scale: String(1.4 - 0.4 * p1), opacity: ramp(lf + 2, 0, 3), filter: lf < 2 ? `blur(${(2 - lf) * 3}px)` : undefined }}>{W(a, 150, ink)}</div></At>
        <At y={90}><div style={{ scale: String(1.4 - 0.4 * p2), opacity: ramp(lf - bt(1.4), 0, 3) }}>{W(bText ?? "", 150, acc)}</div></At>
      </>
    );
  } else if (kind === "stack") {
    const ws = words ?? [];
    body = (
      <>
        {ws.map((w, i) => {
          const t = lf - bt(i * 0.75);
          if (t < 0) return null;
          const p = slam(t);
          const age = ws.filter((_, j) => lf >= bt(j * 0.75)).length - 1 - i;
          return (
            <At key={w} y={(i - (ws.length - 1) / 2) * 118}>
              <div style={{ scale: String(1.3 - 0.3 * p), opacity: ramp(t, 0, 3) * (age > 0 ? 0.35 : 1) }}>{W(w, 120, age > 0 ? ink : acc)}</div>
            </At>
          );
        })}
      </>
    );
  } else if (kind === "marker") {
    const p1 = popSpring(lf + 2, 13, 240, 0.6);
    const sw = ramp(lf, bt(1.4), bt(1.4) + 12, EXPO_OUT);
    const p2 = popSpring(lf - bt(1.4) - 4, 13, 240, 0.6);
    body = (
      <>
        <At y={-80}><div style={{ scale: String(0.7 + 0.3 * p1), opacity: ramp(lf + 2, 0, 4) }}>{W(a, 130, ink)}</div></At>
        <At y={90}>
          <div style={{ position: "relative", padding: "4px 30px 14px" }}>
            <div style={{ position: "absolute", inset: 0, background: C.orange, borderRadius: 18, transform: `scaleX(${sw}) skewX(-8deg)`, transformOrigin: "0% 50%" }} />
            <div style={{ position: "relative", opacity: ramp(lf - bt(1.4) - 4, 0, 4), translate: `0 ${(1 - p2) * 30}px` }}>{W(bText ?? "", 130, dark ? "#fff" : C.night)}</div>
          </div>
        </At>
      </>
    );
  } else if (kind === "split") {
    const s1 = ramp(lf, -2, 12, EXPO_OUT), s2 = ramp(lf, bt(1.2), bt(1.2) + 14, EXPO_OUT);
    const fork = ramp(lf, bt(0.6), bt(1.2), EASE_IN_OUT);
    body = (
      <>
        <svg width={1400} height={500} viewBox="-700 -250 1400 500" style={{ position: "absolute", left: -700, top: -250, overflow: "visible" }}>
          <path d="M -560 0 L -200 0 C -80 0, -60 -150, 80 -150 L 560 -150" fill="none" stroke={C.orange} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fork} opacity={0.35} />
          <path d="M -560 0 L -200 0 C -80 0, -60 150, 80 150 L 560 150" fill="none" stroke={C.violet} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fork} opacity={0.35} />
        </svg>
        <At y={-150} x={lerp(-500, 0, s1)}><div style={{ opacity: s1 }}>{W(a, 130, ink)}</div></At>
        <At y={150} x={lerp(500, 0, s2)}><div style={{ opacity: s2 }}>{W(bText ?? "", 130, C.violet)}</div></At>
      </>
    );
  }
  return (
    <AbsoluteFill style={{ background: bgStyle[bg] }}>
      {bg === "orange" && <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.16) 1.6px, transparent 1.8px)", backgroundSize: "28px 28px", maskImage: "radial-gradient(70% 70% at 50% 50%, #000, transparent)" }} />}
      {bg === "paper" && <AbsoluteFill style={{ background: "radial-gradient(48% 58% at 50% 52%, rgba(253,111,41,.13), transparent 72%)" }} />}
      <Stage>
        <div style={{ position: "absolute", scale: String(1 + exit * 3), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 12}px)` : undefined }}>
          {icon && <At y={-300}><div style={{ scale: String(popSpring(lf + 4, 10, 220, 0.6)) }}>{icon}</div></At>}
          {body}
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ follow-up, part 2: she comes back ============================
export const RESUME = { click: 1, answer: 2.1, done: 3 };

export const FollowResume: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.followB, AT.followB + 4, 0, 6, STRETCH.followB);
  if (!visible) return null;
  const mail = popSpring(lf + 8, 13, 200, 0.7);
  const open = ramp(lf, bt(RESUME.click) + 4, bt(RESUME.click) + 22, EXPO_OUT);
  const ans = popSpring(lf - bt(RESUME.answer), 12, 240, 0.6);
  const fill = ramp(lf, bt(RESUME.answer) + 6, bt(RESUME.done), EXPO_OUT);
  const stamp = popSpring(lf - bt(RESUME.done), 9, 320, 0.7);
  const shake = lf >= bt(RESUME.done) && lf < bt(RESUME.done) + 8 ? Math.sin(lf * 3) * 8 * (1 - (lf - bt(RESUME.done)) / 8) : 0;
  const cur = ramp(lf, bt(RESUME.click) - 24, bt(RESUME.click) - 2, EXPO_OUT);
  const exit = ramp(lf, bt(3.65), bt(4) + 4, EASE_IN);
  const pct = Math.round(lerp(50, 100, fill));
  return (
    <AbsoluteFill>
      <Paper glow="rgba(63,165,101,.12)" />
      <Stage>
        <div style={{ position: "absolute", translate: `${shake}px ${exit * -1300}px` }}>
          <Cam lf={lf} bt={bt} rx={8} ry={10} keys={[[0, 0, -40, 1.3], [0.7, 150, 60, 1.5], [1.35, 0, 20, 1.05], [2.0, 120, 120, 1.4], [2.85, 0, -170, 1.3], [3.3, 0, 0, 1.0]]}>
            {/* the reminder email */}
            <At y={-40}>
              <div style={{ scale: String((0.8 + 0.2 * mail) * (1 - open * 0.35)), opacity: 1 - open, translate: `0 ${-open * 200}px` }}>
                <Card w={760} pad={34}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: C.orangeSoft, display: "grid", placeItems: "center" }}><Icon name="mail" size={30} color={C.orange} /></div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>Northwind onboarding</div>
                      <div style={{ fontSize: 19, color: C.muted }}>to maya@northwind.co · 4 hours later</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 22, fontSize: 28, fontWeight: 600, lineHeight: 1.35 }}>You're 4 questions from finishing</div>
                  <div style={{ marginTop: 24, display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 28px", borderRadius: 16, background: C.orange, color: C.night, fontSize: 24, fontWeight: 700, scale: String(1 - 0.08 * Math.max(0, 1 - Math.abs(lf - bt(RESUME.click)) / 5)) }}>
                    Continue from question 4 <Icon name="arrowRight" size={24} color={C.night} stroke={2.6} />
                  </div>
                </Card>
              </div>
            </At>
            <Ripple x={130} y={80} t={(lf - bt(RESUME.click)) / 20} />
            <Cursor x={lerp(420, 130, cur)} y={lerp(320, 74, cur)} press={Math.max(0, 1 - Math.abs(lf - bt(RESUME.click)) / 5)} opacity={ramp(lf, bt(0.4), bt(0.4) + 8) * (1 - open)} />
            {/* the conversation picks up where it stopped */}
            <At y={20}>
              <div style={{ scale: String(0.7 + 0.3 * open), opacity: open }}>
                <Card dark w={820} h={520} pad={0} style={{ overflow: "hidden", position: "relative" }}>
                  <div style={{ height: 78, display: "flex", alignItems: "center", gap: 14, padding: "0 26px", borderBottom: `1px solid ${C.bubbleLine}` }}>
                    <div style={{ width: 42, height: 42, borderRadius: 21, background: C.orange, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 19, color: C.ink }}>A</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>Welcome back, Maya</div>
                    <div style={{ marginLeft: "auto", fontSize: 26, fontWeight: 800, color: fill >= 1 ? "#6FD39A" : "#F6F1EA", fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
                  </div>
                  <div style={{ height: 8, background: C.bubble }}><div style={{ width: `${pct}%`, height: "100%", background: fill >= 1 ? C.green : C.orange }} /></div>
                  <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={{ fontSize: 17, color: "#9C9288", fontWeight: 600, letterSpacing: "0.1em" }}>QUESTION 4 OF 8</div>
                    <Bubble from="bot" size={28}>How big is the team you're setting up?</Bubble>
                    {lf >= bt(RESUME.answer) && (
                      <div style={{ alignSelf: "flex-end", scale: String(ans), transformOrigin: "100% 100%" }}>
                        <Bubble from="user" size={28}>12 of us</Bubble>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </At>
            <At x={0} y={-150}>
              <div style={{ scale: String(stamp), rotate: "-8deg", opacity: stamp > 0.02 ? 1 : 0, padding: "8px 30px", border: `8px solid ${C.green}`, borderRadius: 18, color: C.green, fontFamily: DISPLAY, fontWeight: 800, fontSize: 72, background: "rgba(255,255,255,.92)" }}>COMPLETED</div>
            </At>
          </Cam>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ recap: every feature, on a moving 3D wall ============================
const FEATURES: { t: string; icon: string; c: string }[] = [
  { t: "Conversational forms", icon: "sparkles", c: C.orange }, { t: "Asks again when an answer is thin", icon: "sparkles", c: C.orange },
  { t: "Understands free text", icon: "hash", c: C.text }, { t: "Answers from your docs", icon: "file", c: C.violet },
  { t: "Automatic follow-ups", icon: "mail", c: C.orange }, { t: "Resume where they left", icon: "arrowRight", c: C.green },
  { t: "AI form builder", icon: "sparkles", c: C.violet }, { t: "Build from your website", icon: "globe", c: C.text },
  { t: "Edit by asking", icon: "pen", c: C.violet }, { t: "Payments with Razorpay and Stripe", icon: "hash", c: C.green },
  { t: "Signatures", icon: "pen", c: C.content }, { t: "Consent records", icon: "shield", c: C.contact },
  { t: "Bookings via Cal.com or Calendly", icon: "calendar", c: C.file }, { t: "27 question types", icon: "grid", c: C.orange },
  { t: "Branching logic", icon: "arrowRight", c: C.violet }, { t: "No dead ends before publish", icon: "check", c: C.green },
  { t: "Verified respondents", icon: "shield", c: C.green }, { t: "Drop-off analytics", icon: "chart", c: C.orange },
  { t: "Embed anywhere", icon: "window", c: C.text }, { t: "QR codes", icon: "qr", c: C.ink },
  { t: "Headless API", icon: "code", c: C.ink }, { t: "Webhooks", icon: "link", c: C.contact },
  { t: "CSV export", icon: "file", c: C.choice }, { t: "Your brand, your fonts", icon: "star", c: C.number },
];
const COLS = 7, CW = 460, CH = 150, GAP = 26;

export const Recap: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.recap, AT.recap + 4, 0, 0, STRETCH.recap);
  if (!visible) return null;
  const pull = ramp(lf, 0, bt(3.2), EASE_IN_OUT);
  const zoom = lerp(2.2, 0.5, pull);
  const tiltX = lerp(10, 30, pull), tiltZ = lerp(-4, -12, pull);
  const dive = ramp(lf, bt(3.55), bt(4), EASE_IN);
  const title = popSpring(lf - bt(2.6), 13, 220, 0.7);
  return (
    <AbsoluteFill style={{ background: "#120E0B" }}>
      <AbsoluteFill style={{ background: "radial-gradient(55% 60% at 50% 50%, rgba(253,111,41,.2), transparent 70%)" }} />
      <Stage>
        <div style={{ position: "absolute", transform: `perspective(2200px) rotateX(${tiltX}deg) rotateZ(${tiltZ}deg) scale(${zoom * Math.pow(6, dive)})`, opacity: 1 - dive }}>
          {Array.from({ length: COLS }, (_, c) => {
            const dir = c % 2 ? 1 : -1;
            // each column drifts at its own slow speed, in alternate directions
            const off = dir * lf * (0.45 + (c % 3) * 0.12);
            return Array.from({ length: 16 }, (_, r) => {
              const i = (c * 7 + r * 3) % FEATURES.length;
              const ft = FEATURES[i];
              const on = c === 3 && r === 8;
              const x = (c - 3) * (CW + GAP);
              const y = (r - 8) * (CH + GAP) + off;
              return (
                <At key={`${c}-${r}`} x={x} y={y}>
                  <div style={{ width: CW, height: CH, boxSizing: "border-box", borderRadius: 26, background: on ? C.card : "#231C18", border: `1.5px solid ${on ? ft.c : "#3A302A"}`, display: "flex", alignItems: "center", gap: 18, padding: "0 28px", boxShadow: on ? `0 0 60px -10px ${ft.c}99` : "none", scale: on ? "1.04" : "1" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 18, background: on ? `${ft.c}22` : "#2E2622", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={ft.icon} size={34} color={on ? ft.c : "#A89E94"} /></div>
                    <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color: on ? C.ink : "#EDE5DA", lineHeight: 1.15 }}>{ft.t}</div>
                  </div>
                </At>
              );
            });
          })}
        </div>
        <At y={0}>
          <div style={{ scale: String(title * (1 - dive)), opacity: title * (1 - dive), padding: "22px 44px", borderRadius: 28, background: "rgba(18,14,11,.82)", backdropFilter: "blur(12px)", border: "1px solid #3A302A", textAlign: "center" }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 84, letterSpacing: "-0.04em", color: "#fff", whiteSpace: "nowrap" }}>One form builder. <span style={{ color: C.orange }}>All of it.</span></div>
          </div>
        </At>
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ end card ============================
export const End: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(AT.end, AT.fin, 2, 0);
  if (!visible) return null;
  const iris = ramp(lf, -2, 16, EXPO_OUT);
  const logo = popSpring(lf, 10, 190, 0.8);
  const join = ramp(lf, 4, 18, EXPO_OUT);
  const cta = popSpring(lf - bt(1.2), 12, 220);
  const sub = ramp(lf, bt(1.8), bt(1.8) + 10);
  return (
    <AbsoluteFill style={{ clipPath: `circle(${iris * 1250}px at 50% 50%)`, background: "linear-gradient(120deg, #F7843F 0%, #EE8FA0 50%, #A983E4 100%)" }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.18) 1.6px, transparent 1.8px)", backgroundSize: "28px 28px", maskImage: "radial-gradient(70% 70% at 50% 45%, #000, transparent)" }} />
      <Stage>
        <At y={-220}>
          <div style={{ scale: String(logo), rotate: `${(1 - logo) * -20}deg`, width: 200, height: 200, borderRadius: 56, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 30px 70px -20px rgba(90,20,60,.5)" }}>
            <Mark size={150} join={join} />
          </div>
        </At>
        <At y={10}>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: 150, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, whiteSpace: "pre", color: "#fff" }}>
            {"chatform".split("").map((ch, i) => {
              const t = lf - 4 - i * 1.3;
              const p = popSpring(t, 11, 260, 0.55);
              return <span key={i} style={{ display: "inline-block", scale: String(p), opacity: ramp(t, 0, 3), transformOrigin: "50% 80%" }}>{ch}</span>;
            })}
          </div>
        </At>
        <At y={185}>
          <div style={{ scale: String(cta), height: 100, padding: "0 46px", borderRadius: 999, background: "#fff", color: C.ink, display: "flex", alignItems: "center", gap: 16, fontFamily: FONT, fontSize: 40, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 24px 60px -18px rgba(90,20,60,.55)" }}>
            Start free at <span style={{ color: C.orange }}>chatform.in</span> <Icon name="arrowRight" size={40} color={C.ink} stroke={2.6} />
          </div>
        </At>
        <At y={305}>
          <div style={{ opacity: sub, fontFamily: FONT, fontSize: 34, fontWeight: 600, color: "rgba(255,255,255,.95)", whiteSpace: "nowrap" }}>Unlimited submissions · Conversational forms people actually finish</div>
        </At>
      </Stage>
    </AbsoluteFill>
  );
};

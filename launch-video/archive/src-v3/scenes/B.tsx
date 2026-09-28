import React from "react";
import { AbsoluteFill } from "remotion";
import { C, DISPLAY, EASE_IN, EXPO_OUT, FONT, MONO, drift, lerp, ramp } from "../brand";
import { At, Paper, Stage, Title, popSpring, useBeatScene } from "../kit";
import { Bubble, Burst, Card, Cursor, Icon, Label, MotionBlur, Ripple, TypeChip } from "../ui";

// ---------- bar 4: the ones who left come back ----------
export const FOLLOW = { toast: 1, click: 2, stamp: 3 };

export const FollowUp: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(16, 20, 8, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 6, 13, 200, 0.7);
  const toast = popSpring(lf - bt(FOLLOW.toast), 13, 220, 0.7);
  const fill = ramp(lf, bt(FOLLOW.click) + 2, bt(FOLLOW.click) + 16, EXPO_OUT);
  const done = lf >= bt(FOLLOW.stamp) - 2;
  const stamp = popSpring(lf - bt(FOLLOW.stamp), 9, 320, 0.7);
  const press = Math.max(0, 1 - Math.abs(lf - bt(FOLLOW.click)) / 5);
  const cx = lerp(420, 150, ramp(lf, bt(FOLLOW.click) - 14, bt(FOLLOW.click) - 1, EXPO_OUT));
  const cy = lerp(260, -150, ramp(lf, bt(FOLLOW.click) - 14, bt(FOLLOW.click) - 1, EXPO_OUT));
  const shake = lf >= bt(FOLLOW.stamp) && lf < bt(FOLLOW.stamp) + 8 ? Math.sin(lf * 3) * 8 * (1 - (lf - bt(FOLLOW.stamp)) / 8) : 0;
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  const pct = Math.round(lerp(50, 100, fill));
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <div style={{ position: "absolute", translate: `${shake}px ${-exit * 1300}px` }}>
          <Title lf={lf} a="Left halfway?" b="It brings them back." at={-2} />
          {/* reminder email arrives */}
          <At y={lerp(-420, -170, toast)}>
            <div style={{ opacity: ramp(lf - bt(FOLLOW.toast), 0, 4) }}>
              <Card w={640} pad={22} style={{ display: "flex", alignItems: "center", gap: 18, borderRadius: 22 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: C.orangeSoft, display: "grid", placeItems: "center" }}><Icon name="mail" size={30} color={C.orange} /></div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 650 }}>Reminder sent</div>
                  <div style={{ fontSize: 19, color: C.muted, marginTop: 2 }}>4 hours after Maya left, back to question 4</div>
                </div>
              </Card>
            </div>
          </At>
          {/* the respondent */}
          <At y={90}>
            <Card w={720} pad={32} style={{ scale: String((0.85 + 0.15 * inP) * 1.18) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: C.violetSoft, color: C.violetFg, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 30 }}>M</div>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 700 }}>Maya</div>
                  <div style={{ fontSize: 21, fontWeight: 600, color: done ? C.green : fill > 0 ? C.orangeFg : C.red }}>{done ? "Completed" : fill > 0 ? "Back at question 4" : "Left at question 4 of 8"}</div>
                </div>
                <div style={{ marginLeft: "auto", fontFamily: DISPLAY, fontSize: 44, fontWeight: 800, color: done ? C.green : C.ink, fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
              </div>
              <div style={{ marginTop: 22, height: 16, borderRadius: 8, background: C.secondary }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 8, background: done ? C.green : fill > 0 ? C.orange : C.red }} />
              </div>
            </Card>
          </At>
          <At x={230} y={60}>
            <div style={{ scale: String(stamp), rotate: "-10deg", opacity: stamp > 0.02 ? 1 : 0, padding: "8px 26px", border: `7px solid ${C.green}`, borderRadius: 16, color: C.green, fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, letterSpacing: "0.02em", background: "rgba(255,255,255,.85)" }}>COMPLETED</div>
          </At>
          <Ripple x={cx} y={cy + 6} t={(lf - bt(FOLLOW.click)) / 20} />
          <Cursor x={cx} y={cy} press={press} opacity={ramp(lf, bt(1), bt(1) + 8) * (1 - ramp(lf, bt(3), bt(3) + 6))} />
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 5: describe it, get the form ----------
const PROMPT = "Onboarding for a design agency";
export const DESCRIBE = { typeFrom: 0.2, typeTo: 1.9, send: 2 };
const QS = [
  { q: "What should we call you?", type: "Short text", color: C.text },
  { q: "Your work email", type: "Email", color: C.contact },
  { q: "How big is your team?", type: "Number", color: C.number },
  { q: "Rough monthly budget?", type: "Single select", color: C.choice },
];

export const Describe: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(20, 24, 10, 6);
  if (!visible) return null;
  const inY = 1 - ramp(lf, -12, 3, EXPO_OUT);
  const n = Math.floor(PROMPT.length * ramp(lf, bt(DESCRIBE.typeFrom), bt(DESCRIBE.typeTo), (x) => x));
  const sent = lf >= bt(DESCRIBE.send);
  const press = Math.max(0, 1 - Math.abs(lf - bt(DESCRIBE.send)) / 5);
  const up = ramp(lf, bt(DESCRIBE.send), bt(DESCRIBE.send) + 12, EXPO_OUT);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  const caret = Math.floor(lf / 14) % 2 === 0;
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <MotionBlur id="desc-in" y={inY * 40} style={{ position: "absolute", translate: `0 ${inY * 1300}px` }}>
          <div style={{ position: "absolute", scale: String(1 + exit * 4), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
            <Title lf={lf} a="Describe it." b="Get the whole form." at={-4} />
            <At y={lerp(-40, -170, up)}>
              <div style={{ scale: String(lerp(1.3, 1, up)), width: 900, height: 100, borderRadius: 30, background: C.card, border: `2px solid ${sent ? C.border : C.orange}`, boxShadow: `0 30px 70px -30px rgba(90,40,0,.35), 0 0 0 ${sent ? 0 : 8}px rgba(253,111,41,.13)`, display: "flex", alignItems: "center", gap: 18, padding: "0 18px 0 30px", boxSizing: "border-box" }}>
                <Icon name="sparkles" size={32} color={C.orange} fill={C.orange} stroke={1} />
                <div style={{ flex: 1, fontFamily: FONT, fontSize: 34, fontWeight: 550, color: n ? C.ink : "#A89E94", whiteSpace: "nowrap" }}>
                  {PROMPT.slice(0, n) || "Describe your form"}
                  {!sent && <span style={{ display: "inline-block", width: 3, height: 34, marginLeft: 3, background: C.orange, opacity: caret ? 1 : 0, verticalAlign: "middle" }} />}
                </div>
                <div style={{ width: 62, height: 62, borderRadius: 31, background: C.orange, display: "grid", placeItems: "center", scale: String(1 - press * 0.2) }}><Icon name="arrowUp" size={30} color={C.ink} stroke={2.8} /></div>
              </div>
            </At>
            {QS.map((q, i) => {
              const p = popSpring(lf - bt(DESCRIBE.send + 0.5 + i * 0.25), 12, 220, 0.7);
              const k = i - 1.5;
              return (
                <At key={i} x={k * 420 * p} y={140 + Math.abs(k) * 30 * p}>
                  <div style={{ scale: String(0.3 + 0.7 * p), rotate: `${k * 5 * p}deg`, opacity: ramp(lf - bt(DESCRIBE.send + 0.5 + i * 0.25), 0, 3) }}>
                    <Card w={380} h={250} pad={0} style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      <div style={{ height: 12, background: q.color }} />
                      <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: q.color, letterSpacing: "0.12em" }}>Q{i + 1}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.02em" }}>{q.q}</div>
                        <div style={{ marginTop: "auto" }}><TypeChip label={q.type} color={q.color} size={19} /></div>
                      </div>
                    </Card>
                  </div>
                </At>
              );
            })}
            <Cursor x={lerp(600, 420, ramp(lf, bt(1.3), bt(DESCRIBE.send) - 1, EXPO_OUT))} y={lerp(180, -30, ramp(lf, bt(1.3), bt(DESCRIBE.send) - 1, EXPO_OUT))} press={press} opacity={ramp(lf, bt(1.2), bt(1.2) + 6) * (1 - ramp(lf, bt(2.5), bt(2.5) + 6))} />
            <Ripple x={420} y={-24} t={(lf - bt(DESCRIBE.send)) / 20} />
          </div>
        </MotionBlur>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 6: or paste your website ----------
const PAGES = ["Home", "Pricing", "Services", "About", "Work", "Contact"];
export const SITE = { typeTo: 0.9, enter: 1, pages: 1.25, scan: 2.5 };

export const Website: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(24, 28, 6, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 6, 13, 200, 0.7);
  const url = "northwind.co";
  const n = Math.floor(url.length * ramp(lf, 0, bt(SITE.typeTo), (x) => x));
  const up = ramp(lf, bt(SITE.enter), bt(SITE.enter) + 12, EXPO_OUT);
  const scan = ramp(lf, bt(SITE.scan), bt(3.4), (x) => x);
  const done = popSpring(lf - bt(3.4), 12, 240, 0.6);
  const iris = ramp(lf, bt(3.55), bt(4) + 2, EASE_IN);
  return (
    <AbsoluteFill style={{ clipPath: `circle(${(1 - iris) * 1300}px at 50% 50%)` }}>
      <Paper glow="rgba(253,111,41,.12)" />
      <Stage>
        <Title lf={lf} a="Or paste" b="your website." at={-2} />
        <At y={lerp(-20, -210, up)}>
          <div style={{ scale: String(lerp(1.35, 0.9, up) * (0.8 + 0.2 * inP)), display: "flex", alignItems: "center", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "20px 34px", boxShadow: "0 24px 60px -24px rgba(90,40,0,.35)", fontFamily: FONT, fontSize: 38, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>
            <Icon name="globe" size={34} color={C.muted} />
            <span style={{ color: C.muted }}>https://</span>
            {url.slice(0, n)}
          </div>
        </At>
        {PAGES.map((p, i) => {
          const s = popSpring(lf - bt(SITE.pages + i * 0.25), 12, 240, 0.6);
          const col = i % 3, row = Math.floor(i / 3);
          const checked = scan > (row + 0.6) / 2;
          return (
            <At key={p} x={(col - 1) * 330} y={40 + row * 200}>
              <div style={{ scale: String(s), rotate: `${(1 - s) * (i % 2 ? 10 : -10)}deg`, opacity: ramp(lf - bt(SITE.pages + i * 0.25), 0, 3), position: "relative" }}>
                <Card w={300} h={176} pad={0} style={{ overflow: "hidden" }}>
                  <div style={{ height: 28, background: C.secondary, display: "flex", gap: 7, alignItems: "center", paddingLeft: 14 }}>
                    {["#F0564A", "#E0A92E", "#4CB86A"].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}
                  </div>
                  <div style={{ padding: "14px 18px" }}>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28 }}>{p}</div>
                    {[210, 250, 160].map((w, k) => <div key={k} style={{ height: 9, width: w, borderRadius: 5, background: C.border, marginTop: 10 }} />)}
                  </div>
                </Card>
                <div style={{ position: "absolute", right: 12, top: 40, width: 38, height: 38, borderRadius: 19, background: C.green, display: "grid", placeItems: "center", scale: String(checked ? popSpring(1, 10, 300) : 0) }}><Icon name="check" size={24} color="#fff" stroke={3.2} /></div>
              </div>
            </At>
          );
        })}
        {scan > 0 && scan < 1 && (
          <At y={-70 + scan * 420}>
            <div style={{ width: 1060, height: 6, borderRadius: 3, background: C.orange, boxShadow: "0 0 40px 10px rgba(253,111,41,.45)" }} />
          </At>
        )}
        <At y={370}>
          <div style={{ scale: String(done), padding: "14px 30px", borderRadius: 999, background: C.ink, color: "#fff", fontFamily: FONT, fontSize: 30, fontWeight: 600, whiteSpace: "nowrap" }}>Read 6 pages. Asks in your words.</div>
        </At>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 7: change it by asking (dark) ----------
const CMD = "Add a budget question. Skip it under 10 people.";
export const EDIT = { typeTo: 1.8, send: 2, tag: 3 };

export const Edit: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(28, 32, 4, 6);
  if (!visible) return null;
  const iris = ramp(lf, -4, 12, EXPO_OUT);
  const n = Math.floor(CMD.length * ramp(lf, 2, bt(EDIT.typeTo), (x) => x));
  const ins = popSpring(lf - bt(EDIT.send) - 4, 12, 220, 0.7);
  const tag = popSpring(lf - bt(EDIT.tag), 11, 260, 0.6);
  const exit = ramp(lf, bt(3.6), bt(4) + 2, EASE_IN);
  const rows = QS.slice(0, 3);
  return (
    <AbsoluteFill style={{ clipPath: `circle(${iris * 1300}px at 50% 50%)` }}>
      <Paper bg={C.night} glow="rgba(253,111,41,.14)" />
      <Stage>
        <div style={{ position: "absolute", rotate: `${exit * 30}deg`, scale: String(1 - exit * 0.8), opacity: 1 - exit }}>
          <Title lf={lf} a="Change it" b="by just asking." at={0} light />
          {rows.map((q, i) => {
            const y = -200 + i * 116 + (i >= 2 ? ins * 116 : 0);
            return (
              <At key={i} y={y}>
                <div style={{ width: 820, height: 96, borderRadius: 24, background: "#2A231F", border: `1px solid ${C.bubbleLine}`, display: "flex", alignItems: "center", gap: 20, padding: "0 26px", boxSizing: "border-box", fontFamily: FONT }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: q.color, color: C.night, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>{i >= 2 ? i + 2 : i + 1}</div>
                  <div style={{ flex: 1, fontSize: 30, fontWeight: 600, color: "#F6F1EA" }}>{q.q}</div>
                  <TypeChip label={q.type} color={q.color} />
                </div>
              </At>
            );
          })}
          <At y={-200 + 2 * 116}>
            <div style={{ scale: String(ins), opacity: ramp(lf - bt(EDIT.send) - 4, 0, 3), width: 820, height: 96, borderRadius: 24, background: "#33291F", border: `2px solid ${C.orange}`, display: "flex", alignItems: "center", gap: 20, padding: "0 26px", boxSizing: "border-box", fontFamily: FONT, boxShadow: "0 0 50px -10px rgba(253,111,41,.6)" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: C.choice, color: C.night, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>3</div>
              <div style={{ flex: 1, fontSize: 30, fontWeight: 600, color: "#F6F1EA" }}>Rough monthly budget?</div>
              <TypeChip label="Single select" color={C.choice} />
            </div>
          </At>
          <At x={0} y={-200 + 2 * 116 - 78}>
            <div style={{ scale: String(tag), display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 999, background: C.number, color: C.night, fontFamily: FONT, fontSize: 22, fontWeight: 700, whiteSpace: "nowrap" }}>
              <Icon name="arrowRight" size={20} color={C.night} stroke={2.6} /> Skipped when the team is under 10
            </div>
          </At>
          <At y={300}>
            <Bubble from="user" size={34}>
              {CMD.slice(0, n) || " "}
              {lf < bt(EDIT.send) && <span style={{ display: "inline-block", width: 3, height: 34, marginLeft: 3, background: C.ink, opacity: Math.floor(lf / 14) % 2 ? 0 : 1, verticalAlign: "middle" }} />}
            </Bubble>
          </At>
          <At y={-50}><Burst t={lf - bt(EDIT.send) - 4} n={12} r={300} /></At>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 8 (the break): 27 question types orbit, one notch per beat ----------
const TYPES = [
  { name: "Rating", icon: "star" }, { name: "File upload", icon: "upload" }, { name: "Signature", icon: "pen" }, { name: "Scheduling", icon: "calendar" },
  { name: "Ranking", icon: "list" }, { name: "Phone", icon: "phone" }, { name: "Number", icon: "hash" }, { name: "Matrix", icon: "grid" },
  { name: "NPS", icon: "gauge" }, { name: "Consent", icon: "check" }, { name: "Yes / No", icon: "toggle" }, { name: "Email", icon: "mail" },
];

export const Types: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(32, 36, 0, 4);
  if (!visible) return null;
  const inP = popSpring(lf + 6, 13, 200, 0.7);
  const beat = Math.max(0, Math.min(3, Math.floor(lf / bt(1) + 0.001)));
  let rot = 0;
  for (let i = 1; i <= 3; i++) rot += popSpring(lf - bt(i), 14, 200, 0.7) * ((Math.PI * 2) / TYPES.length);
  const fall = ramp(lf, bt(3.55), bt(4), EASE_IN);
  const cur = TYPES[beat];
  const pc = popSpring(lf - bt(beat), 12, 260, 0.6);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, #F0501C 0%, ${C.orange} 45%, #FF9A62 100%)` }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.16) 1.6px, transparent 1.8px)", backgroundSize: "28px 28px", maskImage: "radial-gradient(70% 70% at 50% 50%, #000, transparent)" }} />
      <Stage scale={1 - fall}>
        <Title lf={lf} a="27 question types." b="One conversation." at={-2} light y={-400} />
        {TYPES.map((t, i) => {
          const a = (i / TYPES.length) * Math.PI * 2 - rot - Math.PI / 2;
          const on = i === beat;
          return (
            <At key={t.name} x={Math.cos(a) * 560 * inP} y={40 + Math.sin(a) * 270 * inP}>
              <div style={{ width: 88, height: 88, borderRadius: 26, background: on ? "#fff" : "rgba(255,255,255,.22)", border: "1.5px solid rgba(255,255,255,.5)", display: "grid", placeItems: "center", scale: String(on ? 1.2 : 0.9) }}>
                <Icon name={t.icon} size={42} color={on ? C.orange : "#fff"} stroke={2.2} />
              </div>
            </At>
          );
        })}
        <At y={40}>
          <div style={{ scale: String(0.7 + 0.3 * pc), display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <div style={{ width: 150, height: 150, borderRadius: 42, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 30px 60px -20px rgba(120,30,0,.5)" }}>
              <Icon name={cur.icon} size={84} color={C.orange} stroke={2.2} />
            </div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: "#fff", letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{cur.name}</div>
          </div>
        </At>
      </Stage>
    </AbsoluteFill>
  );
};

export { Label, MONO, drift };

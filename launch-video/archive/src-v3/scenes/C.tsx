import React from "react";
import { AbsoluteFill } from "remotion";
import { C, DISPLAY, EASE_IN, EXPO_OUT, FONT, MONO, lerp, ramp } from "../brand";
import { At, Paper, Stage, Title, popSpring, useBeatScene } from "../kit";
import { Bubble, Burst, Card, Cursor, Icon, Label, Mark, MotionBlur, Ring, Ripple } from "../ui";

// ---------- bar 9 (second drop): no dead ends ----------
const N = {
  a: { x: -560, y: 40, label: "How big is your team?", color: C.number },
  b: { x: 0, y: -120, label: "Book a demo", color: C.choice },
  c: { x: 0, y: 200, label: "Work email", color: C.contact },
  d: { x: 540, y: 40, label: "Complete", color: C.green },
};
const edge = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  const x1 = p.x + 170, x2 = q.x - 170;
  return `M${x1} ${p.y} C ${(x1 + x2) / 2} ${p.y}, ${(x1 + x2) / 2} ${q.y}, ${x2} ${q.y}`;
};
export const LOGIC = { walk: 1, dead: 2, fix: 3 };

export const Logic: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(36, 40, 0, 6);
  if (!visible) return null;
  const flash = 1 - ramp(lf, 0, 10);
  const punch = popSpring(lf, 10, 200, 0.8);
  const draw = (a: number) => ramp(lf, a - 6, a + 4, EXPO_OUT);
  const walk = ramp(lf, bt(LOGIC.walk), bt(LOGIC.dead) - 2, (x) => x);
  const dead = lf >= bt(LOGIC.dead) && lf < bt(LOGIC.fix);
  const fix = ramp(lf, bt(LOGIC.fix), bt(LOGIC.fix) + 12, EXPO_OUT);
  const badge = popSpring(lf - bt(LOGIC.fix) - 6, 11, 240, 0.6);
  const shake = dead && lf < bt(LOGIC.dead) + 10 ? Math.sin(lf * 3.3) * 10 : 0;
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  // the walker follows the lower branch: a → c
  const wx = lerp(N.a.x + 170, N.c.x - 170, walk);
  const wy = lerp(N.a.y, N.c.y, walk < 0.5 ? 2 * walk * walk : 1 - Math.pow(-2 * walk + 2, 2) / 2);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <div style={{ position: "absolute", scale: String(lerp(1.3, 1, punch)), translate: `${exit * 2400}px 0` }}>
          <Title lf={lf} a="It won't let you publish" b="a dead end." at={2} />
          <svg width={1920} height={1080} viewBox="-960 -540 1920 1080" style={{ position: "absolute", left: -960, top: -540, overflow: "visible" }}>
            <path d={edge(N.a, N.b)} fill="none" stroke="#CFC6B8" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(4)} />
            <path d={edge(N.a, N.c)} fill="none" stroke="#CFC6B8" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(8)} />
            <path d={edge(N.b, N.d)} fill="none" stroke="#CFC6B8" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(12)} />
            <path d={edge(N.c, N.d)} fill="none" stroke={C.green} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fix} />
            <text x={-300} y={-80} textAnchor="middle" fontFamily={FONT} fontSize={24} fontWeight={600} fill={C.muted} opacity={draw(10)}>50 or more</text>
            <text x={-300} y={170} textAnchor="middle" fontFamily={FONT} fontSize={24} fontWeight={600} fill={C.muted} opacity={draw(12)}>otherwise</text>
            {walk > 0 && walk < 1 && <circle cx={wx} cy={wy} r={14} fill={C.orange} />}
          </svg>
          {Object.entries(N).map(([id, n], i) => {
            const p = popSpring(lf + 6 - i * 2, 12, 240, 0.6);
            const red = id === "c" && dead;
            return (
              <At key={id} x={n.x + (id === "c" ? shake : 0)} y={n.y}>
                <div style={{ scale: String(p), width: 340, height: 92, borderRadius: 24, background: red ? C.red : C.card, border: `1px solid ${red ? C.red : C.border}`, boxShadow: "0 2px 4px #0000000a, 0 20px 44px -22px #5a2a0a44", display: "flex", alignItems: "center", gap: 14, padding: "0 22px", boxSizing: "border-box", fontFamily: FONT }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: red ? "#fff" : n.color }} />
                  <div style={{ fontSize: 25, fontWeight: 650, color: red ? "#fff" : C.ink, whiteSpace: "nowrap" }}>{red ? "Dead end. Can't publish." : n.label}</div>
                </div>
              </At>
            );
          })}
          <At y={350}>
            <div style={{ scale: String(badge), display: "flex", alignItems: "center", gap: 10, padding: "14px 28px", borderRadius: 999, background: C.greenSoft, color: C.green, fontFamily: FONT, fontSize: 30, fontWeight: 700, whiteSpace: "nowrap" }}>
              <Icon name="check" size={28} color={C.green} stroke={3} /> Every path checked before it goes live
            </div>
          </At>
          <At x={N.c.x} y={N.c.y}><Ring t={lf - bt(LOGIC.dead)} max={500} color={C.red} width={5} dur={20} /></At>
          <At x={N.d.x} y={N.d.y}><Burst t={lf - bt(LOGIC.fix) - 8} n={12} r={200} color={C.green} /></At>
        </div>
      </Stage>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

// ---------- bar 10: know who answered ----------
const CODE = "482916";
export const VERIFY = { digits: [0.75, 1, 1.25, 1.5, 1.75, 2], ok: 2.5 };

export const Verify: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(40, 44, 8, 6);
  if (!visible) return null;
  const whip = 1 - ramp(lf, -12, 3, EXPO_OUT);
  const ok = popSpring(lf - bt(VERIFY.ok), 10, 260, 0.6);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper glow="rgba(63,165,101,.12)" />
      <Stage>
        <MotionBlur id="ver-in" x={whip * 50} style={{ position: "absolute", translate: `${-whip * 2400 + exit * 2400}px 0` }}>
          <Title lf={lf} a="Know exactly" b="who answered." at={-2} />
          <At y={50}>
            <Card w={760} pad={40} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>Confirm it's you</div>
              <div style={{ width: "100%", height: 76, borderRadius: 18, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontSize: 26, fontWeight: 600 }}>
                <svg width="30" height="30" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h6a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8.1z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1-3.8 1-2.9 0-5.4-2-6.3-4.7H2.1v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.2H2.1a11 11 0 0 0 0 9.7z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" /></svg>
                Continue with Google
              </div>
              <Label>or a texted code</Label>
              <div style={{ display: "flex", gap: 14 }}>
                {CODE.split("").map((d, i) => {
                  const t = lf - bt(VERIFY.digits[i]);
                  const p = popSpring(t, 12, 300, 0.5);
                  const filled = t >= 0;
                  return (
                    <div key={i} style={{ width: 84, height: 100, borderRadius: 18, border: `2px solid ${filled ? (lf >= bt(VERIFY.ok) ? C.green : C.orange) : C.border}`, background: C.card, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontSize: 52, fontWeight: 700, color: C.ink }}>
                      <span style={{ scale: String(p), display: "inline-block" }}>{filled ? d : ""}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </At>
          <At y={360}>
            <div style={{ scale: String(ok), display: "flex", alignItems: "center", gap: 12, padding: "14px 28px", borderRadius: 999, background: C.green, color: "#fff", fontFamily: FONT, fontSize: 30, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 20px 40px -18px rgba(30,120,60,.6)" }}>
              <Icon name="shield" size={30} color="#fff" stroke={2.4} /> Verified. One response per person.
            </div>
          </At>
          <At y={360}><Burst t={lf - bt(VERIFY.ok)} n={12} r={320} color={C.green} /></At>
        </MotionBlur>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 11: share it anywhere; the cursor clicks a pill per beat ----------
const PILLS = [
  { label: "Link", icon: "link" },
  { label: "QR code", icon: "qr" },
  { label: "Embed", icon: "window" },
  { label: "API", icon: "code" },
];
const PW = 230, GAP = 20;

function Qr({ p }: { p: number }) {
  const n = 17;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const fin = [[0, 0], [0, n - 5], [n - 5, 0]].find(([r0, c0]) => r - r0 >= 0 && r - r0 < 5 && c - c0 >= 0 && c - c0 < 5);
      const on = fin ? r - fin[0] === 0 || r - fin[0] === 4 || c - fin[1] === 0 || c - fin[1] === 4 || (r - fin[0] === 2 && c - fin[1] === 2) : ((r * 7 + c * 13 + r * c) % 5) < 2;
      if (!on) continue;
      const k = ramp(p, ((r * 31 + c * 17) % 20) / 30, ((r * 31 + c * 17) % 20) / 30 + 0.25);
      cells.push(<rect key={`${r}-${c}`} x={c * 13 + 6.5 * (1 - k)} y={r * 13 + 6.5 * (1 - k)} width={13 * k} height={13 * k} rx={2} fill={C.ink} />);
    }
  return <svg width={n * 13} height={n * 13}>{cells}</svg>;
}

export const Share: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(44, 48, 6, 6);
  if (!visible) return null;
  const inP = popSpring(lf + 6, 13, 200, 0.7);
  const total = PILLS.length * PW + (PILLS.length - 1) * GAP;
  const xs = PILLS.map((_, i) => -total / 2 + i * (PW + GAP) + PW / 2);
  let hx = xs[0];
  for (let i = 1; i < 4; i++) hx = lerp(hx, xs[i], popSpring(lf - bt(i), 16, 260, 0.6));
  const active = Math.max(0, Math.min(3, Math.floor(lf / bt(1) + 0.001)));
  const local = lf - bt(active);
  const Y = -200;
  let cx = xs[0] + 90, cy = Y + 120;
  for (let i = 1; i < 4; i++) {
    const p = ramp(lf, bt(i) - 12, bt(i) - 1, EXPO_OUT);
    cx = lerp(cx, xs[i] + 20, p);
    cy = lerp(cy, Y + 12, p);
  }
  const press = [1, 2, 3].reduce((m, i) => Math.max(m, Math.max(0, 1 - Math.abs(lf - bt(i)) / 5)), 0);
  const tile = popSpring(local + 2, 13, 240, 0.6);
  const exit = ramp(lf, bt(3.6), bt(4) + 4, EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage>
        <div style={{ position: "absolute", scale: String((0.85 + 0.15 * inP) * (1 + exit * 4)), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
          <Title lf={lf} a="Share it" b="anywhere." at={-2} />
          <div style={{ position: "absolute", left: hx - PW / 2, top: Y - 40, width: PW, height: 80, borderRadius: 999, background: C.ink, boxShadow: "0 16px 30px -12px rgba(0,0,0,.45)" }} />
          {PILLS.map((p, i) => {
            const on = Math.abs(hx - xs[i]) < PW * 0.5;
            return (
              <div key={p.label} style={{ position: "absolute", left: xs[i] - PW / 2, top: Y - 40, width: PW, height: 80, borderRadius: 999, border: `2px solid ${on ? "transparent" : C.border}`, background: on ? "transparent" : "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: FONT, fontSize: 30, fontWeight: 600, color: on ? "#fff" : "#4A433D", boxSizing: "border-box" }}>
                <Icon name={p.icon} size={28} color={on ? "#fff" : C.muted} /> {p.label}
              </div>
            );
          })}
          <At y={110}>
            <div style={{ scale: String(0.8 + 0.2 * tile), opacity: ramp(local + 2, 0, 4) }}>
              <Card w={720} h={330} pad={0} style={{ display: "grid", placeItems: "center" }}>
                {active === 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.secondary, border: `1px solid ${C.border}`, borderRadius: 20, padding: "18px 18px 18px 26px", fontFamily: MONO, fontSize: 30, color: C.ink }}>
                    chatform.in/f/northwind
                    <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, padding: "10px 16px", borderRadius: 12, background: local > 12 ? C.green : C.orange, color: "#fff" }}>{local > 12 ? "Copied" : "Copy"}</div>
                  </div>
                )}
                {active === 1 && <Qr p={ramp(local, 0, 22) } />}
                {active === 2 && (
                  <div style={{ width: 560, height: 270, background: C.paper, borderRadius: 18, position: "relative", overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <div style={{ height: 30, background: C.secondary, display: "flex", gap: 8, alignItems: "center", paddingLeft: 14 }}>{["#F0564A", "#E0A92E", "#4CB86A"].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />)}</div>
                    {[320, 400, 260].map((w, l) => <div key={l} style={{ margin: "20px 26px 0", height: 14, width: w, borderRadius: 7, background: C.border }} />)}
                    <div style={{ position: "absolute", right: 18, bottom: 18, translate: `0 ${(1 - popSpring(local - 4, 12, 220)) * 220}px`, width: 230, borderRadius: 18, background: C.chat, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 12, background: C.bubble, color: "#F6F1EA", fontFamily: FONT, fontSize: 15 }}>Hi! What should I call you?</div>
                      <div style={{ alignSelf: "flex-end", padding: "8px 12px", borderRadius: 12, background: C.orange, color: C.ink, fontFamily: FONT, fontSize: 15, fontWeight: 600 }}>Maya</div>
                    </div>
                  </div>
                )}
                {active === 3 && (
                  <div style={{ fontFamily: MONO, fontSize: 28, color: C.ink, lineHeight: 1.7 }}>
                    <div><span style={{ color: C.orange }}>POST</span> /v1/chat/sessions</div>
                    <div style={{ scale: String(popSpring(local - 8, 12, 260)), transformOrigin: "0 50%", display: "inline-block", padding: "2px 14px", borderRadius: 10, background: C.greenSoft, color: C.green, fontWeight: 600 }}>200 OK</div>
                    <div style={{ color: C.muted, opacity: ramp(local, 12, 18) }}>{"{ \"recorded\": { \"team_size\": 12 } }"}</div>
                  </div>
                )}
              </Card>
            </div>
          </At>
          <Ripple x={cx} y={Y} t={active > 0 ? (lf - bt(active)) / 20 : -1} />
          <Cursor x={cx} y={cy} press={press} opacity={ramp(lf, 2, 8)} />
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- bar 12: see where people stop ----------
const BARS = [100, 96, 91, 58, 55, 52, 50, 48];
export const DROPOFF = { hover: 2, tip: 2.1 };

export const Dropoff: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(48, 52, 6, 4);
  if (!visible) return null;
  const inP = popSpring(lf + 6, 13, 200, 0.7);
  const hover = lf >= bt(DROPOFF.hover);
  const tip = popSpring(lf - bt(DROPOFF.tip), 12, 260, 0.6);
  const cx = lerp(420, -95, ramp(lf, bt(1.4), bt(DROPOFF.hover) - 1, EXPO_OUT));
  const cy = lerp(300, 60, ramp(lf, bt(1.4), bt(DROPOFF.hover) - 1, EXPO_OUT));
  const zoom = ramp(lf, bt(3.4), bt(4), EASE_IN);
  return (
    <AbsoluteFill>
      <Paper />
      <Stage scale={1 + zoom * 1.5}>
        <Title lf={lf} a="See exactly where" b="people stop." at={-2} />
        <At y={80}>
          <Card w={1000} h={500} pad={40} style={{ scale: String(0.85 + 0.15 * inP), display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Label>Drop-off by question</Label>
              <div style={{ fontSize: 20, color: C.muted, fontWeight: 500 }}>Along the path each person took</div>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 26, marginTop: 30 }}>
              {BARS.map((v, i) => {
                const g = popSpring(lf - 2 - i * 3, 14, 200, 0.7);
                const hot = hover && i === 3;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ width: "100%", height: 300 * (v / 100) * g, borderRadius: 14, background: hot ? C.orange : i < 3 ? "#E8D9C8" : "#F1E7DB" }} />
                    <div style={{ fontSize: 20, fontWeight: 600, color: hot ? C.orangeFg : C.muted }}>Q{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </At>
        <At x={-95} y={-120}>
          <div style={{ scale: String(tip), padding: "14px 22px", borderRadius: 16, background: C.ink, color: "#fff", fontFamily: FONT, fontSize: 24, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 20px 40px -16px rgba(0,0,0,.5)" }}>
            Q4 · "Rough monthly budget?" <span style={{ color: "#FFB48C" }}>loses the most</span>
          </div>
        </At>
        <Cursor x={cx} y={cy} opacity={ramp(lf, bt(1.3), bt(1.3) + 6)} />
      </Stage>
    </AbsoluteFill>
  );
};

// ---------- the recap mosaic, then the end card ----------
const TW = 440, TH = 250, G = 22;
const big = (t: React.ReactNode, color: string = C.ink, size = 56) => <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", color, whiteSpace: "nowrap" }}>{t}</div>;
const TILES: { bg: string; el: React.ReactNode }[] = [
  { bg: C.chat, el: <Bubble from="bot" size={26}>Bad how?</Bubble> },
  { bg: "#fff", el: <div style={{ padding: "16px 26px", borderRadius: 18, background: C.secondary, fontFamily: FONT, fontSize: 34, fontWeight: 700, color: C.ink }}>Team size · 12</div> },
  { bg: C.violetSoft, el: big(<><Icon name="file" size={50} color={C.violet} /> Answers</>, C.violetFg, 52) },
  { bg: "#fff", el: <div style={{ padding: "4px 20px", border: `6px solid ${C.green}`, borderRadius: 14, color: C.green, fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, rotate: "-8deg" }}>COMPLETED</div> },
  { bg: "#fff", el: <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.ink }}><Icon name="sparkles" size={40} color={C.orange} fill={C.orange} stroke={1} /> Describe it</div> },
  { bg: C.secondary, el: <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.ink }}><Icon name="globe" size={40} color={C.muted} /> northwind.co</div> },
  { bg: C.night, el: <Bubble from="user" size={26}>Add a question</Bubble> },
  { bg: `linear-gradient(135deg,#F0501C,${C.orange})`, el: big("27 types", "#fff", 60) },
  { bg: C.greenSoft, el: big(<>✓ No dead ends</>, C.green, 46) },
  { bg: "#fff", el: <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderRadius: 999, background: C.green, color: "#fff", fontFamily: FONT, fontSize: 32, fontWeight: 700 }}><Icon name="shield" size={34} color="#fff" /> Verified</div> },
  { bg: "#fff", el: <div style={{ display: "flex", gap: 10 }}>{["link", "qr", "window", "code"].map((ic) => <div key={ic} style={{ width: 70, height: 70, borderRadius: 20, background: C.ink, display: "grid", placeItems: "center" }}><Icon name={ic} size={34} color="#fff" /></div>)}</div> },
  { bg: C.orangeSoft, el: <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>{[100, 90, 50, 46, 44].map((v, i) => <div key={i} style={{ width: 38, height: v * 1.1, borderRadius: 8, background: i === 2 ? C.orange : "#EFCBB2" }} />)}</div> },
];

export const Outro: React.FC = () => {
  const { lf, visible, bt } = useBeatScene(52, 58, 4, 0);
  if (!visible) return null;
  const zoomOut = ramp(lf, -4, 14, EXPO_OUT);
  const dive = ramp(lf, bt(1.2), bt(1.75), EASE_IN);
  const iris = ramp(lf, bt(1.5), bt(1.5) + 16, EXPO_OUT);
  const R = 1250 * iris;
  const mScale = lerp(2.6, 1, zoomOut) * Math.pow(9, dive);
  const e = lf - bt(1.6);
  const logo = popSpring(e, 10, 190, 0.8);
  const join = ramp(e, 4, 18, EXPO_OUT);
  const cta = popSpring(e - bt(1.2), 12, 220);
  const sub = ramp(e, bt(1.7), bt(1.7) + 10);
  const WS = 150;
  return (
    <AbsoluteFill style={{ background: "#120E0B" }}>
      <Stage scale={mScale}>
        {TILES.map((t, i) => {
          const c = i % 4, r = Math.floor(i / 4);
          const d = Math.hypot(c - 1.5, r - 1);
          const p = popSpring(lf + 9 - d * 2.5, 14, 220);
          return (
            <At key={i} x={(c - 1.5) * (TW + G)} y={(r - 1) * (TH + G)}>
              <div style={{ width: TW, height: TH, borderRadius: 26, background: t.bg, display: "grid", placeItems: "center", overflow: "hidden", scale: String(p), boxShadow: "0 20px 40px -20px rgba(0,0,0,.6)" }}>{t.el}</div>
            </At>
          );
        })}
      </Stage>
      <AbsoluteFill style={{ clipPath: `circle(${R}px at 50% 50%)`, background: "linear-gradient(120deg, #F7843F 0%, #EE8FA0 50%, #A983E4 100%)" }}>
        <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.18) 1.6px, transparent 1.8px)", backgroundSize: "28px 28px", maskImage: "radial-gradient(70% 70% at 50% 45%, #000, transparent)" }} />
        <Stage>
          <At y={-220}>
            <div style={{ scale: String(logo), rotate: `${(1 - logo) * -20}deg`, width: 200, height: 200, borderRadius: 56, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 30px 70px -20px rgba(90,20,60,.5)" }}>
              <Mark size={150} join={join} />
            </div>
          </At>
          <At y={10}>
            <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: WS, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, whiteSpace: "pre", color: "#fff" }}>
              {"chatform".split("").map((ch, i) => {
                const t = e - 4 - i * 1.3;
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
            <div style={{ opacity: sub, fontFamily: FONT, fontSize: 32, fontWeight: 600, color: "rgba(255,255,255,.92)", whiteSpace: "nowrap" }}>Conversational forms people actually finish · Free forever, no card</div>
          </At>
        </Stage>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

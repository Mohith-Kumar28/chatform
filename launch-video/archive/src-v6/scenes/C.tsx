import React from "react";
import { AbsoluteFill } from "remotion";
import { AT, STRETCH } from "../beat";
import { C, DISPLAY, EASE_IN, EXPO_OUT, FONT, MONO, lerp, ramp } from "../brand";
import { At, Paper, Stage, popSpring, useBeatScene, Cam } from "../kit";
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
  const { lf, visible, bt } = useBeatScene(AT.logic, AT.logic + 4, 0, 6, STRETCH.logic);
  if (!visible) return null;
  const spin = 1 - ramp(lf, -12, 4, EXPO_OUT);
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
        <Cam lf={lf} bt={bt} keys={[[0, 0, 40, 0.95], [0.9, -300, 120, 1.3], [1.9, 0, 200, 1.5], [2.9, 270, 120, 1.3], [3.35, 0, 60, 0.95]]}>
        <div style={{ position: "absolute", rotate: `${spin * -40}deg`, scale: String(1 - spin * 0.7), opacity: 1 - spin, translate: `${exit * 2400}px 0` }}>
          <svg width={1920} height={1080} viewBox="-960 -540 1920 1080" style={{ position: "absolute", left: -960, top: -540, overflow: "visible" }}>
            <path d={edge(N.a, N.b)} fill="none" stroke="#CFC6B8" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(4)} />
            <path d={edge(N.a, N.c)} fill="none" stroke="#CFC6B8" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(8)} />
            <path d={edge(N.b, N.d)} fill="none" stroke="#CFC6B8" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw(12)} />
            <path d={edge(N.c, N.d)} fill="none" stroke={C.green} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fix} />
            {walk > 0 && walk < 1 && <circle cx={wx} cy={wy} r={14} fill={C.orange} />}
          </svg>
          {/* branch labels: HTML, not SVG text (SVG text re-hints every frame under the camera zoom and shimmers), and off the walker's path */}
          {[["50 or more", -290, -168, 10], ["otherwise", -290, 248, 12]].map(([t, x, y, d]) => (
            <At key={t as string} x={x as number} y={y as number}>
              <div style={{ opacity: draw(d as number), padding: "6px 14px", borderRadius: 999, background: C.secondary, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>{t}</div>
            </At>
          ))}
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
      </Cam>
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
  const { lf, visible, bt } = useBeatScene(AT.share, AT.share + 4, 6, 6, STRETCH.share);
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
        <Cam lf={lf} bt={bt} keys={[[0, 0, -40, 1.08], [3.3, 0, -10, 1.0]]}>
        <div style={{ position: "absolute", scale: String((0.85 + 0.15 * inP) * (1 + exit * 4)), opacity: 1 - ramp(lf, bt(3.8), bt(4) + 4), filter: exit ? `blur(${exit * 10}px)` : undefined }}>
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
      </Cam>
      </Stage>
    </AbsoluteFill>
  );
};


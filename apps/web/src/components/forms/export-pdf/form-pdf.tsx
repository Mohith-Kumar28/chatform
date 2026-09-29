import {
  Circle,
  Document,
  Ellipse,
  Font,
  Image,
  Line,
  Link,
  Page,
  Path,
  Polygon,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { BlockType } from "@repo/form-schema";
import type { BlockTone } from "@/components/builder/block-library";
import type { FormOutline, OutlineEnding, OutlineQuestion } from "./form-outline";
import type { IconShape } from "./flow-snapshot";

/**
 * The export, as a react-pdf document.
 *
 * Vector text for everything a person reads or copies, and the flow diagram as
 * page-sized slices of a picture (see `flow-snapshot`). Colours are the light
 * theme's tokens converted to hex, since the PDF renderer does not read oklch.
 */

/** In points. The half point off the height keeps the image from being "taller than the page". */
const A4 = { width: 595.28, height: 841.89 };

const INK = "#26221e";
const MUTED = "#6f6861";
const FAINT = "#a39c93";
const BORDER = "#e3dfd8";
const CREAM = "#fbfaf5";
const MUTED_BG = "#f5f2ec";
const ORANGE = "#fd6f29";
const VIOLET = "#9769dc";

const TONES: Record<BlockTone, { base: string; soft: string; ink: string }> = {
  content: { base: "#ed76b3", soft: "#ffe4f2", ink: "#912061" },
  text: { base: "#4087de", soft: "#dff0ff", ink: "#0050a2" },
  contact: { base: "#00a9b1", soft: "#d4f6f8", ink: "#005d65" },
  number: { base: "#e49e22", soft: "#ffeecb", ink: "#874e00" },
  choice: { base: "#3bb360", soft: "#daf8df", ink: "#005f21" },
  scale: { base: "#9769dc", soft: "#f2e9ff", ink: "#62359c" },
  advanced: { base: "#ec5b57", soft: "#ffe5e1", ink: "#a21921" },
};

/** Route colours, in the order a branch lists them. */
const ROUTES = ["#3bb360", "#4087de", "#9769dc", "#e49e22", "#ed76b3", "#00a9b1"];

let fontsReady = false;
export function registerPdfFonts(origin: string) {
  if (fontsReady) return;
  fontsReady = true;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${origin}/fonts/pdf/inter-400.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/pdf/inter-500.ttf`, fontWeight: 500 },
      { src: `${origin}/fonts/pdf/inter-600.ttf`, fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Bricolage",
    fonts: [
      { src: `${origin}/fonts/pdf/bricolage-grotesque-600.ttf`, fontWeight: 600 },
      { src: `${origin}/fonts/pdf/bricolage-grotesque-700.ttf`, fontWeight: 700 },
    ],
  });
  // Titles are full sentences; hyphenating "registration" across a line reads as a typo.
  Font.registerHyphenationCallback((word) => [word]);
  Font.registerEmojiSource({ format: "png", url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/" });
}

const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 9.5,
    color: INK,
    backgroundColor: "#ffffff",
    paddingTop: 44,
    paddingBottom: 64,
    paddingHorizontal: 44,
  },
  flowPage: { padding: 0, backgroundColor: CREAM },
  row: { flexDirection: "row", alignItems: "center" },
  display: { fontFamily: "Bricolage", fontWeight: 700 },
  eyebrow: { fontSize: 7.5, fontWeight: 600, color: MUTED, letterSpacing: 1.1, textTransform: "uppercase" },
  sectionHead: { marginTop: 26, marginBottom: 12, flexDirection: "row", alignItems: "baseline" },
  sectionTitle: { fontFamily: "Bricolage", fontWeight: 700, fontSize: 17 },
  sectionCount: { marginLeft: 8, fontSize: 9, color: MUTED },
  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    marginBottom: 10,
    overflow: "hidden",
  },
  pill: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2.5, fontSize: 7.5, fontWeight: 600 },
  factLabel: { fontSize: 7, fontWeight: 600, color: FAINT, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
  factValue: { fontSize: 9, color: INK, lineHeight: 1.35 },
});

export function FormPdf({
  outline,
  icons,
  flowPages,
  liveUrl,
  builderUrl,
  status,
  exportedAt,
  siteOrigin,
}: {
  outline: FormOutline;
  icons: Map<BlockType, IconShape[]>;
  flowPages: string[];
  liveUrl: string | null;
  /** Where the form opens in ChatForm: the builder, for anyone with access. */
  builderUrl: string;
  status: "live" | "draft";
  exportedAt: Date;
  siteOrigin: string;
}) {
  const site = siteOrigin.replace(/^https?:\/\//, "");
  const date = exportedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const asked = outline.questions.filter((q) => q.asks).length;

  return (
    <Document title={`${outline.title} · ChatForm`} author="ChatForm" creator="ChatForm" producer="ChatForm" subject="Form export">
      <Page size="A4" style={s.page}>
        <Footer title={outline.title} site={site} siteOrigin={siteOrigin} />

        {/* Masthead */}
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 16 }]}>
          <Link src={siteOrigin} style={{ textDecoration: "none" }}>
            <View style={s.row}>
              <Mark size={20} />
              <Text style={[s.display, { fontSize: 14, marginLeft: 6, color: INK }]}>ChatForm</Text>
            </View>
          </Link>
          <Text style={{ fontSize: 8, color: MUTED }}>Form export · {date}</Text>
        </View>

        {/* Title block */}
        <View style={{ borderRadius: 14, backgroundColor: CREAM, borderWidth: 1, borderColor: BORDER, padding: 18, overflow: "hidden" }}>
          <Svg width={200} height={200} style={{ position: "absolute", right: -56, top: -64 }} viewBox="0 0 32 32">
            <Path d="M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z" fill={ORANGE} fillOpacity={0.1} />
            <Path d="M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z" fill={VIOLET} fillOpacity={0.1} />
          </Svg>
          <View style={s.row}>
            <Text style={s.eyebrow}>Conversational form</Text>
            <Text
              style={[
                s.pill,
                { marginLeft: 8, backgroundColor: status === "live" ? "#e0f7e5" : MUTED_BG, color: status === "live" ? "#005222" : MUTED },
              ]}
            >
              {status === "live" ? "Live" : "Draft"}
            </Text>
          </View>
          <Text style={[s.display, { fontSize: 22, lineHeight: 1.15, marginTop: 6, maxWidth: 420 }]}>{outline.title}</Text>
          {outline.description && (
            <Text style={{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.45, maxWidth: 420 }}>{outline.description}</Text>
          )}
          <View style={[s.row, { marginTop: 12, gap: 12 }]}>
            <Link src={builderUrl} style={{ textDecoration: "none" }}>
              <View style={[s.row, { backgroundColor: ORANGE, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 }]}>
                <Mark size={10} light />
                <Text style={{ fontSize: 9, fontWeight: 600, color: INK, marginLeft: 5 }}>Open in ChatForm</Text>
              </View>
            </Link>
            {liveUrl && (
              <Link src={liveUrl} style={{ fontSize: 9, color: "#c2410c", textDecoration: "none" }}>
                {liveUrl.replace(/^https?:\/\//, "")}
              </Link>
            )}
          </View>
        </View>

        {/* At a glance */}
        <View style={[s.row, { marginTop: 10, gap: 8 }]}>
          {outline.stats.map((stat, i) => (
            <View
              key={stat.label}
              style={{ flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}
            >
              <Text style={s.factLabel}>{stat.label}</Text>
              <Text style={[s.display, { fontSize: 17, color: i === 0 ? ORANGE : INK }]}>{stat.value}</Text>
            </View>
          ))}
        </View>

        <SectionHead title="Overview" count="How this form behaves" tight />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
          {outline.overview.map((group) => (
            <View key={group.title} wrap={false} style={{ width: "49%", borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10 }}>
              <Text style={{ fontFamily: "Bricolage", fontWeight: 600, fontSize: 10, marginBottom: 5 }}>{group.title}</Text>
              <View style={{ gap: 4 }}>
                {group.facts.map((f, i) => (
                  // One line per setting, label beside value: the whole overview has to fit one page.
                  <View key={i} style={{ flexDirection: "row" }}>
                    <Text style={{ width: "42%", fontSize: 7.5, color: MUTED, lineHeight: 1.35, paddingRight: 6 }}>{f.label}</Text>
                    <Text style={{ flex: 1, fontSize: 8, lineHeight: 1.35 }}>{f.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Page>

      {/*
        The flow, full bleed. No padding and no footer on these pages, so
        consecutive slices meet edge to edge and the diagram reads as one
        sheet cut by the page, not as separate pictures.
      */}
      {flowPages.map((src, i) => (
        <Page key={i} size="A4" style={s.flowPage}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image, which has no alt. */}
          <Image src={src} style={{ position: "absolute", top: 0, left: 0, width: A4.width, height: A4.height - 0.5 }} />
          {i === flowPages.length - 1 && (
            // The sign-off drawn at the foot of the canvas, made clickable.
            <Link src={siteOrigin} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 70 }}>
              <Text> </Text>
            </Link>
          )}
        </Page>
      ))}

      <Page size="A4" style={s.page}>
        <Footer title={outline.title} site={site} siteOrigin={siteOrigin} />
        <SectionHead title="Questions" count={`${asked} question${asked === 1 ? "" : "s"}, in order`} first />
        {outline.questions.map((q) => (
          <QuestionCard key={q.number} q={q} icon={icons.get(q.type)} />
        ))}

        <SectionHead title="Endings" count={`${outline.endings.length}`} />
        {outline.endings.map((e, i) => (
          <EndingCard key={i} ending={e} />
        ))}
      </Page>
    </Document>
  );
}

function Footer({ title, site, siteOrigin }: { title: string; site: string; siteOrigin: string }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        left: 44,
        right: 44,
        bottom: 26,
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingTop: 9,
      }}
    >
      <Link src={siteOrigin} style={{ textDecoration: "none" }}>
        <View style={s.row}>
          <Mark size={10} />
          <Text style={{ fontSize: 7.5, fontWeight: 600, color: INK, marginLeft: 4 }}>Made with ChatForm</Text>
          <Text style={{ fontSize: 7.5, color: MUTED, marginLeft: 4 }}>· {site}</Text>
        </View>
      </Link>
      <Text style={{ flex: 1, textAlign: "center", fontSize: 7.5, color: FAINT, paddingHorizontal: 12 }}>
        {title.length > 60 ? `${title.slice(0, 59)}…` : title}
      </Text>
      <Text
        style={{ fontSize: 7.5, color: MUTED }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function SectionHead({ title, count, first, tight }: { title: string; count?: string; first?: boolean; tight?: boolean }) {
  return (
    <View style={[s.sectionHead, first ? { marginTop: 0 } : {}, tight ? { marginTop: 16, marginBottom: 8 } : {}]} minPresenceAhead={80}>
      <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: ORANGE, marginRight: 8, alignSelf: "center" }} />
      <Text style={s.sectionTitle}>{title}</Text>
      {count && <Text style={s.sectionCount}>{count}</Text>}
    </View>
  );
}

function QuestionCard({ q, icon }: { q: OutlineQuestion; icon?: IconShape[] }) {
  const tone = TONES[q.tone];
  // Keep a card on one page unless it is too long to fit on any page.
  const long = q.choices.length > 16 || (q.passage?.length ?? 0) > 900 || (q.grid?.rows.length ?? 0) > 10;
  const keys = q.type === "ranking" ? "number" : q.type === "contact_info" || q.type === "address" || q.type === "field_group" ? "dot" : "letter";

  return (
    <View style={[s.card, { flexDirection: "row" }]} wrap={long}>
      {/* The family spine, as on the canvas node. */}
      <View style={{ width: 3.5, backgroundColor: tone.base }} />
      <View style={{ flex: 1, padding: 14 }}>
        <View style={s.row}>
          <Text style={[s.pill, { backgroundColor: MUTED_BG, color: MUTED, fontWeight: 600, paddingHorizontal: 6 }]}>
            Q{q.number}
          </Text>
          <View style={[s.row, { marginLeft: 6, backgroundColor: tone.soft, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2.5 }]}>
            {icon && <Icon shapes={icon} color={tone.ink} size={8.5} />}
            <Text style={{ fontSize: 7.5, fontWeight: 600, color: tone.ink, marginLeft: icon ? 4 : 0 }}>{q.typeLabel}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {q.asks &&
            (q.required ? (
              <Text style={[s.pill, { backgroundColor: "#ffe9e7", color: "#94020d" }]}>Required</Text>
            ) : (
              <Text style={[s.pill, { backgroundColor: MUTED_BG, color: MUTED }]}>Optional</Text>
            ))}
        </View>

        <Text style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, marginTop: 9 }}>{q.title}</Text>
        {q.description && <Text style={{ fontSize: 9, color: MUTED, lineHeight: 1.45, marginTop: 4 }}>{q.description}</Text>}

        {q.choices.length > 0 && (
          <View style={{ marginTop: 10, gap: 3 }}>
            {q.choices.map((c, i) => (
              <View
                key={i}
                wrap={false}
                style={[s.row, { alignItems: "flex-start", borderWidth: 1, borderColor: BORDER, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 7, backgroundColor: c.writeIn ? MUTED_BG : "#ffffff" }]}
              >
                <ChoiceKey kind={keys} index={i} tone={tone} />
                <View style={{ flex: 1, marginLeft: 7 }}>
                  <Text style={{ fontSize: 9, fontWeight: 500, lineHeight: 1.35 }}>
                    {c.label}
                    {c.writeIn && <Text style={{ color: MUTED, fontWeight: 400 }}>  · respondent writes their own</Text>}
                  </Text>
                  {c.description && <Text style={{ fontSize: 8, color: MUTED, marginTop: 1.5 }}>{c.description}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {q.grid && <Grid rows={q.grid.rows} columns={q.grid.columns} tone={tone} />}

        {q.passage && (
          <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: tone.base, backgroundColor: CREAM, paddingVertical: 8, paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 8.5, color: MUTED, lineHeight: 1.5 }}>
              {q.passage.length > 2400 ? `${q.passage.slice(0, 2399)}…` : q.passage}
            </Text>
          </View>
        )}

        {q.facts.length > 0 && (
          <View style={{ marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: "dashed" }}>
            <FactGrid facts={q.facts} columns={2} />
          </View>
        )}

        {(q.routes.length > 0 || q.shownWhen) && (
          <View style={{ marginTop: 10, backgroundColor: CREAM, borderRadius: 8, padding: 9, gap: 5 }}>
            <Text style={s.factLabel}>Logic</Text>
            {q.shownWhen && (
              <View style={[s.row, { alignItems: "flex-start" }]}>
                <View style={{ width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: MUTED, marginTop: 3, marginRight: 6 }} />
                <Text style={{ flex: 1, fontSize: 8.5, lineHeight: 1.4 }}>
                  <Text style={{ color: MUTED }}>Only asked if </Text>
                  {q.shownWhen}
                </Text>
              </View>
            )}
            {q.routes.map((r, i) => {
              const otherwise = r.label === "Otherwise";
              return (
                <View key={i} style={[s.row, { alignItems: "flex-start" }]} wrap={false}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: otherwise ? FAINT : ROUTES[i % ROUTES.length], marginTop: 3, marginRight: 6 }} />
                  <Text style={{ flex: 1, fontSize: 8.5, lineHeight: 1.4 }}>
                    <Text style={{ color: otherwise ? MUTED : INK, fontWeight: 500 }}>{r.label}</Text>
                  </Text>
                  <Arrow />
                  <Text style={{ flex: 1.2, fontSize: 8.5, lineHeight: 1.4, fontWeight: 500 }}>{r.value}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function EndingCard({ ending }: { ending: OutlineEnding }) {
  const accent = ending.screenOut ? FAINT : ORANGE;
  return (
    <View
      wrap={false}
      style={[
        s.card,
        { borderStyle: "dashed", borderWidth: 1.5, borderColor: accent, backgroundColor: ending.screenOut ? MUTED_BG : "#fff7ef", padding: 14 },
      ]}
    >
      <View style={s.row}>
        <FlagIcon screenOut={ending.screenOut} />
        <Text style={{ fontSize: 11.5, fontWeight: 600, marginLeft: 6, flex: 1 }}>{ending.title}</Text>
        <Text style={[s.pill, { backgroundColor: "#ffffff", color: ending.screenOut ? MUTED : "#c2410c" }]}>
          {ending.screenOut ? "Screen-out · can't submit" : "Completed"}
        </Text>
      </View>
      {ending.body && (
        <Text style={{ fontSize: 9, color: MUTED, lineHeight: 1.45, marginTop: 6 }}>
          {ending.body.length > 600 ? `${ending.body.slice(0, 599)}…` : ending.body}
        </Text>
      )}
      {ending.requirements.length > 0 && (
        <View style={{ marginTop: 8, gap: 3 }}>
          <Text style={s.factLabel}>Requirements shown</Text>
          {ending.requirements.map((r, i) => (
            <Text key={i} style={{ fontSize: 8.5 }}>
              • {r}
            </Text>
          ))}
        </View>
      )}
      {ending.facts.length > 0 && (
        <View style={{ marginTop: 9 }}>
          <FactGrid facts={ending.facts} columns={2} />
        </View>
      )}
    </View>
  );
}

function FactGrid({ facts, columns }: { facts: { label: string; value: string }[]; columns: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
      {facts.map((f, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, paddingRight: 10 }} wrap={false}>
          <Text style={s.factLabel}>{f.label}</Text>
          <Text style={s.factValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Grid({ rows, columns, tone }: { rows: string[]; columns: string[]; tone: (typeof TONES)[BlockTone] }) {
  const cell = { flex: 1, fontSize: 8, paddingVertical: 5, paddingHorizontal: 6, textAlign: "center" as const };
  return (
    <View style={{ marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 7, overflow: "hidden" }}>
      <View style={[s.row, { backgroundColor: tone.soft }]}>
        <Text style={[cell, { flex: 1.6, textAlign: "left" }]} />
        {columns.map((c, i) => (
          <Text key={i} style={[cell, { fontWeight: 600, color: tone.ink }]}>
            {c}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[s.row, { borderTopWidth: 1, borderTopColor: BORDER }]} wrap={false}>
          <Text style={[cell, { flex: 1.6, textAlign: "left", fontWeight: 500 }]}>{r}</Text>
          {columns.map((_, j) => (
            <View key={j} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: FAINT }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ChoiceKey({ kind, index, tone }: { kind: "letter" | "number" | "dot"; index: number; tone: (typeof TONES)[BlockTone] }) {
  if (kind === "dot") {
    return <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone.base, marginTop: 4, marginHorizontal: 4 }} />;
  }
  const label = kind === "number" ? String(index + 1) : letterFor(index);
  return (
    <View style={{ width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: tone.base, backgroundColor: tone.soft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 7, fontWeight: 600, color: tone.ink }}>{label}</Text>
    </View>
  );
}

/** A, B, … Z, AA, AB: a dropdown can hold hundreds of options. */
function letterFor(i: number): string {
  let out = "";
  let n = i;
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** A lucide icon, redrawn from the shapes `flow-snapshot` read off the DOM. */
function Icon({ shapes, color, size }: { shapes: IconShape[]; color: string; size: number }) {
  const common = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes.map((shape, i) => {
        const a = shape.attrs;
        switch (shape.tag) {
          case "path":
            return <Path key={i} d={a.d ?? ""} {...common} />;
          case "circle":
            return <Circle key={i} cx={a.cx} cy={a.cy} r={a.r} {...common} />;
          case "ellipse":
            return <Ellipse key={i} cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry} {...common} />;
          case "rect":
            return <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} ry={a.ry} {...common} />;
          case "line":
            return <Line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} {...common} />;
          case "polyline":
            return <Polyline key={i} points={a.points ?? ""} {...common} />;
          case "polygon":
            return <Polygon key={i} points={a.points ?? ""} {...common} />;
          default:
            return null;
        }
      })}
    </Svg>
  );
}

/** Drawn, not typed: the PDF's Latin font has no arrow glyph. */
function Arrow() {
  return (
    <Svg width={16} height={8} viewBox="0 0 16 8" style={{ marginHorizontal: 6, marginTop: 3 }}>
      <Line x1={0} y1={4} x2={13} y2={4} stroke={FAINT} strokeWidth={1.2} />
      <Path d="M10 1 L14 4 L10 7" stroke={FAINT} strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

function FlagIcon({ screenOut }: { screenOut: boolean }) {
  const color = screenOut ? MUTED : ORANGE;
  const common = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      {screenOut ? (
        <>
          <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" {...common} />
          <Path d="M12 8v4" {...common} />
          <Path d="M12 16h.01" {...common} />
        </>
      ) : (
        <>
          <Path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" {...common} />
        </>
      )}
    </Svg>
  );
}

/** `light` draws it in ink on a coloured ground, where the orange plate would vanish. */
function Mark({ size, light }: { size: number; light?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z" fill={light ? INK : ORANGE} />
      <Path d="M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z" fill={light ? "#ffffff" : VIOLET} />
    </Svg>
  );
}

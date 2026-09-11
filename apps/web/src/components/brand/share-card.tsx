import { ImageResponse } from "next/og";
import { BRICOLAGE_700, BRICOLAGE_800, INTER_500, INTER_600 } from "./share-card-fonts";

/**
 * The share card, drawn rather than stored — and drawn once.
 *
 * `opengraph-image.tsx` and `twitter-image.tsx` were byte-for-byte identical,
 * which is two copies of a brand asset guaranteed to drift the first time one
 * of them is edited. Both now call this.
 *
 * It takes a headline, the way `renderFormCard` does, so a Typeform comparison
 * and the pricing page do not unfurl as the same card. Called with nothing it
 * is the landing page's hero, restated at card scale: the same wash, the same
 * ringed figure, and the chat on the right. That one is not served from here —
 * `scripts/og-image.mts` bakes it into `public/og.jpg`, so rerun it after
 * changing anything below.
 *
 * The type is real now. The card used to ask for weight 800 from the platform
 * default, which ships one regular weight, so every headline rendered thin and
 * nothing looked like the site. The faces are embedded in
 * `share-card-fonts.ts` — no network and no filesystem on a path that must
 * never fail — and the mark is inline SVG for the same reason.
 */

/* Alt text is read by someone who cannot see the card, in a feed of other
   cards — a scan position, so it names the category and the claim. */
export const shareCardAlt = "chatform — AI forms that get 2.3× more submissions";

const DEFAULT_KICKER = "chatform turns your form into a conversation that people actually finish.";

export interface ShareCardInput {
  /** Two to six words. Absent, the card wears the landing page's ringed headline. */
  headline?: string;
  /** One line under it. */
  kicker?: string;
}
export const shareCardSize = { width: 1200, height: 630 };
export const shareCardContentType = "image/png";

/* The tokens, resolved. Satori has no custom properties and no oklch, so these
   are the light-theme values converted to sRGB. The `-VIVID` pair is
   `--brand-*-band-vivid` — each hue mixed 86% with the cream in oklch — which
   is the ground the hero sits on. */
const CREAM = "#FBFAF5";
const INK = "#201A16"; // --on-band-vivid
const INK_MUTED = "#362418"; // --on-band-vivid-muted
const MUTED = "#6F6861";
const ORANGE = "#FD6F29";
const VIOLET = "#9769DC";
const LINE = "#E3DDD1";
const ORANGE_VIVID = "#FC893E";
const VIOLET_VIVID = "#C578D1";
const PINK = "#ED76B3"; // --family-content
const AMBER = "#E49E22"; // --family-number

const DISPLAY = "Bricolage";
const TEXT = "Inter";

const PLATE_ASK =
  "M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z";
const PLATE_ANSWER =
  "M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z";

/* `CircleMark`'s pen ring from `annotate.tsx`, verbatim: open at the top-left
   where the pen came round and missed its own start. */
const RING =
  "M52 14 C22 20 6 40 10 58 C14 78 46 90 108 92 C170 94 224 82 231 58 C238 34 206 12 140 7 C104 4 68 7 44 18";

const STAR =
  "M12 2.5 L14.9 8.4 L21.4 9.3 L16.7 13.9 L17.8 20.4 L12 17.3 L6.2 20.4 L7.3 13.9 L2.6 9.3 L9.1 8.4 Z";

/** The band spectrum, as a rule across the foot of the form card. */
const SPECTRUM = [
  { hue: PINK, w: 3 },
  { hue: VIOLET, w: 2 },
  { hue: "#3AA9B1", w: 2 },
  { hue: AMBER, w: 2 },
  { hue: "#3BB360", w: 2 },
  { hue: "#4087DE", w: 2 },
  { hue: ORANGE, w: 4 },
] as const;

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

type Font = { name: string; data: ArrayBuffer; weight: 500 | 600 | 700 | 800; style: "normal" };
let fontCache: Font[] | undefined;

/* Decoded on first render rather than at import: the landing page's own
   bundle imports nothing from here, but a worker boots every module it has. */
function fonts(): Font[] {
  fontCache ??= [
    { name: DISPLAY, data: decode(BRICOLAGE_800), weight: 800, style: "normal" },
    { name: DISPLAY, data: decode(BRICOLAGE_700), weight: 700, style: "normal" },
    { name: TEXT, data: decode(INTER_500), weight: 500, style: "normal" },
    { name: TEXT, data: decode(INTER_600), weight: 600, style: "normal" },
  ];
  return fontCache;
}

function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <svg width={size} height={size} viewBox="0 0 32 32">
        <path d={PLATE_ASK} fill={ORANGE} />
        <path d={PLATE_ANSWER} fill={VIOLET} />
      </svg>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: size * 0.68,
          fontWeight: 700,
          color: INK,
          letterSpacing: -size * 0.025,
        }}
      >
        chatform
      </div>
    </div>
  );
}

/**
 * The hero's headline, line by line. Satori has no inline formatting context to
 * wrap a ringed word in, so the three lines are set by hand — which is also
 * what keeps the ring mid-line, the way the hero holds it.
 */
function RingedHeadline() {
  const line = { display: "flex", alignItems: "center" } as const;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: DISPLAY,
        fontSize: 82,
        fontWeight: 800,
        letterSpacing: -3.6,
        lineHeight: 1.02,
        color: INK,
      }}
    >
      <div style={line}>AI forms that</div>
      <div style={line}>
        get
        {/* The figure leans; the ring stays level — a number somebody leaned
            in to write, inside a pen mark that did not move. */}
        <div style={{ display: "flex", position: "relative", margin: "0 44px 0 40px" }}>
          <div style={{ display: "flex", transform: "rotate(-4deg)" }}>2.3×</div>
          <svg
            width="206"
            height="104"
            viewBox="0 0 240 96"
            preserveAspectRatio="none"
            fill="none"
            style={{ position: "absolute", left: -24, top: -8 }}
          >
            <path d={RING} stroke={INK} strokeWidth={4.5} strokeLinecap="round" opacity={0.85} />
          </svg>
        </div>
        more
      </div>
      <div style={line}>submissions.</div>
    </div>
  );
}

function Bubble({ from, children }: { from: "bot" | "user"; children: string }) {
  const bot = from === "bot";
  return (
    <div style={{ display: "flex", justifyContent: bot ? "flex-start" : "flex-end" }}>
      <div
        style={{
          display: "flex",
          maxWidth: 340,
          padding: "13px 18px",
          fontFamily: TEXT,
          fontSize: 19,
          fontWeight: 500,
          lineHeight: 1.4,
          borderRadius: 20,
          ...(bot
            ? { background: "#FFFFFF", color: INK, border: `1.5px solid ${LINE}`, borderBottomLeftRadius: 6 }
            : { background: ORANGE, color: INK, borderBottomRightRadius: 6 }),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The product, tilted into frame. The hero's `ChatDemo`, frozen mid-transcript
 * on the beat that sells it: a free-text answer read into a number, then a
 * rating card. Cut off by the card's bottom edge on purpose — it reads as a
 * window onto something longer, not a finished screenshot.
 */
function ChatWindow() {
  return (
    <div
      style={{
        position: "absolute",
        left: 694,
        top: 58,
        width: 460,
        height: 640,
        display: "flex",
        flexDirection: "column",
        background: CREAM,
        borderRadius: 28,
        overflow: "hidden",
        border: "1.5px solid rgba(32,26,22,0.10)",
        boxShadow: "0 40px 80px -20px rgba(54,20,60,0.45), 0 12px 24px -8px rgba(32,26,22,0.18)",
        transform: "rotate(4deg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "20px 22px",
          background: "#FFFFFF",
          borderBottom: `1.5px solid ${LINE}`,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            borderRadius: 999,
            background: ORANGE,
            color: INK,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 20,
          }}
        >
          A
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 19, color: INK }}>
            Ada · Northwind onboarding
          </div>
          <div style={{ fontFamily: TEXT, fontWeight: 500, fontSize: 15, color: MUTED }}>
            Question 3 of 6
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: -1.5,
            width: "46%",
            height: 3,
            background: ORANGE,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "24px 22px" }}>
        <Bubble from="bot">Hey! I’m Ada. What should I call you?</Bubble>
        <Bubble from="user">Maya</Bubble>
        <Bubble from="bot">Good to meet you, Maya. How many people are you setting this up for?</Bubble>
        <Bubble from="user">we’re about a dozen right now</Bubble>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: TEXT,
            fontWeight: 500,
            fontSize: 15,
            color: MUTED,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "#3BB360",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.2 6.3 L4.9 8.9 L9.8 3.4"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          Team size recorded as 12
        </div>
        <Bubble from="bot">Twelve — noted. How would you rate the tool you’re leaving?</Bubble>
        <div style={{ display: "flex", gap: 8, paddingLeft: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} width="36" height="36" viewBox="0 0 24 24">
              <path
                d={STAR}
                fill={n <= 2 ? ORANGE : "#FFFFFF"}
                stroke={n <= 2 ? ORANGE : LINE}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}

export function renderShareCard({ headline, kicker }: ShareCardInput = {}) {
  // Page headlines step down rather than run under the chat window.
  const size = !headline ? 0 : headline.length > 22 ? 68 : headline.length > 16 ? 78 : 88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          /* The hero's `vivid` ground: 115deg, orange holding to 30% and
             violet from 74%, so the middle third is the seam. */
          backgroundImage: `linear-gradient(115deg, ${ORANGE_VIVID} 0%, ${ORANGE_VIVID} 30%, ${VIOLET_VIVID} 74%, ${VIOLET_VIVID} 100%)`,
        }}
      >
        {/* The field's lobes, stopped mid-drift. Satori has no blur, so each
            is a radial gradient already soft at the edge. Amber is the
            highlight, pink deepens the seam — the same two the hero adds. */}
        <div
          style={{
            position: "absolute",
            left: -260,
            top: -340,
            width: 900,
            height: 900,
            backgroundImage: `radial-gradient(circle, ${AMBER}99 0%, ${AMBER}00 62%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 340,
            top: 120,
            width: 820,
            height: 820,
            backgroundImage: `radial-gradient(circle, ${PINK}8c 0%, ${PINK}00 62%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 760,
            top: -420,
            width: 800,
            height: 800,
            backgroundImage: `radial-gradient(circle, #AB7EF1a6 0%, #AB7EF100 62%)`,
          }}
        />
        {/* The dot grid that keeps the wash from reading as a flat panel. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            opacity: 0.09,
            backgroundImage: `radial-gradient(circle, ${INK} 1.3px, transparent 1.6px)`,
            backgroundSize: "24px 24px",
          }}
        />

        <ChatWindow />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 660,
            height: "100%",
            padding: "56px 0 52px 68px",
          }}
        >
          <Wordmark size={62} />

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {headline ? (
              <div
                style={{
                  display: "flex",
                  fontFamily: DISPLAY,
                  fontSize: size,
                  fontWeight: 800,
                  letterSpacing: -size * 0.044,
                  lineHeight: 1.02,
                  color: INK,
                }}
              >
                {headline}
              </div>
            ) : (
              <RingedHeadline />
            )}
            <div
              style={{
                display: "flex",
                fontFamily: TEXT,
                fontSize: 25,
                fontWeight: 500,
                lineHeight: 1.4,
                color: INK_MUTED,
                maxWidth: 540,
              }}
            >
              {kicker ?? DEFAULT_KICKER}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontFamily: TEXT,
              fontSize: 19,
              fontWeight: 600,
              color: INK,
            }}
          >
            <div
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                background: INK,
                color: "#FFFFFF",
              }}
            >
              chatform.in
            </div>
            <div style={{ display: "flex", color: INK_MUTED, fontWeight: 500 }}>
              Free, unlimited submissions
            </div>
          </div>
        </div>
      </div>
    ),
    { ...shareCardSize, fonts: fonts() },
  );
}

/**
 * The share card a *form* gets when its author has not uploaded one.
 *
 * Nothing was drawn before, so an unfurled form link was a bare text card —
 * every link anyone shared out of this product looked like a broken one, and
 * the fix was a paid upload most authors never make. This is the same card the
 * marketing pages use, wearing the form's own title: the author's words with
 * our frame around them.
 *
 * Rendered on request rather than stored, so it always matches the current
 * title and costs nothing when nobody shares the link. Same rule as above about
 * fonts and the mark: no network on this path.
 *
 * `description` is the author's own share description and nothing else. The
 * generic "Answer a few questions — it only takes a minute" that used to fill
 * the line said nothing a reader could not see from the button, so the card
 * spent a third of its height telling people what a form is. Absent a real
 * description the title simply gets the room.
 *
 * `deadline` is already formatted for display — the card cannot know a viewer's
 * timezone, so whoever passes it decides how the date reads.
 */
export function renderFormCard({
  title,
  description,
  deadline,
}: {
  title: string;
  description?: string;
  deadline?: string;
}) {
  // Long titles step down rather than wrap into the description.
  const size = title.length > 74 ? 58 : title.length > 44 ? 70 : title.length > 24 ? 84 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          padding: "72px 76px 0",
          fontFamily: TEXT,
        }}
      >
        <Wordmark size={46} />

        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 8 }}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: size,
              fontWeight: 800,
              color: INK,
              letterSpacing: -size * 0.04,
              lineHeight: 1.02,
              maxWidth: 1000,
              display: "flex",
            }}
          >
            {title}
          </div>
          {description ? (
            <div style={{ fontSize: 30, fontWeight: 500, color: MUTED, maxWidth: 860, display: "flex" }}>
              {description}
            </div>
          ) : null}
          {/* The button is the card's call to action and was smaller than the
              description above it, which read as a caption rather than a thing
              to click. It carries the row on its own now. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                background: ORANGE,
                color: INK,
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: -0.6,
                padding: "18px 38px",
                borderRadius: 999,
              }}
            >
              Answer in a chat
            </div>
            {/* A deadline is the one fact that makes someone open the link now
                rather than later, and it was only discoverable by starting the
                form. */}
            {deadline ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 26,
                  fontWeight: 500,
                  color: MUTED,
                  border: `2px solid ${LINE}`,
                  padding: "14px 28px",
                  borderRadius: 999,
                }}
              >
                Closes {deadline}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", width: "100%", height: 14 }}>
          {SPECTRUM.map((s) => (
            <div key={s.hue} style={{ flex: s.w, height: "100%", background: s.hue }} />
          ))}
        </div>
      </div>
    ),
    { ...shareCardSize, fonts: fonts() },
  );
}

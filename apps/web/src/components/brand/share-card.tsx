import { ImageResponse } from "next/og";

/**
 * The share card, drawn rather than stored — and drawn once.
 *
 * `opengraph-image.tsx` and `twitter-image.tsx` were byte-for-byte identical,
 * which is two copies of a brand asset guaranteed to drift the first time one
 * of them is edited. Both now call this.
 *
 * It takes a headline now, the way `renderFormCard` already did. Every page on
 * the site was unfurling the same card — a Typeform comparison and the pricing
 * page were indistinguishable in a Slack thread, which wastes the one piece of
 * the page a person sees before deciding whether to click. The defaults are
 * the landing page's own words, so a route that has nothing particular to say
 * still gets the right card by passing nothing.
 *
 * Fonts are the platform defaults on purpose: pulling Bricolage over the wire
 * at render time is a network dependency on a path that must never fail, and
 * the mark plus the palette already carry the brand. The mark is inline SVG
 * paths for the same reason — Satori rasterises them itself, with nothing to
 * fetch.
 */

/* Alt text is read by someone who cannot see the card, in a feed of other
   cards — a scan position, so it names the category. The drawn headline below
   keeps the claim; a screen reader that got only the metaphor would be the one
   reader who never finds out what this is. */
export const shareCardAlt = "chatform — forms people actually finish";

/** The card's defaults, which are the landing page's own words. */
const DEFAULT_HEADLINE = "Stop losing people at question 4.";
const DEFAULT_KICKER = "A form that asks like a person, so more people finish.";

export interface ShareCardInput {
  /** Two to six words. Anything longer stops fitting at 96px. */
  headline?: string;
  /** One line under it. */
  kicker?: string;
}
export const shareCardSize = { width: 1200, height: 630 };
export const shareCardContentType = "image/png";

/* The tokens, resolved. Satori has no CSS custom properties to read. */
const CREAM = "#FBFAF5";
const INK = "#26221E";
const MUTED = "#6F6861";
const ORANGE = "#FD6F29";
const VIOLET = "#9769DC";
const LINE = "#E3DDD1";

const PLATE_ASK =
  "M19.7 25 L18.8 25 L10.4 28.1 L11.6 25 L11 25 A6 6 0 0 1 5 19 L5 13 A6 6 0 0 1 11 7 L11.3 7 Z";
const PLATE_ANSWER =
  "M12.3 7 L13.2 7 L21.6 3.9 L20.4 7 L21 7 A6 6 0 0 1 27 13 L27 19 A6 6 0 0 1 21 25 L20.7 25 Z";

/** The band spectrum, as a rule across the foot of the card. */
const SPECTRUM = [
  { hue: "#ED76B3", w: 3 },
  { hue: VIOLET, w: 2 },
  { hue: "#3AA9B1", w: 2 },
  { hue: "#E49E22", w: 2 },
  { hue: "#3BB360", w: 2 },
  { hue: "#4087DE", w: 2 },
  { hue: ORANGE, w: 4 },
] as const;

export function renderShareCard({ headline, kicker }: ShareCardInput = {}) {
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
          padding: "76px 76px 0",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="54" height="54" viewBox="0 0 32 32">
            <path d={PLATE_ASK} fill={ORANGE} />
            <path d={PLATE_ANSWER} fill={VIOLET} />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, color: INK, letterSpacing: -1.4 }}>
            chatform
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: INK,
              letterSpacing: -4.5,
              lineHeight: 0.98,
              maxWidth: 940,
              display: "flex",
            }}
          >
            {headline ?? DEFAULT_HEADLINE}
          </div>
          <div style={{ fontSize: 32, color: MUTED, maxWidth: 780, display: "flex" }}>
            {kicker ?? DEFAULT_KICKER}
          </div>
        </div>

        {/* The seven question families, in the order the landing page wears
            them. A logo wall would be a lie; this is the product's own palette. */}
        <div style={{ display: "flex", width: "100%", height: 14 }}>
          {SPECTRUM.map((s) => (
            <div key={s.hue} style={{ flex: s.w, height: "100%", background: s.hue }} />
          ))}
        </div>
      </div>
    ),
    shareCardSize,
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
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="46" height="46" viewBox="0 0 32 32">
            <path d={PLATE_ASK} fill={ORANGE} />
            <path d={PLATE_ANSWER} fill={VIOLET} />
          </svg>
          <div style={{ fontSize: 29, fontWeight: 700, color: INK, letterSpacing: -1.2 }}>
            chatform
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 8 }}>
          <div
            style={{
              fontSize: size,
              fontWeight: 800,
              color: INK,
              letterSpacing: -3.4,
              lineHeight: 1.02,
              maxWidth: 1000,
              display: "flex",
            }}
          >
            {title}
          </div>
          {description ? (
            <div style={{ fontSize: 30, color: MUTED, maxWidth: 860, display: "flex" }}>
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
                color: "#201A16",
                fontSize: 32,
                fontWeight: 700,
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
    shareCardSize,
  );
}

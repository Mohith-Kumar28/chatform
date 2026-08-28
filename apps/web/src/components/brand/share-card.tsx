import { ImageResponse } from "next/og";

/**
 * The share card, drawn rather than stored — and drawn once.
 *
 * `opengraph-image.tsx` and `twitter-image.tsx` were byte-for-byte identical,
 * which is two copies of a brand asset guaranteed to drift the first time one
 * of them is edited. Both now call this.
 *
 * Fonts are the platform defaults on purpose: pulling Bricolage over the wire
 * at render time is a network dependency on a path that must never fail, and
 * the mark plus the palette already carry the brand. The mark is inline SVG
 * paths for the same reason — Satori rasterises them itself, with nothing to
 * fetch.
 */

export const shareCardAlt = "chatform — the first form that answers back";
export const shareCardSize = { width: 1200, height: 630 };
export const shareCardContentType = "image/png";

/* The tokens, resolved. Satori has no CSS custom properties to read. */
const CREAM = "#FBFAF5";
const INK = "#26221E";
const MUTED = "#6F6861";
const ORANGE = "#FD6F29";
const VIOLET = "#9769DC";

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

export function renderShareCard() {
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
            The first form that answers back.
          </div>
          <div style={{ fontSize: 32, color: MUTED, maxWidth: 780, display: "flex" }}>
            An AI interviewer that asks your questions — and answers theirs.
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

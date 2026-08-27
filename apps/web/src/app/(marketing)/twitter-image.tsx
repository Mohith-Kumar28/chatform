import { ImageResponse } from "next/og";

/**
 * The share card, drawn rather than stored. `public/` held nothing but the
 * untouched Next starter SVGs, so every link to this site previewed blank.
 *
 * Fonts are the platform defaults on purpose: pulling Bricolage over the wire
 * at render time is a network dependency on a path that must never fail, and
 * the mark plus the palette already carry the brand.
 */
export const alt = "chatform — the first form that answers back";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CREAM = "#FAF7F2";
const INK = "#3B332C";
const ORANGE = "#F1743C";

export default function OpengraphImage() {
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
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 15,
              background: ORANGE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFF7F0",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            c
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: INK, letterSpacing: -0.5 }}>
            chatform
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              color: INK,
              letterSpacing: -3,
              lineHeight: 1.04,
              maxWidth: 900,
              display: "flex",
            }}
          >
            The first form that answers back.
          </div>
          <div style={{ fontSize: 30, color: "#7A6D60", maxWidth: 820, display: "flex" }}>
            An AI interviewer that asks your questions, understands what people type, and
            answers theirs from a knowledge base you write.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["26 question types", "Headless API", "Free forever plan"].map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                border: `2px solid ${ORANGE}40`,
                background: "#FDEEE5",
                color: "#8A4218",
                borderRadius: 999,
                padding: "10px 22px",
                fontSize: 24,
                fontWeight: 500,
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

import { describe, expect, it } from "vitest";
import { ThemeDoc } from "@repo/form-schema";
import {
  extractSwatches,
  hexToOklch,
  hexToRgb,
  hueDistance,
  oklchToHex,
  pickBrand,
  themeFromAccent,
  themeFromSwatches,
} from "../src/lib/brand-palette";
import { chatThemeVars, contrast, isDarkColor } from "../src/lib/chat-theme";

/** A fake logo: `share` of the pixels in each colour, `transparent` of them cut out. */
function logo(parts: [hex: string, share: number][], transparent = 0): Uint8ClampedArray {
  const n = 1000;
  const px: number[] = [];
  for (const [hex, share] of parts) {
    const [r, g, b] = hexToRgb(hex)!;
    for (let i = 0; i < Math.round(n * share); i++) px.push(r, g, b, 255);
  }
  for (let i = 0; i < Math.round(n * transparent); i++) px.push(0, 0, 0, 0);
  return new Uint8ClampedArray(px);
}

const hueOf = (hex: string) => hexToOklch(hex)!.h;

describe("colour maths", () => {
  it("round-trips hex through OKLCH", () => {
    for (const hex of ["#fd6f29", "#6d3fc7", "#0369a1", "#166534", "#000000", "#ffffff"]) {
      expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
    }
  });

  it("keeps the hue when a colour is out of gamut, by giving up chroma", () => {
    const out = oklchToHex({ l: 0.9, c: 0.4, h: 30 });
    expect(hueDistance(hueOf(out), 30)).toBeLessThan(6);
  });
});

describe("extractSwatches", () => {
  it("finds a logo's colours, most-used first, and ignores the cut-out", () => {
    const s = extractSwatches(logo([["#fd6f29", 0.3], ["#1c1917", 0.1]], 0.6));
    expect(s.map((x) => x.hex)).toHaveLength(2);
    expect(hueDistance(s[0]!.h, hueOf("#fd6f29"))).toBeLessThan(5);
    expect(s[0]!.weight).toBeCloseTo(0.75, 1);
  });

  it("merges anti-aliased shades of one colour into one swatch", () => {
    const s = extractSwatches(logo([["#fd6f29", 0.5], ["#fb6d27", 0.2], ["#ff7430", 0.2], ["#ffffff", 0.1]]));
    expect(s).toHaveLength(2);
  });
});

describe("pickBrand", () => {
  it("picks the brand colour over a white backdrop that outnumbers it", () => {
    const brand = pickBrand(extractSwatches(logo([["#ffffff", 0.8], ["#0369a1", 0.2]])))!;
    expect(hueDistance(brand.primary.h, hueOf("#0369a1"))).toBeLessThan(5);
  });

  it("picks a small vivid mark over a large black wordmark", () => {
    const brand = pickBrand(extractSwatches(logo([["#111111", 0.8], ["#e11d48", 0.2]])))!;
    expect(hueDistance(brand.primary.h, hueOf("#e11d48"))).toBeLessThan(5);
  });

  it("reports a second hue only when it is a different colour", () => {
    const two = pickBrand(extractSwatches(logo([["#FD6F29", 0.5], ["#9769DC", 0.5]])))!;
    expect(two.secondary).not.toBeNull();
    const one = pickBrand(extractSwatches(logo([["#FD6F29", 0.5], ["#f59e0b", 0.5]])))!;
    expect(one.secondary).toBeNull();
  });

  it("treats a black-and-white logo as a monochrome brand", () => {
    const brand = pickBrand(extractSwatches(logo([["#ffffff", 0.7], ["#171717", 0.3]])))!;
    expect(brand.primary.l).toBeLessThan(0.3);
  });

  it("gives up on a logo that is all white", () => {
    expect(pickBrand(extractSwatches(logo([["#ffffff", 1]])))).toBeNull();
  });
});

describe("themeFromAccent", () => {
  const ACCENTS = ["#FD6F29", "#6D3FC7", "#0369A1", "#166534", "#e11d48", "#facc15", "#171717", "#f5f5f5", "#1e3a8a"];

  for (const dark of [false, true]) {
    describe(dark ? "dark" : "light", () => {
      it("keeps the mode it was asked for", () => {
        for (const a of ACCENTS) expect(isDarkColor(themeFromAccent(a, { dark })!.background)).toBe(dark);
      });

      it("reads: body text clears AAA on the page, and every derived ink clears AA", () => {
        for (const a of ACCENTS) {
          const p = themeFromAccent(a, { dark })!;
          expect(contrast(p.text, p.background)).toBeGreaterThanOrEqual(7);
          const v = chatThemeVars(ThemeDoc.parse(p)) as unknown as Record<string, string>;
          expect(contrast(v["--cf-accent"]!, v["--cf-accent-text"]!)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v["--cf-user-bubble"]!, v["--cf-user-bubble-text"]!)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v["--cf-bot-bubble"]!, v["--cf-bot-bubble-text"]!)).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("keeps the button and the bubble visible against the page", () => {
        for (const a of ACCENTS) {
          const p = themeFromAccent(a, { dark })!;
          expect(contrast(p.accent, p.background)).toBeGreaterThanOrEqual(1.5);
          expect(contrast(p.userBubble, p.background)).toBeGreaterThanOrEqual(1.2);
        }
      });
    });
  }

  it("keeps a usable accent exactly as given", () => {
    expect(themeFromAccent("#FD6F29")!.accent).toBe("#fd6f29");
  });

  it("carries the accent's hue into the page and the bubble", () => {
    const p = themeFromAccent("#0369A1")!;
    expect(hueDistance(hueOf(p.background), hueOf("#0369A1"))).toBeLessThan(15);
    expect(hueDistance(hueOf(p.userBubble), hueOf("#0369A1"))).toBeLessThan(15);
  });

  it("dresses the bubble in a second brand hue when there is one", () => {
    const p = themeFromAccent("#FD6F29", { secondary: "#9769DC" })!;
    expect(hueDistance(hueOf(p.userBubble), hueOf("#9769DC"))).toBeLessThan(15);
  });

  it("leaves ink to the runtime by storing the sentinel", () => {
    const p = themeFromAccent("#FD6F29")!;
    const d = ThemeDoc.parse({});
    expect(p.accentText).toBe(d.accentText);
    expect(p.userBubbleText).toBe(d.userBubbleText);
  });

  it("refuses what is not a hex colour", () => {
    expect(themeFromAccent("rebeccapurple")).toBeNull();
  });
});

describe("themeFromSwatches", () => {
  it("builds a whole theme from a logo", () => {
    const p = themeFromSwatches(extractSwatches(logo([["#ffffff", 0.6], ["#166534", 0.4]])), false)!;
    expect(hueDistance(hueOf(p.accent), hueOf("#166534"))).toBeLessThan(5);
    expect(ThemeDoc.safeParse(p).success).toBe(true);
  });
});

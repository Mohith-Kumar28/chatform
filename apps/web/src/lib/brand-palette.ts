import { THEME_DEFAULT_INK, type ThemeDoc } from "@repo/form-schema";
import { contrast, isDarkColor, readableInk } from "@/lib/chat-theme";

/**
 * A whole theme from one colour, and that colour from a logo.
 *
 * Two jobs, one module, because the second is only worth doing if the first is
 * done well: pulling a logo's orange out is easy, and what makes a form look
 * designed is that the page, the ink and both bubbles then agree with it.
 *
 * Everything is worked in OKLCH rather than HSL or hex. Its lightness is
 * perceptual, so "a page at 98.5%" is equally quiet under a yellow brand and a
 * navy one, which is not true of HSL's L. The hue is carried into every
 * derived colour at low chroma, so a blue brand gets a page and an ink with a
 * trace of blue in them rather than generic white and black under a blue
 * button.
 */

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];
type Oklab = [number, number, number];
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]: Rgb): Oklab {
  const [lr, lg, lb] = [r / 255, g / 255, b / 255].map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear sRGB, unclamped, so the caller can tell whether it left the gamut. */
function oklabToLinear([L, a, b]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

export function hexToRgb(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

const rgbToHex = (rgb: Rgb) =>
  `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

function labToLch([l, a, b]: Oklab): Oklch {
  const c = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  return rgb ? labToLch(rgbToOklab(rgb)) : null;
}

/**
 * OKLCH to hex, keeping lightness and hue and giving up chroma until the colour
 * exists in sRGB. Clipping channels instead would shift the hue, which is the
 * one property every derived colour here is meant to share with the brand.
 */
export function oklchToHex({ l, c, h }: Oklch): string {
  const L = Math.min(1, Math.max(0, l));
  const rad = (h * Math.PI) / 180;
  const at = (chroma: number): Rgb => oklabToLinear([L, chroma * Math.cos(rad), chroma * Math.sin(rad)]);
  let lo = 0;
  let hi = Math.max(0, c);
  if (!inGamut(at(hi))) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  const lin = at(hi).map((v) => Math.min(1, Math.max(0, v))) as Rgb;
  return rgbToHex(lin.map((v) => toGamma(v) * 255) as Rgb);
}

/** Shortest distance between two hues, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ---------------------------------------------------------------------------
// Logo → swatches
// ---------------------------------------------------------------------------

export interface Swatch {
  hex: string;
  /** Share of the logo's visible pixels, 0–1. */
  weight: number;
  l: number;
  c: number;
  h: number;
}

/** Below this chroma a colour reads as grey, and grey is not a brand hue. */
const CHROMATIC = 0.045;

/**
 * The colours a logo is made of, most-used first.
 *
 * Pixels are bucketed at 4 bits a channel, then the buckets are merged greedily
 * in OKLab, largest first. The merge is what makes this work on real logos:
 * anti-aliased edges and gradients produce hundreds of near-identical buckets,
 * and a naive "top N buckets" hands back five shades of the same orange. Two
 * colours closer than `MERGE` in OKLab are one colour to a person looking at
 * them.
 *
 * Transparent and near-transparent pixels are skipped: a PNG's cut-out is not
 * part of the brand, and its half-alpha edge pixels are the logo blended with
 * a black that is not there.
 */
export function extractSwatches(pixels: Uint8ClampedArray | Uint8Array, max = 6): Swatch[] {
  const MERGE = 0.085;
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < 200) continue;
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cell = buckets.get(key);
    if (cell) {
      cell.r += r;
      cell.g += g;
      cell.b += b;
      cell.n++;
    } else buckets.set(key, { r, g, b, n: 1 });
    total++;
  }
  if (total === 0) return [];

  const clusters: { lab: Oklab; n: number }[] = [];
  for (const cell of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const lab = rgbToOklab([cell.r / cell.n, cell.g / cell.n, cell.b / cell.n]);
    const near = clusters.find(
      (k) => Math.hypot(k.lab[0] - lab[0], k.lab[1] - lab[1], k.lab[2] - lab[2]) < MERGE,
    );
    if (near) {
      // Weighted, so the cluster sits where most of its pixels are rather than
      // drifting toward whichever stray bucket merged in last.
      const n = near.n + cell.n;
      near.lab = near.lab.map((v, i) => (v * near.n + lab[i]! * cell.n) / n) as Oklab;
      near.n = n;
    } else clusters.push({ lab, n: cell.n });
  }

  return clusters
    .filter((k) => k.n / total >= 0.01)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((k) => {
      const lch = labToLch(k.lab);
      return { hex: oklchToHex(lch), weight: k.n / total, ...lch };
    });
}

/**
 * Which of a logo's colours is the brand, and which (if any) is its second.
 *
 * Population alone picks wrong: a logo on a white square is mostly white, and
 * a wordmark in black with an orange dot is mostly black. So near-white never
 * qualifies, and among the rest a colour earns its place by being both used
 * and saturated — the square root keeps a small, vivid mark in contention with
 * a large, dull one, which is how people actually read a logo's colour.
 *
 * A logo with no chromatic colour at all is a monochrome brand, and its accent
 * is its darkest ink. A second hue is only reported when it is plainly a
 * different colour (40° round the wheel) and more than a speck.
 */
export function pickBrand(swatches: Swatch[]): { primary: Swatch; secondary: Swatch | null } | null {
  const usable = swatches.filter((s) => !(s.l > 0.93 && s.c < 0.04));
  if (usable.length === 0) return null;

  const score = (s: Swatch) => Math.sqrt(s.weight) * (s.c + 0.02) * (s.l > 0.9 || s.l < 0.2 ? 0.5 : 1);
  const chromatic = usable.filter((s) => s.c >= CHROMATIC).sort((a, b) => score(b) - score(a));
  const primary = chromatic[0] ?? [...usable].sort((a, b) => a.l - b.l)[0]!;
  const secondary =
    chromatic.find((s) => s !== primary && s.weight >= 0.03 && hueDistance(s.h, primary.h) >= 40) ?? null;
  return { primary, secondary };
}

// ---------------------------------------------------------------------------
// One colour → a theme
// ---------------------------------------------------------------------------

type Palette = Pick<
  ThemeDoc,
  "background" | "surface" | "text" | "accent" | "accentText" | "botBubble" | "userBubble" | "userBubbleText"
>;

/**
 * Every theme colour, derived from the accent.
 *
 * The rules are the ones the hand-made presets in the theme panel already
 * follow, written down so any accent gets them:
 *
 *   - The accent is the thing you press, so it keeps its colour. It is only
 *     moved when it would vanish into the page — a near-white accent on a light
 *     page, a navy one on a dark page — and then only in lightness.
 *   - The page is the accent's hue at almost no chroma: warm under orange,
 *     cool under blue, never a stark #fff that belongs to nobody.
 *   - The respondent's bubble is a tint, not the accent: light enough that ink
 *     sits well above AA on it, far enough from the page to read as a bubble.
 *     With a second brand hue it takes that one, which is what the Chatform
 *     preset does with its orange action and violet bubble.
 *   - Ink on the accent and on the bubble is left to `readableInk` by storing
 *     the sentinel default, so it is derived from whatever fill it lands on.
 *
 * `dark` keeps a dark form dark: the same relationships, mirrored.
 */
export function themeFromAccent(
  accent: string,
  { dark = false, secondary = null }: { dark?: boolean; secondary?: string | null } = {},
): Palette | null {
  const a = hexToOklch(accent);
  if (!a) return null;
  const b = (secondary && hexToOklch(secondary)) || a;
  const neutral = a.c < CHROMATIC;
  // A grey brand's hue is noise; tint its page toward nothing rather than
  // toward whatever angle a rounding error landed on.
  const tint = (max: number, share: number) => (neutral ? 0 : Math.min(max, a.c * share));
  const bubbleChroma = b.c < CHROMATIC ? 0.006 : Math.min(0.09, Math.max(0.035, b.c * 0.45));

  let out: Palette;
  if (!dark) {
    out = {
      background: oklchToHex({ l: 0.985, c: tint(0.012, 0.08), h: a.h }),
      surface: "#ffffff",
      text: oklchToHex({ l: 0.22, c: tint(0.03, 0.15), h: a.h }),
      accent: oklchToHex(a),
      accentText: THEME_DEFAULT_INK,
      botBubble: "#ffffff",
      userBubble: oklchToHex({ l: 0.88, c: bubbleChroma, h: b.h }),
      userBubbleText: THEME_DEFAULT_INK,
    };
  } else {
    out = {
      background: oklchToHex({ l: 0.18, c: tint(0.02, 0.12), h: a.h }),
      surface: oklchToHex({ l: 0.22, c: tint(0.02, 0.12), h: a.h }),
      text: oklchToHex({ l: 0.96, c: tint(0.01, 0.05), h: a.h }),
      accent: oklchToHex(a),
      accentText: THEME_DEFAULT_INK,
      botBubble: oklchToHex({ l: 0.25, c: tint(0.025, 0.15), h: a.h }),
      userBubble: oklchToHex({ l: 0.38, c: bubbleChroma, h: b.h }),
      userBubbleText: THEME_DEFAULT_INK,
    };
  }

  /*
   * The button has to stand off the page. 1.5:1 on a light page is deliberately
   * gentle: a sunshine-yellow brand on cream is a legitimate choice (its ink is
   * dark and derived), and pushing every light accent to 3:1 would turn it
   * mustard. This only catches accents that would otherwise disappear. A dark
   * page asks for more, because a navy or black accent on near-black reads as
   * a hole rather than a button.
   */
  const standOff = dark ? 2.2 : 1.5;
  let fixed = a;
  for (let i = 0; i < 30 && contrast(oklchToHex(fixed), out.background) < standOff; i++) {
    fixed = { ...fixed, l: fixed.l + (dark ? 0.02 : -0.02) };
  }
  /*
   * And its label has to read. A saturated mid-tone (rose, some reds) is the
   * one lightness where neither near-black nor near-white ink quite clears AA,
   * so it is walked a step at a time away from its ink, at most 0.06 in
   * lightness — a shade nobody would call a different colour.
   */
  for (let i = 0; i < 6; i++) {
    const hex = oklchToHex(fixed);
    const ink = readableInk(hex);
    if (contrast(hex, ink) >= 4.5) break;
    fixed = { ...fixed, l: fixed.l + (isDarkColor(ink) ? 0.01 : -0.01) };
  }
  out.accent = oklchToHex(fixed);

  // And the bubble has to stand off the page, or it is just more page.
  let bubble = hexToOklch(out.userBubble)!;
  for (let i = 0; i < 10 && contrast(out.userBubble, out.background) < 1.2; i++) {
    bubble = { ...bubble, l: bubble.l + (dark ? 0.03 : -0.03) };
    out.userBubble = oklchToHex(bubble);
  }
  return out;
}

/** Whether a theme is a dark one, which decides which way `themeFromAccent` mirrors. */
export const isDarkTheme = (theme: Pick<ThemeDoc, "background">) => isDarkColor(theme.background);

/** A full palette from a logo's swatches, or null when the logo has no usable colour. */
export function themeFromSwatches(swatches: Swatch[], dark: boolean): Palette | null {
  const brand = pickBrand(swatches);
  if (!brand) return null;
  return themeFromAccent(brand.primary.hex, { dark, secondary: brand.secondary?.hex ?? null });
}

// ---------------------------------------------------------------------------
// Browser: image → pixels
// ---------------------------------------------------------------------------

/**
 * A logo's pixels, drawn small.
 *
 * 96px is plenty to find a logo's colours and keeps the scan to ~9k pixels.
 * Takes a `Blob` so the upload path can read the file it already holds; an
 * existing logo is fetched first (asset responses carry CORS for our origin),
 * because drawing a cross-origin `<img>` taints the canvas and
 * `getImageData` then throws.
 */
export async function swatchesFromBlob(blob: Blob): Promise<Swatch[]> {
  const bitmap = await createImageBitmap(blob);
  try {
    const size = 96;
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(bitmap, 0, 0, w, h);
    return extractSwatches(ctx.getImageData(0, 0, w, h).data);
  } finally {
    bitmap.close();
  }
}

export async function swatchesFromUrl(url: string): Promise<Swatch[]> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`logo: ${res.status}`);
  return swatchesFromBlob(await res.blob());
}

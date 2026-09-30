import { CHROMATIC, hueDistance, labToLch, oklchToHex, rgbToOklab, themeFromAccent, type Oklab, type Palette } from "@repo/form-schema";

// The colour maths and the one-colour theme moved to the shared package, so
// the API can derive a palette too; re-exported for existing imports.
export {
  bubbleHue,
  hexToOklch,
  hexToRgb,
  hueDistance,
  isDarkTheme,
  oklchToHex,
  themeFromAccent,
  type Oklch,
  type Palette,
} from "@repo/form-schema";

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

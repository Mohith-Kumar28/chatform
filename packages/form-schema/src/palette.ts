import { THEME_DEFAULT_INK, type ThemeDoc } from "./settings";
import { withThemeSide } from "./form-themes";

/**
 * Colour maths for a form's theme, shared by the web app and the API.
 *
 * Pure functions only: the builder derives palettes with these, the hosted
 * form resolves light and dark with them, and the server can do both before a
 * form is saved (a generated form's palette, a form made dark by the AI).
 */

/**
 * Relative luminance of a hex color, for deciding readable foregrounds.
 * ThemeDoc stores hex (it is edited with native color inputs), so derived
 * states are computed here rather than in CSS.
 */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.45;
}

/** WCAG contrast ratio between two hex colors, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}


/** Blend a hex color toward white or black by `amount` (0–1). */
export function shiftColor(hex: string, amount: number, toward: "light" | "dark"): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return hex;
  const target = toward === "light" ? 255 : 0;
  const out = [0, 2, 4]
    .map((i) => {
      const v = parseInt(full.slice(i, i + 2), 16);
      return Math.round(v + (target - v) * amount)
        .toString(16)
        .padStart(2, "0");
    })
    .join("");
  return `#${out}`;
}

/**
 * The most readable ink for a given fill: the fill itself taken almost to
 * black, or almost to white, whichever wins.
 *
 * Both candidates are the *fill* shifted rather than flat `#000`/`#fff`, so the
 * ink carries a trace of the bubble's hue and reads as part of the palette
 * instead of stamped on top of it.
 */
export function readableInk(fill: string): string {
  const dark = shiftColor(fill, 0.88, "dark");
  const light = shiftColor(fill, 0.96, "light");
  return contrast(fill, dark) >= contrast(fill, light) ? dark : light;
}

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

export type Rgb = [number, number, number];
export type Oklab = [number, number, number];
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]: Rgb): Oklab {
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

export function labToLch([l, a, b]: Oklab): Oklch {
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

/**
 * Any colour a tweakcn theme writes (hex, `rgb()`, `hsl()`, `oklch()`), as hex,
 * for the code here that measures contrast and mixes in sRGB. Alpha is dropped.
 * Null for anything else, so a caller keeps its own fallback.
 */
export function cssColorToHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(v)) {
    const h = v.slice(1);
    if (h.length === 3 || h.length === 4) return `#${h.slice(0, 3).split("").map((c) => c + c).join("")}`;
    return `#${h.slice(0, 6)}`;
  }
  const m = v.match(/^(rgb|hsl|oklch)a?\(([^)]*)\)$/);
  if (!m) return null;
  const parts = m[2]!.split("/")[0]!.trim().split(/[\s,]+/).filter(Boolean);
  const num = (p: string | undefined, scale = 1) => (p === undefined ? NaN : p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
  if (m[1] === "rgb") {
    const rgb = parts.slice(0, 3).map((p) => num(p, 255));
    return rgb.some(Number.isNaN) ? null : rgbToHex(rgb as Rgb);
  }
  if (m[1] === "hsl") {
    const [h, s, l] = [parseFloat(parts[0]!), num(parts[1]), num(parts[2])];
    if ([h, s, l].some(Number.isNaN)) return null;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  const [l, c, h] = [num(parts[0]), parseFloat(parts[1]!), parseFloat(parts[2] ?? "0")];
  if ([l, c].some(Number.isNaN)) return null;
  return oklchToHex({ l, c, h: Number.isNaN(h) ? 0 : h });
}

/** Shortest distance between two hues, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Below this chroma a colour reads as grey, and grey is not a brand hue. */
export const CHROMATIC = 0.045;

// ---------------------------------------------------------------------------
// One colour → a theme
// ---------------------------------------------------------------------------

export type Palette = Pick<
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

/**
 * A theme's bubble as the second brand hue for `themeFromAccent`, or null when
 * it carries no hue of its own. A dark theme's bubble is a near-neutral shade,
 * and taking its hue turned a peach bubble grey on the way back to light.
 */
export function bubbleHue(bubble: string): string | null {
  const o = hexToOklch(bubble);
  return o && o.c >= CHROMATIC ? bubble : null;
}

/** Whether a theme is a dark one, which decides which way `themeFromAccent` mirrors. */
export const isDarkTheme = (theme: Pick<ThemeDoc, "background">) => isDarkColor(theme.background);

/**
 * A form's light or dark appearance, as the respondent sees it.
 *
 * `theme.colorScheme` is the author's choice; the colours are whatever the
 * theme stores. The rule, applied by every surface that themes a form (the
 * hosted page, the embed, the builder preview, the dashboard card, the closed
 * page), so a preview never shows a different form from the real one:
 *
 * - light: the stored colours, exactly as every form has always rendered;
 * - dark: the stored colours when they are already dark (a Midnight form, a
 *   hand-built dark palette), else the dark mirror of the form's own accent
 *   (`themeFromAccent`, the same derivation the Design panel uses);
 * - auto: dark when the respondent's device is, light when it is not.
 *
 * Nothing is migrated: a form nobody touched is `light`, and a dark palette
 * stored before this setting existed is still dark under it.
 */
export function resolveScheme(theme: ThemeDoc, prefersDark: boolean): ThemeDoc {
  const wantDark = theme.colorScheme === "dark" || (theme.colorScheme === "auto" && prefersDark);
  // A tweakcn theme carries its own designed dark side; use it rather than a mirror.
  if (theme.styles) return withThemeSide(theme, wantDark);
  if (!wantDark || isDarkTheme(theme)) return theme;
  const dark = themeFromAccent(theme.accent, { dark: true, secondary: bubbleHue(theme.userBubble) });
  return dark ? { ...theme, ...dark } : theme;
}

/**
 * What the Appearance control shows: the author's choice, read from what the
 * form really is, so a form on the dark Midnight preset (built before this
 * setting existed) is Dark.
 */
export function appearanceOf(theme: ThemeDoc): ThemeDoc["colorScheme"] {
  if (theme.colorScheme === "auto") return "auto";
  // Dark when chosen (the colours may still be the light ones, written by the
  // API or the builder AI, and `resolveScheme` mirrors them) or when the
  // colours themselves are dark.
  return theme.colorScheme === "dark" || isDarkTheme(theme) ? "dark" : "light";
}

/**
 * The theme switched to `next`, for the Design panel and the builder AI alike.
 *
 * The stored colours are rebuilt from the accent when the side changes, so
 * the colour pickers always show the form as it looks. On `auto` they are the
 * light ones, which `resolveScheme` mirrors for a dark device.
 */
export function withAppearance(theme: ThemeDoc, next: ThemeDoc["colorScheme"]): ThemeDoc {
  const dark = next === "dark";
  if (theme.styles) return { ...withThemeSide(theme, dark), colorScheme: next };
  const palette = dark !== isDarkTheme(theme) ? themeFromAccent(theme.accent, { dark, secondary: bubbleHue(theme.userBubble) }) : null;
  return { ...theme, ...(palette ?? {}), colorScheme: next };
}

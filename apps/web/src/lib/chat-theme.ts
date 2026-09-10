import type { CSSProperties } from "react";
import { THEME_DEFAULT_INK, type ThemeDoc } from "@repo/form-schema";

/**
 * Maps a form's ThemeDoc onto the scoped `--cf-*` variables the chat surface
 * consumes.
 *
 * This function is the "preview ≡ production" contract: the builder's live
 * preview and the hosted `/f/[slug]` runtime both render through it, so a form
 * cannot look one way in the builder and another way to a respondent. Change
 * it once and both move together — never fork it.
 */

export const RADIUS_PX: Record<ThemeDoc["radius"], string> = {
  none: "0px",
  sm: "6px",
  md: "12px",
  lg: "18px",
  full: "9999px",
};

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
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The ratio body copy has to clear against the surface behind it (WCAG AA). */
const AA_BODY = 4.5;

/** Blend a hex color toward white or black by `amount` (0–1). */
function shift(hex: string, amount: number, toward: "light" | "dark"): string {
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
  const dark = shift(fill, 0.88, "dark");
  const light = shift(fill, 0.96, "light");
  return contrast(fill, dark) >= contrast(fill, light) ? dark : light;
}

/**
 * Ink for a fill, honouring a deliberate choice and rescuing everything else.
 *
 * A stored value still equal to the schema default means nobody picked it, so
 * it derives — which is what fixes forms saved before this existed, with no
 * migration and no re-save. A value someone did pick survives if it is legible
 * on the fill it now sits on, and is overridden if it is not: a theme cannot be
 * edited into a state where the answer is unreadable.
 */
function inkFor(fill: string, stored: string): string {
  if (stored.trim().toLowerCase() === THEME_DEFAULT_INK.toLowerCase()) return readableInk(fill);
  return contrast(fill, stored) >= AA_BODY ? stored : readableInk(fill);
}

export function chatThemeVars(theme: ThemeDoc): CSSProperties {
  const darkSurface = isDarkColor(theme.background);

  // The bot bubble needs a border only when it would otherwise be invisible
  // against the page. This used to be a hardcoded comparison against the
  // literal default hex, which broke for every custom theme.
  const bubbleBlendsIn = theme.botBubble.toLowerCase() === theme.background.toLowerCase();
  const botBorder = bubbleBlendsIn
    ? shift(theme.botBubble, 0.12, darkSurface ? "light" : "dark")
    : "transparent";

  return {
    "--cf-bg": theme.background,
    "--cf-surface": theme.surface,
    "--cf-text": theme.text,
    "--cf-muted": shift(theme.text, 0.4, darkSurface ? "dark" : "light"),
    "--cf-accent": theme.accent,
    "--cf-accent-text": inkFor(theme.accent, theme.accentText),
    "--cf-bot-bubble": theme.botBubble,
    "--cf-bot-bubble-text": contrast(theme.botBubble, theme.text) >= AA_BODY ? theme.text : readableInk(theme.botBubble),
    "--cf-bot-bubble-border": botBorder,
    "--cf-user-bubble": theme.userBubble,
    "--cf-user-bubble-text": inkFor(theme.userBubble, theme.userBubbleText),
    "--cf-composer-bg": theme.surface,
    /*
     * Outcome colour, which the palette does not supply.
     *
     * A theme names one accent, and "this went through" cannot borrow it: on a
     * form whose accent is red a green receipt is the only thing that reads as
     * a receipt, and on a form whose accent is green a red refusal is the only
     * thing that reads as a refusal. So these two are fixed hues, lightened for
     * a dark page and darkened for a light one, which is the whole of what a
     * theme can legitimately change about them. Used at low opacity for fills —
     * see the return-visit chip — so they sit on any background the author picks.
     */
    "--cf-success": darkSurface ? "oklch(0.8 0.15 155)" : "oklch(0.52 0.13 152)",
    "--cf-warning": darkSurface ? "oklch(0.84 0.14 80)" : "oklch(0.56 0.13 62)",
    "--cf-chip-bg": theme.surface,
    "--cf-chip-border": shift(theme.text, 0.82, darkSurface ? "dark" : "light"),
    /*
     * A fill for a panel that holds other controls — one entry of a repeating
     * group, say. It cannot be the surface, because the inputs inside it are
     * already the surface and a card the same colour as its contents is not a
     * card. So it is the surface nudged a few percent the other way: enough to
     * read as a container on both a white page and a near-black one, not enough
     * to become a second background the author never chose.
     */
    "--cf-sunken": shift(theme.surface, 0.045, darkSurface ? "light" : "dark"),
    "--cf-radius": RADIUS_PX[theme.radius],
    fontFamily: `${theme.fontBody}, ui-sans-serif, system-ui, sans-serif`,
    "--cf-font-heading": `${theme.fontHeading}, ${theme.fontBody}, ui-sans-serif, sans-serif`,
  } as CSSProperties;
}

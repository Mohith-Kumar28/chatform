import type { CSSProperties } from "react";
import { RATING_RAMP } from "./rating-ramp";
import { contrast, isDarkColor, readableInk, shiftColor, THEME_DEFAULT_INK, type ThemeDoc } from "@repo/form-schema";

// Moved to the shared package (the API derives palettes too); re-exported for existing imports.
export { contrast, isDarkColor, readableInk };
import {
  PatternDef,
  patternImage,
  patternSize,
  patternWeight,
  resolvePattern,
  rgbaFromHex,
  shapeLayer,
} from "@/lib/background-patterns";
import { fontStack } from "@/lib/theme-fonts";

/**
 * Maps a form's ThemeDoc onto the scoped `--cf-*` variables the chat surface
 * consumes.
 *
 * This function is the "preview ≡ production" contract: the builder's live
 * preview and the hosted `/f/[slug]` runtime both render through it, so a form
 * cannot look one way in the builder and another way to a respondent. Change
 * it once and both move together — never fork it.
 */

/** Cards and the answer box. Capped short of a pill, which a tall box cannot wear. */
const CARD_RADIUS: Record<ThemeDoc["radius"], string> = { none: "0px", sm: "6px", md: "12px", lg: "16px", full: "24px" };
/** Chips and buttons: one line tall, so Large and Pill are both fully round, as they always were. */
const CONTROL_RADIUS: Record<ThemeDoc["radius"], string> = { none: "0px", sm: "6px", md: "10px", lg: "9999px", full: "9999px" };

const AA_BODY = 4.5;

export const RADIUS_PX: Record<ThemeDoc["radius"], string> = {
  none: "0px",
  sm: "6px",
  md: "12px",
  lg: "18px",
  full: "9999px",
};

/**
 * Ink for a fill, honouring a deliberate choice and rescuing everything else.
 *
 * A stored value still equal to the schema default means nobody picked it, so
 * it derives — which is what fixes forms saved before this existed, with no
 * migration and no re-save. A value someone did pick survives if it is legible
 * on the fill it now sits on, and is overridden if it is not: a theme cannot be
 * edited into a state where the answer is unreadable.
 */
/**
 * The label on a filled button: send, book, pay, submit.
 *
 * Not `inkFor`'s maximum-contrast rule. That picks whichever of dark and
 * light wins by any margin, so a mid-tone action colour (a gold, a teal) got
 * a black label that read as heavy and wrong on it. A button label is short,
 * bold UI text, so light is preferred whenever it clears 2.8:1: just under
 * the 3:1 UI bar, which is where a gold like #B8902A sits, and white on it
 * reads plainly at button size. A colour the author picked is kept down to 2.5:1: it is their
 * brand's button, and a label that clears that is still read at a glance.
 */
function buttonInk(fill: string, stored: string): string {
  const light = shiftColor(fill, 0.96, "light");
  if (stored.trim().toLowerCase() === THEME_DEFAULT_INK.toLowerCase()) {
    return contrast(fill, light) >= 2.8 ? light : readableInk(fill);
  }
  return contrast(fill, stored) >= 2.5 ? stored : readableInk(fill);
}

function inkFor(fill: string, stored: string): string {
  if (stored.trim().toLowerCase() === THEME_DEFAULT_INK.toLowerCase()) return readableInk(fill);
  return contrast(fill, stored) >= AA_BODY ? stored : readableInk(fill);
}

/**
 * The ink the background tile is drawn in, and how strongly.
 *
 * The accent, because the pattern has to read as part of the form somebody
 * designed rather than as chrome we added. Two things override that:
 *
 *   - an accent that does not stand clear of the page at all (a near-white
 *     accent on white) would draw nothing, so the text colour takes over;
 *   - a dark page needs a little more alpha than a light one. Low-alpha ink
 *     over a dark fill loses contrast faster than the same ink over a light
 *     one, and 3% on near-black is indistinguishable from no pattern.
 *
 * How strongly is `patternAlpha`'s question, and the answer depends on the
 * ink: a fixed 8% made a dark accent's pattern the loudest thing on the page.
 */
export function patternInk(theme: ThemeDoc, pattern: PatternDef): string {
  const usable = contrast(theme.background, theme.accent) >= 1.3;
  const ink = theme.backgroundPatternColor || (usable ? theme.accent : theme.text);
  return rgbaFromHex(ink, patternAlpha(theme.background, ink, patternWeight(pattern) * patternOpacity(theme)));
}

/**
 * How much alpha a tile gets, so that it looks equally faint in any colour.
 *
 * A fixed alpha is not a fixed strength. 8% of a pale orange on white is a
 * whisper; 8% of navy or black on the same page is a drawn grid, because what
 * the eye sees is the ink's contrast with the page times its alpha. Dark
 * accents made the pattern loud enough to be the first thing anyone noticed.
 *
 * So the alpha is divided by the square root of that contrast (the square root
 * because perceived lightness is itself roughly a root of luminance), which
 * keeps an orange accent near 5% and brings navy or black down to about 1.5%.
 * The clamp keeps a low-contrast ink from spending more than 6% and a
 * high-contrast one from vanishing entirely. `strength` scales the whole
 * thing: the tile's `weight`, and anything that wants it quieter still.
 */
/** Where the Opacity box starts: the quiet texture every form already had. */
export const DEFAULT_PATTERN_OPACITY = 25;

/**
 * The author's Opacity setting as a multiplier on that quiet texture: 1 at the
 * default 25%, about 2.8 at 50% and 8 at 100%. Curved rather than linear
 * because a sparse tile (scattered dots) at four times the quiet level was
 * still hard to find, and 100% has to mean plainly there. 100% used to mean
 * the quiet texture itself, which left no way to make a pattern visible.
 */
export function patternOpacity(theme: Pick<ThemeDoc, "backgroundPatternOpacity">): number {
  return ((theme.backgroundPatternOpacity ?? DEFAULT_PATTERN_OPACITY) / DEFAULT_PATTERN_OPACITY) ** 1.5;
}

export function patternAlpha(background: string, ink: string, strength = 1): number {
  const dark = isDarkColor(background);
  const lift = Math.sqrt(Math.max(contrast(background, ink) - 1, 0.25));
  const alpha = Math.min(0.06, Math.max(0.012, (dark ? 0.08 : 0.07) / lift)) * strength;
  return Number(Math.min(0.6, alpha).toFixed(4));
}

/**
 * The status tokens (`--destructive`, `--success` and their soft pairs), with
 * the values globals.css gives `:root` and `.dark`. Set on the chat surface so
 * `text-destructive` and the payment receipt read the form's side.
 */
const STATUS_LIGHT = {
  "--destructive": "oklch(0.585 0.215 27)",
  "--destructive-foreground": "oklch(0.995 0 0)",
  "--destructive-soft": "oklch(0.955 0.028 25)",
  "--destructive-soft-foreground": "oklch(0.42 0.17 27)",
  "--success": "oklch(0.63 0.165 152)",
  "--success-foreground": "oklch(0.995 0 0)",
  "--success-soft": "oklch(0.955 0.035 152)",
  "--success-soft-foreground": "oklch(0.38 0.11 152)",
};
const STATUS_DARK = {
  "--destructive": "oklch(0.65 0.2 25)",
  "--destructive-foreground": "oklch(0.98 0 0)",
  "--destructive-soft": "oklch(0.3 0.06 25)",
  "--destructive-soft-foreground": "oklch(0.88 0.09 25)",
  "--success": "oklch(0.7 0.15 152)",
  "--success-foreground": "oklch(0.19 0.02 60)",
  "--success-soft": "oklch(0.29 0.05 152)",
  "--success-soft-foreground": "oklch(0.87 0.09 152)",
};

/**
 * A theme whose text can be read, whatever colours it was given.
 *
 * Everything in the chat that is not a bubble inherits `text`: the form's name
 * and progress in the header, the answer chips, the composer. A theme that
 * pairs a dark background with dark text (a dark colour picked on its own, an
 * AI-made theme, an old theme after the defaults moved) put that header in
 * near-black on deep violet, where nobody could read it.
 *
 * So text that does not reach body contrast against the background is swapped
 * for the readable ink of that background. Surfaces follow: if the chips and
 * the composer are still a light fill under what is now light ink, they become
 * the background lifted a step, so every piece of text keeps its contrast on
 * whatever sits behind it. A theme that was already readable is returned as is.
 */
export function readableTheme(theme: ThemeDoc): ThemeDoc {
  if (contrast(theme.background, theme.text) >= AA_BODY) return theme;
  const text = readableInk(theme.background);
  if (contrast(theme.surface, text) >= AA_BODY) return { ...theme, text };
  const dark = isDarkColor(theme.background);
  return { ...theme, text, surface: shiftColor(theme.background, 0.14, dark ? "light" : "dark") };
}

/**
 * @param seed the form's slug, which is what decides its tile while
 *   `theme.backgroundPattern` is `auto`. Omitted only where there is no form —
 *   the marketing demo — and the surface then paints the flat background it
 *   always did unless the theme names a tile outright.
 */
/**
 * The shape's ink: the primary colour (the text colour when that is too pale
 * to see), at a soft fixed strength. A shape is one large quiet form, not a
 * texture, so it does not follow the tile's opacity setting.
 */
export function shapeInk(theme: ThemeDoc): string {
  const usable = contrast(theme.background, theme.accent) >= 1.3;
  return rgbaFromHex(usable ? theme.accent : theme.text, isDarkColor(theme.background) ? 0.2 : 0.14);
}

export function chatThemeVars(themeIn: ThemeDoc, seed?: string | null): CSSProperties {
  const theme = readableTheme(themeIn);
  const darkSurface = isDarkColor(theme.background);

  /*
   * The author's choice, resolved against the slug. `undefined` on a theme that
   * predates the field resolves to `auto`, so an existing form keeps the tile
   * it has always had.
   */
  const tile = resolvePattern(theme.backgroundPattern, seed);

  // The bot bubble needs a border only when it would otherwise be invisible
  // against the page. This used to be a hardcoded comparison against the
  // literal default hex, which broke for every custom theme.
  const bubbleBlendsIn = theme.botBubble.toLowerCase() === theme.background.toLowerCase();
  const botBorder = bubbleBlendsIn
    ? shiftColor(theme.botBubble, 0.12, darkSurface ? "light" : "dark")
    : "transparent";

  return {
    /*
     * The form decides light or dark for everything inside it, not the
     * viewer's device. The page's own class follows the device (and the
     * author's dashboard setting), so without this a light form on a dark
     * phone got dark native pickers and autofill, and a dark form on a light
     * one got light ones.
     */
    colorScheme: darkSurface ? "dark" : "light",
    // The app's status colours the chat borrows (an error line, a paid
    // receipt), pinned to the form's side rather than the page's.
    ...(darkSurface ? STATUS_DARK : STATUS_LIGHT),
    "--cf-bg": theme.background,
    "--cf-surface": theme.surface,
    "--cf-text": theme.text,
    "--cf-muted": shiftColor(theme.text, 0.4, darkSurface ? "dark" : "light"),
    "--cf-accent": theme.accent,
    "--cf-accent-text": buttonInk(theme.accent, theme.accentText),
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
    /*
      The rating faces in the bug-report panel. Fixed hues for the same reason
      as the two above — a sentiment scale borrowed from the author's accent
      would make "terrible" the brand colour on half the forms — stepped for the
      form's own background rather than the viewer's system theme.
    */
    ...Object.fromEntries(
      (darkSurface ? RATING_RAMP.dark : RATING_RAMP.light).map((c, i) => [`--cf-rating-${i + 1}`, c]),
    ),
    "--cf-chip-bg": theme.surface,
    "--cf-chip-border": shiftColor(theme.text, 0.82, darkSurface ? "dark" : "light"),
    /*
     * A fill for a panel that holds other controls — one entry of a repeating
     * group, say. It cannot be the surface, because the inputs inside it are
     * already the surface and a card the same colour as its contents is not a
     * card. So it is the surface nudged a few percent the other way: enough to
     * read as a container on both a white page and a near-black one, not enough
     * to become a second background the author never chose.
     */
    "--cf-sunken": shiftColor(theme.surface, 0.045, darkSurface ? "light" : "dark"),
    "--cf-radius": RADIUS_PX[theme.radius],
    // The Corners setting reached the bubbles and nothing else: chips, buttons,
    // the answer box and the cards were all hard-coded round, so "Square" left
    // most of the chat exactly as it was. These two carry it the rest of the way.
    "--cf-radius-card": CARD_RADIUS[theme.radius],
    "--cf-radius-control": CONTROL_RADIUS[theme.radius],
    /*
     * The background tile, as two variables `.chat-surface` paints.
     *
     * It lives here rather than in each surface because this function is the
     * "preview ≡ production" contract: the hosted page, the builder's question
     * preview and the embed preview all theme through it, so none of them can
     * end up with a different tile — or no tile — from the one a respondent
     * sees. `none` is a valid `background-image`, which is what lets the
     * seedless case fall through to a flat fill with no branch in the CSS.
     */
    ...backgroundLayers(theme, tile),
    /*
     * Stacks rather than bare names: quoted, pointed at the bundled `next/font`
     * faces where the theme names one of those, and falling back by the
     * face's own category. The families themselves are fetched by
     * `useThemeFonts`, which every surface calling this also calls.
     */
    fontFamily: fontStack(theme.fontBody),
    "--cf-font-heading": fontStack(theme.fontHeading, theme.fontBody),
  } as CSSProperties;
}

/**
 * The background as layers `.chat-surface` paints: the shape on top, then the
 * tile. With no shape it is the tile alone, exactly as before the shape existed.
 */
function backgroundLayers(theme: ThemeDoc, tile: PatternDef | undefined | null): Record<string, string> {
  const tileImage = tile ? patternImage(tile, patternInk(theme, tile)) : "none";
  const tileSize = tile ? patternSize(tile) : "auto";
  const shape = shapeLayer(theme.backgroundShape, shapeInk(theme));
  if (!shape) return { "--cf-pattern": tileImage, "--cf-pattern-size": tileSize };
  return {
    "--cf-pattern": `${shape.image}, ${tileImage}`,
    "--cf-pattern-size": `${shape.size}, ${tileSize}`,
    "--cf-pattern-repeat": "no-repeat, repeat",
    "--cf-pattern-position": `${shape.position}, 0 0`,
  };
}

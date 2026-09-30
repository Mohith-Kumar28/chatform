import { cssColorToHex } from "./palette";
import type { ThemeDoc } from "./settings";
import { FORM_THEMES, formTheme, type ThemeStyleProps, type ThemeStyles } from "./tweakcn";

/**
 * Putting a tweakcn theme (`./tweakcn`) on a form, and keeping the form's own
 * colour fields in step with it.
 *
 * The theme's tokens are what the form renders (`themeTokenVars`). The colour
 * fields are a summary of the side on show, in hex, for everything that reads
 * a form's colours without the tokens: the dashboard card, the API, contrast
 * checks, the builder AI.
 */

export { FORM_THEMES, formTheme };

/** tweakcn's radius (a CSS length) as the nearest Corners step. */
function radiusStep(radius: string): ThemeDoc["radius"] {
  const n = parseFloat(radius);
  const rem = Number.isNaN(n) ? 0.5 : radius.trim().endsWith("px") ? n / 16 : n;
  if (rem <= 0.05) return "none";
  if (rem < 0.4) return "sm";
  if (rem < 0.7) return "md";
  if (rem < 1.2) return "lg";
  return "full";
}

/** The first family of a CSS font list, unquoted: "Plus Jakarta Sans, sans-serif" is "Plus Jakarta Sans". */
function firstFamily(stack: string): string | null {
  const first = stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  if (!first || /^(ui-|system-ui|-apple-system|sans-serif|serif|monospace)/.test(first)) return null;
  return first;
}

/** The colour fields for one side of a theme's tokens. */
function colorsFrom(tokens: ThemeStyleProps, fallback: ThemeDoc) {
  const hex = (key: keyof ThemeStyleProps, prev: string) => cssColorToHex(tokens[key] ?? "") ?? prev;
  return {
    background: hex("background", fallback.background),
    surface: hex("card", fallback.surface),
    text: hex("foreground", fallback.text),
    accent: hex("primary", fallback.accent),
    accentText: hex("primary-foreground", fallback.accentText),
    botBubble: hex("card", fallback.botBubble),
    userBubble: hex("primary", fallback.userBubble),
    userBubbleText: hex("primary-foreground", fallback.userBubbleText),
  };
}

/** The colour fields set to the given side of the form's theme, if it has one. */
export function withThemeSide(theme: ThemeDoc, dark: boolean): ThemeDoc {
  const styles = theme.styles as ThemeStyles | undefined;
  if (!styles) return theme;
  return { ...theme, ...colorsFrom(dark ? styles.dark : styles.light, theme) };
}

/**
 * The form with a theme on it: every token copied, fonts and corners from the
 * theme, and the colour fields set to the side the form shows (dark when its
 * appearance is Dark, else light; Auto stores light and `resolveScheme`
 * swaps). Background shapes stay on if they were on; otherwise the theme
 * shows flat, the way tweakcn draws it. An unknown id changes nothing.
 */
export function applyFormTheme(theme: ThemeDoc, id: string): ThemeDoc {
  const t = formTheme(id);
  if (!t) return theme;
  const light = t.styles.light;
  const font = firstFamily(light["font-sans"]);
  const next: ThemeDoc = {
    ...theme,
    themeId: t.id,
    styles: { light: { ...t.styles.light }, dark: { ...t.styles.dark } },
    radius: radiusStep(light.radius),
    fontHeading: font ?? "Inter",
    fontBody: font ?? "Inter",
    ...(backgroundDecorOn(theme) ? {} : { backgroundPattern: "none", backgroundShape: undefined }),
  };
  return withThemeSide(next, theme.colorScheme === "dark");
}

/** The theme a form is on, or undefined for hand-picked colours. */
export function matchFormTheme(theme: ThemeDoc): string | undefined {
  return theme.styles && theme.themeId && formTheme(theme.themeId) ? theme.themeId : undefined;
}

/** The form's colours taken off its theme: what editing a colour by hand does. */
export function withoutFormTheme(theme: ThemeDoc): ThemeDoc {
  if (!theme.styles && !theme.themeId) return theme;
  return { ...theme, styles: undefined, themeId: undefined };
}

/** Whether the form shows its background shapes: the pattern and the large shape, one switch. */
export function backgroundDecorOn(theme: Pick<ThemeDoc, "backgroundPattern" | "backgroundShape">): boolean {
  return theme.backgroundPattern !== "none" && !!theme.backgroundShape;
}

/**
 * The font the form's theme sets, while it is on one. A theme's own font is
 * part of the theme, not a custom font: picking Notebook sets its handwriting
 * face on every plan, and only a font chosen by hand needs Custom fonts.
 */
export function themeFont(theme: ThemeDoc): string | null {
  const styles = theme.styles as ThemeStyles | undefined;
  return styles ? firstFamily(styles.light["font-sans"] ?? "") ?? "Inter" : null;
}

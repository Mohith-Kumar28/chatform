import type { CSSProperties } from "react";
import type { ThemeDoc } from "@repo/form-schema";

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
    "--cf-accent-text": theme.accentText,
    "--cf-bot-bubble": theme.botBubble,
    "--cf-bot-bubble-text": theme.text,
    "--cf-bot-bubble-border": botBorder,
    "--cf-user-bubble": theme.userBubble,
    "--cf-user-bubble-text": theme.userBubbleText,
    "--cf-composer-bg": theme.surface,
    "--cf-chip-bg": theme.surface,
    "--cf-chip-border": shift(theme.text, 0.82, darkSurface ? "dark" : "light"),
    "--cf-radius": RADIUS_PX[theme.radius],
    fontFamily: `${theme.fontBody}, ui-sans-serif, system-ui, sans-serif`,
    "--cf-font-heading": `${theme.fontHeading}, ${theme.fontBody}, ui-sans-serif, sans-serif`,
  } as CSSProperties;
}

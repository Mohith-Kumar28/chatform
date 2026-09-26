import { useEffect } from "react";
import type { ThemeDoc } from "@repo/form-schema";
import { GOOGLE_FONTS, type GoogleFontCategory, type GoogleFontRow } from "@/lib/google-fonts.generated";

/**
 * Turning a theme's font names into fonts that actually load.
 *
 * `fontHeading` and `fontBody` used to be written straight into
 * `font-family`, and nothing ever fetched them. So a form set in "Poppins"
 * showed Poppins only to a respondent who happened to have it installed, and
 * even the defaults missed: the app's Inter and Bricolage are registered by
 * `next/font` under hashed family names, so the literal "Inter" resolved to
 * the system face on most machines.
 *
 * Now a family from the catalogue is fetched from Google Fonts, the two the
 * app already bundles are pointed at their `next/font` variables, and a name
 * that is in neither is still honoured as a local font, as before.
 */

const BY_NAME = new Map<string, GoogleFontRow>(GOOGLE_FONTS.map((row) => [row[0].toLowerCase(), row]));

export function findFont(family: string): GoogleFontRow | undefined {
  return BY_NAME.get(family.trim().toLowerCase());
}

/** Loaded with the app shell already, so they never cost a second request. */
const BUNDLED: Record<string, string> = {
  inter: "var(--font-inter)",
  "bricolage grotesque": "var(--font-bricolage)",
};

const GENERIC: Record<GoogleFontCategory, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  display: "ui-sans-serif, system-ui, sans-serif",
  handwriting: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, monospace",
};

/** Quoted, so a family like "Source Sans 3" or "M PLUS 1p" parses as one name. */
const quote = (family: string) => `"${family.replace(/["\\]/g, "")}"`;

/** The names one theme font answers to: the bundled variable if there is one, then the family itself. */
function faces(family: string): string[] {
  const name = family.trim();
  if (!name) return [];
  const bundled = BUNDLED[name.toLowerCase()];
  return bundled ? [bundled, quote(name)] : [quote(name)];
}

/**
 * A `font-family` value for a theme font, fallbacks included.
 *
 * `fallback` is a second theme font to try first (the body face, under a
 * heading). The generic tail follows the face's own category, so a serif form
 * waiting on its font shows Georgia rather than jumping from sans to serif
 * when it arrives.
 */
export function fontStack(family: string, fallback?: string): string {
  const generic = GENERIC[findFont(family)?.[1] ?? "sans"];
  return [...faces(family), ...(fallback ? faces(fallback) : []), generic].join(", ");
}

/**
 * The Google Fonts stylesheet a theme needs, or null when both faces are
 * bundled or unknown.
 *
 * Weights are only the ones a family ships, out of the four the chat surface
 * sets: css2 refuses the whole request if any family is asked for a weight it
 * lacks, so one display face with a single cut would otherwise take the body
 * font down with it.
 */
export function themeFontsHref(theme: Pick<ThemeDoc, "fontHeading" | "fontBody">): string | null {
  const families = new Map<string, GoogleFontRow>();
  for (const name of [theme.fontHeading, theme.fontBody]) {
    const row = findFont(name);
    if (row && !BUNDLED[row[0].toLowerCase()]) families.set(row[0], row);
  }
  if (families.size === 0) return null;
  const params = [...families.values()].map(([family, , weights]) => {
    const f = family.replace(/ /g, "+");
    return weights.length > 1 || weights[0] !== 400 ? `family=${f}:wght@${weights.join(";")}` : `family=${f}`;
  });
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}

/** A tiny stylesheet with only the glyphs of the family's own name, for the picker's previews. */
export function fontPreviewHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&text=${encodeURIComponent(family)}&display=swap`;
}

/** Append a stylesheet to `<head>` once. Never removed: a font the page has already paid for is free to keep. */
export function ensureStylesheet(href: string): void {
  if (typeof document === "undefined") return;
  if (document.head.querySelector(`link[rel="stylesheet"][href="${CSS.escape(href)}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Loads a theme's fonts wherever the theme is rendered: the hosted form, the
 * builder's preview and the embed preview. Beside `chatThemeVars` in every
 * surface, for the same preview-equals-production reason.
 */
export function useThemeFonts(theme: Pick<ThemeDoc, "fontHeading" | "fontBody">): void {
  const href = themeFontsHref(theme);
  useEffect(() => {
    if (href) ensureStylesheet(href);
  }, [href]);
}

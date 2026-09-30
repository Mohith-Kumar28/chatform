import { settingDef, type FormDoc, type SettingChange, type ThemeDoc } from "@repo/form-schema";
import { isDarkTheme, themeFromAccent } from "@/lib/brand-palette";

/**
 * Settings an AI proposal changes, applied the way the builder's own controls
 * would apply them.
 *
 * The server checked every value and every plan gate before this sees them;
 * what it cannot do is the colour maths, which lives here. Changing the primary
 * colour or the background in the Design sheet recomputes the rest of the
 * palette, so an AI edit that did less would leave white bubbles on a navy page.
 *
 * Applied to the document as it is now, not copied from the proposal's, so a
 * setting the author changed while the AI was thinking survives.
 */

/** A palette colour the AI set, or that follows from one it set. */
const PALETTE_KEYS = [
  "background",
  "surface",
  "text",
  "accent",
  "accentText",
  "botBubble",
  "userBubble",
  "userBubbleText",
] as const satisfies readonly (keyof ThemeDoc)[];

type PaletteKey = (typeof PALETTE_KEYS)[number];

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  background: "Background",
  surface: "Card",
  text: "Text",
  accent: "Primary colour",
  accentText: "Button text",
  botBubble: "Agent bubble",
  userBubble: "Their bubble",
  userBubbleText: "Their bubble text",
};

/** Write `changes` onto `doc` in place. Locked changes are skipped. */
export function applySettingChanges(doc: FormDoc, changes: readonly SettingChange[]): void {
  const live = changes.filter((c) => !c.locked);
  for (const c of live) settingDef(c.key)?.set(doc, c.after);

  if (!live.some((c) => settingDef(c.key)?.derives === "palette")) return;
  const palette = themeFromAccent(doc.theme.accent, { dark: isDarkTheme(doc.theme) });
  if (!palette) return;
  const explicit = new Set(live.map((c) => c.key));
  for (const key of PALETTE_KEYS) {
    if (!explicit.has(`theme.${key}`)) doc.theme[key] = palette[key];
  }
}

/** The colours that move with the ones the AI named, for the card to show. */
export function followingColours(before: FormDoc, changes: readonly SettingChange[]) {
  const after = structuredClone(before);
  applySettingChanges(after, changes);
  const explicit = new Set(changes.map((c) => c.key));
  return PALETTE_KEYS.filter((k) => !explicit.has(`theme.${k}`) && before.theme[k] !== after.theme[k]).map((k) => ({
    key: k,
    label: PALETTE_LABELS[k],
    before: before.theme[k],
    after: after.theme[k],
  }));
}

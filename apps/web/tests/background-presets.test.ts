import { describe, expect, it } from "vitest";
import { applyBackgroundPreset, BACKGROUND_PRESETS, resolveScheme, ThemeDoc } from "@repo/form-schema";
import { PATTERNS } from "../src/lib/background-patterns";
import { readableTheme } from "../src/lib/chat-theme";

/**
 * The presets live in the shared package, which does not import the tiles, so
 * this is where a preset naming a tile we do not ship would be caught.
 */
describe("background presets on the web", () => {
  it.each(BACKGROUND_PRESETS.map((p) => [p.id, p] as const))("%s names a real tile and needs no rescue", (_id, p) => {
    expect(PATTERNS.map((t) => t.id)).toContain(p.pattern);
    // Correct on its own: the runtime's safety net leaves every colour as the preset set it.
    const theme = resolveScheme(applyBackgroundPreset(ThemeDoc.parse({}), p.id), false);
    const safe = readableTheme(theme);
    for (const k of Object.keys(p.colors) as (keyof typeof p.colors)[]) expect(safe[k]).toBe(p.colors[k]);
  });
});

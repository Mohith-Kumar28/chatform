import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESETS,
  BACKGROUND_PRESET_KEY,
  FormDoc,
  ThemeDoc,
  applyBackgroundPreset,
  applySettingOps,
  contrast,
  isDarkColor,
  leadFormFixture,
  matchBackgroundPreset,
  settingDef,
} from "../src/index.js";

const base = () => FormDoc.parse(structuredClone(leadFormFixture));

describe("background presets", () => {
  it("has unique ids and names, each described", () => {
    const ids = BACKGROUND_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(BACKGROUND_PRESETS.map((p) => p.name)).size).toBe(ids.length);
    expect(BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(BACKGROUND_PRESETS.length).toBeLessThanOrEqual(16);
    for (const p of BACKGROUND_PRESETS) {
      expect(p.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.description).not.toMatch(/\u2014/);
    }
  });

  it.each(BACKGROUND_PRESETS.map((p) => [p.id, p] as const))("%s is readable on its own", (_id, p) => {
    const c = p.colors;
    expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.text, c.botBubble)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.userBubbleText, c.userBubble)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5);
    // The bubble has to read as a bubble, and dark ones are marked dark.
    expect(contrast(c.userBubble, c.background)).toBeGreaterThanOrEqual(1.2);
    expect(isDarkColor(c.background)).toBe(p.dark);
  });

  it.each(BACKGROUND_PRESETS.map((p) => [p.id, p] as const))("%s survives the theme schema", (_id, p) => {
    const theme = applyBackgroundPreset(ThemeDoc.parse({}), p.id);
    const reread = ThemeDoc.parse(JSON.parse(JSON.stringify(theme)));
    expect(reread).toEqual(JSON.parse(JSON.stringify(theme)));
    expect(matchBackgroundPreset(reread)?.id).toBe(p.id);
  });

  it("applies every value, and leaves fonts, corners and opacity alone", () => {
    const start = { ...ThemeDoc.parse({}), radius: "sm" as const, fontBody: "Lora", backgroundPatternOpacity: 60, backgroundPatternColor: "#ff0000" };
    const navy = BACKGROUND_PRESETS.find((p) => p.id === "deep-navy")!;
    const t = applyBackgroundPreset(start, "deep-navy");
    expect(t).toMatchObject({ ...navy.colors, backgroundPattern: navy.pattern, colorScheme: "dark", radius: "sm", fontBody: "Lora", backgroundPatternOpacity: 60 });
    expect(t.backgroundPatternColor).toBeUndefined();
    expect(applyBackgroundPreset({ ...start, colorScheme: "auto" }, "peach-linen").colorScheme).toBe("auto");
    expect(applyBackgroundPreset(t, "peach-linen").colorScheme).toBe("light");
    expect(applyBackgroundPreset(start, "no-such-preset")).toBe(start);
  });

  it("stops matching once a colour is changed by hand", () => {
    const t = applyBackgroundPreset(ThemeDoc.parse({}), "mint-fresh");
    expect(matchBackgroundPreset(t)?.id).toBe("mint-fresh");
    expect(matchBackgroundPreset({ ...t, accent: "#000000" })).toBeUndefined();
    expect(matchBackgroundPreset(ThemeDoc.parse({}))).toBeUndefined();
  });

  it("is a setting the AI applies exactly as the builder does", () => {
    const d = settingDef(BACKGROUND_PRESET_KEY)!;
    expect(d.options?.map((o) => o.value)).toEqual(BACKGROUND_PRESETS.map((p) => p.id));
    for (const p of BACKGROUND_PRESETS) expect(d.hint).toContain(p.description);

    const doc = base();
    const { doc: next, changes } = applySettingOps(doc, [{ key: BACKGROUND_PRESET_KEY, value: "Sage garden" }]);
    expect(changes.map((c) => c.after)).toEqual(["sage-garden"]);
    expect(next.theme).toEqual(applyBackgroundPreset(doc.theme, "sage-garden"));
  });

  it("keeps a colour named beside a preset, whichever came first", () => {
    const { doc } = applySettingOps(base(), [
      { key: "theme.accent", value: "#1E40AF" },
      { key: BACKGROUND_PRESET_KEY, value: "rose-petal" },
    ]);
    const rose = BACKGROUND_PRESETS.find((p) => p.id === "rose-petal")!;
    expect(doc.theme.accent).toBe("#1E40AF");
    // Nothing else is recomputed from the new accent: the rest is the preset's.
    expect(doc.theme.background).toBe(rose.colors.background);
    expect(doc.theme.userBubble).toBe(rose.colors.userBubble);
  });
});

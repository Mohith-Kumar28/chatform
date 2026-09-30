import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESET_KEY,
  FORM_THEMES,
  FormDoc,
  ThemeDoc,
  applyFormTheme,
  applySettingOps,
  cssColorToHex,
  leadFormFixture,
  matchFormTheme,
  resolveScheme,
  settingDef,
  themeTokenVars,
  withAppearance,
} from "../src/index.js";

const base = () => FormDoc.parse(structuredClone(leadFormFixture));

describe("form themes (tweakcn)", () => {
  it("are tweakcn's 43, Default first, each named and described", () => {
    expect(FORM_THEMES).toHaveLength(43);
    expect(FORM_THEMES[0]!.id).toBe("default");
    expect(new Set(FORM_THEMES.map((t) => t.id)).size).toBe(43);
    for (const t of FORM_THEMES) {
      expect(t.name.length).toBeGreaterThan(1);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.description).not.toMatch(/—/);
    }
  });

  it.each(FORM_THEMES.map((t) => [t.id] as const))("%s parses as a stored theme and every colour converts", (id) => {
    const theme = ThemeDoc.parse(applyFormTheme(ThemeDoc.parse({}), id));
    expect(theme.themeId).toBe(id);
    expect(theme.styles).toBeDefined();
    for (const side of ["light", "dark"] as const) {
      for (const key of ["background", "foreground", "card", "primary", "primary-foreground", "border"]) {
        expect(cssColorToHex(theme.styles![side][key]!), `${id} ${side} ${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("copies the tokens and fills the colour fields from the side on show", () => {
    const theme = applyFormTheme(ThemeDoc.parse({}), "modern-minimal");
    expect(theme.styles!.light.primary).toBe("#3b82f6");
    expect(theme.accent).toBe("#3b82f6");
    expect(theme.background).toBe("#ffffff");
    expect(theme.fontBody).toBe("Inter");
    expect(matchFormTheme(theme)).toBe("modern-minimal");
    // Dark uses the theme's own dark side, not a mirror of the accent.
    expect(resolveScheme({ ...theme, colorScheme: "dark" }, false).background).toBe("#171717");
    expect(resolveScheme({ ...theme, colorScheme: "auto" }, true).background).toBe("#171717");
    expect(withAppearance(theme, "dark").background).toBe("#171717");
  });

  it("writes every token as a CSS variable, colours from the mode and common keys from light", () => {
    const vars = themeTokenVars(FORM_THEMES.find((t) => t.id === "neo-brutalism")!.styles, "dark");
    expect(vars["--background"]).toBe("#000000");
    expect(vars["--radius"]).toBe("0px");
    expect(vars["--shadow-sm"]).toContain("color-mix");
  });

  it("drops the theme when a colour is named by hand, and not when the theme is picked", () => {
    const picked = applySettingOps(base(), [{ key: BACKGROUND_PRESET_KEY, value: "bubblegum" }]).doc;
    expect(picked.theme.themeId).toBe("bubblegum");
    const recoloured = applySettingOps(picked, [{ key: "theme.accent", value: "#0f766e" }]).doc;
    expect(recoloured.theme.styles).toBeUndefined();
    expect(recoloured.theme.accent).toBe("#0f766e");
  });

  it("turns the background shapes on and off as one switch", () => {
    const on = applySettingOps(base(), [{ key: "theme.backgroundDecor", value: "true" }]).doc;
    expect(on.theme.backgroundPattern).toBe("auto");
    expect(on.theme.backgroundShape).toBe("auto");
    const off = applySettingOps(on, [{ key: "theme.backgroundDecor", value: "false" }]).doc;
    expect(off.theme.backgroundPattern).toBe("none");
    expect(off.theme.backgroundShape).toBeUndefined();
  });
});

describe("a theme's own font", () => {
  it("is part of the theme, while a font picked by hand still needs Custom fonts", () => {
    const doc = applySettingOps(base(), [{ key: BACKGROUND_PRESET_KEY, value: "notebook" }]).doc;
    expect(doc.theme.fontBody).toBe("Architects Daughter");
    const body = settingDef("theme.fontBody")!;
    expect(body.gate!("Architects Daughter", doc)).toBeNull();
    expect(body.gate!("Lobster", doc)).toBe("custom_fonts");
  });
});

describe("cssColorToHex", () => {
  it("reads hex, rgb, hsl and oklch", () => {
    expect(cssColorToHex("#ABC")).toBe("#aabbcc");
    expect(cssColorToHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(cssColorToHex("hsl(0 0% 100%)")).toBe("#ffffff");
    expect(cssColorToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(cssColorToHex("oklch(0 0 0)")).toBe("#000000");
    expect(cssColorToHex("not a colour")).toBeNull();
  });
});

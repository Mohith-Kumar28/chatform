import { describe, expect, it } from "vitest";
import { appearanceOf, bubbleHue, contrast, isDarkTheme, resolveScheme, ThemeDoc, withAppearance } from "../src";

/**
 * A form's light or dark appearance. The rule is shared by every surface that
 * themes a form and by the server, so it is tested once, here: what each
 * choice renders, what the Appearance control shows, and what switching does
 * to the stored colours.
 */

const light = ThemeDoc.parse({});
const midnight = ThemeDoc.parse({ background: "#14111c", accent: "#B48DF4", botBubble: "#221d30", userBubble: "#453862", text: "#f5f3f8" });

describe("resolveScheme", () => {
  it("leaves a light form exactly as it is, on any device", () => {
    expect(resolveScheme(light, false)).toBe(light);
    expect(resolveScheme(light, true)).toBe(light);
  });

  it("keeps a form that is already dark, whatever its setting", () => {
    // Built on the dark preset before this setting existed: still `light`.
    expect(resolveScheme(midnight, false)).toBe(midnight);
    expect(resolveScheme({ ...midnight, colorScheme: "dark" }, false)).toEqual({ ...midnight, colorScheme: "dark" });
  });

  it("mirrors a light palette when the form is dark, keeping its accent's hue and readable ink", () => {
    const dark = resolveScheme({ ...light, colorScheme: "dark" }, false);
    expect(isDarkTheme(dark)).toBe(true);
    expect(contrast(dark.text, dark.background)).toBeGreaterThan(10);
    expect(contrast(dark.botBubble, dark.background)).toBeGreaterThan(1);
  });

  it("follows the device on auto", () => {
    const auto = { ...light, colorScheme: "auto" as const };
    expect(resolveScheme(auto, false)).toBe(auto);
    expect(isDarkTheme(resolveScheme(auto, true))).toBe(true);
  });
});

describe("the Appearance control", () => {
  it("shows what the form is", () => {
    expect(appearanceOf(light)).toBe("light");
    expect(appearanceOf(midnight)).toBe("dark");
    expect(appearanceOf({ ...light, colorScheme: "dark" })).toBe("dark");
    expect(appearanceOf({ ...midnight, colorScheme: "auto" })).toBe("auto");
  });

  it("rebuilds the stored colours when the side changes, and nothing else", () => {
    const dark = withAppearance(light, "dark");
    expect([dark.colorScheme, isDarkTheme(dark)]).toEqual(["dark", true]);
    expect(dark.radius).toBe(light.radius);
    // Auto stores the light colours; the device's dark is derived from them.
    const auto = withAppearance(dark, "auto");
    expect([auto.colorScheme, isDarkTheme(auto)]).toEqual(["auto", false]);
    // Same side: the colours are left alone.
    expect(withAppearance(light, "auto").background).toBe(light.background);
  });

  it("brings a colourful bubble back from dark, not a grey one", () => {
    const back = withAppearance(withAppearance(light, "dark"), "light");
    expect(bubbleHue(back.userBubble)).not.toBeNull();
  });
});

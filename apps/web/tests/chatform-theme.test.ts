import { describe, expect, it } from "vitest";
import { applyFormTheme, ThemeDoc } from "@repo/form-schema";
import { chatThemeVars } from "../src/lib/chat-theme";

const layers = (theme: ThemeDoc) => String((chatThemeVars(theme, "demo") as Record<string, unknown>)["--cf-pattern"]);

describe("the Chatform theme is drawn plain", () => {
  it("has no pattern and only a faint shape, even on a form that stored the old tile", () => {
    const img = layers(ThemeDoc.parse({ backgroundPattern: "auto" }));
    expect(img.match(/url\(/g)?.length).toBe(1);
    expect(img).toContain("0.045");
  });

  it("draws nothing once Background shapes is off", () => {
    expect(layers(ThemeDoc.parse({ backgroundPattern: "none" }))).toBe("none");
  });

  it("leaves every other theme's pattern and shape as they are", () => {
    const img = layers(applyFormTheme(ThemeDoc.parse({ backgroundPattern: "auto", backgroundShape: "auto" }), "bubblegum"));
    expect(img.match(/url\(/g)?.length).toBe(2);
  });
});

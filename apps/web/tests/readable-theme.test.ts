import { describe, expect, it } from "vitest";
import { ThemeDoc, contrast } from "@repo/form-schema";
import { readableTheme } from "@/lib/chat-theme";

describe("readableTheme", () => {
  it("leaves a readable theme alone", () => {
    const t = ThemeDoc.parse({});
    expect(readableTheme(t)).toBe(t);
  });

  it("lifts dark text off a dark background, and the surfaces with it", () => {
    // Deep violet with the default near-black text and white surfaces: the
    // header on a template's live try was unreadable.
    const t = ThemeDoc.parse({ background: "#5b2ee6" });
    const r = readableTheme(t);
    expect(contrast(r.background, r.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.surface, r.text)).toBeGreaterThanOrEqual(4.5);
  });

  it("works on a near-black background too", () => {
    const r = readableTheme(ThemeDoc.parse({ background: "#0b0b12", text: "#1c1917" }));
    expect(contrast(r.background, r.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.surface, r.text)).toBeGreaterThanOrEqual(4.5);
  });
});

import { describe, expect, it } from "vitest";
import { ThemeDoc } from "@repo/form-schema";
import { chatThemeVars, contrast, readableInk } from "../src/lib/chat-theme";

/**
 * A respondent's answer has to be readable in whatever palette the form was
 * given, and the palette is chosen by whoever built the form — with a native
 * colour picker, in a panel, without a contrast meter.
 *
 * So the ink is not a choice. `chatThemeVars` derives it from the fill behind
 * it, and these are the cases that used to ship: a mid-tone violet bubble with
 * near-black ink at 4.7:1, and an accent anyone could drag to the dark end of
 * the picker while its ink stayed put.
 */

/** WCAG AA for body text. */
const AA = 4.5;

const vars = (theme: Partial<ThemeDoc>) =>
  chatThemeVars(ThemeDoc.parse(theme)) as unknown as Record<string, string>;

describe("readableInk", () => {
  it("clears AA on fills at every lightness", () => {
    for (const fill of ["#ffffff", "#C9AEEE", "#9D6EE4", "#FD6F29", "#0369A1", "#453862", "#000000"]) {
      expect(contrast(fill, readableInk(fill))).toBeGreaterThanOrEqual(AA);
    }
  });

  it("tints the ink with the fill rather than stamping black or white on it", () => {
    // Not `#000000`: a violet bubble gets violet-black ink.
    expect(readableInk("#C9AEEE")).not.toBe("#000000");
    expect(readableInk("#C9AEEE")).not.toBe("#ffffff");
  });
});

describe("chatThemeVars", () => {
  it("derives ink for the shipped defaults", () => {
    const v = vars({});
    expect(contrast(v["--cf-accent"], v["--cf-accent-text"])).toBeGreaterThanOrEqual(AA);
    expect(contrast(v["--cf-user-bubble"], v["--cf-user-bubble-text"])).toBeGreaterThanOrEqual(AA);
    expect(contrast(v["--cf-bot-bubble"], v["--cf-bot-bubble-text"])).toBeGreaterThanOrEqual(AA);
  });

  it("rescues a saved theme whose ink is still the default sentinel", () => {
    // The palette every form carried before the derivation existed: mid-tone
    // violet under `#201a16`, at 4.74:1 — passing on paper, muddy on screen.
    const v = vars({ userBubble: "#9D6EE4", userBubbleText: "#201a16" });
    expect(v["--cf-user-bubble-text"]).not.toBe("#201a16");
    expect(contrast("#9D6EE4", v["--cf-user-bubble-text"])).toBeGreaterThan(4.74);
  });

  it("keeps a hand-picked ink that reads, and overrides one that does not", () => {
    expect(vars({ userBubble: "#1c1917", userBubbleText: "#fef3c7" })["--cf-user-bubble-text"]).toBe(
      "#fef3c7",
    );

    const broken = vars({ accent: "#1c1917", accentText: "#000000" });
    expect(broken["--cf-accent-text"]).not.toBe("#000000");
    expect(contrast("#1c1917", broken["--cf-accent-text"])).toBeGreaterThanOrEqual(AA);
  });

  it("keeps a dark theme's page text on a dark agent bubble legible", () => {
    // `--cf-bot-bubble-text` used to be `theme.text` unconditionally, which is
    // fine until someone darkens the bubble and leaves the text alone.
    const v = vars({ background: "#0c0a09", botBubble: "#1c1917", text: "#1c1917" });
    expect(contrast("#1c1917", v["--cf-bot-bubble-text"])).toBeGreaterThanOrEqual(AA);
  });
});

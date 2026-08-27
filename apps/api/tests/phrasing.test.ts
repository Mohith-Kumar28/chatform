import { describe, expect, it } from "vitest";
import { Block } from "@repo/form-schema";
import { asideText, clarifyText, looksLikeQuestion } from "../src/lib/phrasing.js";

const block = (over: Record<string, unknown> = {}) =>
  Block.parse({
    id: "blk_00000001",
    ref: "q_phone",
    type: "phone",
    title: "What is your WhatsApp / phone number?",
    required: true,
    ...over,
  });

describe("looksLikeQuestion", () => {
  it("recognises what a respondent actually types", () => {
    for (const t of [
      "Why do you want my phone number?",
      "why do you want this",
      "What is this for?",
      "Do I have to give this",
      "can i skip",
      "  How is this used?  ",
    ]) {
      expect(looksLikeQuestion(t), t).toBe(true);
    }
  });

  it("does not treat an answer as a question", () => {
    for (const t of ["+919876543210", "mohith", "Android", "4", "iOS (iPhone)", ""]) {
      expect(looksLikeQuestion(t), t).toBe(false);
    }
  });
});

describe("asideText", () => {
  it("prefers the answer the form's author already wrote", () => {
    const withHint = block({
      agentHints: { askStyle: undefined, whyWeAsk: "We only use it to text you your beta invite.", examples: [] },
    });
    expect(asideText(withHint)).toBe("We only use it to text you your beta invite.");
  });

  it("never answers a question with a validation hint", () => {
    // The reported failure: "Why do you want my phone number?" came back as
    // "Sorry — Please enter a valid phone number with country code."
    const scolding = clarifyText(block(), "Please enter a valid phone number with country code.", 1);
    const aside = asideText(block());
    expect(scolding).toContain("Please enter a valid phone number");
    expect(aside).not.toContain("Please enter a valid phone number");
    expect(aside).toContain("can't answer that one here");
  });

  it("says whether the question can be skipped, truthfully", () => {
    expect(asideText(block({ required: true }))).toContain("needed to finish");
    expect(asideText(block({ required: false }))).toContain("skip");
  });
});

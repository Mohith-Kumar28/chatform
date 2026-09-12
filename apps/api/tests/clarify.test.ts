import { describe, it, expect } from "vitest";
import { z } from "zod";
import { CLARIFY_SYSTEM, withClarifications } from "../src/lib/agent-prompts.js";
import { ClarifyQuestions } from "../src/lib/ai.js";

/**
 * The clarifier's job is mostly to say nothing, and its schema has to stay
 * small enough that the tier it runs on never refuses it. Neither of those is
 * testable against a live model in CI, so what is asserted here is the shape
 * and the folding — the parts that are ours rather than the model's.
 */

describe("the clarify schema", () => {
  it("caps the questions, because three is already too many", () => {
    const tooMany = {
      questions: Array.from({ length: 5 }, (_, i) => ({
        question: `Q${i}`, why: "", kind: "text" as const, options: [],
      })),
    };
    expect(ClarifyQuestions.safeParse(tooMany).success).toBe(false);
  });

  it("stays flat and tiny, like everything else this tier is sent", () => {
    // The budget that refused GenerationDraft applies here too, and this runs
    // on the cheapest model in the stack.
    const json = JSON.stringify(z.toJSONSchema(ClarifyQuestions));
    expect(json).not.toContain("anyOf");
    expect(json).not.toContain("$ref");
    expect(json.length).toBeLessThan(1500);
  });

  it("accepts the two shapes the author can answer in", () => {
    const ok = {
      questions: [
        { question: "Which plans?", why: "so I know where to branch", kind: "choice" as const, options: ["Free", "Pro"] },
        { question: "What's your UPI id?", why: "", kind: "text" as const, options: [] },
      ],
    };
    expect(ClarifyQuestions.safeParse(ok).success).toBe(true);
  });
});

describe("the clarify prompt", () => {
  it("tells the model who it is talking to", () => {
    // The failure this was written against: the model drafting questions FOR
    // the form ("What is the primary reason for your message?") instead of
    // asking the author about it.
    expect(CLARIFY_SYSTEM).toContain("NOT TO THE PEOPLE WHO WILL FILL IT IN");
  });

  it("names the destinations it may not invent", () => {
    // A UPI id and a booking link cannot be guessed, and a form without them
    // is a dead end the respondent discovers.
    expect(CLARIFY_SYSTEM).toContain("UPI");
    expect(CLARIFY_SYSTEM).toContain("booking link");
  });

  it("forbids the questions authors change for themselves", () => {
    expect(CLARIFY_SYSTEM).toContain("Tone, wording, length, colours");
  });
});

describe("withClarifications", () => {
  it("leaves a prompt alone when nothing was asked", () => {
    expect(withClarifications("A waitlist", [])).toBe("A waitlist");
  });

  it("ignores questions the author skipped", () => {
    // Every question is skippable, and a blank answer is a skip rather than an
    // answer of "".
    expect(withClarifications("A waitlist", [{ question: "Which plans?", answer: "  " }])).toBe("A waitlist");
  });

  it("appends what they said without rewriting what they wrote", () => {
    const out = withClarifications("Take a ticket payment", [
      { question: "What's your UPI id?", answer: "acme@okhdfcbank" },
      { question: "Skipped one", answer: "" },
    ]);
    // Their own sentence survives first and intact.
    expect(out.startsWith("Take a ticket payment")).toBe(true);
    expect(out).toContain("acme@okhdfcbank");
    expect(out).toContain("What's your UPI id?");
    expect(out).not.toContain("Skipped one");
  });
});

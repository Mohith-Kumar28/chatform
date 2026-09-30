import { beforeAll, describe, it, expect } from "vitest";
import { z } from "zod";
import { answeredRequest, buildEditPrompt, CLARIFY_SYSTEM, clarifySystem, questionManifest, withClarifications } from "../src/lib/agent-prompts.js";
import { FormDoc } from "@repo/form-schema";
import { applySchema, fetchApi, minimalDoc, seedTenant } from "./helpers.js";
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
        { question: "Which plans?", why: "so I know where to branch", kind: "choice" as const, options: ["Free", "Pro"], multiple: true },
        { question: "What's your UPI id?", why: "", kind: "text" as const, options: [], multiple: false },
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

describe("asking before an edit", () => {
  it("shares the rules with a new form and opens on the form that exists", () => {
    const edit = clarifySystem("edit");
    expect(clarifySystem("create")).toBe(CLARIFY_SYSTEM);
    expect(edit).toContain("already exists");
    expect(edit).toContain("Never ask what the form or the conversation already answers");
    // The same rules body: who fills it in, what not to ask, the three-question cap.
    for (const rule of ["NOT TO THE PEOPLE WHO WILL FILL IT IN", "Tone, wording, length, colours", "At most three questions"]) {
      expect(edit).toContain(rule);
      expect(CLARIFY_SYSTEM).toContain(rule);
    }
  });

  it("checks the request against the same manifest the edit is written against", () => {
    const doc = FormDoc.parse(minimalDoc("clar"));
    expect(buildEditPrompt(doc, "anything")).toContain(questionManifest(doc));
  });

  it("keeps what the author answered in the thread, one line each, and nothing they skipped", () => {
    expect(answeredRequest("route by plan", [{ question: "Which plans?", answer: " Free and Pro " }, { question: "Skipped?", answer: "" }])).toBe(
      "route by plan\n\nWhich plans? → Free and Pro",
    );
    expect(answeredRequest("route by plan", [])).toBe("route by plan");
  });
});

describe("POST /api/ai/clarify-form with a form", () => {
  beforeAll(applySchema);

  it("asks only about a form the caller can open", async () => {
    const me = await seedTenant(`clarme${Date.now()}`);
    const other = await seedTenant(`clarot${Date.now()}`);
    const ask = (formId: string) =>
      fetchApi("/api/ai/clarify-form", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: me.cookie },
        body: JSON.stringify({ prompt: "route by plan", formId }),
      });
    expect((await ask(other.formId)).status).toBe(404);
    const mine = await ask(me.formId);
    expect(mine.status).toBe(200);
    // No model in tests: nothing to ask, and the edit goes ahead.
    expect(await mine.json()).toEqual({ questions: [] });
  });
});

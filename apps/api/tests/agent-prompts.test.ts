import { describe, it, expect } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { buildStablePrefix, buildTurnSuffix } from "../src/lib/agent-prompts.js";

const base = {
  title: "Waitlist",
  blocks: [
    { id: "blk_aaa1", ref: "welcome", type: "welcome", title: "Hi" },
    { id: "blk_bbb1", ref: "q_email", type: "email", title: "What's your email?", required: true },
  ],
  endings: [{ id: "end_aaa1", ref: "end_thanks", title: "Thanks" }],
};

const docWith = (agent: Record<string, unknown>) => FormDoc.parse({ ...base, settings: { agent } });

describe("verbatim question mode", () => {
  it("by default the agent is told to ask in its own words", () => {
    const doc = docWith({});
    expect(doc.settings.agent.rephraseQuestions).toBe(true);
    const prefix = buildStablePrefix(doc);
    expect(prefix).toContain("in your own words");
    const suffix = buildTurnSuffix(doc, doc.blocks[1]!, 0);
    expect(suffix).toContain("ask ref=q_email");
  });

  it("with rephrasing off it is told not to ask at all", () => {
    const doc = docWith({ rephraseQuestions: false });
    const prefix = buildStablePrefix(doc);
    expect(prefix).toContain("Do NOT reword the questions");
    // The FSM emits the question itself, so the model must not preview it.
    const suffix = buildTurnSuffix(doc, doc.blocks[1]!, 0);
    expect(suffix).toContain("Do NOT ask the next question");
    expect(suffix).not.toContain("ask ref=q_email");
  });
});

describe("knowledge base and guardrails reach the prompt", () => {
  it("inlines knowledge entries", () => {
    const doc = docWith({
      knowledge: [{ id: "kb_0001", title: "Pricing", body: "Pro is $29/month." }],
    });
    expect(buildStablePrefix(doc)).toContain("Pro is $29/month.");
  });

  it("uses the refusal line when off-topic answering is disabled", () => {
    const doc = docWith({
      guardrails: { answerOffTopic: false, refusalMessage: "I can't help with that." },
    });
    const prefix = buildStablePrefix(doc);
    expect(prefix).toContain("I can't help with that.");
    expect(prefix).not.toContain("answer briefly from general knowledge");
  });

  it("lists forbidden topics", () => {
    const doc = docWith({ guardrails: { forbiddenTopics: ["competitor pricing"] } });
    expect(buildStablePrefix(doc)).toContain("competitor pricing");
  });
});

describe("per-block agent hints", () => {
  it("surface only for the current block", () => {
    const doc = FormDoc.parse({
      ...base,
      blocks: [
        base.blocks[0],
        {
          ...base.blocks[1],
          agentHints: { askStyle: "casually", whyWeAsk: "So we can email you", examples: ["a@b.com"] },
        },
      ],
    });
    const suffix = buildTurnSuffix(doc, doc.blocks[1]!, 0);
    expect(suffix).toContain("casually");
    expect(suffix).toContain("So we can email you");
    // The welcome block has no hints, so nothing leaks in for it.
    expect(buildTurnSuffix(doc, doc.blocks[0]!, 0)).not.toContain("casually");
  });
});

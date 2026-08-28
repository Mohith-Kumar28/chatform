import { describe, it, expect } from "vitest";
import { ADDABLE_BLOCK_TYPES, BLOCK_TYPES, FormDoc } from "@repo/form-schema";
import {
  buildEditPrompt,
  buildFlowGeneratorPrompt,
  buildStablePrefix,
  buildTurnSuffix,
} from "../src/lib/agent-prompts.js";

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

/**
 * The prompts are what the model is allowed to reach for.
 *
 * Both of them used to carry a hand-written list naming 16 of the 26 block
 * types, followed by "any other word is wrong, pick the closest type from the
 * list above". So a request to take a 499-rupee ticket over UPI produced a
 * short-text question titled "Payment Confirmation" — the model was not
 * ignoring the schema, it was obeying the prompt. These assert against
 * BLOCK_TYPES rather than a copy of it, so the next type added to the schema
 * fails here until it reaches the model.
 */
describe("every block type reaches the model", () => {
  const generator = buildFlowGeneratorPrompt("An event RSVP with a paid ticket", 6, null);
  const editor = buildEditPrompt(
    FormDoc.parse({
      schemaVersion: 1,
      title: "Event RSVP",
      blocks: [
        { id: "blk_w0000001", ref: "q_welcome", type: "welcome", title: "You're invited" },
        { id: "blk_n0000001", ref: "q_name", type: "short_text", title: "Your name?" },
      ],
      endings: [{ id: "end_00000001", ref: "end_thanks", title: "Thanks" }],
      logic: [],
      endingRules: [],
      variables: [],
      hiddenFields: [],
      settings: {},
      theme: {},
    }),
    "collect a 499 rupee ticket over UPI",
  );

  it("offers the generator every type", () => {
    for (const type of BLOCK_TYPES) {
      expect(generator, `generator prompt is missing "${type}"`).toContain(type);
    }
  });

  it("offers the editor every type it may add", () => {
    for (const type of ADDABLE_BLOCK_TYPES) {
      expect(editor, `edit prompt is missing "${type}"`).toContain(type);
    }
  });

  it("tells both how to configure the types that need setup", () => {
    // A type named but unconfigurable is no better than one left out: the
    // draft could not carry an amount or a UPI id, so the block could not be
    // built even when the model asked for it.
    for (const prompt of [generator, editor]) {
      expect(prompt).toContain("method=upi");
      expect(prompt).toContain("currency=");
      expect(prompt).toContain("url=<booking link>");
    }
  });
});

import { describe, it, expect } from "vitest";
import { ADDABLE_BLOCK_TYPES, BLOCK_TYPES, FormDoc } from "@repo/form-schema";
import {
  buildEditPrompt,
  buildFlowGeneratorPrompt,
  FORM_DESIGNER_SYSTEM,
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
  /*
   * The knowledge base is pointed at, not pasted in.
   *
   * These three assertions are the contract that keeps retrieval cheap: the
   * prefix must name the tool when there is knowledge, say nothing when there
   * is not, and never carry the material itself — the prompt is re-sent on
   * every turn of every session, and inlining is what capped the old knowledge
   * base at twenty thousand characters.
   */
  it("points at the retrieval tool when the form has knowledge", () => {
    const prefix = buildStablePrefix(docWith({}), { hasKnowledge: true });
    expect(prefix).toContain("answer_from_knowledge");
    expect(prefix).toContain("WHAT YOU KNOW");
  });

  it("says nothing about knowledge when the form has none", () => {
    const prefix = buildStablePrefix(docWith({}), { hasKnowledge: false });
    expect(prefix).not.toContain("WHAT YOU KNOW");
    expect(prefix).not.toContain("answer_from_knowledge");
  });

  /*
   * The regression these three exist for.
   *
   * When the knowledge base stopped being inlined, the prose around it still
   * described a world where it was. BOUNDARIES said "outside the material
   * above" — and with nothing above any more, the model read the set as empty,
   * decided a pricing question fell outside it, and took the licence that line
   * grants to answer from general knowledge. It never called the tool.
   *
   * It shipped, and the public demo told prospects our pricing did not exist.
   * Every downstream part was healthy: vectors indexed, namespaces matching,
   * entitlements resolving. Only the prompt was wrong, and nothing tested the
   * prompt for whether it still made the tool mandatory.
   */
  it("does not license answering from memory when the form has a knowledge base", () => {
    const prefix = buildStablePrefix(docWith({ guardrails: { answerOffTopic: true } }), { hasKnowledge: true });
    // The phrase that caused it. There is no "material above" any more.
    expect(prefix).not.toContain("outside the material above");
    // Any permission to use general knowledge must be conditional on the
    // lookup having already happened and come back empty.
    expect(prefix).toMatch(/Only once `answer_from_knowledge` has come back with nothing relevant/);
  });

  it("tells the agent it does not know the product from memory", () => {
    const prefix = buildStablePrefix(docWith({}), { hasKnowledge: true });
    expect(prefix).toContain("you cannot see it");
    expect(prefix).toMatch(/do NOT know this product's pricing/);
  });

  it("keeps the plain off-topic wording when there is no knowledge base", () => {
    // Without retrieval there is no lookup to insist on, and a form that
    // simply has no knowledge base must not tell the agent to call a tool that
    // will only ever come back empty.
    const prefix = buildStablePrefix(docWith({ guardrails: { answerOffTopic: true } }), { hasKnowledge: false });
    expect(prefix).toContain("answer briefly and honestly from general knowledge");
    expect(prefix).not.toContain("answer_from_knowledge");
  });

  it("still requires the lookup before refusing, when off-topic answering is off", () => {
    const prefix = buildStablePrefix(
      docWith({ guardrails: { answerOffTopic: false, refusalMessage: "Ask support." } }),
      { hasKnowledge: true },
    );
    expect(prefix).toContain("Ask support.");
    expect(prefix).toMatch(/Only once `answer_from_knowledge`/);
  });

  it("stays byte-identical across turns, whatever the knowledge base holds", () => {
    // The prefix is the cacheable half of the system prompt. If retrieved
    // passages ever get spliced back into it, this is what fails.
    const doc = docWith({});
    expect(buildStablePrefix(doc, { hasKnowledge: true })).toBe(buildStablePrefix(doc, { hasKnowledge: true }));
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

/**
 * How long the generated form is.
 *
 * `questionCount` was a required number defaulting to 6, and the dashboard has
 * never sent one — so "six questions" was not a fallback, it was the length of
 * every form the product had ever generated, however much detail the author
 * asked for. These pin the two halves of the fix: absent means the model
 * decides, and present means the author decided.
 */
describe("the generator sizes the form", () => {
  it("hands the decision to the model when no count was asked for", () => {
    const prompt = buildFlowGeneratorPrompt("A detailed waitlist with per-platform flows", undefined, null);
    expect(prompt).toContain("Decide how many questions this form needs");
    expect(prompt).not.toMatch(/Exactly \d+ answerable questions/);
  });

  it("obeys a count the author typed", () => {
    const prompt = buildFlowGeneratorPrompt("A short poll", 4, null);
    expect(prompt).toContain("Exactly 4 answerable questions");
  });

  it("does not offer the emptiness operators, which drafts only use as filler", () => {
    const prompt = buildFlowGeneratorPrompt("A waitlist", undefined, null);
    const ops = prompt.match(/"op": "<[^>]+>"/g) ?? [];
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) expect(op).not.toContain("is_empty");
  });

  it("carries the design doctrine in the system prompt, not the request", () => {
    // The doctrine is byte-identical on every call, so it belongs in front of
    // the provider's prompt cache rather than inside a prompt that changes.
    expect(FORM_DESIGNER_SYSTEM).toContain("BRANCHING");
    expect(FORM_DESIGNER_SYSTEM).toContain("ANTI-PATTERNS");
    expect(buildFlowGeneratorPrompt("A waitlist", undefined, null)).not.toContain("ANTI-PATTERNS");
  });
});

/**
 * "Make the team name unique" is a sentence about a question that already
 * exists, and the editor has to be able to hear it as one.
 */
describe("changing a question that is already in the form", () => {
  const doc = FormDoc.parse({
    schemaVersion: 1,
    title: "Hackathon",
    blocks: [
      { id: "blk_uq000001", ref: "q_welcome", type: "welcome", title: "Sign your team up" },
      { id: "blk_uq000002", ref: "q_team", type: "short_text", title: "Team name?" },
      { id: "blk_uq000003", ref: "q_lead", type: "email", title: "Captain's email?", unique: true },
    ],
    endings: [{ id: "end_uq000001", ref: "end_thanks", title: "You're in" }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });
  const prompt = buildEditPrompt(doc, "the team name has to be unique");

  it("offers updateBlocks as the way to say it", () => {
    // Without this the model's only legal move is `addBlocks`, and it answers
    // by adding a second team-name question with the flag on.
    expect(prompt).toContain("updateBlocks");
    expect(prompt).toContain("unique=true");
  });

  it("marks the questions that already refuse duplicates", () => {
    // So a request for something already true comes back as "it already is",
    // rather than as a change.
    expect(prompt).toContain("q_lead (email, unique)");
    expect(prompt).not.toContain("q_team (short_text, unique)");
  });
});


describe("outcomes that refuse the respondent", () => {
  it("teaches the designer what a screen-out is for, in the system prompt", () => {
    // In the system prompt rather than the request, so it is cached across
    // every generation and every edit — the same reason the branching doctrine
    // lives there.
    expect(FORM_DESIGNER_SYSTEM).toContain("SCREEN-OUT");
    expect(FORM_DESIGNER_SYSTEM).toContain("Registration Submitted Successfully");
    // The words that should make a model reach for one.
    for (const cue of ["mandatory", "requirement", "eligible", "only open to"]) {
      expect(FORM_DESIGNER_SYSTEM).toContain(cue);
    }
    // And the guard against the opposite failure.
    expect(FORM_DESIGNER_SYSTEM).toContain("a form whose only ending refuses is a form nobody can finish");
  });

  it("gives the generator the shape to express one", () => {
    const prompt = buildFlowGeneratorPrompt("a hackathon registration; teams must have 2-5 people", undefined);
    expect(prompt).toContain('"kind": "success" | "screen_out"');
    expect(prompt).toContain('"requirements"');
    // The worked example, which is what a model actually copies.
    expect(prompt).toContain("end_ineligible");
    expect(prompt).toContain("decline=true");
  });

  it("tells the generator that consent needs a flag before a refusal can route", () => {
    const prompt = buildFlowGeneratorPrompt("registration; agreeing to the code of conduct is mandatory", undefined);
    expect(prompt).toContain("decline=true to offer an explicit refusal");
  });

  const doc = FormDoc.parse({
    schemaVersion: 1,
    title: "Hackathon",
    blocks: [
      { id: "blk_so000001", ref: "q_welcome", type: "welcome", title: "Sign up" },
      { id: "blk_so000002", ref: "q_size", type: "number", title: "Team size?" },
    ],
    endings: [
      { id: "end_so000001", ref: "end_thanks", title: "You're in" },
      {
        id: "end_so000002",
        ref: "end_ineligible",
        title: "You can't submit this",
        kind: "screen_out",
        requirements: [{ id: "req_so000001", label: "A team of 2 to 5 people" }],
      },
    ],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });

  it("shows the editor which outcomes already refuse, and what they list", () => {
    // A bare list of refs was enough while every ending was a thank-you. Shown
    // only refs, a model asked to stop ineligible teams either adds a second
    // screen-out beside the one that is there, or aims the failing answer at a
    // success ending.
    const prompt = buildEditPrompt(doc, "stop teams bigger than five from submitting");
    expect(prompt).toContain("end_ineligible (SCREEN-OUT — refuses the respondent)");
    expect(prompt).toContain("end_thanks (success)");
    expect(prompt).toContain('requirements listed: "A team of 2 to 5 people"');
  });

  it("offers the editor endings as something an edit may change", () => {
    const prompt = buildEditPrompt(doc, "if they don't agree, don't let them submit");
    expect(prompt).toContain('"endings"');
    expect(prompt).toContain("if they say no, don't let them submit");
    expect(prompt).toContain("Never convert its only ending to a screen_out");
  });
});

describe("a consent the agent may be told about", () => {
  const consentDoc = (allowDecline: boolean) =>
    FormDoc.parse({
      ...base,
      blocks: [
        ...base.blocks,
        {
          id: "blk_cn000001",
          ref: "q_conduct",
          type: "legal_consent",
          title: "Code of conduct",
          consentText: "I agree.",
          allowDecline,
        },
      ],
      settings: {},
    });

  it("is told not to push, when declining is a real answer", () => {
    const doc = consentDoc(true);
    const suffix = buildTurnSuffix(doc, doc.blocks[2]!, 1);
    expect(suffix).toContain("equally real answers");
    expect(suffix).toContain("Never push them towards agreeing");
  });

  it("is told the form cannot continue, when it cannot", () => {
    // Otherwise a respondent who says no is cheerfully re-asked forever,
    // because the agent has no idea that no is not an answer here.
    const doc = consentDoc(false);
    const suffix = buildTurnSuffix(doc, doc.blocks[2]!, 1);
    expect(suffix).toContain("cannot continue without their agreement");
    expect(suffix).not.toContain("equally real answers");
  });
});

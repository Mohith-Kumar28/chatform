import { describe, expect, it } from "vitest";
import { FormDoc, type EvalState } from "@repo/form-schema";
import { buildAgentTools, nextStepAfter, resumeAfterChange, type ToolOutcome } from "../src/do/agent-tools.js";

/**
 * Which question the agent is told to ask next, once an answer is in.
 *
 * The agent records an answer and asks the next question in the same message,
 * and the only list of questions it has is in document order. On a branching
 * form that list is a lie: a real intake asked a 23-year-old "do you know
 * someone between 6 and 25 who would benefit?" — the question written directly
 * below the age one, and the one its own branch had just routed that answer
 * past. The FSM had gone to the right question; nobody had told the model.
 *
 * So these pin the branch through the tool result, which is the only channel
 * that can carry it: the routing depends on the value, and the value does not
 * exist until the turn is half over.
 */

const doc = FormDoc.parse({
  title: "Gandhari Vidya intake",
  blocks: [
    { id: "blk_aaaa01", ref: "q_age", type: "number", title: "What is the participant's age?", required: true, min: 1, max: 100 },
    {
      id: "blk_aaaa02",
      ref: "q_knows_referral",
      type: "yes_no",
      title: "Do you know someone between 6 and 25 who would benefit?",
      required: true,
    },
    { id: "blk_aaaa03", ref: "q_awareness", type: "short_text", title: "Have you tried this before?", required: true },
  ],
  endings: [{ id: "end_aaaa01", ref: "end_thanks", title: "Thanks" }],
  logic: [
    {
      id: "rl_aaaa01",
      action_kind: "goto",
      from: "q_age",
      target: "q_awareness",
      targetKind: "block",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_age" }, op: "gte", value: 6 }], groups: [] },
    },
    {
      id: "rl_aaaa02",
      action_kind: "goto",
      from: "q_age",
      target: "q_knows_referral",
      targetKind: "block",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_age" }, op: "lt", value: 6 }], groups: [] },
    },
  ],
});

const age = doc.blocks[0]!;
const empty = (): EvalState => ({ answers: {}, variables: {}, hidden: {} });

describe("nextStepAfter", () => {
  it("follows the branch the answer opens, not the document order", () => {
    expect(nextStepAfter(doc, age, empty(), 23)).toEqual({
      kind: "block",
      ref: "q_awareness",
      title: "Have you tried this before?",
    });
  });

  it("follows the other arm just as faithfully", () => {
    expect(nextStepAfter(doc, age, empty(), 5)).toMatchObject({ kind: "block", ref: "q_knows_referral" });
  });

  it("reports the ending when the answer finishes the form", () => {
    const last = doc.blocks[2]!;
    expect(nextStepAfter(doc, last, empty(), "no")).toEqual({ kind: "ending" });
  });

  it("promises nothing for a value the FSM would refuse", () => {
    // 200 is outside the block's max, so the turn ends in a retry on this same
    // question — there is no next one to name.
    expect(nextStepAfter(doc, age, empty(), 200)).toBeNull();
  });

  it("leaves the session's own state untouched", () => {
    const state = empty();
    nextStepAfter(doc, age, state, 23);
    expect(state.answers).toEqual({});
  });
});

function toolsFor(over: Partial<Parameters<typeof buildAgentTools>[0]> = {}) {
  const outcomes: ToolOutcome[] = [];
  const tools = buildAgentTools(
    {
      doc,
      currentBlock: age,
      nextAfter: (value?: unknown) => nextStepAfter(doc, age, empty(), value),
      clarifications: 0,
      ...over,
    },
    (o) => outcomes.push(o),
  );
  return { tools, outcomes };
}

const recordAnswer = async (tools: ReturnType<typeof toolsFor>["tools"], value: unknown) =>
  (await (
    tools.record_answer as { execute: (a: { ref: string; value: unknown }) => Promise<string> }
  ).execute({ ref: "q_age", value })) as string;

describe("record_answer names where the flow goes", () => {
  it("hands the model the branch target, by ref and by title", async () => {
    const { tools } = toolsFor();
    const out = await recordAnswer(tools, 23);
    expect(out).toContain("ref=q_awareness");
    expect(out).toContain("Have you tried this before?");
    // The question the old prompt would have reached for.
    expect(out).not.toContain("q_knows_referral");
  });

  it("says to stop when the answer was the last question", async () => {
    const last = doc.blocks[2]!;
    const { tools } = toolsFor({
      currentBlock: last,
      nextAfter: (value?: unknown) => nextStepAfter(doc, last, empty(), value),
    });
    const out = (await (
      tools.record_answer as { execute: (a: { ref: string; value: unknown }) => Promise<string> }
    ).execute({ ref: "q_awareness", value: "no" })) as string;
    expect(out).toContain("do NOT ask another");
  });

  it("tells a verbatim form's agent to ask nothing at all", async () => {
    // The FSM emits the question word for word right after the turn, so naming
    // it here would put it on screen twice, in two different sets of words.
    const { tools } = toolsFor({ verbatimQuestions: true });
    const out = await recordAnswer(tools, 23);
    expect(out).toContain("word for word");
    expect(out).not.toContain("ref=q_awareness");
  });

  it("refuses a value the question would refuse, instead of saying it was accepted", async () => {
    // Told "accepted", the model goes straight on to the next question; the DO
    // then refused the value and asked this one again underneath it.
    const { tools, outcomes } = toolsFor();
    const out = await recordAnswer(tools, 200);
    expect(out).toContain("Rejected");
    expect(out).toContain("Nothing was recorded");
    expect(outcomes.at(-1)).toMatchObject({ ok: false });
    expect(outcomes.at(-1)?.effect).toBeUndefined();
  });

  it("is not offered for a card the agent cannot write", () => {
    const card = FormDoc.parse({
      title: "Card",
      blocks: [
        { id: "blk_card0001", ref: "q_contact", type: "contact_info", title: "Your details", required: true, fields: ["first_name", "email"] },
      ],
      endings: [{ id: "end_card0001", ref: "end_thanks", title: "Thanks" }],
    });
    const tools = buildAgentTools(
      { doc: card, currentBlock: card.blocks[0]!, nextAfter: () => null, clarifications: 0 },
      () => {},
    );
    expect(tools.record_answer).toBeUndefined();
    expect(tools.clarify).toBeDefined();
  });

  it("still records the answer when there is no next question to name", async () => {
    const { tools, outcomes } = toolsFor({ nextAfter: () => null });
    await recordAnswer(tools, 23);
    expect(outcomes.at(-1)).toMatchObject({ ok: true, effect: { kind: "record", ref: "q_age", value: 23 } });
  });
});

describe("resuming after a changed answer", () => {
  // The dental-intake bug: the draft carried answers from an earlier visit, so
  // every question on the new branch already had one, and the walk went past
  // all of them to the ending.
  const flow = FormDoc.parse({
    title: "Branch",
    blocks: [
      { id: "blk_rs000001", ref: "q_reason", type: "short_text", title: "Why are you here?", required: true },
      { id: "blk_rs000002", ref: "q_pain", type: "short_text", title: "Where does it hurt?", required: true },
      { id: "blk_rs000003", ref: "q_dob", type: "short_text", title: "Date of birth?", required: true },
      { id: "blk_rs000004", ref: "q_ins", type: "short_text", title: "Insurance?", required: true },
    ],
    endings: [{ id: "end_rs000001", ref: "end_thanks", title: "Thanks" }],
  });
  const carried = (): EvalState => ({
    answers: { q_reason: "cavity", q_dob: "1990-01-01", q_ins: "Delta" },
    variables: {},
    hidden: {},
  });

  it("stops at the first question they have not been through in this conversation", () => {
    const next = resumeAfterChange(flow, carried(), "q_reason", new Set(["q_reason"]));
    expect(next).toMatchObject({ kind: "block", block: { ref: "q_pain" } });
  });

  it("never counts a carried answer as settled, however many there are", () => {
    const answered = { ...carried(), answers: { ...carried().answers, q_pain: "molar" } };
    // They went back from q_pain: q_dob and q_ins were never asked here.
    expect(resumeAfterChange(flow, answered, "q_reason", new Set(["q_reason", "q_pain"]))).toMatchObject({
      kind: "block",
      block: { ref: "q_dob" },
    });
  });

  it("still goes back to where they were when they had been through the rest", () => {
    const answered = { ...carried(), answers: { ...carried().answers, q_pain: "molar" } };
    const walked = new Set(["q_reason", "q_pain", "q_dob", "q_ins"]);
    expect(resumeAfterChange(flow, answered, "q_reason", walked)).toMatchObject({ kind: "ending" });
  });
});

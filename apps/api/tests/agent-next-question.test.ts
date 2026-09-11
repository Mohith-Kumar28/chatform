import { describe, expect, it } from "vitest";
import { FormDoc, type EvalState } from "@repo/form-schema";
import { buildAgentTools, nextStepAfter, type ToolOutcome } from "../src/do/agent-tools.js";

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

  it("still records the answer when there is no next question to name", async () => {
    const { tools, outcomes } = toolsFor({ nextAfter: () => null });
    await recordAnswer(tools, 23);
    expect(outcomes.at(-1)).toMatchObject({ ok: true, effect: { kind: "record", ref: "q_age", value: 23 } });
  });
});

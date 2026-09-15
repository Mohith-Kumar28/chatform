import { describe, expect, it } from "vitest";
import { FormDoc, type EvalState } from "@repo/form-schema";
import { buildAgentTools, nextStepAfter, revisionOf, type ToolOutcome } from "../src/do/agent-tools.js";

/**
 * Changing an earlier answer by asking the agent for it.
 *
 * A respondent three questions into a hackathon registration typed "i want to
 * change my problem statement". Every verb the agent had named the question on
 * screen, so there was nothing it could do but ask for the team leader's name
 * again. The pencil could always reopen an earlier answer; these pin the same
 * edit reached in words, and the fences it shares with the pencil.
 */

const doc = FormDoc.parse({
  title: "Campus Catalyst",
  blocks: [
    { id: "blk_chg00001", ref: "q_team", type: "short_text", title: "Team Name", required: true },
    { id: "blk_chg00002", ref: "q_ps", type: "short_text", title: "Problem Statement ID & Title", required: true },
    {
      id: "blk_chg00003",
      ref: "q_track",
      type: "single_select",
      title: "Track",
      required: true,
      options: [
        { id: "opt_sw", label: "Software" },
        { id: "opt_hw", label: "Hardware" },
      ],
    },
    { id: "blk_chg00004", ref: "q_kit", type: "short_text", title: "Which hardware kit?", required: true },
    { id: "blk_chg00005", ref: "q_leader", type: "short_text", title: "Team Leader's Full Name", required: true },
    { id: "blk_chg00006", ref: "q_age", type: "number", title: "Leader's age", required: true, min: 16, max: 40 },
  ],
  endings: [{ id: "end_chg00001", ref: "end_thanks", title: "Thanks" }],
  logic: [
    {
      id: "rl_chg00001",
      action_kind: "goto",
      from: "q_track",
      target: "q_leader",
      targetKind: "block",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_track" }, op: "eq", value: "opt_sw" }], groups: [] },
    },
  ],
});

const byRef = (ref: string) => doc.blocks.find((b) => b.ref === ref)!;

/** Three answers in, software track, sitting on the leader's name. */
const midway = (): EvalState => ({
  answers: { q_team: "DCODES", q_ps: "26013", q_track: "opt_sw" },
  variables: {},
  hidden: {},
});

describe("revisionOf", () => {
  it("reopens an earlier answer on the walked path", () => {
    expect(revisionOf(doc, midway(), "q_leader", "q_ps")).toMatchObject({ ok: true, next: null });
  });

  it("lands back on the question they were on when the new value changes nothing downstream", () => {
    expect(revisionOf(doc, midway(), "q_leader", "q_ps", "25001 - Smart Irrigation")).toMatchObject({
      ok: true,
      next: { kind: "block", ref: "q_leader" },
    });
  });

  it("follows a branch the new value opens", () => {
    // Hardware routes through the kit question they skipped on the software arm.
    expect(revisionOf(doc, midway(), "q_leader", "q_track", "opt_hw")).toMatchObject({
      ok: true,
      next: { kind: "block", ref: "q_kit" },
    });
  });

  it("refuses the question on screen — that is record_answer", () => {
    expect(revisionOf(doc, midway(), "q_leader", "q_leader")).toMatchObject({ ok: false });
  });

  it("refuses a question they have not reached", () => {
    const out = revisionOf(doc, midway(), "q_leader", "q_age");
    expect(out.ok).toBe(false);
  });

  it("refuses a question on a branch they did not take", () => {
    expect(revisionOf(doc, midway(), "q_leader", "q_kit").ok).toBe(false);
  });

  it("refuses an unknown ref", () => {
    expect(revisionOf(doc, midway(), "q_leader", "q_nope").ok).toBe(false);
  });

  it("refuses a value the question would not accept", () => {
    const state: EvalState = { ...midway(), answers: { ...midway().answers, q_leader: "Asha", q_age: 20 } };
    expect(revisionOf(doc, state, null, "q_age", 200).ok).toBe(false);
  });

  it("leaves the session's own state untouched", () => {
    const state = midway();
    revisionOf(doc, state, "q_leader", "q_track", "opt_hw");
    expect(state.answers.q_track).toBe("opt_sw");
  });
});

function toolsFor(over: Partial<Parameters<typeof buildAgentTools>[0]> = {}) {
  const outcomes: ToolOutcome[] = [];
  const current = byRef("q_leader");
  const tools = buildAgentTools(
    {
      doc,
      currentBlock: current,
      nextAfter: (value?: unknown) => nextStepAfter(doc, current, midway(), value),
      revise: (ref, value) => revisionOf(doc, midway(), current.ref, ref, value),
      clarifications: 0,
      ...over,
    },
    (o) => outcomes.push(o),
  );
  return { tools, outcomes };
}

type Exec<A> = { execute: (a: A) => Promise<string> };
const change = (tools: ReturnType<typeof toolsFor>["tools"], args: { ref: string; value?: unknown }) =>
  (tools.change_earlier_answer as Exec<typeof args>).execute(args);

describe("change_earlier_answer", () => {
  it("is not offered when the session gives no way to revise", () => {
    const { tools } = toolsFor({ revise: undefined });
    expect(tools.change_earlier_answer).toBeUndefined();
  });

  it("reopens the question and tells the agent to ask it, not the current one", async () => {
    const { tools, outcomes } = toolsFor();
    const out = await change(tools, { ref: "q_ps" });
    expect(outcomes.at(-1)).toMatchObject({ ok: true, effect: { kind: "revise", ref: "q_ps" } });
    expect(outcomes.at(-1)!.effect).not.toHaveProperty("value");
    expect(out).toContain("Problem Statement ID & Title");
    expect(out).toContain(`Do not ask "Team Leader's Full Name" now`);
  });

  it("carries a new value through, and names where the flow goes after", async () => {
    const { tools, outcomes } = toolsFor();
    const out = await change(tools, { ref: "q_ps", value: "25001" });
    expect(outcomes.at(-1)).toMatchObject({ ok: true, effect: { kind: "revise", ref: "q_ps", value: "25001" } });
    expect(out).toContain("ref=q_leader");
  });

  it("passes a refusal back to the model with no effect", async () => {
    const { tools, outcomes } = toolsFor();
    const out = await change(tools, { ref: "q_age" });
    expect(out).toMatch(/^Rejected/);
    expect(outcomes.at(-1)).toMatchObject({ ok: false });
    expect(outcomes.at(-1)!.effect).toBeUndefined();
  });

  it("takes one change per turn", async () => {
    const { tools } = toolsFor();
    await change(tools, { ref: "q_ps" });
    expect(await change(tools, { ref: "q_team" })).toMatch(/^Rejected/);
  });

  it("will not record the old question's answer after reopening another", async () => {
    // Applied in that order, the answer would walk the cursor off the reopened
    // question before the respondent could reply to it.
    const { tools, outcomes } = toolsFor();
    await change(tools, { ref: "q_ps" });
    const out = await (tools.record_answer as Exec<{ ref: string; value: unknown }>).execute({
      ref: "q_leader",
      value: "Dheeraj",
    });
    expect(out).toMatch(/^Rejected/);
    expect(outcomes.at(-1)).toMatchObject({ name: "record_answer", ok: false });
  });

  it("reopens the question when the new value does not fit, and says why", async () => {
    // Refused outright, the agent asked for a valid value while the controls of
    // the question on screen stayed put underneath it.
    const answered: EvalState = { ...midway(), answers: { ...midway().answers, q_leader: "Asha" } };
    const age = byRef("q_age");
    const { tools, outcomes } = toolsFor({
      currentBlock: age,
      revise: (ref, value) => revisionOf(doc, { ...answered, answers: { ...answered.answers, q_age: 20 } }, "q_email", ref, value),
    });
    const out = await change(tools, { ref: "q_age", value: 200 });
    expect(outcomes.at(-1)).toMatchObject({ ok: true, effect: { kind: "revise", ref: "q_age" } });
    expect(outcomes.at(-1)!.effect).not.toHaveProperty("value");
    expect(out).toContain("Not changed");
  });

  it("does not let the agent claim it saved an answer to a question not yet asked", async () => {
    const { tools } = toolsFor();
    expect(await change(tools, { ref: "q_age", value: 22 })).toContain("NOTHING was saved");
  });

  it("on a verbatim form, tells the agent not to ask the question itself", async () => {
    const { tools } = toolsFor({ verbatimQuestions: true });
    const out = await change(tools, { ref: "q_ps" });
    expect(out).toContain("word for word");
  });
});

describe("answering a reopened question", () => {
  it("points the agent back to where they were, not to the next question in the list", () => {
    // Reopened the problem statement while sitting on the leader's name.
    const ps = byRef("q_ps");
    expect(nextStepAfter(doc, ps, midway(), "25104", { resume: true })).toMatchObject({ kind: "block", ref: "q_leader" });
    // Without it, the question after the problem statement — the bug.
    expect(nextStepAfter(doc, ps, midway(), "25104")).toMatchObject({ kind: "block", ref: "q_track" });
  });
});

describe("on the review step", () => {
  it("offers only the tools that need no question on screen", () => {
    const { tools } = toolsFor({ currentBlock: null, nextAfter: () => null });
    expect(Object.keys(tools).sort()).toEqual(["change_earlier_answer"]);
  });

  it("reopens an answer and says the review comes back after", async () => {
    const answered: EvalState = {
      answers: { q_team: "DCODES", q_ps: "26013", q_track: "opt_sw", q_leader: "Asha", q_age: 20 },
      variables: {},
      hidden: {},
    };
    const { tools, outcomes } = toolsFor({
      currentBlock: null,
      nextAfter: () => null,
      revise: (ref, value) => revisionOf(doc, answered, null, ref, value),
    });
    const out = await change(tools, { ref: "q_team" });
    expect(outcomes.at(-1)).toMatchObject({ ok: true, effect: { kind: "revise", ref: "q_team" } });
    expect(out).toContain("shown for review again");
  });
});

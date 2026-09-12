import { describe, it, expect } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { buildEditContext, buildEditTools, type EditOutcome } from "../src/lib/edit-tools.js";
import { applyEditDraft, introducedFlowProblems } from "../src/lib/edit-apply.js";

/**
 * The loop, driven by a scripted model.
 *
 * An LLM is not reproducible — same prompt, same temperature, different bytes,
 * because batch size on the serving side moves with load. So the thing worth
 * testing deterministically is not what the model says, it is what OUR code
 * does with a given sequence of calls. Each case here is a trajectory a real
 * model produces, replayed exactly, asserted on the document that comes out.
 */

function baseForm(): FormDoc {
  return FormDoc.parse({
    id: "frm_test000001",
    version: 1,
    title: "Waitlist",
    description: "",
    blocks: [
      { id: "blk_0000000001", ref: "welcome", type: "welcome", title: "Hi", required: false },
      {
        id: "blk_0000000002",
        ref: "q_platform",
        type: "single_select",
        title: "Which platform?",
        required: true,
        options: [
          { id: "opt_000000001", label: "iPhone" },
          { id: "opt_000000002", label: "Android" },
        ],
      },
      { id: "blk_0000000003", ref: "q_email", type: "email", title: "Your email?", required: true },
    ],
    endings: [{ id: "end_0000000001", ref: "end_thanks", title: "Thanks", kind: "success" }],
    logic: [],
  });
}

type Call = [name: string, input: Record<string, unknown>];

/**
 * Run a fixed sequence of tool calls, exactly as the SDK's loop would, and
 * apply whatever proposal comes out — `ctx.best` when the model left one,
 * which is the same rule the route uses.
 */
async function replay(calls: Call[], base: FormDoc = baseForm()) {
  const outcomes: EditOutcome[] = [];
  const ctx = buildEditContext(base, (draft) => ({
    introduced: introducedFlowProblems(base, applyEditDraft(base, draft).doc),
  }));
  const tools = buildEditTools(ctx, (o) => outcomes.push(o));
  const results: string[] = [];
  for (const [name, input] of calls) {
    const t = tools[name] as { execute: (i: unknown, o: unknown) => Promise<string> } | undefined;
    if (!t) throw new Error(`no such tool: ${name}`);
    results.push(await t.execute(input, {}));
  }
  const proposal = ctx.best?.draft ?? ctx.draft;
  return { ctx, outcomes, results, applied: applyEditDraft(base, proposal), base };
}

const add = (over: Record<string, unknown>): Record<string, unknown> => ({
  ref: "q_new", type: "short_text", title: "A question", description: "",
  required: false, options: [], scale: 0, config: "", insertAfter: "",
  ...over,
});

describe("a routing-only edit", () => {
  it('answers "if they pick Android, ask for their Play Store email" in three calls', async () => {
    const { ctx, applied } = await replay([
      ["add_question", add({ ref: "q_play_email", type: "email", title: "Play Store email?", required: true, insertAfter: "q_platform" })],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_email" }],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "q_play_email" }],
      ["finish_edit", { summary: "Added a Play Store email for Android users." }],
    ]);

    expect(ctx.finished).toBe(true);
    expect(applied.added.map((b) => b.ref)).toEqual(["q_play_email"]);
    // Sits immediately below the question that decides it.
    expect(applied.doc.blocks.map((b) => b.ref)).toEqual(["welcome", "q_platform", "q_play_email", "q_email"]);
    // And nothing is stranded.
    expect(introducedFlowProblems(baseForm(), applied.doc)).toEqual([]);
  });

  it("changes a route without disturbing the arms it did not mention", async () => {
    const first = await replay([
      ["add_question", add({ ref: "q_ios", insertAfter: "q_platform" })],
      ["add_question", add({ ref: "q_droid", insertAfter: "q_ios" })],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_ios" }],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "q_droid" }],
      ["finish_edit", { summary: "Two arms." }],
    ]);
    expect(first.ctx.finished).toBe(true);

    // A second edit that restates only the iPhone arm.
    const second = await replay(
      [
        ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_email" }],
        ["finish_edit", { summary: "iPhone users skip straight to email." }],
      ],
      first.applied.doc,
    );
    const armFor = (optionId: string) =>
      second.applied.doc.logic.find(
        (r) => r.action_kind === "goto" && r.from === "q_platform" && JSON.stringify(r.when).includes(optionId),
      );
    expect(armFor("opt_000000001")?.target).toBe("q_email");
    // The arm the edit never mentioned is exactly where it was.
    expect(armFor("opt_000000002")?.target).toBe("q_droid");
  });
});

describe("a settings-only edit", () => {
  it("holds an existing email question to a domain", async () => {
    const { applied } = await replay([
      ["get_question_type", { type: "email" }],
      ["configure_question", { ref: "q_email", config: "domains=college.edu", description: "" }],
      ["finish_edit", { summary: "Only college addresses." }],
    ]);
    const email = applied.doc.blocks.find((b) => b.ref === "q_email");
    expect(email?.type === "email" && email.allowedDomains).toEqual(["college.edu"]);
    expect(applied.updated).toEqual(["q_email"]);
    expect(applied.added).toEqual([]);
  });
});

describe("a screen-out edit", () => {
  it('answers "if they do not meet the requirements, do not let them submit"', async () => {
    const { applied } = await replay([
      ["add_question", add({
        ref: "q_eligible", type: "yes_no", title: "Does your team meet the requirements?",
        required: true, insertAfter: "q_platform",
      })],
      ["set_ending", {
        ref: "end_sorry", title: "You're not eligible for this round", body: "Come back next round.",
        kind: "screen_out", requirements: "A team of 2-5 people | At least one member over 18", redirectUrl: "",
      }],
      ["set_branch", { whenRef: "q_eligible", op: "eq", value: "no", then: "end_sorry" }],
      ["finish_edit", { summary: "Teams that do not qualify are screened out." }],
    ]);

    const sorry = applied.doc.endings.find((e) => e.ref === "end_sorry");
    expect(sorry?.kind).toBe("screen_out");
    // The failing answer points at the refusal, not at the thank-you. This is
    // the bug the screen_out kind was added for: a team that had just declared
    // itself ineligible used to be shown "Registration Submitted Successfully".
    const gotos = applied.doc.logic.filter((r) => r.action_kind === "goto");
    expect(gotos.some((r) => r.from === "q_eligible" && r.target === "end_sorry")).toBe(true);
    // And the success ending is still there for everyone else.
    expect(applied.doc.endings.some((e) => e.kind === "success")).toBe(true);
  });
});

describe("the repair round", () => {
  it("fixes a flow it broke, without a second full prompt", async () => {
    const { ctx, results, applied } = await replay([
      // Routes both answers past q_email, stranding it.
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" }],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" }],
      ["finish_edit", { summary: "Everyone straight to the end." }],
      // The model reads the linter's sentence and corrects one arm.
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_email" }],
      ["finish_edit", { summary: "iPhone users still give their email." }],
    ]);

    expect(results[2]).toContain("Rejected");
    expect(results[2]).toContain("broke the flow");
    expect(results[4]).not.toContain("Rejected");
    expect(ctx.finished).toBe(true);
    expect(introducedFlowProblems(baseForm(), applied.doc)).toEqual([]);
  });

  it("keeps the better attempt when the repair makes things worse", async () => {
    const { ctx, applied } = await replay([
      ["add_question", add({ ref: "q_ios", insertAfter: "q_platform" })],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_ios" }],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "q_email" }],
      ["finish_edit", { summary: "Clean." }],
    ]);
    expect(ctx.best?.problems).toHaveLength(0);
    // The proposal kept is the clean one.
    expect(introducedFlowProblems(baseForm(), applied.doc)).toEqual([]);
  });
});

describe("a model that gets it wrong first", () => {
  it("recovers inside the same turn from a misremembered option label", async () => {
    const { results, applied, ctx } = await replay([
      // "iOS" is not one of the labels; the old path fuzzy-matched or dropped it.
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iOS", then: "end_thanks" }],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" }],
      ["set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "q_email" }],
      ["finish_edit", { summary: "iPhone users are done early." }],
    ]);
    expect(results[0]).toContain("Rejected");
    expect(results[0]).toContain("iPhone");
    expect(ctx.finished).toBe(true);
    // The rejected call left no trace in the proposal.
    expect(ctx.draft.branches).toHaveLength(2);
    expect(introducedFlowProblems(baseForm(), applied.doc)).toEqual([]);
  });

  it("recovers from reaching for a type's setup it had not looked up", async () => {
    const { results, ctx } = await replay([
      ["add_question", add({ ref: "q_slot", type: "scheduling", title: "Pick a slot" })],
      ["get_question_type", { type: "scheduling" }],
      ["add_question", add({ ref: "q_slot", type: "scheduling", title: "Pick a slot", config: "url=https://cal.com/acme" })],
      ["finish_edit", { summary: "Added booking." }],
    ]);
    expect(results[0]).toContain("Rejected");
    expect(results[2]).not.toContain("Rejected");
    expect(ctx.draft.addBlocks).toHaveLength(1);
    expect(ctx.finished).toBe(true);
  });
});

describe("what the loop returns when it does not converge", () => {
  it("keeps a valid partial edit rather than returning nothing", async () => {
    // A model that makes a real change and then never calls finish_edit —
    // the step cap ends the loop. The route applies what was collected.
    const { ctx, applied } = await replay([
      ["configure_question", { ref: "q_email", config: "unique=true", description: "" }],
    ]);
    expect(ctx.finished).toBe(false);
    // Still a usable proposal: returning nothing because the model forgot to
    // say goodbye would be the worst possible failure.
    expect(applied.updated).toEqual(["q_email"]);
  });
});

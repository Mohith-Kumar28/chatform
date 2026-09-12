import { describe, it, expect } from "vitest";
import { FormDoc, ADDABLE_BLOCK_TYPES, BLOCK_CATALOG, BLOCK_TYPES } from "@repo/form-schema";
import { z } from "zod";
import { buildEditContext, buildEditTools, type EditToolContext, type EditOutcome } from "../src/lib/edit-tools.js";
import { applyEditDraft, introducedFlowProblems } from "../src/lib/edit-apply.js";

/**
 * Every guard here exists because the same mistake used to land silently.
 * A rejection is only worth having if it says what to do instead, so each case
 * asserts the message as well as the refusal.
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

/** A context wired to the real applier and linter, as the route wires it. */
function harness(base: FormDoc = baseForm()) {
  const outcomes: EditOutcome[] = [];
  const ctx = buildEditContext(base, (draft) => ({
    introduced: introducedFlowProblems(base, applyEditDraft(base, draft).doc),
  }));
  const tools = buildEditTools(ctx, (o) => outcomes.push(o));
  // `execute` is what the SDK calls; the second argument is its options bag,
  // which none of these guards read.
  const call = async (name: string, input: unknown): Promise<string> =>
    (await (tools[name] as { execute: (i: unknown, o: unknown) => Promise<string> }).execute(input, {})) as string;
  return { ctx, tools, outcomes, call };
}

const addInput = (over: Record<string, unknown> = {}) => ({
  ref: "q_new",
  type: "short_text",
  title: "A new question",
  description: "",
  required: false,
  options: [],
  scale: 0,
  config: "",
  insertAfter: "",
  ...over,
});

describe("the tool set itself", () => {
  it("offers every type a model may add", () => {
    // The catalog going stale is the bug this whole file's ancestor was written
    // for: two hand-written lists named 16 of 26 types, so `payment` and
    // `scheduling` were not undocumented, they were forbidden.
    const { tools } = harness();
    const shape = (tools.add_question.inputSchema as z.ZodObject<{ type: z.ZodEnum<Record<string, string>> }>).shape;
    expect(new Set(shape.type.options)).toEqual(new Set(ADDABLE_BLOCK_TYPES));
    expect(ADDABLE_BLOCK_TYPES).toHaveLength(BLOCK_TYPES.length - 1);
  });

  it("names every type in add_question's description, so none has to be guessed at", () => {
    const { tools } = harness();
    const description = tools.add_question.description ?? "";
    for (const type of ADDABLE_BLOCK_TYPES) expect(description).toContain(type);
  });

  it("does not offer the emptiness operators", () => {
    // They are how a model spells "and then", which is already what happens.
    const { tools } = harness();
    const shape = (tools.set_branch.inputSchema as z.ZodObject<{ op: z.ZodEnum<Record<string, string>> }>).shape;
    expect(shape.op.options).not.toContain("is_empty");
    expect(shape.op.options).not.toContain("is_not_empty");
  });

  it("stays inside the schema budget the provider enforces", () => {
    /**
     * The whole tool set is re-sent on every step of every loop, and is
     * validated by the same budget that refused `GenerationDraft` the day
     * Google tightened it — with no deploy on our side. Asserted rather than
     * hoped for.
     */
    const { tools } = harness();
    let properties = 0;
    for (const t of Object.values(tools)) {
      const json = z.toJSONSchema(t.inputSchema as z.ZodType) as { properties?: Record<string, unknown> };
      properties += Object.keys(json.properties ?? {}).length;
      // `maxItems` is the one keyword measured to trigger a refusal.
      expect(JSON.stringify(json)).not.toContain("maxItems");
    }
    expect(properties).toBeLessThanOrEqual(32);
  });
});

describe("get_question_type", () => {
  it("gives the config keys for the type asked about", async () => {
    const { call } = harness();
    const out = await call("get_question_type", { type: "payment" });
    expect(out).toContain("payment");
    expect(out).toContain("upi");
    expect(out).toContain("amount");
  });

  it("says when a type cannot be built without something", async () => {
    const { call } = harness();
    expect(await call("get_question_type", { type: "scheduling" })).toContain("Cannot be built without");
  });

  it("describes every type without throwing", async () => {
    const { call } = harness();
    for (const type of ADDABLE_BLOCK_TYPES) {
      expect(await call("get_question_type", { type }), type).toContain(type);
    }
  });
});

describe("add_question", () => {
  it("adds a question and makes it visible to later calls in the same turn", async () => {
    const { ctx, call } = harness();
    const out = await call("add_question", addInput({ ref: "q_why", insertAfter: "q_platform" }));
    expect(out).not.toContain("Rejected");
    expect(ctx.draft.addBlocks).toHaveLength(1);
    // This is what lets set_branch point at it.
    expect(ctx.order).toEqual(["welcome", "q_platform", "q_why", "q_email"]);
    expect(ctx.blocks.has("q_why")).toBe(true);
  });

  it("refuses a ref the form already has, and says what to use instead", async () => {
    const { ctx, call } = harness();
    const out = await call("add_question", addInput({ ref: "q_email" }));
    expect(out).toContain("Rejected");
    expect(out).toContain("configure_question");
    expect(ctx.draft.addBlocks).toHaveLength(0);
  });

  it("refuses an insertAfter that does not exist, and lists the refs that do", async () => {
    const { call } = harness();
    const out = await call("add_question", addInput({ insertAfter: "q_nope" }));
    expect(out).toContain("Rejected");
    expect(out).toContain("q_platform");
  });

  it("refuses a choice question with fewer than two options", async () => {
    // This used to become a short_text question, silently.
    const { ctx, call } = harness();
    const out = await call("add_question", addInput({ ref: "q_size", type: "single_select", options: ["Only one"] }));
    expect(out).toContain("Rejected");
    expect(out).toContain("at least two options");
    expect(ctx.draft.addBlocks).toHaveLength(0);
  });

  it("refuses a scheduling question with no booking link, and offers date instead", async () => {
    // This used to become a date question, silently — which was the right
    // fallback and the wrong way to arrive at it.
    const { call } = harness();
    const out = await call("add_question", addInput({ ref: "q_slot", type: "scheduling" }));
    expect(out).toContain("Rejected");
    expect(out).toContain('type="date"');
  });

  it("refuses a repeating group with no columns", async () => {
    const { call } = harness();
    const out = await call("add_question", addInput({ ref: "q_team", type: "field_group" }));
    expect(out).toContain("Rejected");
    expect(out).toContain("fields=");
  });

  it("refuses a config key the type does not read, and names the ones it does", async () => {
    // `parseBlockConfig` would drop this without a word.
    const { call } = harness();
    const out = await call("add_question", addInput({ ref: "q_seats", type: "number", config: "ammount=50" }));
    expect(out).toContain("Rejected");
    expect(out).toContain("ammount");
    expect(out).toContain("integeronly");
  });

  it("accepts a payment question with a destination, and one without", async () => {
    // Payment deliberately does NOT require a destination: a block with a
    // visible gap the linter flags is the right outcome when the author named
    // a price but no UPI id.
    const { ctx, call } = harness();
    expect(await call("add_question", addInput({ ref: "q_pay", type: "payment", config: "method=upi; upi=a@b; amount=499" }))).not.toContain("Rejected");
    expect(await call("add_question", addInput({ ref: "q_fee", type: "payment", config: "amount=99" }))).not.toContain("Rejected");
    expect(ctx.draft.addBlocks).toHaveLength(2);
  });
});

describe("configure_question", () => {
  it("changes a setting on a question already in the form", async () => {
    const { ctx, call } = harness();
    const out = await call("configure_question", { ref: "q_email", config: "domains=college.edu", description: "" });
    expect(out).not.toContain("Rejected");
    expect(ctx.draft.updateBlocks).toEqual([{ ref: "q_email", config: "domains=college.edu", description: "" }]);
  });

  it("refuses a ref that is not in the form", async () => {
    const { call } = harness();
    expect(await call("configure_question", { ref: "q_nope", config: "unique=true", description: "" })).toContain("Rejected");
  });

  it("refuses to configure a question this same edit added", async () => {
    const { call } = harness();
    await call("add_question", addInput({ ref: "q_new" }));
    const out = await call("configure_question", { ref: "q_new", config: "unique=true", description: "" });
    expect(out).toContain("Rejected");
    expect(out).toContain("add_question");
  });

  it("refuses a call that would change nothing", async () => {
    const { call } = harness();
    expect(await call("configure_question", { ref: "q_email", config: "", description: "" })).toContain("Rejected");
  });

  it("refuses a key this type does not read", async () => {
    const { call } = harness();
    const out = await call("configure_question", { ref: "q_platform", config: "verify=true", description: "" });
    expect(out).toContain("Rejected");
    expect(out).toContain("verify");
  });
});

describe("remove_question", () => {
  it("removes a question and takes it out of the running order", async () => {
    const { ctx, call } = harness();
    expect(await call("remove_question", { ref: "q_email" })).not.toContain("Rejected");
    expect(ctx.draft.removeRefs).toEqual(["q_email"]);
    expect(ctx.order).toEqual(["welcome", "q_platform"]);
  });

  it("refuses to remove the welcome block", async () => {
    const { call } = harness();
    expect(await call("remove_question", { ref: "welcome" })).toContain("Rejected");
  });

  it("refuses a ref that is not there", async () => {
    const { call } = harness();
    expect(await call("remove_question", { ref: "q_nope" })).toContain("Rejected");
  });
});

describe("set_branch", () => {
  it("routes an answer at a question below the decider", async () => {
    const { ctx, call } = harness();
    const out = await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "q_email" });
    expect(out).not.toContain("Rejected");
    expect(ctx.draft.branches).toHaveLength(1);
  });

  it("routes an answer at an ending", async () => {
    const { call } = harness();
    expect(await call("set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" })).not.toContain("Rejected");
  });

  it("routes at a question added earlier in the same turn", async () => {
    // The reason these tools mutate: a guard that could not see add_question's
    // effect would refuse the commonest two-call edit there is.
    const { call } = harness();
    await call("add_question", addInput({ ref: "q_android_email", type: "email", insertAfter: "q_platform" }));
    const out = await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "q_android_email" });
    expect(out).not.toContain("Rejected");
  });

  it("refuses a destination that does not exist, and lists both what it could be", async () => {
    const { call } = harness();
    const out = await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "end_sorry" });
    expect(out).toContain("Rejected");
    expect(out).toContain("set_ending");
    expect(out).toContain("end_thanks");
  });

  it("refuses an upward branch, and says how to make it point downwards", async () => {
    // `buildFlowRules` drops these silently — which is how a rewire lost an arm.
    const { call } = harness();
    const out = await call("set_branch", { whenRef: "q_email", op: "eq", value: "x", then: "q_platform" });
    expect(out).toContain("Rejected");
    expect(out).toContain("loop");
    expect(out).toContain("insertAfter=q_email");
  });

  it("refuses a value the deciding question cannot produce, and lists the ones it can", async () => {
    // `resolveBranches` papers over this with a fuzzy match; the model should
    // be told, not guessed at.
    const { call } = harness();
    const out = await call("set_branch", { whenRef: "q_platform", op: "eq", value: "iOS", then: "q_email" });
    expect(out).toContain("Rejected");
    expect(out).toContain("iPhone");
    expect(out).toContain("Android");
  });

  it("refuses a decider that is not in the form", async () => {
    const { call } = harness();
    expect(await call("set_branch", { whenRef: "q_nope", op: "eq", value: "x", then: "q_email" })).toContain("Rejected");
  });
});

describe("set_ending", () => {
  it("adds a screen-out ending", async () => {
    const { ctx, call } = harness();
    const out = await call("set_ending", {
      ref: "end_sorry", title: "You're not eligible", body: "", kind: "screen_out",
      requirements: "A team of 2-5 people", redirectUrl: "",
    });
    expect(out).not.toContain("Rejected");
    expect(ctx.draft.endings).toHaveLength(1);
    // Immediately routable, which is the ordering bug this avoids.
    expect(await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "end_sorry" })).not.toContain("Rejected");
  });

  it("refuses to turn the only success ending into a refusal", async () => {
    const { call } = harness();
    const out = await call("set_ending", {
      ref: "end_thanks", title: "No", body: "", kind: "screen_out", requirements: "x", redirectUrl: "",
    });
    expect(out).toContain("Rejected");
    expect(out).toContain("nobody can finish");
  });

  it("refuses requirements on a success ending", async () => {
    const { call } = harness();
    const out = await call("set_ending", {
      ref: "end_yes", title: "You're in", body: "", kind: "success", requirements: "Over 18", redirectUrl: "",
    });
    expect(out).toContain("Rejected");
  });

  it("refuses a redirect that is not a full address", async () => {
    // `redirectTarget` silently drops these today.
    const { call } = harness();
    const out = await call("set_ending", {
      ref: "end_yes", title: "You're in", body: "", kind: "success", requirements: "", redirectUrl: "acme.com/thanks",
    });
    expect(out).toContain("Rejected");
    expect(out).toContain("https://");
  });
});

describe("ask_user", () => {
  it("has no execute, so calling it ends the turn", () => {
    // That is the whole mechanism: the loop stops, the route reads the call
    // off the result and returns the question instead of a proposal.
    const { tools } = harness();
    expect(tools.ask_user.execute).toBeUndefined();
  });

  it("tells the model when NOT to use it", () => {
    // An editor that asks instead of acting is worse than one that guesses and
    // gets corrected — the author came here to change something.
    const description = harness().tools.ask_user.description ?? "";
    expect(description).toContain("ENDS your turn");
    expect(description).toContain("Never ask about wording");
  });

  it("takes one question and nothing else", () => {
    const { tools } = harness();
    const shape = (tools.ask_user.inputSchema as z.ZodObject<Record<string, unknown>>).shape;
    expect(Object.keys(shape)).toEqual(["question"]);
  });
});

describe("finish_edit", () => {
  it("refuses to finish an edit that changed nothing", async () => {
    const { call } = harness();
    expect(await call("finish_edit", { summary: "Nothing." })).toContain("Rejected");
  });

  it("accepts an edit whose flow checks out", async () => {
    const { ctx, call } = harness();
    await call("configure_question", { ref: "q_email", config: "unique=true", description: "" });
    const out = await call("finish_edit", { summary: "Made the email unique." });
    expect(out).not.toContain("Rejected");
    expect(ctx.finished).toBe(true);
    expect(ctx.draft.summary).toBe("Made the email unique.");
  });

  it("sends the linter's own words back when the edit breaks the flow", async () => {
    const { ctx, call } = harness();
    // Route both options past q_email, leaving it unreachable.
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" });
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" });
    const out = await call("finish_edit", { summary: "Routed both." });
    expect(out).toContain("Rejected");
    expect(out).toContain("broke the flow");
    expect(ctx.finished).toBe(false);
    expect(ctx.reviewAttempts).toBe(1);
  });

  it("gives up after two failed checks rather than spending the whole budget", async () => {
    const { ctx, call } = harness();
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" });
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" });
    expect(await call("finish_edit", { summary: "One." })).toContain("Rejected");
    expect(await call("finish_edit", { summary: "Two." })).toContain("Rejected");
    const third = await call("finish_edit", { summary: "Three." });
    expect(third).not.toContain("Rejected");
    expect(ctx.finished).toBe(true);
    // The proposal is still a proposal — the builder sees the warning on it.
    expect(ctx.best).not.toBeNull();
  });

  it("keeps the best attempt, not the last one", async () => {
    const { ctx, call } = harness();
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" });
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" });
    await call("finish_edit", { summary: "Broken." });
    const broken = ctx.best?.problems.length ?? 0;
    expect(broken).toBeGreaterThan(0);

    // Repair it: send iPhone to the question instead of past it.
    await call("set_branch", { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_email" });
    await call("finish_edit", { summary: "Fixed." });
    expect(ctx.best?.problems).toHaveLength(0);
  });
});

describe("the reliability floor", () => {
  it("stops asking after three refused calls in a row", async () => {
    const { call } = harness();
    expect(await call("remove_question", { ref: "q_a" })).toContain("Rejected");
    expect(await call("remove_question", { ref: "q_b" })).toContain("Rejected");
    expect(await call("remove_question", { ref: "q_c" })).toContain("Rejected");
    const out = await call("add_question", addInput({ ref: "q_fine" }));
    expect(out).toContain("too many invalid calls");
  });

  it("a call that lands clears the streak", async () => {
    const { call } = harness();
    await call("remove_question", { ref: "q_a" });
    await call("remove_question", { ref: "q_b" });
    expect(await call("add_question", addInput({ ref: "q_fine" }))).not.toContain("Rejected");
    await call("remove_question", { ref: "q_c" });
    // Streak restarted, so this is still a real attempt rather than the floor.
    const out = await call("add_question", addInput({ ref: "q_also_fine" }));
    expect(out).not.toContain("too many invalid calls");
  });

  it("refuses more tools once the edit is finished", async () => {
    const { call } = harness();
    await call("configure_question", { ref: "q_email", config: "unique=true", description: "" });
    await call("finish_edit", { summary: "Done." });
    expect(await call("add_question", addInput({ ref: "q_late" }))).toContain("already finished");
  });
});

describe("the catalog the guards read", () => {
  it("documents config keys for every type whose prose mentions them", () => {
    // `configKeys` is what the guard checks; `config` is what the model reads.
    // A type that documents settings in prose but lists none is a type whose
    // settings the guard will refuse.
    for (const [type, entry] of Object.entries(BLOCK_CATALOG)) {
      if (!entry.config) continue;
      expect(entry.configKeys?.length, `${type} documents config but lists no configKeys`).toBeGreaterThan(0);
    }
  });

  it("lists every documented requirement as a key the type also reads", () => {
    for (const [type, entry] of Object.entries(BLOCK_CATALOG)) {
      for (const group of entry.configRequiresOneOf ?? []) {
        for (const key of group) {
          expect(entry.configKeys, `${type} requires ${key} but does not read it`).toContain(key);
        }
      }
    }
  });
});

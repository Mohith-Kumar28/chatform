import { describe, it, expect } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { applyEditDraft, introducedFlowProblems } from "../src/lib/edit-apply.js";
import type { EditDraft } from "../src/lib/ai.js";

/**
 * `applyEditDraft` is the document surgery every AI edit goes through, and
 * until it was lifted out of `editFormHandler` it had no tests at all — 150
 * lines of branching logic reachable only through a route that needs an
 * OpenRouter key and a D1 row. Each case here is one of the rules the comments
 * in that function were written to defend.
 */

const edit = (over: Partial<EditDraft>): EditDraft => ({
  addBlocks: [],
  updateBlocks: [],
  endings: [],
  removeRefs: [],
  rewireRefs: [],
  branches: [],
  summary: "",
  ...over,
});

const add = (over: Partial<EditDraft["addBlocks"][number]>): EditDraft["addBlocks"][number] => ({
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

/** A three-question form with a choice question and one success ending. */
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

describe("applyEditDraft", () => {
  it("adds a question directly after the ref it names", () => {
    // Appending everything to the end — which is all the route used to do —
    // puts the arms of a condition below the questions they should skip.
    const out = applyEditDraft(baseForm(), edit({ addBlocks: [add({ ref: "q_why", insertAfter: "q_platform" })] }));
    expect(out.doc.blocks.map((b) => b.ref)).toEqual(["welcome", "q_platform", "q_why", "q_email"]);
    expect(out.added).toHaveLength(1);
  });

  it("appends when insertAfter is empty", () => {
    const out = applyEditDraft(baseForm(), edit({ addBlocks: [add({ ref: "q_why" })] }));
    expect(out.doc.blocks.at(-1)?.ref).toBe("q_why");
  });

  it("lets one added question follow another added in the same edit", () => {
    // Resolved against the list as it grows, not against the form as it was.
    const out = applyEditDraft(
      baseForm(),
      edit({
        addBlocks: [
          add({ ref: "q_one", insertAfter: "q_platform" }),
          add({ ref: "q_two", insertAfter: "q_one" }),
        ],
      }),
    );
    expect(out.doc.blocks.map((b) => b.ref)).toEqual(["welcome", "q_platform", "q_one", "q_two", "q_email"]);
  });

  it("removes a question and every rule hanging off it", () => {
    const base = baseForm();
    const routed = applyEditDraft(
      base,
      edit({ branches: [{ whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" }] }),
    );
    expect(routed.newRules.length).toBeGreaterThan(0);

    const out = applyEditDraft(routed.doc, edit({ removeRefs: ["q_platform"] }));
    expect(out.doc.blocks.map((b) => b.ref)).not.toContain("q_platform");
    expect(out.removed).toEqual(["q_platform"]);
    // A rule pointing at, or hanging off, a question that no longer exists is
    // a dead end rather than a route.
    expect(out.doc.logic.filter((r) => r.action_kind === "goto" && r.from === "q_platform")).toHaveLength(0);
  });

  it("never removes the welcome block", () => {
    const out = applyEditDraft(baseForm(), edit({ removeRefs: ["welcome"] }));
    expect(out.doc.blocks[0]?.ref).toBe("welcome");
    expect(out.removed).toEqual([]);
  });

  it("changes settings on a question that is already there", () => {
    const out = applyEditDraft(baseForm(), edit({ updateBlocks: [{ ref: "q_email", config: "businessonly=true", description: "" }] }));
    const email = out.doc.blocks.find((b) => b.ref === "q_email");
    expect(email?.type === "email" && email.businessOnly).toBe(true);
    expect(out.updated).toEqual(["q_email"]);
  });

  it("does not count a config that changes nothing as an update", () => {
    // This is what lets the route refuse an edit that touches nothing at all.
    const out = applyEditDraft(baseForm(), edit({ updateBlocks: [{ ref: "q_email", config: "", description: "" }] }));
    expect(out.updated).toEqual([]);
  });

  it("ignores an update naming a ref the form does not have", () => {
    const out = applyEditDraft(baseForm(), edit({ updateBlocks: [{ ref: "q_nope", config: "unique=true", description: "" }] }));
    expect(out.updated).toEqual([]);
  });

  it("adds an ending, and patches one that already exists in place", () => {
    const added = applyEditDraft(
      baseForm(),
      edit({
        endings: [{ ref: "end_sorry", title: "You're not eligible", body: "", kind: "screen_out", requirements: "Over 18", redirectUrl: "" }],
      }),
    );
    expect(added.doc.endings.map((e) => e.ref)).toEqual(["end_thanks", "end_sorry"]);
    expect(added.endingChanges).toEqual(["end_sorry"]);

    const patched = applyEditDraft(
      added.doc,
      edit({ endings: [{ ref: "end_thanks", title: "You're in!", body: "", kind: "success", requirements: "", redirectUrl: "" }] }),
    );
    expect(patched.doc.endings).toHaveLength(2);
    expect(patched.doc.endings.find((e) => e.ref === "end_thanks")?.title).toBe("You're in!");
    expect(patched.endingChanges).toEqual(["end_thanks"]);
  });

  it("does not count an ending rewritten to what it already said", () => {
    const out = applyEditDraft(
      baseForm(),
      edit({ endings: [{ ref: "end_thanks", title: "Thanks", body: "", kind: "success", requirements: "", redirectUrl: "" }] }),
    );
    expect(out.endingChanges).toEqual([]);
  });

  it("routes a branch at an ending the same edit is adding", () => {
    // Endings are applied before the wiring on purpose: `buildFlowRules` only
    // accepts an ending ref it is given, so added after, the branch would be
    // dropped as dangling and the edit would land as questions with no route
    // to the outcome it just created.
    const out = applyEditDraft(
      baseForm(),
      edit({
        endings: [{ ref: "end_sorry", title: "Not this time", body: "", kind: "screen_out", requirements: "An iPhone", redirectUrl: "" }],
        branches: [{ whenRef: "q_platform", op: "eq", value: "Android", then: "end_sorry" }],
      }),
    );
    const gotos = out.doc.logic.filter((r) => r.action_kind === "goto");
    expect(gotos.some((r) => r.target === "end_sorry" && r.targetKind === "ending")).toBe(true);
  });

  it("matches a branch value against the option's label, not its id", () => {
    const out = applyEditDraft(
      baseForm(),
      edit({ branches: [{ whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" }] }),
    );
    expect(out.newRules.length).toBeGreaterThan(0);
    // The label resolved to the option id the document actually carries.
    expect(JSON.stringify(out.doc.logic)).toContain("opt_000000002");
  });

  it("replaces a route per answer, leaving the other arms alone", () => {
    /**
     * The rule this defends: asked to send Chrome users straight to the
     * ending, the model rewired `q_platform` and restated two of its three
     * options — so the Android route was deleted and iOS was quietly pointed
     * at the wrong question. A model that forgets one arm should cost that
     * arm nothing.
     */
    const both = applyEditDraft(
      baseForm(),
      edit({
        addBlocks: [add({ ref: "q_ios_extra", insertAfter: "q_platform" }), add({ ref: "q_android_extra", insertAfter: "q_ios_extra" })],
        branches: [
          { whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_ios_extra" },
          { whenRef: "q_platform", op: "eq", value: "Android", then: "q_android_extra" },
        ],
      }),
    );
    // Three rules, not two: the two arms, plus the exit `buildFlowRules` adds
    // so the iOS arm jumps past the Android arm instead of falling into it.
    const armTarget = (doc: FormDoc, optionId: string) =>
      doc.logic.find(
        (r) => r.action_kind === "goto" && r.from === "q_platform" && JSON.stringify(r.when).includes(optionId),
      );
    expect(both.doc.logic.filter((r) => r.action_kind === "goto")).toHaveLength(3);
    expect(armTarget(both.doc, "opt_000000001")?.target).toBe("q_ios_extra");
    expect(armTarget(both.doc, "opt_000000002")?.target).toBe("q_android_extra");

    // Restate only the iPhone arm, pointing it somewhere new.
    const after = applyEditDraft(
      both.doc,
      edit({ branches: [{ whenRef: "q_platform", op: "eq", value: "iPhone", then: "q_email" }] }),
    );
    // The iPhone route moved; the Android route the edit never mentioned is
    // exactly where it was. One rule superseded, not two.
    expect(armTarget(after.doc, "opt_000000001")?.target).toBe("q_email");
    expect(armTarget(after.doc, "opt_000000002")?.target).toBe("q_android_extra");
    expect(after.rewired).toBe(1);
  });

  it("leaves the form untouched when the draft is empty", () => {
    const base = baseForm();
    const out = applyEditDraft(base, edit({}));
    expect(out.added).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(out.updated).toEqual([]);
    expect(out.endingChanges).toEqual([]);
    expect(out.newRules).toEqual([]);
    expect(out.doc.blocks.map((b) => b.ref)).toEqual(base.blocks.map((b) => b.ref));
  });

  it("does not mutate the form it was given", () => {
    const base = baseForm();
    const snapshot = JSON.stringify(base);
    applyEditDraft(base, edit({ removeRefs: ["q_email"], addBlocks: [add({ ref: "q_new" })] }));
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("introducedFlowProblems", () => {
  it("says nothing about a form that is already fine", () => {
    const base = baseForm();
    expect(introducedFlowProblems(base, base)).toEqual([]);
  });

  it("reports a question this edit cut off", () => {
    // Routing both options past q_email leaves it unreachable.
    const base = baseForm();
    const out = applyEditDraft(
      base,
      edit({
        branches: [
          { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" },
          { whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" },
        ],
      }),
    );
    const problems = introducedFlowProblems(base, out.doc);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.code)).toContain("unreachable_blocks");
  });

  it("does not blame this edit for a problem the form already had", () => {
    // A form that was already broken is not the request's fault, and telling
    // the model to fix something it did not cause spends a turn and invites it
    // to "fix" the part that was working.
    const base = baseForm();
    const broken = applyEditDraft(
      base,
      edit({
        branches: [
          { whenRef: "q_platform", op: "eq", value: "iPhone", then: "end_thanks" },
          { whenRef: "q_platform", op: "eq", value: "Android", then: "end_thanks" },
        ],
      }),
    ).doc;
    expect(introducedFlowProblems(base, broken).length).toBeGreaterThan(0);

    // Same breakage on both sides now: the edit introduced nothing new.
    const next = applyEditDraft(broken, edit({ updateBlocks: [{ ref: "q_email", config: "unique=true", description: "" }] }));
    expect(introducedFlowProblems(broken, next.doc)).toEqual([]);
  });
});

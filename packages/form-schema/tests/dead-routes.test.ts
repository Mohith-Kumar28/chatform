import { describe, it, expect } from "vitest";
import { FormDoc, lintFormDoc, hasErrors, buildFlowRules, type DraftBranch, type Block } from "../src/index";

/**
 * Routes that are drawn and never taken.
 *
 * All four shapes here came off one generated form — an open mic registration
 * that went live. Four of its thirteen rules could not do what they said, and
 * nothing anywhere mentioned it: the canvas drew them as ordinary branches, the
 * linter had nothing to say, and publishing was not blocked. One of them was
 * not cosmetic. Every attendee who filled the form in was shown "You're on the
 * list to perform!" because the route to the audience ending waited for
 * somebody to type a sentence into a free-text box.
 *
 * So: warnings, never errors. The form works — it just does less than it looks
 * like it does, and which way to fix that is the author's call.
 */

const build = (blocks: unknown[], logic: unknown[] = []) =>
  FormDoc.parse({
    title: "t",
    blocks,
    endings: [
      { id: "end_dr_ok001", ref: "end_thanks", title: "Thanks", kind: "success" },
      { id: "end_dr_out01", ref: "end_audience", title: "See you in the audience", kind: "success" },
    ],
    logic,
  });

const choice = {
  id: "blk_dr_role01",
  ref: "q_role",
  type: "single_select",
  title: "Performing or watching?",
  required: true,
  options: [
    { id: "opt_perform", label: "I want to perform" },
    { id: "opt_watch", label: "Just coming to watch and support" },
  ],
};
const notes = { id: "blk_dr_note01", ref: "q_notes", type: "long_text", title: "Any special notes?", minLength: 0, maxLength: 500 };
const code = { id: "blk_dr_code01", ref: "q_code", type: "short_text", title: "Referral code", minLength: 0, maxLength: 40 };
const act = { id: "blk_dr_act001", ref: "q_act", type: "short_text", title: "Tell us about your act", required: true, minLength: 0, maxLength: 200 };

const rule = (from: string, op: string, value: unknown, target: string, targetKind = "block") => ({
  id: `rl_dr_${from.slice(2, 8)}${op.slice(0, 2)}`,
  action_kind: "goto",
  from,
  when: { op: "and", conditions: [{ left: { kind: "ref", ref: from }, op, value }], groups: [] },
  target,
  targetKind,
});

const codesOf = (doc: ReturnType<typeof build>) => lintFormDoc(doc).map((i) => i.code);
const find = (doc: ReturnType<typeof build>, code: string) => lintFormDoc(doc).find((i) => i.code === code);

describe("a condition that is always true", () => {
  // `neq ""` is how a model spells "and then" once `is_not_empty` is taken off
  // the menu. No answer can ever be the empty string, so it matches every time.
  const doc = build([choice, act, notes], [rule("q_act", "neq", "", "q_notes")]);

  it("is flagged", () => {
    expect(codesOf(doc)).toContain("always_true_route");
  });

  it("does not block publishing", () => {
    expect(hasErrors(lintFormDoc(doc))).toBe(false);
    expect(find(doc, "always_true_route")!.level).toBe("warning");
  });

  it("lands on the question whose routes these are", () => {
    expect(find(doc, "always_true_route")!.refs).toEqual(["q_act"]);
  });

  it("is true whether the question was answered or skipped", () => {
    // The optional twin of the case above — and the reason this needs no
    // `required` guard. A skipped answer normalises to null, which is still
    // not the empty string.
    const optional = build([choice, notes, code], [rule("q_notes", "neq", "", "q_code")]);
    expect(codesOf(optional)).toContain("always_true_route");
  });
});

describe("a condition that can never be true", () => {
  const doc = build([choice, act, notes], [rule("q_act", "eq", "", "q_notes")]);

  it("is flagged as a route nobody travels", () => {
    expect(codesOf(doc)).toContain("never_true_route");
    expect(find(doc, "never_true_route")!.level).toBe("warning");
  });
});

describe("a choice question compared against something that is not an option", () => {
  it("catches the label written where the id belongs, and says which id to use", () => {
    const doc = build([choice, notes], [rule("q_role", "eq", "Just coming to watch and support", "end_audience", "ending")]);
    const issue = find(doc, "value_not_an_option");
    expect(issue?.level).toBe("warning");
    expect(issue?.message).toContain("opt_watch");
  });

  it("catches a value belonging to no option at all", () => {
    const doc = build([choice, notes], [rule("q_role", "eq", "opt_nonsense", "end_audience", "ending")]);
    expect(codesOf(doc)).toContain("value_not_an_option");
  });

  it("says nothing about a real option id", () => {
    const doc = build([choice, notes], [rule("q_role", "eq", "opt_watch", "end_audience", "ending")]);
    expect(codesOf(doc)).not.toContain("value_not_an_option");
  });

  it("says nothing about an operator that is not an exact match", () => {
    // `contains` on a choice question is a partial match on the id, which is
    // sloppy but can genuinely fire.
    const doc = build([choice, notes], [rule("q_role", "contains", "watch", "end_audience", "ending")]);
    expect(codesOf(doc)).not.toContain("value_not_an_option");
  });
});

describe("an exact match on a box the respondent types into", () => {
  it("is flagged on a long text, whatever the value", () => {
    const doc = build([choice, notes], [rule("q_notes", "eq", "Just coming to watch and support", "end_audience", "ending")]);
    const issue = find(doc, "exact_match_on_free_text");
    expect(issue?.level).toBe("warning");
    expect(issue?.refs).toEqual(["q_notes"]);
  });

  it("is flagged on a short text when the value is a phrase", () => {
    const doc = build([choice, code], [rule("q_code", "eq", "Just coming to watch", "end_audience", "ending")]);
    expect(codesOf(doc)).toContain("exact_match_on_free_text");
  });

  it("leaves a short text alone when the value is a token", () => {
    // An access code or a referral code is a deliberate exact match, and a
    // warning on every one of them is noise on a form that works.
    const doc = build([choice, code], [rule("q_code", "eq", "SAVE10", "end_audience", "ending")]);
    expect(codesOf(doc)).not.toContain("exact_match_on_free_text");
  });

  it("leaves `contains` alone, which is what the author probably wanted", () => {
    const doc = build([choice, notes], [rule("q_notes", "contains", "wheelchair", "end_audience", "ending")]);
    expect(codesOf(doc)).not.toContain("exact_match_on_free_text");
  });
});

describe("the flow generator, given the same shapes", () => {
  /**
   * The other half of the fix. The linter warns about documents that already
   * exist; this stops new ones being written, which is where all four of these
   * came from in the first place.
   */
  const blocks = [choice, act, notes].map((b) => FormDoc.parse({ title: "t", blocks: [b], endings: [{ id: "end_dr_ok001", ref: "end_thanks", title: "Thanks" }] }).blocks[0]!) as Block[];

  it("collapses `neq \"\"` into an ordinary always-go-here step", () => {
    const branches: DraftBranch[] = [{ when: { ref: "q_act", op: "neq", value: "" }, then: "q_notes" }];
    const rules = buildFlowRules(branches, blocks, ["end_thanks"]);
    const mine = rules.filter((r) => r.action_kind === "goto" && r.from === "q_act" && r.target === "q_notes");
    expect(mine).toHaveLength(1);
    // No condition: the canvas draws a step, not a decision with a dead arm.
    expect(mine[0]!.when?.conditions ?? []).toEqual([]);
  });

  it("drops `eq \"\"` rather than drawing a wire nobody travels", () => {
    const branches: DraftBranch[] = [{ when: { ref: "q_act", op: "eq", value: "" }, then: "q_notes" }];
    const rules = buildFlowRules(branches, blocks, ["end_thanks"]);
    const conditioned = rules.filter(
      (r) => r.action_kind === "goto" && r.from === "q_act" && (r.when?.conditions?.length ?? 0) > 0,
    );
    expect(conditioned).toEqual([]);
  });

  it("leaves a real condition exactly where it is", () => {
    const branches: DraftBranch[] = [{ when: { ref: "q_role", op: "eq", value: "opt_watch" }, then: "q_notes" }];
    const rules = buildFlowRules(branches, blocks, ["end_thanks"]);
    const mine = rules.find((r) => r.action_kind === "goto" && r.from === "q_role" && r.target === "q_notes");
    expect(mine?.when?.conditions?.[0]).toMatchObject({ op: "eq", value: "opt_watch" });
  });
});

describe("a form with none of this wrong", () => {
  it("is quiet", () => {
    const doc = build(
      [choice, act, notes],
      [rule("q_role", "eq", "opt_watch", "end_audience", "ending"), rule("q_role", "eq", "opt_perform", "q_act")],
    );
    const codes = codesOf(doc);
    for (const code of ["always_true_route", "never_true_route", "value_not_an_option", "exact_match_on_free_text"]) {
      expect(codes).not.toContain(code);
    }
  });
});

/**
 * Ending rules — the one rule in a form that is about an answer given earlier.
 *
 * They decide which ending a finished response gets, are evaluated once
 * against the whole answer set, and had never been written by anything. The
 * shapes below are the two ways to get one wrong.
 */
describe("a rule that picks the ending", () => {
  const endingRule = (from: string | undefined, ref: string, value: string) => ({
    id: "rl_dr_end001",
    action_kind: "goto",
    ...(from ? { from } : {}),
    when: { op: "and", conditions: [{ left: { kind: "ref", ref }, op: "eq", value }], groups: [] },
    target: "end_audience",
    targetKind: "ending",
  });

  const withEndingRules = (rules: unknown[]) =>
    FormDoc.parse({
      title: "t",
      blocks: [choice, notes],
      endings: [
        { id: "end_dr_ok001", ref: "end_thanks", title: "Thanks", kind: "success" },
        { id: "end_dr_out01", ref: "end_audience", title: "See you in the audience", kind: "success" },
      ],
      logic: [],
      endingRules: rules,
    });

  it("is quiet when it reads a real option on a real question", () => {
    const doc = withEndingRules([endingRule(undefined, "q_role", "opt_watch")]);
    expect(lintFormDoc(doc)).toEqual([]);
  });

  it("is flagged when it is tied to a question, because then it never runs", () => {
    // `applyLogicRules` skips a goto whose `from` does not match the question
    // just answered, and ending resolution passes none.
    const doc = withEndingRules([endingRule("q_role", "q_role", "opt_watch")]);
    const issue = lintFormDoc(doc).find((i) => i.code === "ending_rule_scoped");
    expect(issue?.level).toBe("warning");
    expect(issue?.refs).toEqual(["end_audience"]);
  });

  it("gets the same dead-condition checks as any other rule", () => {
    const doc = withEndingRules([endingRule(undefined, "q_role", "Just coming to watch and support")]);
    const issue = lintFormDoc(doc).find((i) => i.code === "value_not_an_option");
    expect(issue?.message).toContain("opt_watch");
    // Reported on the ending, which is the only node that can show it — the
    // rule hangs off no question.
    expect(issue?.refs).toEqual(["end_audience"]);
  });
});

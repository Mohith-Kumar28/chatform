import { describe, expect, it } from "vitest";
import { Block, rulesAreExhaustive, type LogicRule } from "../src/index";

/**
 * Does a branch leave anything to fall through?
 *
 * The flow canvas asks this to decide whether to draw an "otherwise" row, so a
 * false negative is not cosmetic: it puts a route on the author's screen that
 * no respondent can ever travel, under the two arms of a branch that is already
 * complete. Which is exactly what a two-armed Yes/No did — neither `yes_no` nor
 * `legal_consent` carries an `options` array, so the only check that existed
 * skipped both of them.
 */

type GotoRule = Extract<LogicRule, { action_kind: "goto" }>;

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

const rule = (n: number, ref: string, op: string, value?: unknown): GotoRule =>
  ({
    id: uid("rl", n),
    action_kind: "goto",
    from: ref,
    when: {
      op: "and",
      conditions: [{ left: { kind: "ref", ref }, op, ...(value === undefined ? {} : { value }) }],
      groups: [],
    },
    target: "end_thanks",
    targetKind: "ending",
  }) as GotoRule;

const unconditional = (n: number, ref: string): GotoRule =>
  ({
    id: uid("rl", n),
    action_kind: "goto",
    from: ref,
    when: { op: "and", conditions: [], groups: [] },
    target: "end_thanks",
    targetKind: "ending",
  }) as GotoRule;

const yesNo = () => Block.parse({ id: uid("blk", 1), ref: "q_meets", type: "yes_no", title: "Meets it?" });
const consent = () =>
  Block.parse({
    id: uid("blk", 2),
    ref: "q_conduct",
    type: "legal_consent",
    title: "Code of conduct",
    consentText: "I agree.",
    allowDecline: true,
  });
const select = (n: number) =>
  Block.parse({
    id: uid("blk", 3),
    ref: "q_role",
    type: "single_select",
    title: "Role?",
    options: Array.from({ length: n }, (_, i) => ({ id: `opt_0000${i}`, label: `Option ${i}` })),
  });
const number = () => Block.parse({ id: uid("blk", 4), ref: "q_size", type: "number", title: "How many?" });

describe("a yes/no branch", () => {
  it("is exhaustive with both answers routed", () => {
    // The case in front of the author: "Yes" to one place, "No" to another.
    // Reported as having a fall-through, so the canvas drew an otherwise row.
    const block = yesNo();
    const rules = [rule(1, "q_meets", "eq", true), rule(2, "q_meets", "eq", false)];
    expect(rulesAreExhaustive(block, rules)).toBe(true);
  });

  it("is exhaustive as eq against neq on the same value", () => {
    const block = yesNo();
    expect(rulesAreExhaustive(block, [rule(1, "q_meets", "eq", true), rule(2, "q_meets", "neq", true)])).toBe(true);
  });

  it("is exhaustive as is_checked against is_not_checked", () => {
    // Complements by definition: `left === true` against `left !== true`.
    const block = yesNo();
    expect(
      rulesAreExhaustive(block, [rule(1, "q_meets", "is_checked"), rule(2, "q_meets", "is_not_checked")]),
    ).toBe(true);
  });

  it("is not exhaustive with only one answer routed", () => {
    // "No" still falls through to whatever comes next, and the canvas has to
    // keep saying so.
    expect(rulesAreExhaustive(yesNo(), [rule(1, "q_meets", "eq", true)])).toBe(false);
  });
});

describe("a consent branch", () => {
  it("is exhaustive with agreeing and declining both routed", () => {
    const rules = [rule(1, "q_conduct", "eq", true), rule(2, "q_conduct", "eq", false)];
    expect(rulesAreExhaustive(consent(), rules)).toBe(true);
  });

  it("is not exhaustive with only the refusal routed", () => {
    expect(rulesAreExhaustive(consent(), [rule(1, "q_conduct", "eq", false)])).toBe(false);
  });
});

describe("the shapes that already worked", () => {
  it("covers every option of a choice question", () => {
    const rules = [rule(1, "q_role", "eq", "opt_00000"), rule(2, "q_role", "eq", "opt_00001")];
    expect(rulesAreExhaustive(select(2), rules)).toBe(true);
    // A third option nobody routed still falls through.
    expect(rulesAreExhaustive(select(3), rules)).toBe(false);
  });

  it("covers a number with two halves that meet", () => {
    expect(rulesAreExhaustive(number(), [rule(1, "q_size", "lte", 5), rule(2, "q_size", "gte", 6)])).toBe(true);
    // `lte 2` and `gte 4` say nothing about 3.
    expect(rulesAreExhaustive(number(), [rule(1, "q_size", "lte", 2), rule(2, "q_size", "gte", 4)])).toBe(false);
  });

  it("treats an unconditional rule as taking everyone", () => {
    expect(rulesAreExhaustive(yesNo(), [unconditional(1, "q_meets")])).toBe(true);
  });

  it("gives up on anything compound rather than guessing", () => {
    // Erring toward "not exhaustive" keeps a block reachable, which never
    // invents a problem that is not there.
    const compound = {
      ...rule(1, "q_meets", "eq", true),
      when: {
        op: "or",
        conditions: [{ left: { kind: "ref", ref: "q_meets" }, op: "eq", value: true }],
        groups: [{ op: "and", conditions: [], groups: [] }],
      },
    } as GotoRule;
    expect(rulesAreExhaustive(yesNo(), [compound])).toBe(false);
  });

  it("is never exhaustive with no rules at all", () => {
    expect(rulesAreExhaustive(yesNo(), [])).toBe(false);
  });
});

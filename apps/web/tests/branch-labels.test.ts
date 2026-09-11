import { describe, expect, it } from "vitest";
import { Block } from "@repo/form-schema";
import { caseLabel, edgeLabel } from "@/components/builder/branch-layout";

/**
 * What a route's wire says on the canvas.
 *
 * A correct flow labelled wrongly is indistinguishable from a broken one, and
 * this label used to drop the operator: a Yes/No branch with one arm for "Yes"
 * and one for "not Yes" drew the SAME words on both wires, pointing at
 * different places, with nothing on screen to tell them apart.
 */

const yesNo = (over: Record<string, unknown> = {}) =>
  Block.parse({
    id: "blk_yn000001",
    ref: "q_meets",
    type: "yes_no",
    title: "Does your team meet the mandatory requirements?",
    ...over,
  });

const consent = (over: Record<string, unknown> = {}) =>
  Block.parse({
    id: "blk_cn000001",
    ref: "q_conduct",
    type: "legal_consent",
    title: "Code of conduct",
    consentText: "I agree.",
    ...over,
  });

const select = (labels: string[]) =>
  Block.parse({
    id: "blk_sl000001",
    ref: "q_role",
    type: "single_select",
    title: "Your role?",
    options: labels.map((label, i) => ({ id: `opt_0000${i}`, label })),
  });

describe("yes/no route labels", () => {
  const block = yesNo({ yesLabel: "Yes, verified", noLabel: "No" });

  it("names the answer, using the block's own labels", () => {
    expect(edgeLabel(block, { op: "eq", value: true })).toBe("Yes, verified");
    expect(edgeLabel(block, { op: "eq", value: false })).toBe("No");
  });

  it("reads a negation as the other answer", () => {
    // The bug: both of these came back "Yes, verified", because only the value
    // was consulted. A boolean has two answers, so "not Yes" is "No" — shorter
    // than "not Yes, verified" and no less true.
    expect(edgeLabel(block, { op: "neq", value: true })).toBe("No");
    expect(edgeLabel(block, { op: "neq", value: false })).toBe("Yes, verified");
  });

  it("never gives two routes of a two-armed branch the same label", () => {
    const yes = edgeLabel(block, { op: "eq", value: true });
    const not = edgeLabel(block, { op: "neq", value: true });
    expect(yes).not.toBe(not);
  });

  it("falls back to Yes/No when the block was not relabelled", () => {
    expect(edgeLabel(yesNo(), { op: "eq", value: true })).toBe("Yes");
    expect(edgeLabel(yesNo(), { op: "neq", value: true })).toBe("No");
  });
});

describe("consent route labels", () => {
  const block = consent({ allowDecline: true, agreeLabel: "I agree", declineLabel: "I do not agree" });

  it("names agreeing and declining", () => {
    expect(edgeLabel(block, { op: "eq", value: true })).toBe("I agree");
    expect(edgeLabel(block, { op: "eq", value: false })).toBe("I do not agree");
  });

  it("reads a negation as the other side", () => {
    expect(edgeLabel(block, { op: "neq", value: true })).toBe("I do not agree");
  });
});

describe("choice route labels", () => {
  it("names the option", () => {
    const block = select(["Engineer", "Designer", "Product"]);
    expect(edgeLabel(block, { op: "eq", value: "opt_00000" })).toBe("Engineer");
  });

  it("keeps a negation a negation past two options", () => {
    // With three options "not Engineer" is not any single answer, so rewriting
    // it as one would be a lie.
    const block = select(["Engineer", "Designer", "Product"]);
    expect(edgeLabel(block, { op: "neq", value: "opt_00000" })).toBe("not Engineer");
  });

  it("resolves a negation to the other option when there are exactly two", () => {
    const block = select(["Yes, verified", "No"]);
    expect(edgeLabel(block, { op: "neq", value: "opt_00000" })).toBe("No");
  });

  it("falls back to the operator's own words for a value that is not an option", () => {
    const block = select(["Engineer", "Designer"]);
    expect(edgeLabel(block, { op: "contains", value: "eng" })).toBe("contains eng");
  });
});

describe("labels with no block to consult", () => {
  it("states the operator and the value", () => {
    expect(edgeLabel(null, { op: "gte", value: 5 })).toBe("greater or equal 5");
    expect(edgeLabel(null, { op: "is_not_empty" })).toBe("is not empty");
  });
});

/**
 * A route holds a list of conditions now, because a range needs two of them.
 * The node row has to speak for all of them: a label that reads only the first
 * describes a form that routes differently from the one it is drawn on.
 */
describe("labels for a route with more than one condition", () => {
  const age = Block.parse({
    id: "blk_ag000001",
    ref: "q_age",
    type: "number",
    title: "Participant's age?",
  });
  const group = (conditions: { op: string; value?: unknown }[], op: "and" | "or" = "and") => ({
    op,
    conditions,
  });

  it("reads a pair of inclusive bounds as the range a person would say", () => {
    expect(
      caseLabel(age, group([{ op: "gte", value: 6 }, { op: "lte", value: 25 }])),
    ).toBe("6–25");
  });

  it("keeps the range the right way round however it was typed", () => {
    expect(
      caseLabel(age, group([{ op: "lte", value: 25 }, { op: "gte", value: 6 }])),
    ).toBe("6–25");
  });

  it("will not turn exclusive bounds into a range it would have to do arithmetic for", () => {
    expect(caseLabel(age, group([{ op: "gt", value: 6 }, { op: "lt", value: 25 }]))).toBe(
      "greater than 6 and less than 25",
    );
  });

  it("joins an 'any of' route with its own word", () => {
    expect(caseLabel(age, group([{ op: "eq", value: 1 }, { op: "eq", value: 2 }], "or"))).toBe(
      "equals 1 or equals 2",
    );
  });

  it("leaves a single condition exactly as it read before", () => {
    expect(caseLabel(age, group([{ op: "gte", value: 6 }]))).toBe("greater or equal 6");
  });

  it("calls a route with no conditions what it is", () => {
    expect(caseLabel(age, group([]))).toBe("always");
    expect(caseLabel(age, null)).toBe("always");
  });

  it("cuts a label too long for the node rather than overflowing it", () => {
    const long = caseLabel(age, group([
      { op: "gte", value: 100000 },
      { op: "lte", value: 200000 },
      { op: "neq", value: 150000 },
    ]));
    expect(long.length).toBeLessThanOrEqual(34);
    expect(long.endsWith("…")).toBe(true);
  });
});

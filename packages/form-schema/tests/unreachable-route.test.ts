import { describe, expect, it } from "vitest";
import { FormDoc, lintFormDoc, resolveNext, type EvalState } from "../src/index";

/**
 * A route the flow will never read, reported before a respondent finds it.
 *
 * From a real intake for 6-to-25-year-olds. Its age question had three routes —
 * "≥ 6 carry on", "< 6 referral", "> 25 referral" — and routes are matched in
 * order, so "≥ 6" answered for the over-25s too and the arm written for them
 * could never fire. A 40-year-old was taken through as eligible. Everything
 * about the form looked right, including the canvas.
 *
 * The fix an author reaches for is the range, which is why these tests pin both
 * halves: the overlap is reported, and closing the first route with an upper
 * bound both silences the report and routes the over-25s where they belong.
 */

const doc = (logic: unknown[]) =>
  FormDoc.parse({
    title: "Intake",
    blocks: [
      { id: "blk_aaaa01", ref: "q_age", type: "number", title: "Participant's age?", required: true },
      { id: "blk_aaaa02", ref: "q_referral", type: "yes_no", title: "Know someone aged 6-25?", required: true },
      { id: "blk_aaaa03", ref: "q_about", type: "short_text", title: "Tell us more", required: true },
    ],
    endings: [{ id: "end_aaaa01", ref: "end_thanks", title: "Thanks" }],
    logic,
  });

const goto = (id: string, conditions: unknown[], target: string, op: "and" | "or" = "and") => ({
  id,
  action_kind: "goto",
  from: "q_age",
  when: { op, conditions: conditions.map((c) => ({ left: { kind: "ref", ref: "q_age" }, ...(c as object) })), groups: [] },
  target,
  targetKind: "block",
});

const overlapping = doc([
  goto("rl_aaaa01", [{ op: "gte", value: 6 }], "q_about"),
  goto("rl_aaaa02", [{ op: "lt", value: 6 }], "q_referral"),
  goto("rl_aaaa03", [{ op: "gt", value: 25 }], "q_referral"),
]);

const ranged = doc([
  goto("rl_aaaa01", [{ op: "gte", value: 6 }, { op: "lte", value: 25 }], "q_about"),
  goto("rl_aaaa02", [{ op: "lt", value: 6 }], "q_referral"),
  goto("rl_aaaa03", [{ op: "gt", value: 25 }], "q_referral"),
]);

const issue = (d: FormDoc) => lintFormDoc(d).find((i) => i.code === "unreachable_route");
const next = (d: FormDoc, age: number) => {
  const state: EvalState = { answers: { q_age: age }, variables: {}, hidden: {} };
  const step = resolveNext(d, "q_age", state);
  return step.kind === "block" ? step.block.ref : `ending:${step.ending.ref}`;
};

describe("a route an earlier route already answers for", () => {
  it("reports the arm that can never run, and names both positions", () => {
    const found = issue(overlapping);
    expect(found?.level).toBe("warning");
    expect(found?.refs).toEqual(["q_age"]);
    expect(found?.message).toContain("route 3 can never run");
    expect(found?.message).toContain("route 1");
  });

  it("is silent once the first route is bounded at both ends", () => {
    expect(issue(ranged)).toBeUndefined();
  });

  it("says nothing about a route that merely overlaps without covering", () => {
    // "≥ 6" does not answer for "< 6": neither contains the other.
    const found = lintFormDoc(
      doc([
        goto("rl_aaaa01", [{ op: "gte", value: 6 }], "q_about"),
        goto("rl_aaaa02", [{ op: "lt", value: 6 }], "q_referral"),
      ]),
    ).find((i) => i.code === "unreachable_route");
    expect(found).toBeUndefined();
  });

  it("leaves tests it cannot read as numbers alone", () => {
    const found = lintFormDoc(
      doc([
        goto("rl_aaaa01", [{ op: "is_not_empty" }], "q_about"),
        goto("rl_aaaa02", [{ op: "gt", value: 25 }], "q_referral"),
      ]),
    ).find((i) => i.code === "unreachable_route");
    expect(found).toBeUndefined();
  });

  it("does not read an 'any of' route as a stretch of the number line", () => {
    // `≥ 6 OR ≤ 25` is every number there is, but this only reasons about
    // "and" — and saying nothing is the right failure for a warning.
    const found = lintFormDoc(
      doc([
        goto("rl_aaaa01", [{ op: "gte", value: 6 }, { op: "lte", value: 25 }], "q_about", "or"),
        goto("rl_aaaa02", [{ op: "gt", value: 25 }], "q_referral"),
      ]),
    ).find((i) => i.code === "unreachable_route");
    expect(found).toBeUndefined();
  });
});

describe("the flow the warning is about", () => {
  it("routes a 40-year-old as eligible while the routes overlap", () => {
    expect(next(overlapping, 40)).toBe("q_about");
  });

  it("sends them to the referral question once the range is closed", () => {
    expect(next(ranged, 40)).toBe("q_referral");
    expect(next(ranged, 23)).toBe("q_about");
    expect(next(ranged, 5)).toBe("q_referral");
  });

  it("keeps the bounds inclusive at both ends", () => {
    expect(next(ranged, 6)).toBe("q_about");
    expect(next(ranged, 25)).toBe("q_about");
    expect(next(ranged, 26)).toBe("q_referral");
  });
});

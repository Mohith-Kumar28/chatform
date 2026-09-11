import { describe, expect, it } from "vitest";
import { FormDoc, applyLogicRules, buildFlowRules, lintFormDoc, type DraftBranch } from "../src/index";

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

/**
 * The Gandhari Vidya intake, cut down to the part that broke.
 *
 * An age question already screened out anyone over 25. Asked to offer a
 * referral to anyone under 6, the AI bar inserted the referral question
 * directly below the age and routed "under 6" to it — and nothing sent the
 * 6-to-25s past it. They fell through into the referral, which screens out,
 * and every question after it became unreachable.
 */
const blocks = FormDoc.parse({
  schemaVersion: 1,
  title: "T",
  blocks: [
    { id: uid("blk", 1), ref: "q_age", type: "number", title: "Age", required: true },
    { id: uid("blk", 2), ref: "q_referral", type: "short_text", title: "Referral" },
    { id: uid("blk", 3), ref: "q_awareness", type: "short_text", title: "Awareness" },
    { id: uid("blk", 4), ref: "q_questions", type: "short_text", title: "Questions" },
  ],
  endings: [
    { id: uid("end", 1), ref: "end_thanks", title: "Thanks" },
    { id: uid("end", 2), ref: "end_ineligible", title: "Not eligible", kind: "screen_out" },
  ],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  settings: {},
  theme: {},
}).blocks;

const endingRefs = ["end_thanks", "end_ineligible"];

const over25: DraftBranch = { when: { ref: "q_age", op: "gt", value: 25 }, then: "end_ineligible" };
const under6: DraftBranch = { when: { ref: "q_age", op: "lt", value: 6 }, then: "q_referral" };
const referralOut: DraftBranch[] = [
  { when: { ref: "q_referral", op: "neq", value: "" }, then: "end_ineligible" },
  { when: { ref: "q_referral", op: "eq", value: "" }, then: "end_ineligible" },
];

function docWith(logic: unknown[]) {
  return FormDoc.parse({
    schemaVersion: 1,
    title: "T",
    blocks,
    endings: [
      { id: uid("end", 1), ref: "end_thanks", title: "Thanks" },
      { id: uid("end", 2), ref: "end_ineligible", title: "Not eligible", kind: "screen_out" },
    ],
    logic,
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });
}

/** Where an answer on `ref` sends the respondent, by the rules as stored. */
function next(doc: ReturnType<typeof docWith>, ref: string, value: unknown) {
  return applyLogicRules(doc.logic, { answers: { [ref]: value }, variables: {} } as never, ref);
}

describe("a conditional question beside a branch that ends the form", () => {
  it("skips the eligible past it when the draft restates the ending branch", () => {
    const logic = buildFlowRules([over25, under6, ...referralOut], blocks, endingRefs);
    const doc = docWith(logic);
    expect(next(doc, "q_age", 12)).toEqual({ gotoRef: "q_awareness", gotoKind: "block" });
    expect(next(doc, "q_age", 4)).toEqual({ gotoRef: "q_referral", gotoKind: "block" });
    expect(next(doc, "q_age", 30)).toEqual({ gotoRef: "end_ineligible", gotoKind: "ending" });
    expect(lintFormDoc(doc).map((i) => i.code)).not.toContain("unreachable_blocks");
  });

  it("skips the eligible past it when the ending branch was already on the form", () => {
    const existing = buildFlowRules([over25], blocks, endingRefs);
    const added = buildFlowRules([under6, ...referralOut], blocks, endingRefs, existing as never);
    const doc = docWith([...existing, ...added]);
    expect(next(doc, "q_age", 12)).toEqual({ gotoRef: "q_awareness", gotoKind: "block" });
    expect(next(doc, "q_age", 30)).toEqual({ gotoRef: "end_ineligible", gotoKind: "ending" });
    expect(lintFormDoc(doc).map((i) => i.code)).not.toContain("unreachable_blocks");
  });

  it("draws 'empty' and 'not empty' to the same place as one unconditional route", () => {
    const logic = buildFlowRules([under6, ...referralOut], blocks, endingRefs);
    const fromReferral = logic.filter((r) => r.action_kind === "goto" && r.from === "q_referral");
    expect(fromReferral).toHaveLength(1);
    expect((fromReferral[0] as { when: { conditions: unknown[] } }).when.conditions).toEqual([]);
  });
});

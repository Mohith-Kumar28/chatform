import { describe, expect, it } from "vitest";
import { FormDoc, repairFlow, resolveNext, type Block, type EvalState } from "@repo/form-schema";
import { conditionalRule, choicesFor, deciderFor, opsFor } from "@/components/builder/condition-row";

/**
 * Adding a conditional question from the Questions list.
 *
 * The picker writes only the positive branch and leaves `repairFlow` to derive
 * the skip. That division is the whole design, so it is worth proving that the
 * two halves together produce a flow where the people who should not see the
 * question genuinely do not.
 */

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

function docWithPlatform() {
  return FormDoc.parse({
    schemaVersion: 1,
    title: "Waitlist",
    blocks: [
      { id: uid("blk", 1), ref: "welcome", type: "welcome", title: "Hi" },
      {
        id: uid("blk", 2),
        ref: "q_platform",
        type: "single_select",
        title: "Which platform?",
        required: true,
        options: [
          { id: "opt_android", label: "Android" },
          { id: "opt_ios", label: "iOS" },
        ],
      },
      { id: uid("blk", 3), ref: "q_email", type: "email", title: "Your email?", required: true },
    ],
    endings: [{ id: uid("end", 1), ref: "end_thanks", title: "Thanks" }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });
}

const NEW_BLOCK = {
  id: uid("blk", 9),
  ref: "q_play_email",
  type: "email" as const,
  title: "Play Store email?",
  required: true,
} as unknown as Block;

function walk(doc: ReturnType<typeof FormDoc.parse>, answers: Record<string, unknown>): string[] {
  const path: string[] = [];
  let current = doc.blocks[0]!.ref;
  for (let guard = 0; guard < 30; guard++) {
    path.push(current);
    const state: EvalState = { answers, variables: {}, hiddenFields: {} };
    const next = resolveNext(doc, current, state);
    if (next.kind !== "block") break;
    current = next.block.ref;
  }
  return path;
}

/** What the picker does: insert at `index`, add the positive branch, repair. */
function insertConditional(index: number, optionId: string) {
  const doc = docWithPlatform();
  const decider = deciderFor(doc.blocks, index)!;
  const rule = conditionalRule(decider, { ref: decider.ref, op: "eq", value: optionId }, NEW_BLOCK.ref);
  const blocks = [...doc.blocks];
  blocks.splice(index, 0, NEW_BLOCK);
  return repairFlow({ ...doc, blocks, logic: [...doc.logic, rule] });
}

describe("deciderFor", () => {
  it("picks the question directly above the insertion point", () => {
    const doc = docWithPlatform();
    expect(deciderFor(doc.blocks, 2)?.ref).toBe("q_platform");
  });

  it("offers nothing when only the greeting is above", () => {
    const doc = docWithPlatform();
    // Index 1 sits directly under the welcome block, which decides nothing.
    expect(deciderFor(doc.blocks, 1)).toBeNull();
  });
});

describe("opsFor / choicesFor", () => {
  it("offers the question's own answers for a choice question", () => {
    const platform = docWithPlatform().blocks[1]!;
    expect(choicesFor(platform).map((c) => c.label)).toEqual(["Android", "iOS"]);
    expect(opsFor(platform)[0]!.value).toBe("eq");
  });

  it("offers comparisons for a scale, not a list of answers", () => {
    const nps = { id: uid("blk", 5), ref: "q_nps", type: "nps", title: "Recommend?" } as unknown as Block;
    expect(choicesFor(nps)).toEqual([]);
    expect(opsFor(nps).map((o) => o.value)).toContain("gte");
  });

  it("marks the ops that need no value", () => {
    const platform = docWithPlatform().blocks[1]!;
    const answered = opsFor(platform).find((o) => o.value === "is_not_empty");
    expect(answered?.needsValue).toBe(false);
  });
});

describe("inserting a conditional question", () => {
  it("asks it only of the answer it was conditioned on", () => {
    const doc = insertConditional(2, "opt_android");

    const android = walk(doc, { q_platform: "opt_android", q_play_email: "a@b.co", q_email: "a@b.co" });
    const ios = walk(doc, { q_platform: "opt_ios", q_play_email: "a@b.co", q_email: "a@b.co" });

    expect(android).toContain("q_play_email");
    // The half the picker does not write, and the half that matters.
    expect(ios).not.toContain("q_play_email");
    // Nobody loses the question that came after it.
    expect(android).toContain("q_email");
    expect(ios).toContain("q_email");
  });

  it("writes exactly one rule and lets the repair derive the rest", () => {
    const doc = insertConditional(2, "opt_android");
    const gotos = doc.logic.filter((r) => r.action_kind === "goto");
    // One positive branch in, more than one rule out — the difference is the
    // derived skip.
    expect(gotos.length).toBeGreaterThan(1);
    expect(gotos.some((r) => r.from === "q_platform" && r.target === "q_play_email")).toBe(true);
  });

  it("produces a document the schema still accepts", () => {
    const doc = insertConditional(2, "opt_android");
    expect(() => FormDoc.parse(doc)).not.toThrow();
  });
});

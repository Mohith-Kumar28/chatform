import { describe, expect, it } from "vitest";
import { FormDoc, applyLogicRules, buildFlowRules, lintFormDoc, repairFlow, type DraftBranch } from "../src/index";

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

/**
 * An intake with three whole arms and no trunk, as generated for a real author:
 * "book a call, VC firm, or founder?" Each answer gets its own questions and
 * none of them meet again. The founder arm opens with a contact card nothing
 * branches from, so without a declared rejoin the founder arm was read as one
 * question long, and the booking and VC arms were joined into its second
 * question, asking investors what company they were building.
 */
const refs = [
  "q_path",
  "q_book",
  "q_vc_contact",
  "q_vc_firm",
  "q_vc_site",
  "q_f_contact",
  "q_f_company",
  "q_f_site",
  "q_f_building",
] as const;

function doc(logic: unknown[] = [], order: readonly string[] = refs) {
  return FormDoc.parse({
    schemaVersion: 1,
    title: "Intake",
    blocks: order.map((ref, i) =>
      ref === "q_path"
        ? {
            id: uid("blk", i + 1),
            ref,
            type: "single_select",
            title: "How would you like to proceed?",
            required: true,
            options: [
              { id: "opt_book", label: "Book an intro call" },
              { id: "opt_vc", label: "VC firm" },
              { id: "opt_founder", label: "Founder" },
            ],
          }
        : { id: uid("blk", i + 1), ref, type: "short_text", title: ref, required: true },
    ),
    endings: [
      { id: uid("end", 1), ref: "end_thanks", title: "Thanks" },
      { id: uid("end", 2), ref: "end_no", title: "Not a fit", kind: "screen_out" },
    ],
    logic,
  });
}

const endingRefs = ["end_thanks", "end_no"];

function branches(rejoin?: string): DraftBranch[] {
  return [
    { when: { ref: "q_path", op: "eq", value: "opt_book" }, then: "q_book", rejoin },
    { when: { ref: "q_path", op: "eq", value: "opt_vc" }, then: "q_vc_contact", rejoin },
    { when: { ref: "q_path", op: "eq", value: "opt_founder" }, then: "q_f_contact", rejoin },
  ];
}

/** Every question one respondent is asked, walking the stored rules. */
function walk(d: ReturnType<typeof doc>, choice: string): string[] {
  const asked: string[] = [];
  let at = d.blocks[0]!.ref;
  for (let guard = 0; guard < 50; guard++) {
    asked.push(at);
    const value = at === "q_path" ? choice : "x";
    const hop = applyLogicRules(d.logic, { answers: { [at]: value }, variables: {} } as never, at);
    if (hop?.gotoKind === "ending") return [...asked, hop.gotoRef];
    const i = d.blocks.findIndex((b) => b.ref === at);
    const nextRef = hop?.gotoRef ?? d.blocks[i + 1]?.ref;
    if (!nextRef) return [...asked, d.endings[0]!.ref];
    at = nextRef;
  }
  throw new Error("loop");
}

describe("arms that never meet again", () => {
  it("runs each arm to the ending when the rejoin is declared", () => {
    const d = doc(buildFlowRules(branches("end_thanks"), doc().blocks, endingRefs));
    expect(walk(d, "opt_book")).toEqual(["q_path", "q_book", "end_thanks"]);
    expect(walk(d, "opt_vc")).toEqual(["q_path", "q_vc_contact", "q_vc_firm", "q_vc_site", "end_thanks"]);
    expect(walk(d, "opt_founder")).toEqual([
      "q_path",
      "q_f_contact",
      "q_f_company",
      "q_f_site",
      "q_f_building",
      "end_thanks",
    ]);
    expect(lintFormDoc(d).filter((i) => i.level === "error")).toEqual([]);
  });

  it("keeps the arms apart after the flow is repaired, e.g. by a drag", () => {
    const built = doc(buildFlowRules(branches("end_thanks"), doc().blocks, endingRefs));
    // Swap two founder questions: an ordinary drag inside the last arm.
    const moved = ["q_path", "q_book", "q_vc_contact", "q_vc_firm", "q_vc_site", "q_f_contact", "q_f_site", "q_f_company", "q_f_building"];
    const dragged = repairFlow(doc(built.logic, moved));
    expect(walk(dragged, "opt_vc")).toEqual(["q_path", "q_vc_contact", "q_vc_firm", "q_vc_site", "end_thanks"]);
    expect(walk(dragged, "opt_book")).toEqual(["q_path", "q_book", "end_thanks"]);
  });

  it("sends the last arm to the declared ending even when it is not the first", () => {
    const d = doc(buildFlowRules(branches("end_no"), doc().blocks, endingRefs));
    expect(walk(d, "opt_founder").at(-1)).toBe("end_no");
    expect(walk(d, "opt_vc").at(-1)).toBe("end_no");
  });

  it("still rejoins at a declared trunk question", () => {
    // Treat the last two founder questions as everyone's.
    const d = doc(buildFlowRules(branches("q_f_site"), doc().blocks, endingRefs));
    expect(walk(d, "opt_vc")).toEqual(["q_path", "q_vc_contact", "q_vc_firm", "q_vc_site", "q_f_site", "q_f_building", "end_thanks"]);
    expect(walk(d, "opt_founder")).toEqual(["q_path", "q_f_contact", "q_f_company", "q_f_site", "q_f_building", "end_thanks"]);
  });

  it("ignores a rejoin that points into the arms", () => {
    const d = doc(buildFlowRules(branches("q_vc_firm"), doc().blocks, endingRefs));
    // Falls back to inference, which is no worse than before.
    expect(walk(d, "opt_vc").slice(0, 2)).toEqual(["q_path", "q_vc_contact"]);
  });
});

describe("an author's own jumps survive a repair", () => {
  const jump = (from: string, target: string, targetKind: "block" | "ending") => ({
    id: `rl_${from}`,
    action_kind: "goto" as const,
    from,
    when: null,
    target,
    targetKind,
  });

  it("keeps a question cut off to end the form", () => {
    const built = doc(buildFlowRules(branches("end_thanks"), doc().blocks, endingRefs));
    // The author cut the founder arm short after the company question.
    const cut = doc([...built.logic, jump("q_f_company", "end_thanks", "ending")]);
    const repaired = repairFlow(cut);
    expect(walk(repaired, "opt_founder")).toEqual(["q_path", "q_f_contact", "q_f_company", "end_thanks"]);
  });

  it("puts it after the question's branches, so it cannot shadow them", () => {
    const built = doc(buildFlowRules(branches("end_thanks"), doc().blocks, endingRefs));
    // A hand-aimed "otherwise" on the deciding question itself.
    const repaired = repairFlow(doc([jump("q_path", "q_f_site", "block"), ...built.logic]));
    expect(walk(repaired, "opt_vc")[1]).toBe("q_vc_contact");
    expect(walk(repaired, "opt_book")[1]).toBe("q_book");
  });

  it("drops one that now points backwards", () => {
    const repaired = repairFlow(doc([jump("q_f_site", "q_book", "block")]));
    expect(repaired.logic.some((r) => r.action_kind === "goto" && r.from === "q_f_site" && r.target === "q_book")).toBe(false);
  });
});

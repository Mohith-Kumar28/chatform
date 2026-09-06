import { describe, expect, it } from "vitest";
import { Block, buildFlowRules, orderBlocksForBranches, type DraftBranch } from "../src/index";

const q = (n: number, ref: string, extra: Record<string, unknown> = {}) =>
  Block.parse({ id: `blk_${String(n).padStart(8, "0")}`, ref, type: "short_text", title: `Q ${ref}`, ...extra });

const choice = (n: number, ref: string, labels: string[], required = true) =>
  Block.parse({
    id: `blk_${String(n).padStart(8, "0")}`,
    ref,
    type: "single_select",
    title: `Q ${ref}`,
    required,
    options: labels.map((label, i) => ({ id: `opt_${ref}_${i}`, label })),
  });

const on = (ref: string, value: string, then: string, op: DraftBranch["when"]["op"] = "eq"): DraftBranch => ({
  when: { ref, op, value },
  then,
});

describe("orderBlocksForBranches", () => {
  it("leaves a draft whose branches already point downwards alone", () => {
    const blocks = [q(1, "welcome"), choice(2, "q_platform", ["iOS", "Android"]), q(3, "q_ios"), q(4, "q_android")];
    const branches = [on("q_platform", "opt_q_platform_0", "q_ios"), on("q_platform", "opt_q_platform_1", "q_android")];
    expect(orderBlocksForBranches(blocks, branches).map((b) => b.ref)).toEqual([
      "welcome",
      "q_platform",
      "q_ios",
      "q_android",
    ]);
  });

  /**
   * The failure this exists for. `buildFlowRules` discards an upward branch
   * because honouring it would loop, so a model that designed the flow
   * correctly and merely wrote the blocks out in the wrong order used to lose
   * the whole design and hand back a straight line.
   */
  it("lifts a target that was written above the question deciding it", () => {
    const blocks = [q(1, "welcome"), q(2, "q_ios"), q(3, "q_android"), choice(4, "q_platform", ["iOS", "Android"]), q(5, "q_use")];
    const branches = [on("q_platform", "opt_q_platform_0", "q_ios"), on("q_platform", "opt_q_platform_1", "q_android")];
    expect(orderBlocksForBranches(blocks, branches).map((b) => b.ref)).toEqual([
      "welcome",
      "q_platform",
      "q_ios",
      "q_android",
      "q_use",
    ]);
  });

  it("keeps the arms in the order their branches were written", () => {
    const blocks = [q(1, "welcome"), q(2, "q_b"), q(3, "q_a"), choice(4, "q_pick", ["A", "B"])];
    const branches = [on("q_pick", "opt_q_pick_0", "q_a"), on("q_pick", "opt_q_pick_1", "q_b")];
    expect(orderBlocksForBranches(blocks, branches).map((b) => b.ref)).toEqual(["welcome", "q_pick", "q_a", "q_b"]);
  });

  it("survives two questions that each decide the other", () => {
    const blocks = [q(1, "welcome"), q(2, "q_a"), q(3, "q_b")];
    const branches = [on("q_a", "x", "q_b"), on("q_b", "y", "q_a")];
    const out = orderBlocksForBranches(blocks, branches);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((b) => b.ref))).toEqual(new Set(["welcome", "q_a", "q_b"]));
  });

  it("never routes anything above the greeting", () => {
    const blocks = [q(1, "welcome"), q(2, "q_a")];
    expect(orderBlocksForBranches(blocks, [on("q_a", "x", "welcome")]).map((b) => b.ref)).toEqual(["welcome", "q_a"]);
  });

  it("turns a lost branch into a live rule once the order is fixed", () => {
    const blocks = [q(1, "welcome"), q(2, "q_ios"), choice(3, "q_platform", ["iOS", "Android"]), q(4, "q_use")];
    const branches = [on("q_platform", "opt_q_platform_0", "q_ios")];
    expect(buildFlowRules(branches, blocks, ["end_thanks"])).toHaveLength(0);
    const ordered = orderBlocksForBranches(blocks, branches);
    expect(buildFlowRules(branches, ordered, ["end_thanks"]).length).toBeGreaterThan(0);
  });
});

describe("rules that can never fire", () => {
  /**
   * `is_empty` on a required question is a wire nobody travels — the
   * respondent cannot move past the question without answering it — and it
   * used to be drawn on the canvas as a decision the form makes.
   */
  it("drops is_empty hanging off a required question", () => {
    const blocks = [q(1, "welcome"), choice(2, "q_pick", ["A", "B"], true), q(3, "q_next")];
    const rules = buildFlowRules([on("q_pick", "", "q_next", "is_empty")], blocks, ["end_thanks"]);
    expect(rules).toHaveLength(0);
  });

  it("keeps it on an optional question, where it can", () => {
    const blocks = [q(1, "welcome"), choice(2, "q_pick", ["A", "B"], false), q(3, "q_next"), q(4, "q_last")];
    const rules = buildFlowRules([on("q_pick", "", "q_next", "is_empty")], blocks, ["end_thanks"]);
    expect(rules.length).toBeGreaterThan(0);
  });
});

/**
 * The two shapes the generator's prompt teaches, checked against the code that
 * has to understand them.
 *
 * A worked example in a prompt is a promise about behaviour, and it is the kind
 * of promise that rots quietly: the model follows it exactly and the flow comes
 * out wrong, which reads as the model being bad at branching. These fail if the
 * derivation and the prompt ever stop agreeing.
 */
describe("the branch shapes the prompt teaches", () => {
  const isEnding = ["end_thanks"];

  it("routes a per-platform split, with the shared questions below the arms", () => {
    const blocks = [
      q(1, "welcome"),
      q(2, "q_email"),
      choice(3, "q_platform", ["iPhone (iOS)", "Android", "Chrome extension"]),
      q(4, "q_ios_version"),
      q(5, "q_ios_testflight"),
      q(6, "q_android_device"),
      q(7, "q_android_beta"),
      q(8, "q_ext_browser"),
      q(9, "q_use_case"),
      q(10, "q_referral"),
    ];
    const branches = [
      on("q_platform", "opt_q_platform_0", "q_ios_version"),
      on("q_platform", "opt_q_platform_1", "q_android_device"),
      on("q_platform", "opt_q_platform_2", "q_ext_browser"),
    ];
    const rules = buildFlowRules(branches, blocks, isEnding);
    const jumps = rules
      .filter((r) => r.action_kind === "goto")
      .map((r) => `${r.from}${(r.when as { conditions?: unknown[] })?.conditions?.length ? "?" : "!"}${r.target}`);

    // Each arm ends by rejoining the trunk, and nobody falls into the next arm.
    expect(jumps).toContain("q_ios_testflight!q_use_case");
    expect(jumps).toContain("q_android_beta!q_use_case");
    // The last arm needs no jump: q_use_case is simply what follows it.
    expect(jumps).not.toContain("q_ext_browser!q_use_case");
  });

  it("reads two answers naming one question as the place the arms meet again", () => {
    const blocks = [
      q(1, "welcome"),
      choice(2, "q_role", ["Engineer", "Designer", "Product", "Something else"]),
      q(3, "q_languages"),
      q(4, "q_portfolio"),
      q(5, "q_why"),
    ];
    const branches = [
      on("q_role", "opt_q_role_0", "q_languages"),
      on("q_role", "opt_q_role_1", "q_portfolio"),
      on("q_role", "opt_q_role_2", "q_why"),
      on("q_role", "opt_q_role_3", "q_why"),
    ];
    const rules = buildFlowRules(branches, blocks, isEnding);
    const closing = rules.filter(
      (r) => r.action_kind === "goto" && !(r.when as { conditions?: unknown[] })?.conditions?.length,
    );
    // The engineer's arm is one question long and stops at q_why — the shared
    // target — rather than spilling into the designer's.
    expect(closing.map((r) => `${r.from}->${r.target}`)).toEqual(["q_languages->q_why"]);
  });
});

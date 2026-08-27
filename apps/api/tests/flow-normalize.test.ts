import { describe, expect, it } from "vitest";
import { FormDoc, resolveNext, type Block, type EvalState } from "@repo/form-schema";
import { buildFlowRules, type DraftBranch } from "../src/lib/flow-normalize.js";

/**
 * These tests drive the real engine, not the rule list.
 *
 * Asserting on the rules the normalizer emits would pass just as happily for a
 * flow that sends everyone to the wrong question — the first generated form we
 * inspected had four perfectly well-formed rules and still asked people who
 * use a competitor what they use "instead". So each case walks the flow with
 * `resolveNext` and checks the path a respondent actually takes.
 */

function block(ref: string, opts?: string[]): Block {
  return FormDoc.parse({
    title: "t",
    blocks: [
      {
        id: `blk_${ref}`,
        ref,
        type: opts ? "single_select" : "short_text",
        title: ref,
        required: true,
        ...(opts ? { options: opts.map((o) => ({ id: o, label: o })) } : {}),
      },
    ],
    endings: [{ id: "end_aaaaaa", ref: "end_thanks", title: "Thanks" }],
  }).blocks[0]!;
}

function walk(blocks: Block[], branches: DraftBranch[], endingRefs: string[], answers: Record<string, unknown>): string[] {
  const doc = FormDoc.parse({
    title: "t",
    blocks,
    endings: endingRefs.map((ref, i) => ({ id: `end_zz${i}${"a".repeat(3)}`, ref, title: ref })),
    logic: buildFlowRules(branches, blocks, endingRefs),
  });
  const state: EvalState = { answers: answers as never, variables: {}, hidden: {} };
  const path: string[] = [];
  let ref: string | null = null;
  for (let i = 0; i < 30; i++) {
    const next = resolveNext(doc, ref, state);
    if (next.kind === "ending") {
      path.push(next.ending.ref);
      break;
    }
    path.push(next.block.ref);
    ref = next.block.ref;
  }
  return path;
}

describe("two arms off one question", () => {
  // The exact shape the generator produced for a lead-qualification prompt.
  const blocks = [
    block("q_uses_competitor", ["opt_yes", "opt_no"]),
    block("q_which_competitor"),
    block("q_alt_tool"),
    block("q_team_size"),
    block("q_email"),
  ];
  const branches: DraftBranch[] = [
    { when: { ref: "q_uses_competitor", op: "eq", value: "opt_yes" }, then: "q_which_competitor" },
    { when: { ref: "q_uses_competitor", op: "eq", value: "opt_no" }, then: "q_alt_tool" },
  ];
  const run = (answer: string) =>
    walk(blocks, branches, ["end_thanks"], {
      q_uses_competitor: answer,
      q_which_competitor: "x",
      q_alt_tool: "y",
      q_team_size: "z",
      q_email: "a@b.co",
    });

  it("closes the first arm so it does not spill into the second", () => {
    // Before the rejoin rule this was …q_which_competitor → q_alt_tool → …,
    // asking someone who named a competitor what they use instead.
    expect(run("opt_yes")).toEqual(["q_uses_competitor", "q_which_competitor", "q_team_size", "q_email", "end_thanks"]);
  });

  it("leaves the last arm to fall through to the trunk", () => {
    expect(run("opt_no")).toEqual(["q_uses_competitor", "q_alt_tool", "q_team_size", "q_email", "end_thanks"]);
  });

  it("asks every trunk question on both paths", () => {
    for (const answer of ["opt_yes", "opt_no"]) {
      expect(run(answer)).toContain("q_team_size");
      expect(run(answer)).toContain("q_email");
    }
  });
});

describe("a single branch onto the very next block", () => {
  const blocks = [block("q_subscribed", ["opt_yes", "opt_no"]), block("q_why_not"), block("q_email")];
  // "Only ask why not if they said no" — but `q_why_not` is next anyway, so
  // this rule on its own changes nothing and everyone gets asked.
  const branches: DraftBranch[] = [{ when: { ref: "q_subscribed", op: "eq", value: "opt_no" }, then: "q_why_not" }];
  const run = (answer: string) =>
    walk(blocks, branches, ["end_thanks"], { q_subscribed: answer, q_why_not: "x", q_email: "a@b.co" });

  it("derives the complement so the other answer skips the follow-up", () => {
    expect(run("opt_yes")).toEqual(["q_subscribed", "q_email", "end_thanks"]);
  });

  it("still asks the follow-up when the condition holds", () => {
    expect(run("opt_no")).toEqual(["q_subscribed", "q_why_not", "q_email", "end_thanks"]);
  });
});

describe("routing to different endings", () => {
  const blocks = [block("q_team_size"), block("q_email")];
  const branches: DraftBranch[] = [
    { when: { ref: "q_team_size", op: "gt", value: 50 }, then: "end_sales" },
    { when: { ref: "q_team_size", op: "lte", value: 50 }, then: "end_trial" },
  ];

  it("sends each answer to its own outcome", () => {
    expect(walk(blocks, branches, ["end_trial", "end_sales"], { q_team_size: 200 })).toEqual([
      "q_team_size",
      "end_sales",
    ]);
    expect(walk(blocks, branches, ["end_trial", "end_sales"], { q_team_size: 4 })).toEqual([
      "q_team_size",
      "end_trial",
    ]);
  });

  it("drops a branch to an ending that does not exist rather than dead-ending", () => {
    const rules = buildFlowRules(
      [{ when: { ref: "q_team_size", op: "gt", value: 50 }, then: "end_nonexistent" }],
      blocks,
      ["end_thanks"],
    );
    expect(rules).toHaveLength(0);
  });
});

describe("rules that would break the flow are dropped", () => {
  const blocks = [block("q_one"), block("q_two"), block("q_three")];

  it("refuses a backwards jump, which would loop forever", () => {
    const rules = buildFlowRules(
      [{ when: { ref: "q_three", op: "is_not_empty", value: null }, then: "q_one" }],
      blocks,
      ["end_thanks"],
    );
    expect(rules).toHaveLength(0);
  });

  it("refuses a self-jump and an unknown source", () => {
    expect(buildFlowRules([{ when: { ref: "q_two", op: "eq", value: "x" }, then: "q_two" }], blocks, ["end_thanks"])).toHaveLength(0);
    expect(buildFlowRules([{ when: { ref: "q_ghost", op: "eq", value: "x" }, then: "q_two" }], blocks, ["end_thanks"])).toHaveLength(0);
  });

  it("leaves a genuinely linear form alone", () => {
    expect(buildFlowRules([], blocks, ["end_thanks"])).toHaveLength(0);
    expect(walk(blocks, [], ["end_thanks"], { q_one: "a", q_two: "b", q_three: "c" })).toEqual([
      "q_one",
      "q_two",
      "q_three",
      "end_thanks",
    ]);
  });
});

describe("three arms", () => {
  const blocks = [
    block("q_role", ["opt_dev", "opt_design", "opt_other"]),
    block("q_stack"),
    block("q_tools"),
    block("q_role_other"),
    block("q_email"),
  ];
  const branches: DraftBranch[] = [
    { when: { ref: "q_role", op: "eq", value: "opt_dev" }, then: "q_stack" },
    { when: { ref: "q_role", op: "eq", value: "opt_design" }, then: "q_tools" },
    { when: { ref: "q_role", op: "eq", value: "opt_other" }, then: "q_role_other" },
  ];
  const run = (role: string) =>
    walk(blocks, branches, ["end_thanks"], {
      q_role: role,
      q_stack: "ts",
      q_tools: "figma",
      q_role_other: "pm",
      q_email: "a@b.co",
    });

  it("gives each role exactly its own follow-up", () => {
    expect(run("opt_dev")).toEqual(["q_role", "q_stack", "q_email", "end_thanks"]);
    expect(run("opt_design")).toEqual(["q_role", "q_tools", "q_email", "end_thanks"]);
    expect(run("opt_other")).toEqual(["q_role", "q_role_other", "q_email", "end_thanks"]);
  });
});

describe("one block arm alongside an ending arm", () => {
  // The generator produced exactly this for a support survey: "want a
  // callback?" → yes goes to the phone question, no ends the form.
  const blocks = [
    block("q_issue"),
    block("q_callback_want", ["opt_yes", "opt_no"]),
    block("q_phone"),
    block("q_positive"),
  ];
  const branches: DraftBranch[] = [
    { when: { ref: "q_callback_want", op: "eq", value: "opt_yes" }, then: "q_phone" },
    { when: { ref: "q_callback_want", op: "eq", value: "opt_no" }, then: "end_apology" },
  ];

  it("does not invent a complement when the model already routed the rest", () => {
    const rules = buildFlowRules(branches, blocks, ["end_apology"]);
    // Two rules in, two rules out. A third — "neq opt_yes → q_positive" — would
    // compete with the model's own "opt_no → end_apology".
    expect(rules).toHaveLength(2);
    expect(rules.some((r) => r.when?.conditions[0]?.op === "neq")).toBe(false);
  });

  it("sends the ending arm straight to its ending", () => {
    const answers = { q_issue: "slow", q_callback_want: "opt_no", q_phone: "x", q_positive: "y" };
    expect(walk(blocks, branches, ["end_apology"], answers)).toEqual([
      "q_issue",
      "q_callback_want",
      "end_apology",
    ]);
  });

  it("lets a lone block arm fall through, because nothing says where it ends", () => {
    // There is no second block arm to bound this one against, so the only
    // thing the document states is the block order. Jumping to an ending here
    // would be the normalizer guessing at intent. When the model gets this
    // wrong the linter is what catches it — see the unreachable/fall-through
    // checks in `lintFormDoc` — rather than the normalizer papering over it.
    expect(
      walk(blocks, branches, ["end_apology"], {
        q_issue: "slow",
        q_callback_want: "opt_yes",
        q_phone: "x",
        q_positive: "y",
      }),
    ).toEqual(["q_issue", "q_callback_want", "q_phone", "q_positive", "end_apology"]);
  });
});

describe("two branch structures whose arms interleave", () => {
  // Generated from "if in person ask dietary needs and parking; if online ask
  // timezone; everyone gives name and email". The parking arm runs
  // q_car_reg → q_name, and q_timezone sits between them in block order while
  // belonging to the *other* branch entirely.
  const blocks = [
    block("q_attendance", ["opt_in_person", "opt_online"]),
    block("q_needs", ["opt_parking", "opt_vegan"]),
    block("q_car_reg"),
    block("q_timezone"),
    block("q_name"),
    block("q_email"),
  ];
  const branches: DraftBranch[] = [
    { when: { ref: "q_attendance", op: "eq", value: "opt_in_person" }, then: "q_needs" },
    { when: { ref: "q_attendance", op: "eq", value: "opt_online" }, then: "q_timezone" },
    { when: { ref: "q_needs", op: "contains", value: "opt_parking" }, then: "q_car_reg" },
    { when: { ref: "q_needs", op: "not_contains", value: "opt_parking" }, then: "q_name" },
    { when: { ref: "q_car_reg", op: "is_not_empty", value: null }, then: "q_name" },
  ];
  const run = (attendance: string, needs: string) =>
    walk(blocks, branches, ["end_thanks"], {
      q_attendance: attendance,
      q_needs: needs,
      q_car_reg: "AB12 CDE",
      q_timezone: "UTC",
      q_name: "Grace",
      q_email: "a@b.co",
    });

  it("does not cut the online path short at the question it does not own", () => {
    // The naive arm-boundary rule gave q_timezone an unconditional jump to
    // q_email, so everyone attending online was never asked their name.
    expect(run("opt_online", "opt_vegan")).toEqual(["q_attendance", "q_timezone", "q_name", "q_email", "end_thanks"]);
  });

  it("routes the in-person paths through their own follow-ups", () => {
    expect(run("opt_in_person", "opt_parking")).toEqual([
      "q_attendance",
      "q_needs",
      "q_car_reg",
      "q_name",
      "q_email",
      "end_thanks",
    ]);
    expect(run("opt_in_person", "opt_vegan")).toEqual(["q_attendance", "q_needs", "q_name", "q_email", "end_thanks"]);
  });

  it("asks everyone the questions the form said everyone answers", () => {
    for (const path of [run("opt_online", "opt_vegan"), run("opt_in_person", "opt_parking"), run("opt_in_person", "opt_vegan")]) {
      expect(path).toContain("q_name");
      expect(path).toContain("q_email");
    }
  });
});

describe("arms that converge on a shared question", () => {
  // The AI bar, asked to collect an iCloud address from iPhone users and a
  // Play Store address from Android users, hung four conditions off the
  // device question that was already in the form — two to new follow-ups and
  // two sending the remaining options straight on to the existing email
  // question.
  const blocks = [
    block("q_device", ["opt_iphone", "opt_android", "opt_chrome", "opt_multiple"]),
    block("q_apple_email"),
    block("q_playstore_email"),
    block("q_email"),
    block("q_phone"),
  ];
  const branches: DraftBranch[] = [
    { when: { ref: "q_device", op: "eq", value: "opt_iphone" }, then: "q_apple_email" },
    { when: { ref: "q_device", op: "eq", value: "opt_android" }, then: "q_playstore_email" },
    { when: { ref: "q_device", op: "eq", value: "opt_chrome" }, then: "q_email" },
    { when: { ref: "q_device", op: "eq", value: "opt_multiple" }, then: "q_email" },
  ];
  const run = (device: string) =>
    walk(blocks, branches, ["end_thanks"], {
      q_device: device,
      q_apple_email: "a@icloud.com",
      q_playstore_email: "a@gmail.com",
      q_email: "a@b.co",
      q_phone: "+14155550132",
    });

  it("treats the block two conditions share as the rejoin, not as an arm", () => {
    // Reading q_email as the last arm put the rejoin one block further down,
    // so both platform arms jumped to q_phone and skipped it.
    expect(run("opt_iphone")).toEqual(["q_device", "q_apple_email", "q_email", "q_phone", "end_thanks"]);
    expect(run("opt_android")).toEqual(["q_device", "q_playstore_email", "q_email", "q_phone", "end_thanks"]);
  });

  it("sends the options with no follow-up straight to the shared question", () => {
    expect(run("opt_chrome")).toEqual(["q_device", "q_email", "q_phone", "end_thanks"]);
    expect(run("opt_multiple")).toEqual(["q_device", "q_email", "q_phone", "end_thanks"]);
  });

  it("never asks one platform the other platform's question", () => {
    expect(run("opt_iphone")).not.toContain("q_playstore_email");
    expect(run("opt_android")).not.toContain("q_apple_email");
    expect(run("opt_chrome")).not.toContain("q_apple_email");
    expect(run("opt_chrome")).not.toContain("q_playstore_email");
  });

  it("still asks everyone the questions that follow the branch", () => {
    for (const d of ["opt_iphone", "opt_android", "opt_chrome", "opt_multiple"]) {
      expect(run(d)).toContain("q_email");
      expect(run(d)).toContain("q_phone");
    }
  });
});

describe("a test that cannot fail", () => {
  const blocks = [block("q_device", ["opt_iphone", "opt_android"]), block("q_icloud"), block("q_playstore"), block("q_email")];

  it("stores an always-true condition as a plain jump", () => {
    // The generator wrote `q_icloud is_not_empty → q_email` to close the
    // iPhone arm. On a required question that can never be false, and kept as
    // a condition it draws a decision node with one dead arm.
    const rules = buildFlowRules(
      [{ when: { ref: "q_icloud", op: "is_not_empty", value: null }, then: "q_email" }],
      blocks,
      ["end_thanks"],
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]!.when?.conditions).toHaveLength(0);
    expect(rules[0]!.target).toBe("q_email");
  });

  it("keeps it as a condition when the question is optional", () => {
    const optional = blocks.map((b) => (b.ref === "q_icloud" ? { ...b, required: false } : b));
    const rules = buildFlowRules(
      [{ when: { ref: "q_icloud", op: "is_not_empty", value: null }, then: "q_email" }],
      optional,
      ["end_thanks"],
    );
    expect(rules[0]!.when?.conditions).toHaveLength(1);
  });

  it("routes the same either way", () => {
    const branches: DraftBranch[] = [
      { when: { ref: "q_device", op: "eq", value: "opt_iphone" }, then: "q_icloud" },
      { when: { ref: "q_device", op: "eq", value: "opt_android" }, then: "q_playstore" },
      { when: { ref: "q_icloud", op: "is_not_empty", value: null }, then: "q_email" },
    ];
    const answers = { q_icloud: "a@icloud.com", q_playstore: "a@gmail.com", q_email: "a@b.co" };
    expect(walk(blocks, branches, ["end_thanks"], { ...answers, q_device: "opt_iphone" })).toEqual([
      "q_device",
      "q_icloud",
      "q_email",
      "end_thanks",
    ]);
    expect(walk(blocks, branches, ["end_thanks"], { ...answers, q_device: "opt_android" })).toEqual([
      "q_device",
      "q_playstore",
      "q_email",
      "end_thanks",
    ]);
  });
});

describe("rules already on the form", () => {
  const blocks = [
    { ref: "q_platform", type: "single_select", required: true, options: [
      { id: "opt_android", label: "Android" },
      { id: "opt_ios", label: "iOS" },
    ] },
    { ref: "q_play_email", type: "email", required: true },
    { ref: "q_any_email", type: "email", required: true },
    { ref: "q_extra", type: "short_text", required: false },
  ] as never;

  const androidBranch = { when: { ref: "q_platform", op: "eq" as const, value: "opt_android" }, then: "q_play_email" };
  const iosBranch = { when: { ref: "q_platform", op: "eq" as const, value: "opt_ios" }, then: "q_any_email" };

  it("does not restate a rule the form already has", () => {
    // Restating a branch used to append an identical second rule, so the logic
    // editor drew two edges where one was live.
    const first = buildFlowRules([androidBranch, iosBranch], blocks, ["end_thanks"]);
    expect(first.length).toBeGreaterThan(0);

    const again = buildFlowRules([androidBranch, iosBranch], blocks, ["end_thanks"], first as never);
    expect(again).toHaveLength(0);
  });

  it("still writes a rule that differs only in where it goes", () => {
    const first = buildFlowRules([androidBranch, iosBranch], blocks, ["end_thanks"]);
    const moved = buildFlowRules(
      [{ when: { ref: "q_platform", op: "eq" as const, value: "opt_ios" }, then: "q_extra" }],
      blocks,
      ["end_thanks"],
      first as never,
    );
    expect(moved.some((r) => r.action_kind === "goto" && r.target === "q_extra")).toBe(true);
  });

  it("drops a conditional jump that duplicates an unconditional one", () => {
    // Derivation and the model's own branch list can reach the same jump from
    // two directions; both route identically, and two edges between the same
    // pair of nodes is only confusing.
    const rules = buildFlowRules(
      [
        { when: { ref: "q_platform", op: "eq" as const, value: "opt_android" }, then: "q_play_email" },
        { when: { ref: "q_platform", op: "eq" as const, value: "opt_ios" }, then: "q_any_email" },
        { when: { ref: "q_play_email", op: "is_empty" as const, value: null }, then: "q_extra" },
      ],
      blocks,
      ["end_thanks"],
    );
    const fromPlayEmail = rules.filter((r) => r.action_kind === "goto" && r.from === "q_play_email" && r.target === "q_extra");
    expect(fromPlayEmail.length).toBeLessThanOrEqual(1);
  });
});

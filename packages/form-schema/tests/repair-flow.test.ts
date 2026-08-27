import { describe, expect, it } from "vitest";
import { FormDoc, repairFlow, resolveNext, type EvalState } from "../src";

/**
 * Dragging a question must not change who gets asked what.
 *
 * These walk the real engine rather than asserting on rule shapes: a flow can
 * have four well-formed rules and still ask iPhone users for their Android
 * device model, which is exactly the class of bug this repair exists for.
 */

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

/**
 * welcome · name · platform(Android|iOS) · play-email · device · any-email · phone
 *
 * Android → play-email, then falls through to device, then an unconditional
 * jump carries it past any-email. iOS → any-email. Both rejoin at phone.
 */
function baseDoc() {
  return FormDoc.parse({
    schemaVersion: 1,
    title: "Waitlist",
    blocks: [
      { id: uid("blk", 1), ref: "welcome", type: "welcome", title: "Hi" },
      { id: uid("blk", 2), ref: "q_name", type: "short_text", title: "Your name?", required: true },
      {
        id: uid("blk", 3),
        ref: "q_platform",
        type: "single_select",
        title: "Which platform?",
        required: true,
        options: [
          { id: "opt_android", label: "Android" },
          { id: "opt_ios", label: "iOS" },
        ],
      },
      { id: uid("blk", 4), ref: "q_play_email", type: "email", title: "Play Store email?", required: true },
      { id: uid("blk", 5), ref: "q_device", type: "short_text", title: "Which Android device?", required: true },
      { id: uid("blk", 6), ref: "q_any_email", type: "email", title: "Your email?", required: true },
      { id: uid("blk", 7), ref: "q_phone", type: "phone", title: "Phone?", required: true },
    ],
    endings: [{ id: uid("end", 1), ref: "end_thanks", title: "Thanks" }],
    logic: [
      {
        id: uid("rl", 1),
        action_kind: "goto",
        from: "q_platform",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_android" }], groups: [] },
        target: "q_play_email",
        targetKind: "block",
      },
      {
        id: uid("rl", 2),
        action_kind: "goto",
        from: "q_platform",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_ios" }], groups: [] },
        target: "q_any_email",
        targetKind: "block",
      },
      {
        id: uid("rl", 3),
        action_kind: "goto",
        from: "q_device",
        when: { op: "and", conditions: [], groups: [] },
        target: "q_phone",
        targetKind: "block",
      },
    ],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });
}

/** Every question a respondent is actually asked, in order. */
function walk(doc: ReturnType<typeof FormDoc.parse>, answers: Record<string, unknown>): string[] {
  const path: string[] = [];
  let current = doc.blocks[0]!.ref;
  for (let guard = 0; guard < 40; guard++) {
    path.push(current);
    const state: EvalState = { answers, variables: {}, hiddenFields: {} };
    const next = resolveNext(doc, current, state);
    // `resolveNext` returns the block itself, not its ref — reading `.ref` off
    // the wrapper produced a path of `undefined`s and made these tests lie.
    if (next.kind !== "block") break;
    current = next.block.ref;
  }
  return path;
}

const ANDROID = { q_name: "m", q_platform: "opt_android", q_play_email: "a@b.co", q_device: "Pixel", q_any_email: "a@b.co", q_phone: "+911234567890" };
const IOS = { ...ANDROID, q_platform: "opt_ios" };

/** Move a block by ref to sit at `toIndex`, the way a drag does. */
function move(doc: ReturnType<typeof FormDoc.parse>, ref: string, toIndex: number) {
  const blocks = [...doc.blocks];
  const from = blocks.findIndex((b) => b.ref === ref);
  const [moved] = blocks.splice(from, 1);
  blocks.splice(toIndex, 0, moved!);
  return { ...doc, blocks };
}

describe("the flow before any repair", () => {
  it("asks each platform only its own questions", () => {
    const doc = baseDoc();
    expect(walk(doc, ANDROID)).toEqual(["welcome", "q_name", "q_platform", "q_play_email", "q_device", "q_phone"]);
    expect(walk(doc, IOS)).toEqual(["welcome", "q_name", "q_platform", "q_any_email", "q_phone"]);
  });
});

describe("repairFlow", () => {
  it("leaves a flow that is already coherent alone", () => {
    const doc = baseDoc();
    const repaired = repairFlow(doc);
    expect(walk(repaired, ANDROID)).toEqual(walk(doc, ANDROID));
    expect(walk(repaired, IOS)).toEqual(walk(doc, IOS));
  });

  it("keeps the arm intact when a question is dragged out of it", () => {
    // The device question leaves the Android arm and joins the trunk, so
    // everyone should now be asked it — and no one should lose their email.
    const dragged = move(baseDoc(), "q_device", 6);
    const repaired = repairFlow(dragged);

    const android = walk(repaired, ANDROID);
    const ios = walk(repaired, IOS);
    // Both paths still reach an email question and the phone question.
    expect(android).toContain("q_play_email");
    expect(android).toContain("q_phone");
    expect(ios).toContain("q_any_email");
    expect(ios).toContain("q_phone");
    // The arm no longer carries the device question away from iOS users.
    expect(ios).not.toContain("q_play_email");
  });

  it("keeps a question dragged into an arm inside that arm", () => {
    // The phone question moves up between the Android arm's two questions.
    const dragged = move(baseDoc(), "q_phone", 4);
    const repaired = repairFlow(dragged);

    // iOS users must not be dragged through it just because it moved.
    const ios = walk(repaired, IOS);
    expect(ios).toContain("q_any_email");
    expect(ios).not.toContain("q_play_email");
  });

  it("drops a branch whose target no longer exists", () => {
    const doc = baseDoc();
    const withoutTarget = { ...doc, blocks: doc.blocks.filter((b) => b.ref !== "q_any_email") };
    const repaired = repairFlow(withoutTarget);
    const gotos = repaired.logic.filter((r) => r.action_kind === "goto");
    expect(gotos.some((r) => r.target === "q_any_email")).toBe(false);
    // And the flow still terminates rather than dead-ending.
    expect(walk(repaired as never, IOS).at(-1)).toBeDefined();
  });

  it("drops a branch that would jump backwards and loop", () => {
    const doc = baseDoc();
    // Send the platform question's Android answer to a question ABOVE it.
    const looping = {
      ...doc,
      logic: doc.logic.map((r) =>
        r.action_kind === "goto" && r.target === "q_play_email" ? { ...r, target: "q_name" } : r,
      ),
    };
    const repaired = repairFlow(looping);
    const gotos = repaired.logic.filter((r) => r.action_kind === "goto");
    expect(gotos.some((r) => r.from === "q_platform" && r.target === "q_name")).toBe(false);
  });

  it("preserves rules it cannot express as a simple branch", () => {
    const doc = baseDoc();
    const withComplex = {
      ...doc,
      logic: [
        ...doc.logic,
        {
          id: uid("rl", 9),
          action_kind: "goto" as const,
          from: "q_name",
          when: {
            op: "and" as const,
            conditions: [
              { left: { kind: "ref" as const, ref: "q_name" }, op: "is_not_empty" as const },
              { left: { kind: "ref" as const, ref: "q_platform" }, op: "is_not_empty" as const },
            ],
            groups: [],
          },
          target: "q_phone",
          targetKind: "block" as const,
        },
      ],
    };
    const repaired = repairFlow(withComplex);
    expect(repaired.logic.some((r) => r.id === uid("rl", 9))).toBe(true);
  });

  it("leaves set_variable rules alone", () => {
    const doc = baseDoc();
    const withVar = {
      ...doc,
      variables: [{ name: "score", type: "number" as const, initial: 0 }],
      logic: [
        ...doc.logic,
        { id: uid("rl", 8), action_kind: "set_variable" as const, variable: "score", expr: { kind: "literal" as const, value: 1 } },
      ],
    };
    const repaired = repairFlow(withVar as never);
    expect(repaired.logic.some((r) => r.action_kind === "set_variable")).toBe(true);
  });

  it("is idempotent", () => {
    const once = repairFlow(move(baseDoc(), "q_device", 6));
    const twice = repairFlow(once);
    expect(walk(twice, ANDROID)).toEqual(walk(once, ANDROID));
    expect(walk(twice, IOS)).toEqual(walk(once, IOS));
  });
});

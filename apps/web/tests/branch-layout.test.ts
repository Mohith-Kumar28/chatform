import { describe, expect, it } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { computeBranchLayout } from "@/components/builder/branch-layout";

/**
 * The picture of the flow, which the builder trusts more than the rules.
 *
 * A correct flow drawn wrongly is indistinguishable from a broken one. These
 * cases are the shapes the generator actually produces.
 */

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

function doc(): ReturnType<typeof FormDoc.parse> {
  // welcome · name · platform(Android|iOS) · play-store email · android device
  // · general email · capture source
  //
  // Android → play-store email, then falls through to the device question, then
  // an unconditional jump carries it past the general email question.
  return FormDoc.parse({
    schemaVersion: 1,
    title: "Waitlist",
    blocks: [
      { id: uid("blk", 1), ref: "welcome", type: "welcome", title: "Hi" },
      { id: uid("blk", 2), ref: "q_name", type: "short_text", title: "Your name?" },
      {
        id: uid("blk", 3),
        ref: "q_platform",
        type: "single_select",
        title: "Which platform?",
        options: [
          { id: "opt_android", label: "Android" },
          { id: "opt_ios", label: "iOS" },
        ],
      },
      { id: uid("blk", 4), ref: "q_play_email", type: "email", title: "Play Store email?" },
      { id: uid("blk", 5), ref: "q_device", type: "short_text", title: "Which Android device?" },
      { id: uid("blk", 6), ref: "q_any_email", type: "email", title: "Your email?" },
      { id: uid("blk", 7), ref: "q_capture", type: "short_text", title: "What do you save?" },
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
      // Closes the Android arm off so it does not spill into the iOS one.
      {
        id: uid("rl", 3),
        action_kind: "goto",
        from: "q_device",
        when: { op: "and", conditions: [], groups: [] },
        target: "q_capture",
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

describe("computeBranchLayout", () => {
  it("keeps a question that is only reached by falling through inside its arm", () => {
    // The bug this exists for: only the FIRST question of an arm is a branch
    // target, so treating "not a target" as "on the trunk" drew the Android
    // device question at trunk level — reading, to anyone looking at the list,
    // as a question asked of everyone. The flow was right; the picture was not.
    const layout = computeBranchLayout(doc());

    expect(layout.get("q_play_email")?.depth).toBe(1);
    expect(layout.get("q_device")?.depth).toBe(1);
    expect(layout.get("q_device")?.sourceRef).toBe("q_platform");
  });

  it("states the condition once, on the arm's first question only", () => {
    const layout = computeBranchLayout(doc());
    expect(layout.get("q_play_email")?.condition).toBe("Android");
    // The rest of the arm is indented under that label and repeats nothing.
    expect(layout.get("q_device")?.condition).toBeNull();
  });

  it("returns to the trunk after the jump that closes an arm", () => {
    const layout = computeBranchLayout(doc());
    // q_device carries the unconditional jump, so it is the arm's last member
    // and what the jump lands on is back on the trunk.
    expect(layout.get("q_capture")?.depth).toBe(0);
  });

  it("puts questions before the split on the trunk", () => {
    const layout = computeBranchLayout(doc());
    expect(layout.get("welcome")?.depth).toBe(0);
    expect(layout.get("q_name")?.depth).toBe(0);
  });

  it("marks the question that splits the flow", () => {
    const layout = computeBranchLayout(doc());
    expect(layout.get("q_platform")?.branches).toBe(true);
    expect(layout.get("q_name")?.branches).toBe(false);
  });

  it("names the deciding question only when it is not the row above", () => {
    const layout = computeBranchLayout(doc());
    // q_play_email sits directly under q_platform, so "Android" says it all.
    expect(layout.get("q_play_email")?.sourceTitle).toBeNull();
    // q_any_email is separated from it by the whole Android arm, so the
    // question is worth naming.
    expect(layout.get("q_any_email")?.condition).toBe("iOS");
  });
});

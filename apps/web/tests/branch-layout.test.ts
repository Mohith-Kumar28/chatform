import { describe, expect, it } from "vitest";
import { FormDoc, repairFlow } from "@repo/form-schema";
import { computeQuestionFlow } from "@/components/builder/branch-layout";

/**
 * The picture of the flow, which the builder trusts more than the rules.
 *
 * A correct flow drawn wrongly is indistinguishable from a broken one. These
 * are the shapes the generator and the "only ask this sometimes" picker
 * actually produce, including the two that the old depth-based tree drew wrong.
 */

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

const parse = (doc: unknown) => FormDoc.parse(doc);

const rule = (
  n: number,
  from: string,
  target: string,
  when: { ref: string; op: string; value?: unknown } | null,
  targetKind: "block" | "ending" = "block",
) => ({
  id: uid("rl", n),
  action_kind: "goto" as const,
  from,
  when: {
    op: "and",
    conditions: when
      ? [{ left: { kind: "ref", ref: when.ref }, op: when.op, ...("value" in when ? { value: when.value } : {}) }]
      : [],
    groups: [],
  },
  target,
  targetKind,
});

const shell = (blocks: unknown[], logic: unknown[]) => ({
  schemaVersion: 1,
  title: "T",
  blocks,
  endings: [{ id: uid("end", 1), ref: "end_thanks", title: "Thanks" }],
  logic,
  endingRules: [],
  variables: [],
  hiddenFields: [],
  settings: {},
  theme: {},
});

/**
 * welcome · name · platform(Android|iOS) · play-store email · android device
 * · general email · capture source
 *
 * Android → play-store email, then falls through to the device question, then
 * an unconditional jump carries it past the general email question.
 */
function waitlist() {
  return parse(
    shell(
      [
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
      [
        rule(1, "q_platform", "q_play_email", { ref: "q_platform", op: "eq", value: "opt_android" }),
        rule(2, "q_platform", "q_any_email", { ref: "q_platform", op: "eq", value: "opt_ios" }),
        // Closes the Android arm off so it does not spill into the iOS one.
        rule(3, "q_device", "q_capture", null),
      ],
    ),
  );
}

describe("computeQuestionFlow", () => {
  it("puts questions nothing can skip on the trunk", () => {
    const flow = computeQuestionFlow(waitlist());
    expect(flow.get("welcome")?.conditional).toBe(false);
    expect(flow.get("q_name")?.conditional).toBe(false);
    // The last question is reached by every path, branch or not.
    expect(flow.get("q_capture")?.conditional).toBe(false);
  });

  it("marks a question that some answer routes around", () => {
    const flow = computeQuestionFlow(waitlist());
    expect(flow.get("q_play_email")?.conditional).toBe(true);
    // An expression, not a sentence: naming the deciding question in full gave
    // "Only if Which platform? → Android", which truncated to nothing useful in
    // a 288px column.
    expect(flow.get("q_play_email")?.condition).toBe("if platform is Android");
    expect(flow.get("q_any_email")?.condition).toBe("if platform is iOS");
  });

  it("carries the condition to a question reached only by falling through", () => {
    // Only the FIRST question of an arm is a branch target. Reading "nothing
    // routes here" as "everyone is asked this" drew the Android device question
    // as though it went to iOS users too.
    const flow = computeQuestionFlow(waitlist());
    expect(flow.get("q_device")?.conditional).toBe(true);
    expect(flow.get("q_device")?.condition).toBe("if platform is Android");
  });

  it("marks the question that splits the flow, and only that one", () => {
    const flow = computeQuestionFlow(waitlist());
    expect(flow.get("q_platform")?.branches).toBe(true);
    expect(flow.get("q_name")?.branches).toBe(false);
    // q_device carries an unconditional jump. Everyone who gets there takes it,
    // so it moves people; it does not decide anything.
    expect(flow.get("q_device")?.branches).toBe(false);
  });

  /**
   * The RSVP that started this: two "only ask this sometimes" inserts in a row,
   * run through `repairFlow` exactly as the builder stores them.
   */
  function rsvp() {
    return parse(
      repairFlow(
        parse(
          shell(
            [
              { id: uid("blk", 1), ref: "q_welcome", type: "welcome", title: "You're invited!" },
              { id: uid("blk", 2), ref: "q_name", type: "short_text", title: "Your full name?" },
              { id: uid("blk", 3), ref: "q_attending", type: "yes_no", title: "Will you be attending?" },
              { id: uid("blk", 4), ref: "q_guests", type: "number", title: "How many guests?" },
              { id: uid("blk", 5), ref: "q_names", type: "long_text", title: "Guest names?" },
              { id: uid("blk", 6), ref: "q_diet", type: "long_text", title: "Dietary notes?" },
            ],
            [
              rule(1, "q_attending", "q_guests", { ref: "q_attending", op: "eq", value: true }),
              rule(2, "q_guests", "q_names", { ref: "q_guests", op: "gte", value: 1 }),
            ],
          ),
        ),
      ),
    );
  }

  it("marks a chain of conditional inserts as branching", () => {
    // The list drew all three of these as plain trunk questions, so a form that
    // only asks about guests when someone is coming looked like one that asks
    // everybody.
    const flow = computeQuestionFlow(rsvp());
    expect(flow.get("q_attending")?.branches).toBe(true);
    expect(flow.get("q_guests")?.branches).toBe(true);
    expect(flow.get("q_guests")?.conditional).toBe(true);
  });

  it("names a yes/no condition by its button, not as a double negative", () => {
    const flow = computeQuestionFlow(rsvp());
    expect(flow.get("q_guests")?.condition).toBe("if attending is Yes");
  });

  it("writes comparisons as symbols", () => {
    const doc = parse(
      shell(
        [
          { id: uid("blk", 1), ref: "q_guests", type: "number", title: "How many guests?" },
          { id: uid("blk", 2), ref: "q_names", type: "long_text", title: "Guest names?" },
          { id: uid("blk", 3), ref: "q_diet", type: "long_text", title: "Dietary notes?" },
        ],
        [
          rule(1, "q_guests", "q_names", { ref: "q_guests", op: "gte", value: 1 }),
          rule(2, "q_guests", "q_diet", { ref: "q_guests", op: "lt", value: 1 }),
        ],
      ),
    );
    const flow = computeQuestionFlow(doc);
    expect(flow.get("q_names")?.condition).toBe("if guests ≥ 1");
  });

  it("falls back to the position when the ref says nothing", () => {
    const doc = parse(
      shell(
        [
          { id: uid("blk", 1), ref: "q_1", type: "yes_no", title: "Coming?" },
          { id: uid("blk", 2), ref: "q_2", type: "short_text", title: "Who with?" },
          { id: uid("blk", 3), ref: "q_3", type: "short_text", title: "Anything else?" },
        ],
        [
          rule(1, "q_1", "q_2", { ref: "q_1", op: "eq", value: true }),
          rule(2, "q_1", "q_3", { ref: "q_1", op: "eq", value: false }),
        ],
      ),
    );
    expect(computeQuestionFlow(doc).get("q_2")?.condition).toBe("if Q1 is Yes");
  });

  it("ignores the complement rule that only exists to skip a question", () => {
    // `q_names` is targeted by the real branch ("1 or more guests") and also by
    // the complement `repairFlow` derives for "attending" — mechanism, not
    // intent. Counting the second one produced "1 or more or not yes"; ignoring
    // it leaves the branch someone actually authored.
    const flow = computeQuestionFlow(rsvp());
    expect(flow.get("q_names")?.conditional).toBe(true);
    expect(flow.get("q_names")?.condition).toBe("if guests ≥ 1");
  });

  it("does not blame a skip rule for the question it skips TO", () => {
    // The bug on screen: `q_guests lt 1 → q_os` exists to skip the guest-names
    // question, and the list read it as the reason the operating-system
    // question is asked — "if guests ≤ 0", on a question every attendee sees.
    const flow = computeQuestionFlow(rsvp());
    expect(flow.get("q_diet")?.condition).not.toBe("if guests ≤ 0");
    expect(flow.get("q_diet")?.conditional).toBe(false);
  });

  it("says nothing rather than inventing a phrase when two branches disagree", () => {
    // Two different questions genuinely route to the same follow-up for
    // different reasons. No single phrase is true of both, so none is given.
    const doc = parse(
      shell(
        [
          { id: uid("blk", 1), ref: "q_a", type: "yes_no", title: "A?" },
          { id: uid("blk", 2), ref: "q_b", type: "yes_no", title: "B?" },
          { id: uid("blk", 3), ref: "q_arm", type: "short_text", title: "Arm" },
          { id: uid("blk", 4), ref: "q_shared", type: "short_text", title: "Shared" },
          { id: uid("blk", 5), ref: "q_tail", type: "short_text", title: "Tail" },
        ],
        [
          rule(1, "q_b", "q_arm", { ref: "q_b", op: "eq", value: true }),
          rule(2, "q_a", "q_shared", { ref: "q_a", op: "eq", value: false }),
          rule(3, "q_b", "q_shared", { ref: "q_b", op: "eq", value: false }),
          // Closes the arm, which is what makes q_shared a branch target
          // rather than the row the arm falls into.
          rule(4, "q_arm", "q_tail", null),
        ],
      ),
    );
    const flow = computeQuestionFlow(doc);
    expect(flow.get("q_shared")?.conditional).toBe(true);
    expect(flow.get("q_shared")?.condition).toBeNull();
  });

  it("keeps the question after a branch on the trunk", () => {
    // Drawn two levels deep inside a branch nobody was in, before.
    const flow = computeQuestionFlow(rsvp());
    expect(flow.get("q_diet")?.conditional).toBe(false);
  });

  it("treats a branch that ends the form as a branch", () => {
    // "No, I can't make it" → straight to the ending. Counting only branches
    // between blocks missed this entirely, so the question that decided it
    // carried no marker and everything after it read as unconditional.
    const doc = parse(
      shell(
        [
          { id: uid("blk", 1), ref: "q_attending", type: "yes_no", title: "Will you be attending?" },
          { id: uid("blk", 2), ref: "q_guests", type: "number", title: "How many guests?" },
        ],
        [rule(1, "q_attending", "end_thanks", { ref: "q_attending", op: "eq", value: false }, "ending")],
      ),
    );
    const flow = computeQuestionFlow(doc);
    expect(flow.get("q_attending")?.branches).toBe(true);
    expect(flow.get("q_guests")?.conditional).toBe(true);
  });
});

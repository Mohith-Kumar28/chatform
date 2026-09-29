import { describe, expect, it } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { outlineForm } from "@/components/forms/export-pdf/form-outline";

/**
 * What the PDF export prints about a form: numbering that matches the canvas,
 * routes written out in words, and nothing printed that should stay private.
 */

const when = (ref: string, value: unknown, op = "eq") => ({
  op: "and" as const,
  conditions: [{ left: { kind: "ref" as const, ref }, op, value }],
  groups: [],
});

const doc = FormDoc.parse({
  title: "Team registration",
  blocks: [
    { id: "blk_welcome", ref: "welcome", type: "welcome", title: "Hi!" },
    {
      id: "blk_track",
      ref: "track",
      type: "single_select",
      title: "Which track?",
      required: true,
      allowOther: true,
      options: [
        { id: "opt_software", label: "Software" },
        { id: "opt_hardware", label: "Hardware" },
      ],
    },
    { id: "blk_board", ref: "board", type: "short_text", title: "Which board?", visibility: when("track", "opt_hardware") },
    { id: "blk_age", ref: "age", type: "number", title: "Age?", required: true, min: 16, integerOnly: true },
  ],
  logic: [
    { id: "rule_hw", action_kind: "goto", from: "track", when: when("track", "opt_hardware"), target: "board" },
    { id: "rule_else", action_kind: "goto", from: "track", when: null, target: "age" },
    { id: "rule_young", action_kind: "goto", from: "age", when: when("age", 18, "lt"), target: "too_young" },
  ],
  endings: [
    { id: "end_done", ref: "done", title: "Registered" },
    { id: "end_young", ref: "too_young", title: "Too young", kind: "screen_out", requirements: [{ id: "req_age", label: "Be 18 or over" }] },
  ],
  settings: { password: { enabled: true, value: "hunter2" } },
});

describe("outlineForm", () => {
  const outline = outlineForm(doc);

  it("numbers questions the way the canvas does, welcome included", () => {
    expect(outline.questions.map((q) => q.number)).toEqual([1, 2, 3, 4]);
    expect(outline.questions[0]!.asks).toBe(false);
    expect(outline.stats.find((s) => s.label === "Questions")!.value).toBe("3");
    expect(outline.stats.find((s) => s.label === "Branching points")!.value).toBe("2");
  });

  it("lists choices with the write-in last", () => {
    expect(outline.questions[1]!.choices).toEqual([
      { label: "Software", description: undefined },
      { label: "Hardware", description: undefined },
      { label: "Other", writeIn: true },
    ]);
  });

  it("writes routes in words, Otherwise last", () => {
    expect(outline.questions[1]!.routes).toEqual([
      { label: "If “Hardware”", value: "Q3 Which board?" },
      { label: "Otherwise", value: "Q4 Age?" },
    ]);
    expect(outline.questions[3]!.routes).toEqual([{ label: "If answer less than 18", value: "Ending: Too young" }]);
  });

  it("names the question a visibility rule reads", () => {
    expect(outline.questions[2]!.shownWhen).toBe("Q2 is “Hardware”");
  });

  it("prints validation as labelled facts", () => {
    expect(outline.questions[3]!.facts).toEqual([
      { label: "Minimum", value: "16" },
      { label: "Whole numbers only", value: "On" },
    ]);
  });

  it("says a password exists without printing it", () => {
    expect(outline.settings).toContainEqual({ label: "Password", value: "Protected" });
    expect(JSON.stringify(outline)).not.toContain("hunter2");
  });

  it("marks a screen-out ending and its requirements", () => {
    expect(outline.endings[1]).toMatchObject({ title: "Too young", screenOut: true, requirements: ["Be 18 or over"] });
  });
});

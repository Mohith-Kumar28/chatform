import { describe, expect, it } from "vitest";
import { FormDoc, type Block } from "@repo/form-schema";
import { caseLabel } from "@/components/builder/branch-layout";
import { deriveGraph } from "@/components/builder/flow-graph";

/**
 * Which ending a finished response gets, said on the canvas.
 *
 * `resolveEnding` has always read `doc.endingRules`, and nothing had ever
 * written one — no generator, no inspector, no node. So the one rule a form
 * genuinely needs to express about an earlier answer had nowhere to live, and
 * the open mic form that needed it wrote a branch on its last question instead,
 * comparing a long-text answer against a sentence nobody would type. Every
 * attendee got the performer's ending.
 *
 * These pin the two halves of making that sayable: a label that reads the
 * question each condition actually names, and an ending node that carries its
 * own rules.
 */

const doc = FormDoc.parse({
  title: "Open mic",
  blocks: [
    {
      id: "blk_er_role01",
      ref: "q_role",
      type: "single_select",
      title: "Performing or watching?",
      required: true,
      options: [
        { id: "opt_perform", label: "I want to perform" },
        { id: "opt_watch", label: "Just coming to watch and support" },
      ],
    },
    { id: "blk_er_note01", ref: "q_notes", type: "long_text", title: "Any special notes?", minLength: 0, maxLength: 500 },
  ],
  endings: [
    { id: "end_er_perf01", ref: "end_performer", title: "You're on the list to perform!", kind: "success" },
    { id: "end_er_aud001", ref: "end_audience", title: "See you in the audience!", kind: "success" },
  ],
  logic: [],
  endingRules: [
    {
      id: "rl_er_aud001",
      action_kind: "goto",
      // No `from`: an ending rule is read once at the end, not after a question.
      when: {
        op: "and",
        conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "eq", value: "opt_watch" }],
        groups: [],
      },
      target: "end_audience",
      targetKind: "ending",
    },
  ],
});

const endingNode = (ref: string) =>
  deriveGraph(doc, [], new Map()).nodes.find((n) => n.id === ref)!;

describe("the label for a rule whose conditions name their own question", () => {
  it("reads the option's label, not its id", () => {
    // Without the question list there is no way to resolve `opt_watch`, and the
    // node would show the raw id — which is exactly the thing an author cannot
    // check at a glance.
    const when = doc.endingRules[0]!.when!;
    expect(caseLabel(null, when, doc.blocks as Block[])).toBe("Just coming to watch and support");
  });

  it("falls back to the raw comparison when it cannot resolve the question", () => {
    const when = doc.endingRules[0]!.when!;
    expect(caseLabel(null, when)).toContain("opt_watch");
  });
});

describe("the ending node", () => {
  it("carries the rules that send people to it", () => {
    expect(endingNode("end_audience").data.conditions).toEqual(["Just coming to watch and support"]);
  });

  it("says nothing on an ending no rule claims", () => {
    expect(endingNode("end_performer").data.conditions).toEqual([]);
  });

  it("says nothing at all about the ending everyone else lands on", () => {
    // It said "everyone else" for a version. That is a label for the normal
    // case: it turned up on every form, told nobody anything they had not
    // assumed, and made a working ending look unfinished.
    expect(endingNode("end_performer").data).not.toHaveProperty("fallback");
    expect(endingNode("end_performer").data.conditions).toEqual([]);
  });

  it("stays quiet on a form that has no ending rules at all", () => {
    const plain = FormDoc.parse({ ...doc, endingRules: [] });
    for (const ref of ["end_performer", "end_audience"]) {
      const node = deriveGraph(plain, [], new Map()).nodes.find((n) => n.id === ref)!;
      expect(node.data.conditions).toEqual([]);
    }
  });

  it("is not wired from any question", () => {
    // An ending rule is not a route out of a question — it is one test against
    // the whole answer set — so drawing it as an edge would put it somewhere it
    // does not come from.
    const { edges } = deriveGraph(doc, [], new Map());
    expect(edges.some((e) => e.id.includes("rl_er_aud001"))).toBe(false);
  });
});

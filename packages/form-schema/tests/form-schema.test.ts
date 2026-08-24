import { describe, expect, it } from "vitest";
import {
  applyLogicRules,
  evalCondition,
  evalGroup,
  FormDoc,
  leadFormFixture,
  lintFormDoc,
  resolveNext,
  validateAnswer,
  type EvalState,
} from "../src/index.js";

const state = (partial: Partial<EvalState> = {}): EvalState => ({
  answers: {},
  variables: {},
  hidden: {},
  ...partial,
});

describe("FormDoc parsing", () => {
  it("parses the lead fixture with defaults applied", () => {
    const doc = FormDoc.parse(leadFormFixture);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.settings.agent.mode).toBe("hybrid");
    expect(doc.blocks).toHaveLength(7);
    expect(doc.endings[0]!.showSummary).toBe(true);
  });

  it("rejects duplicate refs", () => {
    const bad = structuredClone(leadFormFixture) as Record<string, unknown>;
    (bad.blocks as { ref: string }[])[1]!.ref = "welcome";
    expect(() => FormDoc.parse(bad)).not.toThrow(); // schema allows; lint catches
    const doc = FormDoc.parse(bad);
    expect(lintFormDoc(doc).some((i) => i.code === "duplicate_ref")).toBe(true);
  });

  it("round-trips JSON losslessly", () => {
    const doc = FormDoc.parse(leadFormFixture);
    const json = JSON.parse(JSON.stringify(doc));
    expect(FormDoc.parse(json)).toEqual(doc);
  });
});

describe("condition evaluation", () => {
  const s = state({
    answers: { q_role: "opt_dev00001", q_tags: ["a", "b"] },
    variables: { score: 3 },
    hidden: { utm_source: "twitter" },
  });

  it("eq / neq on refs", () => {
    expect(evalCondition({ left: { kind: "ref", ref: "q_role" }, op: "eq", value: "opt_dev00001" }, s)).toBe(true);
    expect(evalCondition({ left: { kind: "ref", ref: "q_role" }, op: "neq", value: "opt_dev00001" }, s)).toBe(false);
  });

  it("numeric comparisons on variables", () => {
    expect(evalCondition({ left: { kind: "variable", name: "score" }, op: "gte", value: 3 }, s)).toBe(true);
    expect(evalCondition({ left: { kind: "variable", name: "score" }, op: "gt", value: 3 }, s)).toBe(false);
  });

  it("hidden fields", () => {
    expect(evalCondition({ left: { kind: "hidden", name: "utm_source" }, op: "eq", value: "twitter" }, s)).toBe(true);
  });

  it("array includes", () => {
    expect(evalCondition({ left: { kind: "ref", ref: "q_tags" }, op: "includes", value: ["a"] }, s)).toBe(true);
    expect(evalCondition({ left: { kind: "ref", ref: "q_tags" }, op: "includes", value: ["c"] }, s)).toBe(false);
  });

  it("unary emptiness", () => {
    expect(evalCondition({ left: { kind: "ref", ref: "missing" }, op: "is_empty" }, s)).toBe(true);
    expect(evalCondition({ left: { kind: "ref", ref: "q_role" }, op: "is_not_empty" }, s)).toBe(true);
  });

  it("nested groups AND/OR", () => {
    const g = {
      op: "and",
      conditions: [{ left: { kind: "variable", name: "score" }, op: "gte", value: 2 }],
      groups: [
        {
          op: "or",
          conditions: [
            { left: { kind: "ref", ref: "q_role" }, op: "eq", value: "opt_founder1" },
            { left: { kind: "hidden", name: "utm_source" }, op: "eq", value: "twitter" },
          ],
          groups: [],
        },
      ],
    };
    expect(evalGroup(g, s)).toBe(true);
  });
});

describe("logic rules & branching", () => {
  const doc = FormDoc.parse(leadFormFixture);

  it("designer branch skips detail question", () => {
    const s = state({ answers: { q_role: "opt_design01" } });
    const next = resolveNext(doc, "q_role", s);
    expect(next.kind).toBe("block");
    if (next.kind === "block") expect(next.block.ref).toBe("q_excitement");
  });

  it("developer falls through to detail", () => {
    const s = state({ answers: { q_role: "opt_dev00001" } });
    const next = resolveNext(doc, "q_role", s);
    expect(next.kind).toBe("block");
    if (next.kind === "block") expect(next.block.ref).toBe("q_detail");
  });

  it("invisible visibility blocks are skipped", () => {
    const s = state({ answers: { q_role: "opt_design01", q_excitement: 5, q_consent: true, q_email: "a@b.co", q_name: "Jo" } });
    // consent answered last → flow ends
    const next = resolveNext(doc, "q_consent", s);
    expect(next.kind).toBe("ending");
  });

  it("add_score accumulates", () => {
    const rules = [
      { id: "r1", action_kind: "add_score" as const, when: null, variable: "excitement", amount: 5 },
    ];
    const s = state();
    applyLogicRules(rules, s);
    applyLogicRules(rules, s);
    expect(s.variables.excitement).toBe(10);
  });
});

describe("answer validation", () => {
  const doc = FormDoc.parse(leadFormFixture);
  const byRef = (ref: string) => doc.blocks.find((b) => b.ref === ref)!;

  it("email validation", () => {
    expect(validateAnswer(byRef("q_email"), "not-an-email").ok).toBe(false);
    expect(validateAnswer(byRef("q_email"), "USER@Example.co").value).toBe("user@example.co");
  });

  it("single select maps labels to ids", () => {
    const r = validateAnswer(byRef("q_role"), "developer");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("opt_dev00001");
    expect(validateAnswer(byRef("q_role"), "astronaut").ok).toBe(false);
  });

  it("rating bounds", () => {
    expect(validateAnswer(byRef("q_excitement"), 6).ok).toBe(false);
    expect(validateAnswer(byRef("q_excitement"), 4).value).toBe(4);
  });

  it("required enforcement", () => {
    expect(validateAnswer(byRef("q_email"), "").ok).toBe(false);
    expect(validateAnswer(byRef("q_detail"), "").ok).toBe(true); // not required
  });

  it("consent hashes text", () => {
    const r = validateAnswer(byRef("q_consent"), true);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ accepted: true });
    expect((r.value as { textSha256: string }).textSha256).toHaveLength(64);
  });

  it("ranking validates permutation", () => {
    const rankBlock = { ...byRef("q_role"), type: "ranking" as const, items: byRef("q_role").options.map((o) => ({ id: o.id, label: o.label })) };
    expect(validateAnswer(rankBlock as never, ["opt_dev00001", "opt_founder1", "opt_design01", "opt_other001"]).ok).toBe(true);
    expect(validateAnswer(rankBlock as never, ["opt_dev00001", "opt_dev00001", "opt_design01", "opt_other001"]).ok).toBe(false);
  });
});

describe("lint", () => {
  it("clean fixture has no errors", () => {
    const doc = FormDoc.parse(leadFormFixture);
    expect(lintFormDoc(doc).filter((i) => i.level === "error")).toEqual([]);
  });

  it("flags dangling goto targets", () => {
    const doc = FormDoc.parse(leadFormFixture);
    doc.logic.push({ id: "rl_bad00001", action_kind: "goto", when: null, target: "nope", targetKind: "block" });
    expect(lintFormDoc(doc).some((i) => i.code === "dangling_target")).toBe(true);
  });

  it("flags missing condition values", () => {
    const doc = FormDoc.parse(leadFormFixture);
    doc.logic.push({
      id: "rl_bad00002", action_kind: "goto",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "eq" }], groups: [] },
      target: "q_email", targetKind: "block",
    });
    expect(lintFormDoc(doc).some((i) => i.code === "missing_value")).toBe(true);
  });
});

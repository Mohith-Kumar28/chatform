import { describe, expect, it } from "vitest";
import {
  FormDoc,
  lintFormDoc,
  OTHER_ANSWER,
  priceChoices,
  replayState,
  resolveNext,
  resolvePaymentAmount,
  rulesAreExhaustive,
  tidyBranches,
  type EvalState,
  type LogicRule,
} from "../src/index";

/**
 * Routing on "Other".
 *
 * From a dental intake the AI built: "reason for visit" allowed Other, and its
 * fifth route was `eq "Other"`. An Other answer is stored as what the patient
 * typed, so that route waited for someone to type the word "Other", and every
 * patient who picked it fell through to the next block: the pain questions.
 * `OTHER_ANSWER` names the choice instead of the text.
 */

type GotoRule = Extract<LogicRule, { action_kind: "goto" }>;

const route = (id: string, value: unknown, target: string, op = "eq"): GotoRule =>
  ({
    id,
    action_kind: "goto",
    from: "q_reason",
    when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_reason" }, op, value }], groups: [] },
    target,
    targetKind: "block",
  }) as GotoRule;

const always = (id: string, from: string, target: string): GotoRule =>
  ({ id, action_kind: "goto", from, when: { op: "and", conditions: [], groups: [] }, target, targetKind: "block" }) as GotoRule;

const doc = (logic: GotoRule[], opts: { allowOther?: boolean; multi?: boolean } = {}) =>
  FormDoc.parse({
    title: "Intake",
    blocks: [
      {
        id: "blk_aaaa01",
        ref: "q_reason",
        type: opts.multi ? "multi_select" : "single_select",
        title: "Reason for visit?",
        required: true,
        allowOther: opts.allowOther ?? true,
        options: [
          { id: "opt_pain", label: "Tooth pain" },
          { id: "opt_clean", label: "Cleaning" },
        ],
      },
      { id: "blk_aaaa02", ref: "q_pain", type: "short_text", title: "Where does it hurt?" },
      { id: "blk_aaaa03", ref: "q_contact", type: "short_text", title: "Your email?" },
      { id: "blk_aaaa04", ref: "q_other", type: "short_text", title: "Tell us more" },
    ],
    endings: [{ id: "end_aaaa01", ref: "end_thanks", title: "Thanks" }],
    logic,
  });

const next = (d: FormDoc, answer: unknown) => {
  const state: EvalState = { answers: { q_reason: answer as never }, variables: {}, hidden: {} };
  const step = resolveNext(d, "q_reason", state);
  return step.kind === "block" ? step.block.ref : `ending:${step.ending.ref}`;
};

const routed = doc([
  route("rl_aaaa01", "opt_pain", "q_pain"),
  route("rl_aaaa02", "opt_clean", "q_contact"),
  route("rl_aaaa03", OTHER_ANSWER, "q_other"),
]);

describe("a route for Other", () => {
  it("takes a typed answer, and only a typed answer", () => {
    expect(next(routed, "a chipped crown")).toBe("q_other");
    expect(next(routed, "opt_clean")).toBe("q_contact");
    expect(next(routed, "opt_pain")).toBe("q_pain");
  });

  it("works on a multi-select, where Other is one entry among picked ids", () => {
    const multi = doc([route("rl_aaaa01", OTHER_ANSWER, "q_other", "includes")], { multi: true });
    expect(next(multi, ["opt_pain", "whitening"])).toBe("q_other");
    expect(next(multi, ["opt_pain"])).toBe("q_pain");
  });

  it("negates cleanly", () => {
    const d = doc([route("rl_aaaa01", OTHER_ANSWER, "q_other", "neq")]);
    expect(next(d, "opt_clean")).toBe("q_other");
    expect(next(d, "something else")).toBe("q_pain");
  });

  it("replays the same way the chat walks it", () => {
    const { path } = replayState(routed, { q_reason: "a chipped crown" });
    expect(path).toEqual(["q_reason", "q_other"]);
  });

  it("is a valid value only where Other is allowed", () => {
    expect(lintFormDoc(routed).find((i) => i.code === "value_not_an_option")).toBeUndefined();
    const off = doc([route("rl_aaaa01", OTHER_ANSWER, "q_other")], { allowOther: false });
    expect(lintFormDoc(off).find((i) => i.code === "value_not_an_option")?.message).toContain("doesn't allow Other");
  });
});

describe("whether a branch covers every answer", () => {
  const cases = (d: FormDoc) => d.logic as GotoRule[];

  it("counts Other as an answer when the question allows it", () => {
    const optionsOnly = doc(cases(routed).slice(0, 2));
    expect(rulesAreExhaustive(optionsOnly.blocks[0]!, cases(optionsOnly))).toBe(false);
    expect(rulesAreExhaustive(routed.blocks[0]!, cases(routed))).toBe(true);
  });

  it("does not ask for Other when there is none", () => {
    const off = doc(cases(routed).slice(0, 2), { allowOther: false });
    expect(rulesAreExhaustive(off.blocks[0]!, cases(off))).toBe(true);
  });
});

describe("a route under an otherwise", () => {
  it("is reported, whatever its shape", () => {
    const d = doc([always("rl_aaaa01", "q_reason", "q_contact"), route("rl_aaaa02", "opt_pain", "q_pain")]);
    const found = lintFormDoc(d).find((i) => i.code === "unreachable_route");
    expect(found?.message).toContain("route 2 can never run");
  });
});

describe("tidyBranches", () => {
  it("moves the otherwise below the cases, so the cases run", () => {
    const d = doc([always("rl_aaaa01", "q_reason", "q_contact"), route("rl_aaaa02", "opt_pain", "q_pain")]);
    const tidy = tidyBranches(d);
    expect(tidy.logic.map((r) => r.id)).toEqual(["rl_aaaa02", "rl_aaaa01"]);
    expect(next(tidy, "opt_pain")).toBe("q_pain");
  });

  it("drops an otherwise nobody can reach, when pruning", () => {
    const d = doc([...(routed.logic as GotoRule[]), always("rl_aaaa09", "q_reason", "q_contact")]);
    expect(tidyBranches(d, { prune: true }).logic.map((r) => r.id)).toEqual(["rl_aaaa01", "rl_aaaa02", "rl_aaaa03"]);
    expect(tidyBranches(d).logic).toHaveLength(4);
  });

  it("drops a last case that goes where the otherwise goes", () => {
    // "If Yes → Preferred date / Otherwise → Preferred date".
    const d = doc([always("rl_aaaa01", "q_reason", "q_contact"), route("rl_aaaa02", "opt_clean", "q_contact")]);
    expect(tidyBranches(d, { prune: true }).logic.map((r) => r.id)).toEqual(["rl_aaaa01"]);
  });

  it("turns cases that all go one way into a single step", () => {
    const d = doc([
      route("rl_aaaa01", "opt_pain", "q_contact"),
      route("rl_aaaa02", "opt_clean", "q_contact"),
      route("rl_aaaa03", OTHER_ANSWER, "q_contact"),
    ]);
    const tidy = tidyBranches(d, { prune: true });
    expect(tidy.logic).toHaveLength(1);
    expect(tidy.logic[0]!.when?.conditions).toEqual([]);
    expect(next(tidy, "anything")).toBe("q_contact");
  });

  it("leaves a tidy form as it was", () => {
    expect(tidyBranches(routed, { prune: true })).toBe(routed);
  });
});

describe("pricing an Other answer", () => {
  const block = {
    amountMode: "answer" as const,
    currency: "INR",
    priceFrom: { ref: "q_reason", prices: { opt_pain: 500, opt_clean: 300, [OTHER_ANSWER]: 400 } },
  };

  it("charges the Other price for a typed answer", () => {
    const paid = resolvePaymentAmount(block as never, {}, { q_reason: "whitening" });
    expect(paid).toMatchObject({ ok: true });
    expect(resolvePaymentAmount(block as never, {}, { q_reason: "opt_clean" })).toMatchObject({ ok: true });
  });

  it("offers an Other row only when the question allows Other", () => {
    expect(priceChoices(routed.blocks[0]!).map((c) => c.key)).toContain(OTHER_ANSWER);
    const off = doc([], { allowOther: false });
    expect(priceChoices(off.blocks[0]!).map((c) => c.key)).not.toContain(OTHER_ANSWER);
  });

  it("does not treat an inherited property name as a price", () => {
    const paid = resolvePaymentAmount(block as never, {}, { q_reason: "constructor" });
    expect(paid).toMatchObject({ ok: true });
  });
});

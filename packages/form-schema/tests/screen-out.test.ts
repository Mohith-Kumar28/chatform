import { describe, expect, it } from "vitest";
import {
  Block,
  displayAnswer,
  evalGroup,
  FormDoc,
  lintFormDoc,
  resolveEnding,
  resolveNext,
  toPublicBlock,
  toPublicEnding,
  validateAnswer,
  conditionGroupRefs,
  isRequirementUnmet,
  type ConditionGroup,
  type EvalState,
} from "../src/index";

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

const consent = (over: Record<string, unknown> = {}) =>
  Block.parse({
    id: uid("blk", 1),
    ref: "q_consent",
    type: "legal_consent",
    title: "Our code of conduct",
    required: true,
    consentText: "I agree to the code of conduct.",
    ...over,
  });

const state = (answers: Record<string, unknown>): EvalState => ({
  answers: answers as EvalState["answers"],
  variables: {},
  hidden: {},
});

const group = (ref: string, op: string, value?: unknown): ConditionGroup =>
  ({
    op: "and",
    conditions: [{ left: { kind: "ref", ref }, op, ...(value === undefined ? {} : { value }) }],
    groups: [],
  }) as ConditionGroup;

describe("declining a consent", () => {
  it("is refused when the block does not offer it", () => {
    const result = validateAnswer(consent(), false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("consent_required");
  });

  it("is recorded as an answer when the block does", () => {
    const result = validateAnswer(consent({ allowDecline: true }), false);
    expect(result.ok).toBe(true);
    const value = result.value as { accepted: boolean; textSha256: string; ts: number };
    expect(value.accepted).toBe(false);
    // The hash of the wording they refused, not an empty string: what makes a
    // refusal as provable as an acceptance.
    expect(value.textSha256).toHaveLength(64);
  });

  it("hashes the same wording whichever way they answered", () => {
    const block = consent({ allowDecline: true });
    const yes = validateAnswer(block, true).value as { textSha256: string };
    const no = validateAnswer(block, false).value as { textSha256: string };
    expect(no.textSha256).toBe(yes.textSha256);
  });

  it("accepts the string forms both ways", () => {
    const block = consent({ allowDecline: true });
    expect((validateAnswer(block, "false").value as { accepted: boolean }).accepted).toBe(false);
    expect((validateAnswer(block, "true").value as { accepted: boolean }).accepted).toBe(true);
  });

  it("still rejects an answer that is neither", () => {
    expect(validateAnswer(consent({ allowDecline: true }), "maybe").code).toBe("consent_required");
  });

  it("summarizes as the block's own labels, not always as agreement", () => {
    const block = consent({ allowDecline: true, declineLabel: "I do not agree" });
    const no = validateAnswer(block, false).value;
    const yes = validateAnswer(block, true).value;
    expect(displayAnswer(block, no)).toBe("I do not agree");
    expect(displayAnswer(block, yes)).toBe("I agree");
  });

  it("projects its labels to the respondent", () => {
    const pub = toPublicBlock(consent({ allowDecline: true, declineLabel: "No thanks" }));
    expect(pub.allowDecline).toBe(true);
    expect(pub.declineLabel).toBe("No thanks");
  });
});

describe("branching on a consent", () => {
  /**
   * The answer is stored as `{ accepted, textSha256, ts }`, so every one of
   * these compared a condition against an object before `answerOperand`
   * existed — and every route hanging off a consent question was dead.
   */
  const accepted = { accepted: true, textSha256: "a".repeat(64), ts: 1 };
  const declined = { accepted: false, textSha256: "a".repeat(64), ts: 1 };

  it("reads is_checked / is_not_checked", () => {
    expect(evalGroup(group("q_consent", "is_checked"), state({ q_consent: accepted }))).toBe(true);
    expect(evalGroup(group("q_consent", "is_checked"), state({ q_consent: declined }))).toBe(false);
    expect(evalGroup(group("q_consent", "is_not_checked"), state({ q_consent: declined }))).toBe(true);
  });

  it("reads eq / neq against a boolean", () => {
    expect(evalGroup(group("q_consent", "eq", false), state({ q_consent: declined }))).toBe(true);
    expect(evalGroup(group("q_consent", "eq", true), state({ q_consent: declined }))).toBe(false);
    expect(evalGroup(group("q_consent", "neq", true), state({ q_consent: declined }))).toBe(true);
  });

  it("leaves an unanswered consent empty", () => {
    expect(evalGroup(group("q_consent", "is_empty"), state({}))).toBe(true);
    expect(evalGroup(group("q_consent", "is_not_empty"), state({ q_consent: declined }))).toBe(true);
  });

  it("does not unwrap a payment answer into its status", () => {
    // Deliberate: `status: "paid"` is the respondent's own word for it with
    // nothing verifying it, so it must not become routable by accident.
    const paid = { status: "paid" as const, verified: false };
    expect(evalGroup(group("q_pay", "eq", "paid"), state({ q_pay: paid }))).toBe(false);
  });
});

const shell = (endings: unknown[], logic: unknown[] = []) =>
  FormDoc.parse({
    schemaVersion: 1,
    title: "Registration",
    blocks: [
      { id: uid("blk", 9), ref: "welcome", type: "welcome", title: "Hi" },
      { id: uid("blk", 2), ref: "q_size", type: "number", title: "How big is your team?", required: true },
    ],
    endings,
    logic,
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });

const success = { id: uid("end", 1), ref: "end_thanks", title: "You're registered" };
const screenOut = (over: Record<string, unknown> = {}) => ({
  id: uid("end", 2),
  ref: "end_ineligible",
  title: "You can't submit this registration",
  kind: "screen_out",
  requirements: [{ id: uid("req", 1), label: "A team of 2 to 5 people" }],
  ...over,
});

describe("the screen-out ending", () => {
  it("defaults to a success ending, so every existing form is unchanged", () => {
    const doc = shell([success]);
    expect(doc.endings[0]!.kind).toBe("success");
    expect(doc.endings[0]!.requirements).toEqual([]);
  });

  it("reaches the respondent as a refusal with its requirements", () => {
    const doc = shell([success, screenOut()]);
    const pub = toPublicEnding(doc.endings[1]!);
    expect(pub.kind).toBe("screen_out");
    expect(pub.requirements).toEqual(["A team of 2 to 5 people"]);
  });

  it("shows only the requirements this response actually missed", () => {
    const doc = shell([
      success,
      screenOut({
        requirements: [
          { id: uid("req", 1), label: "A team of 2 to 5 people", when: group("q_size", "gt", 5) },
          { id: uid("req", 2), label: "At least one member over 18", when: group("q_age", "lt", 18) },
          { id: uid("req", 3), label: "Agreement to the code of conduct" },
        ],
      }),
    ]);
    const answers = state({ q_size: 9, q_age: 30 });
    const pub = toPublicEnding(doc.endings[1]!, undefined, (when) => evalGroup(when, answers));
    // The size line fired, the age line did not, and the unconditional line
    // always shows. Being told you failed a requirement you met is the reason
    // this is not just prose in the body.
    expect(pub.requirements).toEqual(["A team of 2 to 5 people", "Agreement to the code of conduct"]);
  });

  it("lists every requirement when there are no answers to test", () => {
    // The form's shape rather than one run through it — `toPublicConfig`'s case.
    const doc = shell([
      success,
      screenOut({
        requirements: [
          { id: uid("req", 1), label: "A team of 2 to 5 people", when: group("q_size", "gt", 5) },
          { id: uid("req", 2), label: "Agreement to the code of conduct" },
        ],
      }),
    ]);
    expect(toPublicEnding(doc.endings[1]!).requirements).toEqual([
      "A team of 2 to 5 people",
      "Agreement to the code of conduct",
    ]);
  });

  it("is a legitimate branch target", () => {
    const doc = shell([success, screenOut()], [
      {
        id: uid("rl", 1),
        action_kind: "goto",
        from: "q_size",
        when: group("q_size", "gt", 5),
        target: "end_ineligible",
        targetKind: "ending",
      },
    ]);
    const next = resolveNext(doc, "q_size", state({ q_size: 9 }));
    expect(next.kind).toBe("ending");
    expect(next.kind === "ending" && next.ending.ref).toBe("end_ineligible");
    expect(next.kind === "ending" && next.ending.kind).toBe("screen_out");
  });
});

describe("where a respondent lands when no rule sends them anywhere", () => {
  it("accepts them, even when the screen-out was listed first", () => {
    /*
     * `endings[0]` used to be the fallback, which made the ORDER of the array a
     * policy nobody set: an author who dropped the refusal onto the canvas
     * first, or a generator that listed it above the thank-you, screened out
     * every respondent who took the ordinary path.
     */
    const doc = shell([screenOut(), success]);
    expect(resolveEnding(doc, state({ q_size: 3 })).ref).toBe("end_thanks");
  });

  it("still honours a rule that does send them to the screen-out", () => {
    const doc = FormDoc.parse({
      ...shell([screenOut(), success]),
      endingRules: [
        {
          id: uid("rl", 1),
          action_kind: "goto",
          when: group("q_size", "gt", 5),
          target: "end_ineligible",
          targetKind: "ending",
        },
      ],
    });
    expect(resolveEnding(doc, state({ q_size: 9 })).ref).toBe("end_ineligible");
    expect(resolveEnding(doc, state({ q_size: 3 })).ref).toBe("end_thanks");
  });

  it("falls back to the first ending when there is no success ending at all", () => {
    // Unpublishable — `no_success_ending` is an error — but it must not throw.
    const doc = shell([screenOut()]);
    expect(resolveEnding(doc, state({})).ref).toBe("end_ineligible");
  });
});

describe("narrowing requirements to what was actually failed", () => {
  const unmet = (when: ConditionGroup, answers: Record<string, unknown>) =>
    isRequirementUnmet(when, state(answers));

  it("does not fire on a question the respondent never reached", () => {
    // `is_not_checked` is true of an unanswered consent, so the naive reading
    // tells somebody screened out at the first gate that they also failed to
    // agree to a code of conduct nobody showed them.
    expect(unmet(group("q_conduct", "is_not_checked"), {})).toBe(false);
    expect(unmet(group("q_size", "is_empty"), {})).toBe(false);
  });

  it("fires once that question has an answer", () => {
    const declined = { accepted: false, textSha256: "a".repeat(64), ts: 1 };
    expect(unmet(group("q_conduct", "is_not_checked"), { q_conduct: declined })).toBe(true);
  });

  it("still evaluates normally when the answer is there", () => {
    expect(unmet(group("q_size", "gt", 5), { q_size: 9 })).toBe(true);
    expect(unmet(group("q_size", "gt", 5), { q_size: 3 })).toBe(false);
  });

  it("evaluates a mixed condition rather than suppressing it", () => {
    const when: ConditionGroup = {
      op: "or",
      conditions: [
        { left: { kind: "ref", ref: "q_size" }, op: "gt", value: 5 },
        { left: { kind: "ref", ref: "q_conduct" }, op: "is_not_checked" },
      ],
      groups: [],
    } as ConditionGroup;
    // One of the two was answered, so the requirement is live.
    expect(unmet(when, { q_size: 9 })).toBe(true);
  });

  it("evaluates a condition with no question in it at all", () => {
    // Over a variable or a hidden field there is no "were they asked" to check.
    const when: ConditionGroup = {
      op: "and",
      conditions: [{ left: { kind: "variable", name: "score" }, op: "lt", value: 10 }],
      groups: [],
    } as ConditionGroup;
    expect(isRequirementUnmet(when, { answers: {}, variables: { score: 2 }, hidden: {} })).toBe(true);
  });

  it("collects refs from nested groups", () => {
    const when: ConditionGroup = {
      op: "and",
      conditions: [{ left: { kind: "ref", ref: "q_a" }, op: "eq", value: 1 }],
      groups: [
        {
          op: "or",
          conditions: [
            { left: { kind: "ref", ref: "q_b" }, op: "eq", value: 2 },
            { left: { kind: "variable", name: "v" }, op: "eq", value: 3 },
          ],
          groups: [],
        },
      ],
    } as ConditionGroup;
    expect(conditionGroupRefs(when)).toEqual(["q_a", "q_b"]);
  });
});

describe("linting a screen-out", () => {
  it("passes when a success ending stands beside it", () => {
    const issues = lintFormDoc(shell([success, screenOut()]));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("blocks a form where every ending refuses", () => {
    const doc = shell([screenOut()]);
    const issue = lintFormDoc(doc).find((i) => i.code === "no_success_ending");
    expect(issue?.level).toBe("error");
  });

  it("warns about a refusal that explains nothing", () => {
    const doc = shell([success, screenOut({ requirements: [], bodyMd: "" })]);
    const issue = lintFormDoc(doc).find((i) => i.code === "screen_out_unexplained");
    expect(issue?.level).toBe("warning");
    expect(issue?.refs).toEqual(["end_ineligible"]);
  });

  it("accepts a message instead of a requirement list", () => {
    const doc = shell([success, screenOut({ requirements: [], bodyMd: "Applications reopen in March." })]);
    expect(lintFormDoc(doc).some((i) => i.code === "screen_out_unexplained")).toBe(false);
  });

  it("catches a requirement condition pointing at a question that does not exist", () => {
    const doc = shell([
      success,
      screenOut({ requirements: [{ id: uid("req", 1), label: "Be eligible", when: group("q_ghost", "eq", 1) }] }),
    ]);
    expect(lintFormDoc(doc).some((i) => i.code === "dangling_operand")).toBe(true);
  });
});

import type { Block, LogicRuleInput } from "@repo/form-schema";

/**
 * Turning a model's branch list into a flow that actually works.
 *
 * A language model is good at saying "if they use a competitor, ask which
 * one" and bad at noticing what that implies for everyone else. Left alone it
 * produces flows that are structurally valid and semantically wrong in two
 * specific ways, both of which we saw on the first prompt we tried:
 *
 *   1. **No rejoin.** `yes → q_which_competitor` sends the respondent into the
 *      follow-up, and then nothing brings them back: they fall straight into
 *      the *other* arm and get asked what they use "instead".
 *   2. **A no-op branch.** `yes → q_details` where `q_details` is already the
 *      next block routes everyone there anyway. The rule the flow needed was
 *      the complement — *skip* it when the answer was no.
 *
 * Both are derivable from the branch list and the block order, so they are
 * derived here rather than left to the prompt. The model is still asked to get
 * it right (see `buildFlowGeneratorPrompt`); this is the net underneath.
 */

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "is_empty" | "is_not_empty";

/** Every op the draft allows has a clean complement, which is what makes (2) fixable. */
const NEGATE: Record<Op, Op> = {
  eq: "neq",
  neq: "eq",
  gt: "lte",
  lte: "gt",
  gte: "lt",
  lt: "gte",
  contains: "not_contains",
  not_contains: "contains",
  is_empty: "is_not_empty",
  is_not_empty: "is_empty",
};

export interface DraftBranch {
  when: { ref: string; op: Op; value: string | number | boolean | null };
  then: string;
}

const ruleId = () => `rl_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

function gotoRule(from: string, cond: DraftBranch["when"], target: string, targetKind: "block" | "ending"): LogicRuleInput {
  return {
    id: ruleId(),
    action_kind: "goto",
    from,
    when: {
      op: "and",
      conditions: [
        {
          left: { kind: "ref", ref: cond.ref },
          op: cond.op,
          ...(cond.value !== null && cond.value !== undefined ? { value: cond.value } : {}),
        },
      ],
      groups: [],
    },
    target,
    targetKind,
    branch: "true",
  };
}

/** An unconditional jump, used to close an arm off. */
function alwaysRule(from: string, target: string, targetKind: "block" | "ending"): LogicRuleInput {
  return {
    id: ruleId(),
    action_kind: "goto",
    from,
    when: { op: "and", conditions: [], groups: [] },
    target,
    targetKind,
    branch: "true",
  };
}

/**
 * Map draft branches onto strict goto rules, then add the rules the model
 * left out. Anything referring to a block or ending that does not exist is
 * dropped rather than allowed to produce a dead end.
 */
export function buildFlowRules(
  branches: DraftBranch[],
  blocks: Block[],
  endingRefs: string[],
): LogicRuleInput[] {
  const index = new Map(blocks.map((b, i) => [b.ref, i]));
  const endings = new Set(endingRefs);
  const rules: LogicRuleInput[] = [];

  /** Branches the model gave us, keyed by the question they hang off. */
  const bySource = new Map<string, DraftBranch[]>();
  /** Blocks the model already routes away from, so we do not override it. */
  const routed = new Set<string>();

  for (const br of branches) {
    if (!index.has(br.when.ref)) continue;
    if (br.when.ref === br.then) continue;
    const isEnding = endings.has(br.then);
    if (!isEnding && !index.has(br.then)) continue;
    // A backwards jump is how a form loops forever; the FSM would allow it and
    // the respondent would never escape.
    if (!isEnding && index.get(br.then)! <= index.get(br.when.ref)!) continue;

    rules.push(gotoRule(br.when.ref, br.when, br.then, isEnding ? "ending" : "block"));
    routed.add(br.when.ref);
    const list = bySource.get(br.when.ref);
    if (list) list.push(br);
    else bySource.set(br.when.ref, [br]);
  }

  for (const [source, group] of bySource) {
    const sourceIndex = index.get(source)!;
    // Endings terminate; only block arms need anything doing to them.
    const arms = group
      .filter((b) => index.has(b.then))
      .sort((a, b) => index.get(a.then)! - index.get(b.then)!);
    if (arms.length === 0) continue;

    // Only one branch in total leaves this question — including any that end
    // the form. When the model has already routed the other answers somewhere,
    // adding a complement here would compete with its rule instead of
    // completing it.
    if (arms.length === 1 && group.length === 1) {
      const target = index.get(arms[0]!.then)!;
      // (2) The branch targets the block that comes next anyway, so it changes
      // nothing. What the flow meant is "skip this when the condition fails".
      if (target === sourceIndex + 1) {
        const dest = destinationAfter(target, blocks, endingRefs);
        if (dest) {
          const w = arms[0]!.when;
          rules.push(gotoRule(source, { ...w, op: NEGATE[w.op] }, dest.ref, dest.kind));
        }
      }
      continue;
    }

    // (1) Several arms hang off one question. Each arm runs from its own target
    // up to the block before the next arm starts; the last arm ends where the
    // trunk resumes. Every arm but the last needs closing off, or it spills
    // into the one below it.
    const lastArmStart = index.get(arms[arms.length - 1]!.then)!;
    const rejoin = destinationAfter(lastArmStart, blocks, endingRefs);
    if (!rejoin) continue;

    for (let i = 0; i < arms.length - 1; i++) {
      const armEnd = index.get(arms[i + 1]!.then)! - 1;
      const tail = blocks[armEnd];
      if (!tail || armEnd < index.get(arms[i]!.then)!) continue;
      if (tail.ref === rejoin.ref) continue;
      // The model sometimes closes the arm itself. Adding a second,
      // unconditional rule on top would shadow whatever it decided.
      if (routed.has(tail.ref)) continue;
      rules.push(alwaysRule(tail.ref, rejoin.ref, rejoin.kind));
    }
  }

  return rules;
}

/** What follows position `i` — the next block, or the first ending. */
function destinationAfter(
  i: number,
  blocks: Block[],
  endingRefs: string[],
): { ref: string; kind: "block" | "ending" } | null {
  const next = blocks[i + 1];
  if (next) return { ref: next.ref, kind: "block" };
  const ending = endingRefs[0];
  return ending ? { ref: ending, kind: "ending" } : null;
}

import { conditionIsAlwaysTrue } from "../conditions";
import type { Block } from "../blocks";
import type { LogicRuleInput } from "../logic";

/**
 * Turning a branch list into a flow that actually works.
 *
 * Lives in the shared package because two very different callers need the same
 * answer: the AI routes on the server, and the builder's question list in the
 * browser, which has to rewrite these rules whenever a question is dragged into
 * or out of a branch. Two implementations of "where does this arm end" is
 * exactly how an editor and a graph come to disagree about the same form.
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
  /**
   * Rules already on the form, when extending rather than generating. They are
   * not returned — only used so derivation does not fight or duplicate them.
   */
  existing: { from?: string | null; target: string; targetKind?: "block" | "ending"; when?: unknown }[] = [],
): LogicRuleInput[] {
  const index = new Map(blocks.map((b, i) => [b.ref, i]));
  const endings = new Set(endingRefs);
  const rules: LogicRuleInput[] = [];

  /** Branches the model gave us, keyed by the question they hang off. */
  const bySource = new Map<string, DraftBranch[]>();
  /** Blocks the model already routes away from, so we do not override it. */
  const routed = new Set<string>();
  /** Which question each block is an arm of, so arms are not confused. */
  const armOf = new Map<string, Set<string>>();

  for (const r of existing) {
    if (r.from) routed.add(r.from);
    if (r.from && (r.targetKind ?? "block") === "block") {
      const owners = armOf.get(r.target);
      if (owners) owners.add(r.from);
      else armOf.set(r.target, new Set([r.from]));
    }
  }

  for (const br of branches) {
    if (!index.has(br.when.ref)) continue;
    if (br.when.ref === br.then) continue;
    const isEnding = endings.has(br.then);
    if (!isEnding && !index.has(br.then)) continue;
    // A backwards jump is how a form loops forever; the FSM would allow it and
    // the respondent would never escape.
    if (!isEnding && index.get(br.then)! <= index.get(br.when.ref)!) continue;

    // `is_not_empty` on a required question is how the model spells "and
    // then": it can never be false, so keeping it as a condition would draw a
    // decision with one live arm and one dead one. Store what it means.
    const sourceBlock = blocks.find((b) => b.ref === br.when.ref);
    const unconditional = conditionIsAlwaysTrue(
      { left: { kind: "ref", ref: br.when.ref }, op: br.when.op, ...(br.when.value === null ? {} : { value: br.when.value }) },
      sourceBlock,
    );
    if (unconditional) {
      rules.push(alwaysRule(br.when.ref, br.then, isEnding ? "ending" : "block"));
      routed.add(br.when.ref);
      continue;
    }

    rules.push(gotoRule(br.when.ref, br.when, br.then, isEnding ? "ending" : "block"));
    routed.add(br.when.ref);
    if (!isEnding) {
      const owners = armOf.get(br.then);
      if (owners) owners.add(br.when.ref);
      else armOf.set(br.then, new Set([br.when.ref]));
    }
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
    //
    // When two of the conditions point at the same block, that block is where
    // the flow converges — not an arm of its own. A device question routing
    // iPhone and Android to their own follow-ups while sending Chrome and
    // "several" straight on to the shared next question says exactly this, and
    // reading that shared target as the last arm put the rejoin one block too
    // far down, skipping the question everyone was supposed to answer.
    const counts = new Map<string, number>();
    for (const a of arms) counts.set(a.then, (counts.get(a.then) ?? 0) + 1);
    const shared = [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([ref]) => ref)
      .sort((a, b) => index.get(a)! - index.get(b)!)[0];

    const trueArms = shared
      ? arms.filter((a) => a.then !== shared && index.get(a.then)! < index.get(shared)!)
      : dedupeByTarget(arms);
    if (trueArms.length === 0) continue;

    const rejoin = shared
      ? { ref: shared, kind: "block" as const }
      : destinationAfter(index.get(trueArms[trueArms.length - 1]!.then)!, blocks, endingRefs);
    if (!rejoin) continue;

    for (let i = 0; i < trueArms.length - 1; i++) {
      const armEnd = index.get(trueArms[i + 1]!.then)! - 1;
      const tail = blocks[armEnd];
      if (!tail || armEnd < index.get(trueArms[i]!.then)!) continue;
      if (tail.ref === rejoin.ref) continue;
      // The model sometimes closes the arm itself. Adding a second,
      // unconditional rule on top would shadow whatever it decided.
      if (routed.has(tail.ref)) continue;
      // Arms are assumed to be contiguous runs of blocks, which holds until a
      // second branch elsewhere in the form interleaves its own arms with this
      // one. Then the block sitting at what looks like this arm's end actually
      // belongs to that other question, and sending it onward would cut its
      // own path short — an event form did exactly this, skipping the name
      // question for everyone attending online. Somebody else's arm is left
      // alone.
      const owners = armOf.get(tail.ref);
      if (owners && !owners.has(source)) continue;
      rules.push(alwaysRule(tail.ref, rejoin.ref, rejoin.kind));
    }
  }

  return dedupeRules(rules, existing);
}

/**
 * Drop rules that cannot change where anyone goes.
 *
 * Derivation and the model's own branch list can arrive at the same jump from
 * two directions — a generated waitlist form produced both `q_device is_empty →
 * q_channels` and an unconditional `q_device → q_channels`, which route
 * identically. Harmless at runtime and confusing everywhere else: the logic
 * editor draws two edges between the same pair of nodes, and an author trying
 * to change the flow has to work out which of them is doing anything.
 */
function dedupeRules(
  rules: LogicRuleInput[],
  /**
   * Rules already on the form. Compared against, not returned.
   *
   * Without this, restating a branch that already existed appended a second,
   * identical rule: asked to confirm the routing it had already written, the
   * builder's AI bar doubled every `q_platform` rule and the logic editor drew
   * eight edges where four were live.
   */
  existing: { from?: string | null; target: string; targetKind?: "block" | "ending"; when?: unknown }[] = [],
): LogicRuleInput[] {
  // Every rule this file produces is a goto, but `LogicRuleInput` is the whole
  // union; read the two fields that matter through a narrow instead of casting.
  const shape = (r: LogicRuleInput): { from: string; target: string; conditions: number } | null => {
    if (r.action_kind !== "goto") return null;
    const when = r.when as { conditions?: unknown[] } | undefined;
    return { from: r.from ?? "", target: r.target, conditions: when?.conditions?.length ?? 0 };
  };

  const unconditional = new Set<string>();
  for (const r of rules) {
    const s = shape(r);
    if (s && s.conditions === 0) unconditional.add(`${s.from}\u0000${s.target}`);
  }

  // Pre-seed with what is already on the form, so a rule identical to a live
  // one is recognised as redundant rather than added beside it.
  const seen = new Set<string>();
  for (const r of existing) {
    seen.add(`${r.from ?? ""}\u0000${r.target}\u0000${JSON.stringify(r.when ?? null)}`);
  }
  return rules.filter((r) => {
    const s = shape(r);
    if (!s) return true;
    const key = `${s.from}\u0000${s.target}\u0000${JSON.stringify(r.when ?? null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    // A conditional jump to the same place an unconditional one already goes.
    if (s.conditions > 0 && unconditional.has(`${s.from}\u0000${s.target}`)) return false;
    return true;
  });
}

/** Two conditions sending answers to the same follow-up are still one arm. */
function dedupeByTarget(arms: DraftBranch[]): DraftBranch[] {
  const seen = new Set<string>();
  return arms.filter((a) => (seen.has(a.then) ? false : (seen.add(a.then), true)));
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

/**
 * Put the flow back in order after the blocks have moved.
 *
 * The builder's question list is a picture of the flow, and the flow is derived
 * from two things: which answer goes where, and what order the questions sit
 * in. Dragging a question changes the second one — and `moveBlock` was a plain
 * array splice that never touched `logic`, so dragging the first question of an
 * arm left its branch pointing at wherever it landed, and dragging anything
 * across an arm boundary left the arm-closing jump behind. Both produce a form
 * that asks the wrong people the wrong questions, and neither shows up in the
 * list, which is derived from the same broken rules.
 *
 * The repair rests on a distinction the rules do not make for themselves:
 *
 *   - A CONDITIONAL goto is intent. "Android goes to the Play Store email" is
 *     something a person decided, and no amount of reordering changes it.
 *   - An UNCONDITIONAL goto is mechanism. "This arm ends here, rejoin there" is
 *     a consequence of where the blocks sit, and is re-derivable.
 *
 * So intent is read back out, mechanism is thrown away, and `buildFlowRules`
 * derives it again from the new order. A branch that has become impossible —
 * pointing at a deleted question, or backwards, which would loop — is dropped
 * rather than kept as a dead end.
 *
 * Rules with more than one condition, or with nested groups, are beyond what
 * `DraftBranch` can express. Those are preserved exactly as they are and passed
 * to the derivation so it does not fight them.
 */
export function repairFlow<T extends { blocks: Block[]; endings: { ref: string }[]; logic: LogicRuleInput[] }>(
  doc: T,
): T {
  const endingRefs = doc.endings.map((e) => e.ref);
  const refs = new Set(doc.blocks.map((b) => b.ref));

  /** Anything that is not a goto — `set_variable` — is none of our business. */
  const untouched: LogicRuleInput[] = [];
  /** Multi-condition or grouped rules: kept verbatim, and respected. */
  const complex: Extract<LogicRuleInput, { action_kind: "goto" }>[] = [];
  const branches: DraftBranch[] = [];

  for (const rule of doc.logic) {
    if (rule.action_kind !== "goto") {
      untouched.push(rule);
      continue;
    }
    const when = rule.when as { conditions?: unknown[]; groups?: unknown[] } | null | undefined;
    const conditions = when?.conditions ?? [];
    const groups = when?.groups ?? [];

    // Mechanism. Dropped, then derived again below.
    if (conditions.length === 0 && groups.length === 0) continue;

    if (conditions.length !== 1 || groups.length > 0) {
      complex.push(rule);
      continue;
    }

    const condition = conditions[0] as {
      left?: { kind?: string; ref?: string };
      op?: Op;
      value?: string | number | boolean;
    };
    const from = rule.from ?? condition.left?.ref;
    // A condition on anything but a question ref — a variable, say — is not a
    // branch in the sense this file means.
    if (!from || condition.left?.kind !== "ref" || !condition.op) {
      complex.push(rule);
      continue;
    }
    // Intent that can no longer be honoured is intent about a form that no
    // longer exists.
    if (!refs.has(from)) continue;
    if (!refs.has(rule.target) && !endingRefs.includes(rule.target)) continue;

    branches.push({
      when: { ref: from, op: condition.op, value: condition.value ?? null },
      then: rule.target,
    });
  }

  const derived = buildFlowRules(branches, doc.blocks, endingRefs, complex);
  return { ...doc, logic: [...untouched, ...complex, ...derived] };
}

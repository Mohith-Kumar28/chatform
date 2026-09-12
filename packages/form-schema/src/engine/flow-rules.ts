import { conditionIsAlwaysFalse, conditionIsAlwaysTrue } from "../conditions";
import type { Block } from "../blocks";
import type { LogicRuleInput } from "../logic";
import { rulesAreExhaustive } from "./lint";

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

/**
 * The operators a MODEL may write on a branch.
 *
 * Deliberately short of the full `Op` set: `is_empty` and `is_not_empty` are
 * how a model spells "and then", which is already what falling through to the
 * next question does. A rule that says so adds nothing to the flow and draws a
 * decision node on the author's canvas with one live arm and one dead one,
 * over a choice the form never makes. `resolveBranches` strips them; keeping
 * them out of the tool schema means the model cannot reach for them at all.
 */
export const DRAFT_BRANCH_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
] as const;
export type DraftBranchOp = (typeof DRAFT_BRANCH_OPS)[number];

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

  /**
   * (3) A condition and its exact opposite, both sent to the same place.
   *
   * "Not empty → screen-out" beside "empty → screen-out" is how a model says
   * "and then the form ends". Stored as written it routes correctly, but the
   * canvas draws a decision with two arms over a choice nobody makes. Kept as
   * one unconditional jump instead; `collapsedAt` records which pairs have
   * already been written so the second half of each adds nothing.
   */
  const exhaustive = new Set<DraftBranch>();
  for (const a of branches) {
    for (const b of branches) {
      if (
        a !== b &&
        a.when.ref === b.when.ref &&
        a.then === b.then &&
        NEGATE[a.when.op] === b.when.op &&
        a.when.value === b.when.value
      ) {
        exhaustive.add(a);
        exhaustive.add(b);
      }
    }
  }
  const collapsedAt = new Set<string>();

  for (const br of branches) {
    if (!index.has(br.when.ref)) continue;
    if (br.when.ref === br.then) continue;
    const isEnding = endings.has(br.then);
    if (!isEnding && !index.has(br.then)) continue;
    // A backwards jump is how a form loops forever; the FSM would allow it and
    // the respondent would never escape.
    if (!isEnding && index.get(br.then)! <= index.get(br.when.ref)!) continue;

    if (exhaustive.has(br)) {
      const key = `${br.when.ref}\u0000${br.then}`;
      if (!collapsedAt.has(key)) {
        collapsedAt.add(key);
        rules.push(alwaysRule(br.when.ref, br.then, isEnding ? "ending" : "block"));
        routed.add(br.when.ref);
      }
      continue;
    }

    // `is_not_empty` on a required question is how the model spells "and
    // then": it can never be false, so keeping it as a condition would draw a
    // decision with one live arm and one dead one. Store what it means.
    const sourceBlock = blocks.find((b) => b.ref === br.when.ref);
    const condition = {
      left: { kind: "ref" as const, ref: br.when.ref },
      op: br.when.op,
      ...(br.when.value === null ? {} : { value: br.when.value }),
    };
    // Its opposite: `is_empty` on a required question can never fire, so the
    // rule is a wire nobody travels — and, worse, it makes the question look
    // like a decision point on the canvas. Dropping it is not a loss of intent
    // because there was no reachable intent to lose.
    if (conditionIsAlwaysFalse(condition, sourceBlock)) continue;
    const unconditional = conditionIsAlwaysTrue(condition, sourceBlock);
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

    // Only one branch leaves this question for another QUESTION. Branches that
    // end the form do not count against it: they sit above the complement in
    // the rule list, and the first matching goto wins, so they keep their
    // answers either way.
    //
    // This used to require exactly one branch in total, on the reasoning that
    // any other branch meant the model had already routed the remaining
    // answers. Sometimes it has — "yes → phone, no → end" leaves nobody over —
    // and then a complement is a wire nobody travels. But an ending branch
    // routes its own answers, not necessarily the rest: an age question that
    // screened out the over-25s was given "under 6 → a referral question"
    // directly below it, the complement was withheld because of the
    // screen-out, and every 6-to-25-year-old fell into the referral question
    // and was screened out behind it. So the question is whether the branches
    // — these and any already on the form — leave an answer unrouted.
    if (arms.length === 1) {
      const target = index.get(arms[0]!.then)!;
      const siblings = [
        ...group.map((b) => gotoRule(source, b.when, b.then, "block")),
        ...existing.filter((r) => r.from === source),
      ] as Parameters<typeof rulesAreExhaustive>[1];
      const sourceBlock = blocks[sourceIndex];
      // (2) The branch targets the block that comes next anyway, so it changes
      // nothing. What the flow meant is "skip this when the condition fails".
      if (target === sourceIndex + 1 && sourceBlock && !rulesAreExhaustive(sourceBlock, siblings)) {
        // Skip the whole arm, not just its first question — see `armExtent`.
        const dest = destinationAfter(armExtent(target, branches, blocks), blocks, endingRefs);
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

    // Without a shared target the trunk has to be inferred, and the only
    // evidence is where the last arm stops. `armExtent` reads that from the
    // branch list — a follow-up question decided from inside the arm belongs to
    // it — rather than assuming the last arm is one question long, which put
    // every earlier arm's rejoin in the MIDDLE of the last one.
    //
    // It is still an inference, and the way to avoid needing it is to name the
    // trunk: two answers pointing at the same question say "this is where we
    // all meet again" outright, which is why both prompts ask for a branch per
    // answer including the ones that need no follow-up.
    const rejoin = shared
      ? { ref: shared, kind: "block" as const }
      : destinationAfter(
          armExtent(index.get(trueArms[trueArms.length - 1]!.then)!, branches, blocks),
          blocks,
          endingRefs,
        );
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

/**
 * How far the arm opened by a conditional question actually reaches.
 *
 * The complement of "only ask this when X" has to land past everything that
 * arm contains, and the arm is frequently longer than one question. Two
 * conditional inserts in a row build exactly that: "how many guests" only when
 * attending, then "your guests' names" only when there is at least one guest.
 * Reading the arm as a single block sent the complement of the *first*
 * condition to the second question in the arm — so an RSVP that said "no, I
 * can't come" was asked to list the guests it was not bringing. The routing
 * was wrong, not merely drawn wrong, and it shipped to respondents.
 *
 * Extent is read from the author's own branch list rather than from the rules
 * being derived here: a question belongs to the arm when something already in
 * the arm is what decides it. Derived rules are half-written at this point and
 * reading them back would make the answer depend on iteration order.
 */
function armExtent(start: number, branches: DraftBranch[], blocks: Block[]): number {
  const members = new Set<string>();
  const first = blocks[start];
  if (!first) return start;
  members.add(first.ref);

  let end = start;
  for (let k = start + 1; k < blocks.length; k++) {
    const block = blocks[k];
    if (!block) break;
    const decidedFromInside = branches.some((b) => b.then === block.ref && members.has(b.when.ref));
    if (!decidedFromInside) break;
    members.add(block.ref);
    end = k;
  }
  return end;
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

/**
 * Take questions out of the flow without cutting the chain they sat in.
 *
 * Deleting a question used to delete every route pointing at it, so an answer
 * that led there simply fell through to whichever block happened to sit next
 * in the list. With the first question of an arm gone, that next block was
 * often another arm's question: delete "Play Store email?" and every iOS user
 * was asked which Android device they own.
 *
 * A route into a deleted question is a route into whatever that question led
 * to, so that is where it goes now — the question's own unconditional jump if
 * it had one, else the block below it, else the first ending — following on
 * past anything else deleted in the same edit. Routes out of a deleted
 * question go with it.
 *
 * `rederived` is for a caller about to run `repairFlow`, which reads every
 * branch target as the start of that answer's arm. When the deleted questions
 * were the whole arm, the destination is where the arms rejoin, and a branch
 * aimed there would be read as a new arm that the other arms then skip past.
 * So an emptied arm's route is dropped instead, and `repairFlow` sends that
 * answer to the rejoin itself — the one case where dropping was always right.
 */
export function bridgeDeletedBlocks<T extends { blocks: Block[]; endings: { ref: string }[]; logic: LogicRuleInput[] }>(
  doc: T,
  deleted: Iterable<string>,
  { rederived = false }: { rederived?: boolean } = {},
): T {
  const gone = new Set(deleted);
  const endingRefs = new Set(doc.endings.map((e) => e.ref));
  const isJump = (r: LogicRuleInput, from: string): r is Extract<LogicRuleInput, { action_kind: "goto" }> => {
    if (r.action_kind !== "goto" || r.from !== from) return false;
    const when = r.when as { conditions?: unknown[]; groups?: unknown[] } | null | undefined;
    return (when?.conditions?.length ?? 0) === 0 && (when?.groups?.length ?? 0) === 0;
  };

  /**
   * Where the flow went after `ref`, walking past everything being deleted.
   * `jumped` says an arm-closing jump was crossed on the way.
   */
  const onward = (ref: string): { ref: string; kind: "block" | "ending"; jumped: boolean } | null => {
    const visited = new Set<string>();
    let at = ref;
    let jumped = false;
    while (gone.has(at)) {
      if (visited.has(at)) return null; // deleted questions jumping in a circle
      visited.add(at);
      const jump = doc.logic.find((r) => isJump(r, at));
      if (jump && jump.action_kind === "goto") {
        at = jump.target;
        jumped = true;
        continue;
      }
      const i = doc.blocks.findIndex((b) => b.ref === at);
      const next = doc.blocks[i + 1]?.ref ?? doc.endings[0]?.ref;
      if (!next) return null;
      at = next;
    }
    return { ref: at, kind: endingRefs.has(at) ? "ending" : "block", jumped };
  };

  /**
   * The destination is where arms meet, not the rest of this one: a sibling
   * answer already goes there, or a surviving arm's closing jump lands there.
   */
  const isRejoin = (target: string, rule: LogicRuleInput & { action_kind: "goto" }) =>
    doc.logic.some(
      (o) =>
        o !== rule &&
        o.action_kind === "goto" &&
        o.target === target &&
        !gone.has(o.from ?? "") &&
        (o.from === rule.from || (o.from !== undefined && isJump(o, o.from))),
    );

  const logic: LogicRuleInput[] = [];
  for (const rule of doc.logic) {
    if (rule.action_kind !== "goto") {
      logic.push(rule);
      continue;
    }
    if (rule.from && gone.has(rule.from)) continue;
    if (!gone.has(rule.target)) {
      logic.push(rule);
      continue;
    }
    const to = onward(rule.target);
    // Nowhere to rejoin, or rejoining would send the question back to itself.
    if (!to || to.ref === rule.from) continue;
    if (rederived && (to.jumped || isRejoin(to.ref, rule))) continue;
    logic.push({ ...rule, target: to.ref, targetKind: to.kind });
  }

  return { ...doc, blocks: doc.blocks.filter((b) => !gone.has(b.ref)), logic };
}

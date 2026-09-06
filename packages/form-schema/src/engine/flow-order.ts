import type { Block } from "../blocks";
import type { DraftBranch } from "./flow-rules";

/**
 * Put the questions in an order the branches can actually be expressed in.
 *
 * `buildFlowRules` discards any branch that points at a question ABOVE the one
 * deciding it, and it is right to: the FSM would honour the jump and the
 * respondent would loop forever. But discarding it silently means a model that
 * designed the flow correctly and merely wrote the blocks out in the wrong
 * order loses the design rather than the ordering — which is what the author
 * sees as "the AI is bad at branching".
 *
 * It is a common failure and an unforced one. A drafted waitlist that put the
 * shared "how did you hear about us" question before the per-platform arms had
 * all three of its platform branches dropped on the floor, and arrived as a
 * straight line with an unexplained single-select in the middle of it.
 *
 * The repair is the one the order was trying to express: a question that is the
 * target of a branch belongs below the question that decides it. So each
 * offending target is lifted out and reinserted directly after its decider, in
 * the order its branches were written — which is option order, and therefore
 * the order the arms read in on the canvas.
 *
 * Deliberately narrow. This does not rearrange a form whose branches already
 * point downwards, and it does not try to guess which of the trailing questions
 * belong to which arm; both would mean rewriting an order the author or the
 * model got right, on evidence that does not exist. It only moves the blocks
 * whose position is provably wrong, because the alternative for those is not
 * "a different order" but "no branch at all".
 */
export function orderBlocksForBranches(blocks: Block[], branches: DraftBranch[]): Block[] {
  if (blocks.length < 3 || branches.length === 0) return blocks;

  let current = blocks;

  // Each pass fixes the offenders visible in the current order, and moving one
  // block can expose another (an arm's second question hanging off its first).
  // Bounded because a pathological branch set — two questions each deciding the
  // other — has no order that satisfies both, and must not spin.
  for (let pass = 0; pass < 4; pass++) {
    const index = new Map(current.map((b, i) => [b.ref, i]));

    /** Targets to lift, grouped by the question they hang off, in branch order. */
    const lift = new Map<string, string[]>();
    const lifted = new Set<string>();

    for (const br of branches) {
      const from = index.get(br.when.ref);
      const to = index.get(br.then);
      // A branch to an ending, or to a question that is not in this document,
      // has no position to be wrong about.
      if (from === undefined || to === undefined) continue;
      if (to > from) continue;
      // The first block is the greeting; nothing may be routed above it, and a
      // branch aimed at it is a loop by any ordering.
      if (to === 0) continue;
      if (lifted.has(br.then)) continue;
      // Moving a question above its own decider is how the two-pass fix would
      // fight itself; a decider that is also a target is left where it is.
      if (br.then === br.when.ref) continue;
      lifted.add(br.then);
      const list = lift.get(br.when.ref);
      if (list) list.push(br.then);
      else lift.set(br.when.ref, [br.then]);
    }

    if (lifted.size === 0) return current;

    const next: Block[] = [];
    for (const block of current) {
      if (lifted.has(block.ref)) continue;
      next.push(block);
      const arms = lift.get(block.ref);
      if (!arms) continue;
      for (const ref of arms) {
        const arm = current.find((b) => b.ref === ref);
        if (arm) next.push(arm);
      }
    }

    // A decider that was itself lifted takes its arms with it, so anything the
    // walk above could not place is appended rather than dropped.
    if (next.length !== current.length) {
      const placed = new Set(next.map((b) => b.ref));
      for (const block of current) if (!placed.has(block.ref)) next.push(block);
    }

    current = next;
  }

  return current;
}

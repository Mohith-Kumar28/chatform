import type { Block, FormDoc, Ending, AnswerMap } from "../index";
import {
  type EvalState,
  applyLogicRules,
  isBlockVisible,
  resolveNext,
} from "./evaluate";

/**
 * Rebuild the state a form is in from the answers already stored for it.
 *
 * The chat runtime keeps its cursor in a Durable Object and advances it one turn
 * at a time. A programmatic response has no such place to keep one — and giving
 * it one would immediately raise the question the chat path never has to answer:
 * what happens when two requests append answers at the same time.
 *
 * So there is no cursor. Every request replays the stored answers through the
 * same `resolveNext` the conversation uses, which is deterministic in
 * `(answers, hidden)` — including `add_score`, provided each answered block is
 * walked exactly once in path order, which is what this does. Two concurrent
 * appends to different questions cannot corrupt a cursor that does not exist.
 *
 * The cost is one indexed read of at most 200 rows plus arithmetic, which is
 * cheaper than the Durable Object round trip it replaces.
 *
 * The constraint this relies on: `LogicRule` actions are a pure function of the
 * answers walked so far. If an action is ever added whose result depends on
 * *when* it ran — a timestamp, a counter, an external call — replay stops
 * agreeing with the live path and this has to become a stored cursor.
 */

export interface ReplayResult {
  /** The state the flow would be in, having consumed every on-path answer. */
  state: EvalState;
  /** Blocks the flow actually walked, in order. */
  path: string[];
  /** Where the flow is waiting, or the ending it reached. */
  cursor: { kind: "block"; block: Block } | { kind: "ending"; ending: Ending };
  /**
   * Answers stored for blocks the flow never reached.
   *
   * Not an error in itself — an earlier answer may have been changed, routing
   * the conversation around a question that had already been answered — but they
   * are excluded from `state`, so logic and endings resolve from the live path
   * only.
   */
  offPath: string[];
}

/** Blocks that collect nothing and are walked past rather than waited on. */
function isPassive(block: Block): boolean {
  return block.type === "welcome" || block.type === "statement";
}

export function replayState(
  doc: FormDoc,
  answers: AnswerMap,
  hidden: Record<string, string> = {},
): ReplayResult {
  const state: EvalState = { answers: {}, variables: {}, hidden };
  for (const v of doc.variables) state.variables[v.name] = v.initial;

  const path: string[] = [];
  const consumed = new Set<string>();

  let cursor = resolveNext(doc, null, state);
  // A form holds at most 200 blocks, so twice that is a ceiling no legitimate
  // flow reaches — and a guard against a `goto` cycle that lint did not catch.
  const ceiling = doc.blocks.length * 2 + 2;

  for (let guard = 0; guard < ceiling && cursor.kind === "block"; guard++) {
    const block = cursor.block;
    path.push(block.ref);

    if (!isPassive(block)) {
      const stored = answers[block.ref];
      // Unanswered: this is exactly where the flow is waiting.
      if (stored === undefined) break;
      state.answers[block.ref] = stored;
      consumed.add(block.ref);
    }
    cursor = resolveNext(doc, block.ref, state);
  }

  return {
    state,
    path,
    cursor,
    offPath: Object.keys(answers).filter((ref) => !consumed.has(ref)),
  };
}

export interface MissingAnswer {
  ref: string;
  title: string;
}

/**
 * Required questions the respondent has actually been asked and not answered.
 *
 * "Required" alone is not the test — a required question inside a branch nobody
 * took was never asked, and refusing to complete over it would make conditional
 * logic unusable. So this walks the same path the flow walked and reports only
 * what is required, visible, on that path, and empty.
 */
export function unsatisfiedRequired(
  doc: FormDoc,
  answers: AnswerMap,
  hidden: Record<string, string> = {},
): MissingAnswer[] {
  const { state, path } = replayState(doc, answers, hidden);
  const missing: MissingAnswer[] = [];
  for (const ref of path) {
    const block = doc.blocks.find((b) => b.ref === ref);
    if (!block || isPassive(block) || !block.required) continue;
    if (!isBlockVisible(block, state)) continue;
    const value = answers[ref];
    if (value === undefined || value === null || value === "") {
      missing.push({ ref, title: block.title });
    }
  }
  return missing;
}

/**
 * May this block be answered right now?
 *
 * Answering out of order is refused rather than silently accepted, because the
 * alternative makes the drop-off funnel meaningless: a response that jumped
 * straight to question nine would report eight abandonments. Re-answering
 * something already on the path is fine — that is an edit.
 */
export function answerability(
  doc: FormDoc,
  answers: AnswerMap,
  ref: string,
  hidden: Record<string, string> = {},
): { ok: true; block: Block } | { ok: false; code: "unknown_block" | "block_not_reachable" | "block_not_visible" } {
  const block = doc.blocks.find((b) => b.ref === ref);
  if (!block) return { ok: false, code: "unknown_block" };
  if (isPassive(block)) return { ok: false, code: "unknown_block" };

  const { state, path, cursor } = replayState(doc, answers, hidden);
  if (!isBlockVisible(block, state)) return { ok: false, code: "block_not_visible" };

  const isCursor = cursor.kind === "block" && cursor.block.ref === ref;
  const alreadyOnPath = path.includes(ref);
  if (!isCursor && !alreadyOnPath) return { ok: false, code: "block_not_reachable" };
  return { ok: true, block };
}

/**
 * The questions this respondent has been through, and the ones still ahead.
 *
 * `replayState` answers the first half: it walks the real path and stops where
 * the flow is waiting. The second half is a forecast, and the only honest one
 * available — nobody can know which arm an unanswered branching question will
 * open. So the walk simply keeps going the way the flow is already pointed:
 * `resolveNext` reads an unanswered block the same way it reads any block whose
 * conditions do not match, and falls through to the next one. Unconditional
 * rejoin rules — the `goto` that closes an arm back onto the trunk — still fire,
 * because they match on nothing.
 *
 * What that means in practice is that the estimate starts out as the whole form
 * and narrows as the respondent picks their way through it. It narrows rather
 * than grows, which is the direction a progress bar should move.
 *
 * `seen` spans both halves, so a `goto` pointing back at somewhere the walk has
 * already been ends the forecast instead of circling. A question is counted
 * once however many times the flow passes it.
 */
export function projectedPath(
  doc: FormDoc,
  answers: AnswerMap,
  hidden: Record<string, string> = {},
): { walked: string[]; ahead: string[]; state: EvalState } {
  const { state, path, cursor } = replayState(doc, answers, hidden);
  const blockOf = (ref: string) => doc.blocks.find((b) => b.ref === ref);
  const walked = path.filter((ref) => {
    const b = blockOf(ref);
    return b !== undefined && !isPassive(b);
  });

  // `replayState` pushes the block it stops on, so the cursor is already in
  // `path` and the forecast starts after it.
  const seen = new Set(path);
  const ahead: string[] = [];
  const ceiling = doc.blocks.length * 2 + 2;
  let next = cursor.kind === "block" ? resolveNext(doc, cursor.block.ref, state) : cursor;
  for (let guard = 0; guard < ceiling && next.kind === "block"; guard += 1) {
    const block = next.block;
    if (seen.has(block.ref)) break;
    seen.add(block.ref);
    if (!isPassive(block)) ahead.push(block.ref);
    next = resolveNext(doc, block.ref, state);
  }

  return { walked, ahead, state };
}

/**
 * Progress, in the terms a client renders: answered, an estimate, a percentage.
 *
 * Counted over the respondent's own path, not the whole form. The denominator
 * used to be every visible block in the document, where "visible" means only
 * `block.visibility` — so on a form that branches with `goto` rules, which is
 * how the builder writes branches, it was the entire form every time. Somebody
 * nine questions into a nine-question path was told they were at "Question 8 of
 * 14" and a bar a little past halfway, and it never reached the end.
 */
export function progressOf(doc: FormDoc, answers: AnswerMap, hidden: Record<string, string> = {}) {
  const { walked, ahead } = projectedPath(doc, answers, hidden);
  const answered = walked.filter((ref) => answers[ref] !== undefined).length;
  const total = Math.max(walked.length + ahead.length, answered);
  return { answered, totalEstimate: total, pct: total === 0 ? 100 : Math.round((answered / total) * 100) };
}

export { applyLogicRules };

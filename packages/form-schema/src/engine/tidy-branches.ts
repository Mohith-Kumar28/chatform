import type { FormDoc } from "../form-doc";
import type { LogicRule } from "../logic";
import { rulesAreExhaustive } from "./lint";

type GotoRule = Extract<LogicRule, { action_kind: "goto" }>;

const isGoto = (r: LogicRule): r is GotoRule => r.action_kind === "goto";

/** A route with no condition: the question's "otherwise". */
function isCatchAll(rule: GotoRule): boolean {
  return !rule.when || (rule.when.conditions.length === 0 && rule.when.groups.length === 0);
}

const sameTarget = (a: GotoRule, b: { target: string; targetKind?: string }) =>
  a.target === b.target && (a.targetKind ?? "block") === (b.targetKind ?? "block");

/**
 * Put every question's routes in the order they are read: cases first, then
 * the "otherwise".
 *
 * `applyLogicRules` takes the first goto that matches, so an unconditional
 * route above a case swallows every answer and the case never runs. Edits
 * append their new cases after the routes a question already had, and a
 * question that already had an "and then" jump got its new branch underneath
 * it: a dental intake drew "If Yes → Preferred date / Otherwise → Preferred
 * date", with the Yes row dead.
 *
 * With `prune`, routes that change nothing are dropped too. Only the AI's
 * output is pruned; a person's own routes are reordered and otherwise left as
 * they built them.
 * - An "otherwise" under cases that already cover every answer.
 * - A last case that goes where the written "otherwise" already goes. Only
 *   trailing ones: an earlier case can hold answers a later case would
 *   otherwise take.
 * - Cases that cover every answer and all go to one place become one plain
 *   "go to" step.
 *
 * Rules keep their slots in `doc.logic`: only the routes leaving one question
 * trade places among themselves, so nothing else moves.
 */
export function tidyBranches(doc: FormDoc, opts: { prune?: boolean } = {}): FormDoc {
  const bySource = new Map<string, number[]>();
  doc.logic.forEach((r, i) => {
    if (!isGoto(r) || r.from === undefined) return;
    const slots = bySource.get(r.from);
    if (slots) slots.push(i);
    else bySource.set(r.from, [i]);
  });

  const logic: (LogicRule | null)[] = [...doc.logic];
  let changed = false;
  for (const [from, slots] of bySource) {
    const rules = slots.map((i) => doc.logic[i] as GotoRule);
    let cases = rules.filter((r) => !isCatchAll(r));
    let otherwise = rules.filter(isCatchAll);

    if (opts.prune) {
      const block = doc.blocks.find((b) => b.ref === from);
      // Only the first "otherwise" is ever reached.
      otherwise = otherwise.slice(0, 1);
      if (block && cases.length > 0 && rulesAreExhaustive(block, cases)) {
        otherwise = [];
        const first = cases[0]!;
        if (cases.every((c) => sameTarget(c, first))) {
          cases = [];
          // An empty group rather than null: it is the spelling the linter's
          // reachability pass reads as "takes everyone".
          otherwise = [{ ...first, when: { op: "and", conditions: [], groups: [] } }];
        }
      } else if (otherwise[0]) {
        // Against an "otherwise" someone wrote, not the natural next step: a
        // case aimed at the next question still says, on the canvas, which
        // answer goes there, and the AI is asked to route every option.
        const fallback = otherwise[0];
        while (cases.length > 0 && sameTarget(cases[cases.length - 1]!, fallback)) cases.pop();
      }
    }

    const ordered = [...cases, ...otherwise];
    if (ordered.length === rules.length && ordered.every((r, i) => r === rules[i])) continue;
    changed = true;
    slots.forEach((slot, i) => {
      logic[slot] = ordered[i] ?? null;
    });
  }
  if (!changed) return doc;
  return { ...doc, logic: logic.filter((r): r is LogicRule => r !== null) };
}

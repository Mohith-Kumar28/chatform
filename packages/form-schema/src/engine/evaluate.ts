import type { AnswerMap } from "../answers";
import type { Block } from "../blocks";
import type { Condition, ConditionGroup, ConditionOp } from "../conditions";
import type { Ending, LogicRule } from "../logic";
import type { ValueExprT } from "../logic";
import type { FormDoc } from "../form-doc";

export interface EvalState {
  answers: AnswerMap;
  variables: Record<string, string | number>;
  hidden: Record<string, string>;
}

type Primitive = string | number | boolean | string[] | undefined | null;

/**
 * The scalar a condition should compare against, for the answers that are
 * stored as objects.
 *
 * A `legal_consent` answer is `{ accepted, textSha256, ts }` — the hash and the
 * timestamp are what make it an audit record — and a condition resolving to
 * that object could never match anything. `is_checked` tests `left === true`,
 * `eq true` normalizes the object to itself: so every route hanging off a
 * consent question was dead, and had been since consent existed. Nobody
 * noticed because there was also no way to answer one with "no".
 *
 * Only consent is unwrapped. `payment` is deliberately left as its object: its
 * `status` is the respondent's own word for having paid with nothing verifying
 * it, and quietly making that routable would turn a self-report into a gate.
 * `signature` and `scheduling` have no scalar worth comparing — the emptiness
 * operators already work on them as objects.
 */
function answerOperand(raw: unknown): Primitive {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw) && "accepted" in raw) {
    const accepted = (raw as { accepted: unknown }).accepted;
    if (typeof accepted === "boolean") return accepted;
  }
  return raw as Primitive;
}

export function resolveOperand(operand: Condition["left"], state: EvalState): Primitive {
  switch (operand.kind) {
    case "ref":
      return answerOperand(state.answers[operand.ref]);
    case "variable":
      return state.variables[operand.name] as Primitive;
    case "hidden":
      return state.hidden[operand.name] as Primitive;
    case "literal":
      return undefined;
  }
}

function isNumeric(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toComparableNumber(v: Primitive): number | null {
  if (isNumeric(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function evalCondition(cond: Condition, state: EvalState): boolean {
  const left = resolveOperand(cond.left, state);
  const value = cond.value;

  switch (cond.op as ConditionOp) {
    case "eq":
      return normalizeScalar(left) === normalizeScalar(value);
    case "neq":
      return normalizeScalar(left) !== normalizeScalar(value);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toComparableNumber(left);
      const b = toComparableNumber(value as Primitive);
      if (a === null || b === null) return false;
      return cond.op === "gt" ? a > b : cond.op === "gte" ? a >= b : cond.op === "lt" ? a < b : a <= b;
    }
    case "contains":
      return str(left).includes(str(value));
    case "not_contains":
      return !str(left).includes(str(value));
    case "starts_with":
      return str(left).startsWith(str(value));
    case "ends_with":
      return str(left).endsWith(str(value));
    case "matches_regex":
      try {
        return new RegExp(str(value)).test(str(left));
      } catch {
        return false;
      }
    case "is_empty":
      return isEmpty(left);
    case "is_not_empty":
      return !isEmpty(left);
    case "is_checked":
      return left === true;
    case "is_not_checked":
      return left !== true;
    case "includes":
      return Array.isArray(left) && Array.isArray(value)
        ? value.every((v) => left.includes(v))
        : Array.isArray(left)
          ? left.includes(str(value))
          : false;
    case "not_includes":
      return !evalCondition({ ...cond, op: "includes" }, state);
    case "ranked_above":
    case "ranked_below": {
      // left = ranking answer (array of item ids); value = [a, b] — true when a is ranked above/below b.
      if (!Array.isArray(left) || !Array.isArray(value) || value.length !== 2) return false;
      const ia = left.indexOf(value[0]!);
      const ib = left.indexOf(value[1]!);
      if (ia === -1 || ib === -1) return false;
      return cond.op === "ranked_above" ? ia < ib : ia > ib;
    }
    default:
      return false;
  }
}

function normalizeScalar(v: Primitive): string | number | boolean | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return JSON.stringify(v);
  return v;
}

function str(v: Primitive): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join(",");
  return String(v);
}

function isEmpty(v: Primitive): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** Every block ref a condition group reads, at any depth. */
export function conditionGroupRefs(group: ConditionGroup): string[] {
  const out: string[] = [];
  const walk = (g: ConditionGroup) => {
    for (const c of g.conditions) if (c.left.kind === "ref") out.push(c.left.ref);
    for (const sub of g.groups) walk(sub);
  };
  walk(group);
  return out;
}

/**
 * Did this response actually fail this requirement?
 *
 * Not the same question as "does the condition evaluate true", and the
 * difference is what a respondent reads on a screen-out. Several of the
 * operators are true of an answer that was never given — `is_not_checked` on an
 * unanswered consent, `is_empty` on anything — so a requirement list built the
 * obvious way tells somebody screened out at the FIRST gate that they also
 * failed to agree to a code of conduct they were never shown. Which is both
 * false and, on a form that turns people away, the kind of false that gets
 * argued about over email.
 *
 * So a requirement whose condition reads only questions this respondent never
 * answered is not shown. It cannot have been failed: nobody asked. A condition
 * over a variable or a hidden field has no ref to check and is evaluated
 * normally, as is one that mixes an answered question with an unanswered one.
 */
export function isRequirementUnmet(when: ConditionGroup, state: EvalState): boolean {
  const refs = conditionGroupRefs(when);
  if (refs.length > 0 && refs.every((ref) => state.answers[ref] === undefined)) return false;
  return evalGroup(when, state);
}

export function evalGroup(group: ConditionGroup | null | undefined, state: EvalState): boolean {
  if (!group) return true;
  const results: boolean[] = [
    ...group.conditions.map((c) => evalCondition(c, state)),
    ...group.groups.map((g) => evalGroup(g, state)),
  ];
  if (results.length === 0) return true;
  return group.op === "and" ? results.every(Boolean) : results.some(Boolean);
}

/** Evaluate arithmetic/concat expressions. */
export function evalValueExpr(expr: ValueExprT, state: EvalState): string | number | boolean {
  if (typeof expr !== "object" || expr === null || !("op" in expr)) return expr;
  const args = expr.args.map((a) => evalValueExpr(a, state));
  const nums = args.map((a) => toComparableNumber(a as Primitive) ?? 0);
  switch (expr.op) {
    case "add":
      return nums.reduce((a, b) => a + b, 0);
    case "sub":
      return nums.length === 1 ? -nums[0]! : nums.reduce((a, b) => a - b);
    case "mul":
      return nums.reduce((a, b) => a * b, 1);
    case "div":
      return nums.length >= 2 && nums[1] !== 0 ? nums[0]! / nums[1]! : 0;
    case "concat":
      return args.map((a) => str(a as Primitive)).join("");
    default:
      return "";
  }
}

export interface BranchResult {
  /** Target ref to jump to, or null to fall through to the next visible block. */
  gotoRef: string | null;
  gotoKind: "block" | "ending" | null;
}

/**
 * Apply logic rules after an answer was recorded.
 * Semantics: set_variable/add_score rules apply in array order (when matching);
 * the FIRST matching `goto` wins and stops evaluation.
 */
export function applyLogicRules(
  rules: LogicRule[],
  state: EvalState,
  fromRef?: string,
): BranchResult {
  for (const rule of rules) {
    if (rule.action_kind === "set_variable") {
      if (evalGroup(rule.when, state)) {
        const v = evalValueExpr(rule.expr, state);
        state.variables[rule.variable] =
          typeof v === "boolean" ? (v ? 1 : 0) : v;
      }
    } else if (rule.action_kind === "add_score") {
      if (evalGroup(rule.when, state)) {
        const cur = state.variables[rule.variable];
        state.variables[rule.variable] = (typeof cur === "number" ? cur : 0) + rule.amount;
      }
    }
  }
  for (const rule of rules) {
    if (rule.action_kind !== "goto") continue;
    // Scoped goto rules only fire from their source block; unscoped rules apply after any answer.
    if (rule.from !== undefined && rule.from !== fromRef) continue;
    if (evalGroup(rule.when, state)) {
      return { gotoRef: rule.target, gotoKind: rule.targetKind ?? "block" };
    }
  }
  return { gotoRef: null, gotoKind: null };
}

/** Index of block by ref; -1 if missing. */
export function blockIndex(doc: FormDoc, ref: string): number {
  return doc.blocks.findIndex((b) => b.ref === ref);
}

/** Whether a block is visible given current state. */
export function isBlockVisible(block: Block, state: EvalState): boolean {
  return evalGroup(block.visibility, state);
}

/**
 * Resolve the next visible block after `currentRef`, following fall-through
 * and skipping invisible blocks (visibility chains). Returns null when the
 * flow should proceed to ending evaluation.
 */
export function nextVisibleBlock(
  doc: FormDoc,
  currentRef: string | null,
  state: EvalState,
): Block | null {
  let idx = currentRef === null ? 0 : blockIndex(doc, currentRef) + 1;
  while (idx < doc.blocks.length) {
    const b = doc.blocks[idx]!;
    if (isBlockVisible(b, state)) return b;
    idx += 1;
  }
  return null;
}

/** First visible block of the form (usually welcome). */
export function firstVisibleBlock(doc: FormDoc, state: EvalState): Block | null {
  return nextVisibleBlock(doc, null, state);
}

/**
 * Evaluate ending rules after the final block; the first matching goto(ending)
 * wins, and otherwise the form's default outcome.
 *
 * The default is the first ending that ACCEPTS the response, not simply the
 * first ending. Reaching here means nothing decided to refuse this respondent —
 * no rule matched, they answered everything asked of them — so accepting is the
 * only defensible fallback. A plain `endings[0]` turned the order of the array
 * into a policy: an author who dragged their screen-out onto the canvas first,
 * or a generator that listed the refusal above the thank-you, would screen out
 * every respondent who took the ordinary path, with nothing on the canvas
 * showing why. `endings[0]` remains the last resort for a document that has no
 * success ending at all, which `lintFormDoc` refuses to publish.
 */
export function resolveEnding(doc: FormDoc, state: EvalState): Ending {
  const result = applyLogicRules(doc.endingRules, state);
  if (result.gotoKind === "ending" && result.gotoRef) {
    const e = doc.endings.find((x) => x.ref === result.gotoRef);
    if (e) return e;
  }
  return defaultEnding(doc);
}

/** Where a respondent lands when no rule sends them anywhere. */
export function defaultEnding(doc: FormDoc): Ending {
  return doc.endings.find((e) => e.kind !== "screen_out") ?? doc.endings[0]!;
}

/**
 * Full transition resolver: given the block just answered (or null at start),
 * decide what comes next — honoring explicit goto rules, fall-through,
 * invisible-block skipping, and endings.
 */
export function resolveNext(
  doc: FormDoc,
  answeredRef: string | null,
  state: EvalState,
): { kind: "block"; block: Block } | { kind: "ending"; ending: Ending } {
  if (answeredRef !== null) {
    const branch = applyLogicRules(doc.logic, state, answeredRef);
    if (branch.gotoKind === "ending" && branch.gotoRef) {
      const e = doc.endings.find((x) => x.ref === branch.gotoRef);
      if (e) return { kind: "ending", ending: e };
    }
    if (branch.gotoKind === "block" && branch.gotoRef) {
      const idx = blockIndex(doc, branch.gotoRef);
      if (idx !== -1) {
        const target = doc.blocks[idx]!;
        if (isBlockVisible(target, state)) return { kind: "block", block: target };
        // invisible target → continue fall-through from it
        const nxt = nextVisibleBlock(doc, branch.gotoRef, state);
        if (nxt) return { kind: "block", block: nxt };
        return { kind: "ending", ending: resolveEnding(doc, state) };
      }
    }
    const nxt = nextVisibleBlock(doc, answeredRef, state);
    if (nxt) return { kind: "block", block: nxt };
    return { kind: "ending", ending: resolveEnding(doc, state) };
  }
  const first = firstVisibleBlock(doc, state);
  if (first) return { kind: "block", block: first };
  return { kind: "ending", ending: resolveEnding(doc, state) };
}

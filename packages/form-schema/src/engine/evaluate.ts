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

export function resolveOperand(operand: Condition["left"], state: EvalState): Primitive {
  switch (operand.kind) {
    case "ref":
      return state.answers[operand.ref] as Primitive;
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

/** Evaluate ending rules after the final block; first matching goto(ending) wins, else endings[0]. */
export function resolveEnding(doc: FormDoc, state: EvalState): Ending {
  const result = applyLogicRules(doc.endingRules, state);
  if (result.gotoKind === "ending" && result.gotoRef) {
    const e = doc.endings.find((x) => x.ref === result.gotoRef);
    if (e) return e;
  }
  return doc.endings[0]!;
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

/** Blocks the agent is allowed to ask next (for guard allowlists): just the resolved one. */
export function allowedNextRefs(
  doc: FormDoc,
  answeredRef: string | null,
  state: EvalState,
): string[] {
  const next = resolveNext(doc, answeredRef, state);
  return next.kind === "block" ? [next.block.ref] : [];
}

import { z } from "zod";
import { HiddenFieldName, RefString, VariableName } from "./ids";

export const ConditionOp = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_regex",
  "is_empty",
  "is_not_empty",
  "is_checked",
  "is_not_checked",
  "includes",
  "not_includes",
  "ranked_above",
  "ranked_below",
]);
export type ConditionOp = z.infer<typeof ConditionOp>;

export const Operand = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ref"), ref: RefString }),
  z.object({ kind: z.literal("variable"), name: VariableName }),
  z.object({ kind: z.literal("hidden"), name: HiddenFieldName }),
  z.object({ kind: z.literal("literal") }),
]);
export type Operand = z.infer<typeof Operand>;

export const ConditionValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
export type ConditionValue = z.infer<typeof ConditionValue>;

export const Condition = z.object({
  left: Operand,
  op: ConditionOp,
  value: ConditionValue.optional(),
});
export type Condition = z.infer<typeof Condition>;

export interface ConditionGroup {
  op: "and" | "or";
  conditions: Condition[];
  groups: ConditionGroup[];
}

export const ConditionGroup: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    op: z.enum(["and", "or"]),
    conditions: z.array(Condition).default([]),
    groups: z.array(ConditionGroup).default([]),
  }),
);

export const emptyGroup = (op: "and" | "or" = "and"): ConditionGroup => ({
  op,
  conditions: [],
  groups: [],
});

/** Ops that require a `value` operand. */
export const opsRequiringValue = new Set<ConditionOp>([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_regex",
  "includes",
  "not_includes",
  "ranked_above",
  "ranked_below",
]);

/** Ops valid for unary use (no value). */
export const unaryOps = new Set<ConditionOp>([
  "is_empty",
  "is_not_empty",
  "is_checked",
  "is_not_checked",
]);

/**
 * Can this condition ever be false?
 *
 * The flow generator writes `is_not_empty` on a question as a way of saying
 * "and then" — a rule that carries one arm of a branch back to the trunk. On a
 * required question that test can never fail, because the respondent cannot
 * move past it without answering. Kept as a condition it draws a decision node
 * with a live branch and a dead one, which reads as a choice the form does not
 * actually make.
 *
 * Callers should treat a true result as an unconditional jump.
 */
export function conditionIsAlwaysTrue(
  condition: Condition,
  sourceBlock: { ref: string; required: boolean } | null | undefined,
): boolean {
  if (condition.left.kind !== "ref") return false;
  if (isEmptyStringTest(condition)) return condition.op === "neq";
  if (condition.op !== "is_not_empty") return false;
  if (!sourceBlock || !sourceBlock.required) return false;
  return condition.left.ref === sourceBlock.ref;
}

/**
 * Can this condition ever be true?
 *
 * The mirror of `conditionIsAlwaysTrue`, and the case it does not cover.
 * `is_empty` on a required question can never fire — the respondent cannot move
 * past it without answering — so a route hanging off one is a wire nobody ever
 * travels, drawn on the canvas as a decision the form appears to make and never
 * does.
 *
 * It arrives from the same place its twin does: a model reaching for the
 * emptiness operators as a way of spelling "and then", then negating one of
 * them because the arm it wanted was the other way round.
 */
export function conditionIsAlwaysFalse(
  condition: Condition,
  sourceBlock: { ref: string; required: boolean } | null | undefined,
): boolean {
  if (condition.left.kind !== "ref") return false;
  if (isEmptyStringTest(condition)) return condition.op === "eq";
  if (condition.op !== "is_empty") return false;
  if (!sourceBlock || !sourceBlock.required) return false;
  return condition.left.ref === sourceBlock.ref;
}

/**
 * `eq ""` / `neq ""` on an answer — the emptiness test in disguise.
 *
 * `DRAFT_BRANCH_OPS` withholds `is_empty` and `is_not_empty` from the flow
 * generator precisely so a model cannot spell "and then" as a condition. A
 * model that wants to say it anyway reaches for the nearest legal spelling,
 * which is a comparison against the empty string — and that walked past both
 * predicates above, because they were written to recognise the banned operator
 * rather than the idea behind it. One live form came back with three of them,
 * each drawn on the author's canvas as a decision with a dead arm.
 *
 * These are stronger than the operators they imitate, not weaker, which is why
 * neither needs the `required` guard that `is_not_empty` does. No block can
 * ever hold `""`: `validateAnswer` trims, and an answer that is empty after
 * trimming is either refused (required) or stored as `undefined` (optional).
 * So `neq ""` is true whether the question was answered or skipped — true for
 * `undefined` as well, since it normalises to `null` — and `eq ""` is false
 * either way. Always true and never true, on any question.
 *
 * Only for answers. A hidden field genuinely can arrive as `""` — `?utm=` with
 * nothing after it — so the `kind === "ref"` guard in both callers is load
 * bearing, not a formality.
 */
function isEmptyStringTest(condition: Condition): boolean {
  return (condition.op === "eq" || condition.op === "neq") && condition.value === "";
}

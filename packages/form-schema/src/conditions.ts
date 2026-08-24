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

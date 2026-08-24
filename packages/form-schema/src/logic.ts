import { z } from "zod";
import { ConditionGroup } from "./conditions.js";
import { NanoId, RefString, VariableName } from "./ids.js";

const RuleBase = { id: NanoId };

export type ValueExprT = string | number | boolean | { op: "add" | "sub" | "mul" | "div" | "concat"; args: ValueExprT[] };

export const ValueExpr: z.ZodType<ValueExprT> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({
      op: z.enum(["add", "sub", "mul", "div", "concat"]),
      args: z.array(ValueExpr).min(1).max(5),
    }),
  ]),
);
export type ValueExpr = ValueExprT;

export const LogicRule = z.discriminatedUnion("action_kind", [
  z.object({
    ...RuleBase,
    action_kind: z.literal("goto"),
    /** null = unconditional default/fallback */
    when: ConditionGroup.nullable().default(null),
    /** Source block ref — when set, this rule only fires after that block is answered. */
    from: RefString.optional(),
    target: RefString,
    targetKind: z.enum(["block", "ending"]).default("block"),
  }),
  z.object({
    ...RuleBase,
    action_kind: z.literal("set_variable"),
    when: ConditionGroup.nullable().default(null),
    variable: VariableName,
    expr: ValueExpr,
  }),
  z.object({
    ...RuleBase,
    action_kind: z.literal("add_score"),
    when: ConditionGroup.nullable().default(null),
    variable: VariableName,
    amount: z.number(),
  }),
]);
export type LogicRule = z.output<typeof LogicRule>;
export type LogicRuleInput = z.input<typeof LogicRule>;

export const Variable = z.object({
  name: VariableName,
  type: z.enum(["number", "text"]),
  initial: z.union([z.number(), z.string()]).default(0),
});
export type Variable = z.infer<typeof Variable>;

export const HiddenField = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_.-]{0,60}$/),
  defaultValue: z.string().optional(),
});
export type HiddenField = z.infer<typeof HiddenField>;

export const Ending = z.object({
  id: NanoId,
  ref: RefString,
  title: z.string().max(2000).default("Thank you!"),
  bodyMd: z.string().max(10000).default(""),
  imageUrl: z.string().url().nullable().default(null),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().url().optional(),
  redirectUrl: z.string().url().optional(),
  redirectDelaySec: z.number().int().min(0).max(120).default(5),
  showSummary: z.boolean().default(false),
});
export type Ending = z.infer<typeof Ending>;

/** Rules evaluated after the final block; first matching goto(ending) wins. */
export const EndingRules = z.array(LogicRule);

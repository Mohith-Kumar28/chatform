import { z } from "zod";
import { ConditionGroup } from "./conditions";
import { NanoId, RefString, VariableName } from "./ids";

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
    /** Id of the sibling rule forming the other branch of an if/else pair (workflow editor). */
    pair: NanoId.optional(),
    /** Which branch of an if/else pair this rule is. */
    branch: z.enum(["true", "false"]).optional(),
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

/**
 * One line of "here is what you did not meet", on a screen-out ending.
 *
 * `when` is what makes the list honest. A screen-out reached from three
 * different gates should not recite all three at somebody who failed one of
 * them — being told you are ineligible for reasons that do not apply to you
 * reads as a broken form, and it is the reason "these are the requirements you
 * are failing" cannot just be prose in `bodyMd`. So a requirement carries the
 * condition under which it is UNMET, evaluated against the response before the
 * ending is projected, and only the lines that actually fired are shown.
 *
 * `when: null` means "always show this one" — the static "here is what this
 * form is for" list, which is the right answer when there is a single gate and
 * the reason is already obvious from having just answered it.
 */
export const EndingRequirement = z.object({
  id: NanoId,
  /** Stated as the requirement, not as the failure: "Be 18 or over". */
  label: z.string().min(1).max(300),
  /** True when this requirement is NOT met. Null shows the line unconditionally. */
  when: ConditionGroup.nullable().default(null),
});
export type EndingRequirement = z.output<typeof EndingRequirement>;

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
  /**
   * How this outcome ended.
   *
   * Endings used to be interchangeable — every one of them a thank-you — so a
   * branch that had decided somebody could NOT proceed had nowhere to point but
   * at a screen congratulating them on submitting. The flow was correct and the
   * form lied at the last step: "Registration Submitted Successfully" to a team
   * that had just said it did not meet the mandatory requirements.
   *
   * `screen_out` is the other outcome. It renders as a refusal with the
   * requirements that were missed, it does not pause for a confirm-and-submit
   * step (there is nothing to submit), and the response is finalized
   * `disqualified` rather than `completed` — so it stays in the results, out of
   * the completion rate, and off the `response.completed` webhook that adds
   * people to things.
   */
  kind: z.enum(["success", "screen_out"]).default("success"),
  /** What they did not meet. Only meaningful on a `screen_out`. */
  requirements: z.array(EndingRequirement).max(20).default([]),
});
export type Ending = z.infer<typeof Ending>;

/** True when reaching this ending means the form was refused, not completed. */
export function isScreenOut(ending: Pick<Ending, "kind">): boolean {
  return ending.kind === "screen_out";
}

/** Rules evaluated after the final block; first matching goto(ending) wins. */
export const EndingRules = z.array(LogicRule);

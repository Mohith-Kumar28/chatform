"use client";

import type { Block, LogicRuleInput } from "@repo/form-schema";

/**
 * "Only ask this if …" — one condition, chosen in one row.
 *
 * The Flow view can already draw any condition, but reaching it meant leaving
 * the Questions list, finding the node, and wiring an edge. This is the same
 * capability where the questions are, and it writes the same branch rules the
 * graph reads, so the two views cannot disagree about what the form does.
 *
 * Deliberately one condition against one question, not a condition builder.
 * Anything more — two conditions, nested groups — belongs in the Flow view,
 * which has the room to draw it; this covers the case that comes up constantly,
 * which is "ask this one only when they picked that one".
 */

/** Ops worth offering for a given question type, in plain words. */
export function opsFor(block: Block): { value: Op; label: string; needsValue: boolean }[] {
  const base: { value: Op; label: string; needsValue: boolean }[] = [];
  if ("options" in block && block.options?.length) {
    base.push({ value: "eq", label: "is", needsValue: true });
    base.push({ value: "neq", label: "is not", needsValue: true });
  } else if (block.type === "yes_no") {
    base.push({ value: "eq", label: "is", needsValue: true });
  } else if (block.type === "number" || block.type === "nps" || block.type === "rating" || block.type === "opinion_scale") {
    base.push({ value: "eq", label: "is", needsValue: true });
    base.push({ value: "gte", label: "is at least", needsValue: true });
    base.push({ value: "lte", label: "is at most", needsValue: true });
  } else {
    base.push({ value: "contains", label: "contains", needsValue: true });
    base.push({ value: "eq", label: "is exactly", needsValue: true });
  }
  base.push({ value: "is_not_empty", label: "was answered", needsValue: false });
  base.push({ value: "is_empty", label: "was left blank", needsValue: false });
  return base;
}

export type Op =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty";

export interface DraftCondition {
  /** Ref of the question that decides it. */
  ref: string;
  op: Op;
  /** Option id, number, boolean, or free text. Ignored when the op needs none. */
  value: string;
}

/** The answers a question offers, for the value control. */
export function choicesFor(block: Block): { value: string; label: string }[] {
  if ("options" in block && block.options?.length) {
    return (block.options as { id: string; label: string }[]).map((o) => ({ value: o.id, label: o.label }));
  }
  if (block.type === "yes_no") {
    return [
      { value: "true", label: block.yesLabel ?? "Yes" },
      { value: "false", label: block.noLabel ?? "No" },
    ];
  }
  return [];
}

/**
 * The question a new block at `index` would naturally hang off: the one
 * directly above it, provided it can actually decide anything.
 *
 * Directly above is not a limitation, it is what makes the rule expressible.
 * `buildFlowRules` derives the "skip it otherwise" complement only when the
 * conditional question is the one that follows its decider — anywhere else and
 * the branch would have to know about every question in between.
 */
export function deciderFor(blocks: Block[], index: number): Block | null {
  for (let i = Math.min(index, blocks.length) - 1; i >= 0; i--) {
    const candidate = blocks[i];
    if (!candidate) continue;
    if (candidate.type === "welcome" || candidate.type === "statement") return null;
    return candidate;
  }
  return null;
}

/** Coerce the picked value to what the deciding question stores. */
function typedValue(decider: Block, condition: DraftCondition): string | number | boolean {
  if (decider.type === "yes_no") return condition.value === "true";
  if (
    decider.type === "number" ||
    decider.type === "nps" ||
    decider.type === "rating" ||
    decider.type === "opinion_scale"
  ) {
    const n = Number(condition.value);
    return Number.isFinite(n) ? n : condition.value;
  }
  return condition.value;
}

/**
 * The one rule that makes `targetRef` conditional.
 *
 * Just the positive branch. `repairFlow` derives the complement that skips the
 * question when the condition fails, which is the half people forget and the
 * half that actually does the skipping.
 */
export function conditionalRule(
  decider: Block,
  condition: DraftCondition,
  targetRef: string,
): LogicRuleInput {
  const needsValue = opsFor(decider).find((o) => o.value === condition.op)?.needsValue ?? true;
  return {
    id: `rl_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
    action_kind: "goto",
    from: decider.ref,
    when: {
      op: "and",
      conditions: [
        {
          left: { kind: "ref", ref: decider.ref },
          op: condition.op,
          ...(needsValue ? { value: typedValue(decider, condition) } : {}),
        },
      ],
      groups: [],
    },
    target: targetRef,
    targetKind: "block",
    branch: "true",
  } as LogicRuleInput;
}

export function ConditionRow({
  decider,
  condition,
  onChange,
}: {
  decider: Block;
  condition: DraftCondition;
  onChange: (next: DraftCondition) => void;
}) {
  const ops = opsFor(decider);
  const choices = choicesFor(decider);
  const needsValue = ops.find((o) => o.value === condition.op)?.needsValue ?? true;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground shrink-0">if</span>
      <span className="bg-muted max-w-[14rem] truncate rounded-md px-1.5 py-1 text-xs font-medium">
        {decider.title || decider.ref}
      </span>

      <select
        aria-label="Condition"
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as Op })}
        className="border-input bg-background h-7 rounded-md border px-1.5 text-xs"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {needsValue &&
        (choices.length > 0 ? (
          <select
            aria-label="Answer"
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="border-input bg-background h-7 max-w-[12rem] rounded-md border px-1.5 text-xs"
          >
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label="Value"
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="value"
            className="border-input bg-background h-7 w-24 rounded-md border px-1.5 text-xs"
          />
        ))}
    </div>
  );
}

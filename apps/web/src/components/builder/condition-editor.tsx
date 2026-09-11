"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import type { Block, Condition, ConditionGroup } from "@repo/form-schema";
import { OPS, type Op, opsValueNeeded } from "./branch-layout";
import { BufferedInput } from "@/components/ui/buffered-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * A route's test, which is no longer allowed to be a single comparison.
 *
 * It was one, and a form paid for it. An intake that took participants aged
 * 6-25 drew three routes off its age question — "≥ 6 carry on", "< 6 to the
 * referral question", "> 25 to the referral question" — because a range could
 * not be said in one row. Routes are matched in order and the first match wins,
 * so "≥ 6" swallowed the over-25s: a 40-year-old was routed as eligible, past
 * the arm written for exactly that case, which sat below it and could never
 * fire. The author had drawn the right flow. The editor could not express it.
 *
 * A range needs two comparisons and the word between them, so that is what a
 * route holds now: a list of conditions and one joiner for the whole list. All
 * of them, or any of them — the two the engine's `ConditionGroup` already
 * supports, which is why nothing downstream had to change to store this.
 *
 * What it deliberately does NOT offer is a second question to test. Every
 * condition here reads the question the branch hangs off, because that is what
 * the canvas draws: one question, its routes, and where each one goes. A test
 * that read some other question would make the node a lie, and the place for
 * that rule is the question's own "only ask this if" instead.
 */

/** The shape the rule stores, narrowed to what this editor writes. */
export type WhenGroup = { op: "and" | "or"; conditions: Condition[]; groups: ConditionGroup[] };

const JOINERS = [
  { value: "and", label: "All", hint: "every condition must be true" },
  { value: "or", label: "Any", hint: "one condition is enough" },
] as const;

/** The word printed between two rows, so the list reads as the sentence it is. */
const joinerWord = (op: "and" | "or") => (op === "and" ? "and" : "or");

function condition(ref: string, op: Op, value?: unknown): Condition {
  return {
    left: { kind: "ref", ref },
    op,
    ...(opsValueNeeded(op) && value !== undefined ? { value: value as Condition["value"] } : {}),
  } as Condition;
}

/**
 * What a second condition should say before anybody has touched it.
 *
 * A new row that repeats the first one is a row you have to fix before it means
 * anything, and on the branch this exists for — a range — the second condition
 * is always the opposite bound. So "at least 6" proposes "at most 6", which is
 * one number away from what was wanted rather than a duplicate that silently
 * matches nothing.
 */
function suggestNext(previous: Condition | undefined, ref: string): Condition {
  const op = (previous?.op ?? "is_not_empty") as Op;
  const pairs: Partial<Record<Op, Op>> = { gte: "lte", gt: "lt", lte: "gte", lt: "gt" };
  const mirrored = pairs[op];
  if (mirrored) return condition(ref, mirrored, previous?.value);
  return condition(ref, "eq");
}

export function ConditionsEditor({
  sourceBlock,
  when,
  onChange,
  /** The branch row is denser than the panel below it. */
  compact = false,
}: {
  sourceBlock: Block | null;
  when: WhenGroup;
  onChange: (next: WhenGroup) => void;
  compact?: boolean;
}) {
  const ref = sourceBlock?.ref ?? "";
  const conditions = when.conditions.length > 0 ? when.conditions : [condition(ref, "is_not_empty")];
  const many = conditions.length > 1;

  const put = (next: Condition[]) => onChange({ ...when, conditions: next, groups: [] });
  const patchAt = (index: number, patch: Partial<{ op: Op; value: unknown }>) =>
    put(
      conditions.map((c, i) => {
        if (i !== index) return c;
        const op = (patch.op ?? c.op) as Op;
        const value = "value" in patch ? patch.value : c.value;
        return condition(ref, op, value);
      }),
    );

  return (
    <div className="space-y-1.5">
      {/*
        The joiner appears only once there is something to join.

        A single-condition route is the overwhelming majority of routes, and
        showing it an All/Any control asks it to answer a question about a list
        of one. It arrives with the second condition, which is the moment the
        answer starts to matter.
      */}
      {many && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">Match</span>
          <div className="bg-muted/60 flex rounded-full p-0.5">
            {JOINERS.map((j) => (
              <button
                key={j.value}
                type="button"
                title={j.hint}
                aria-pressed={when.op === j.value}
                onClick={() => onChange({ ...when, op: j.value })}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                  when.op === j.value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {j.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {conditions.map((c, i) => {
        const op = c.op as Op;
        return (
          <div key={i} className="flex items-start gap-1.5">
            {/*
              The connector, as a fixed-width gutter rather than a control.

              One joiner governs the whole list — it is chosen once, above — so
              printing it per row is a reminder, not a second switch. Keeping
              the gutter on the first row too (empty) is what keeps the pickers
              in a column instead of stepping sideways under each other.
            */}
            {many && (
              <span className="text-muted-foreground w-7 shrink-0 pt-1.5 text-right text-[10px] leading-none">
                {i === 0 ? "" : joinerWord(when.op)}
              </span>
            )}

            <div className="flex min-w-0 flex-1 gap-1.5">
              <Picker
                value={op}
                onValueChange={(v) => patchAt(i, { op: v as Op })}
                className="min-w-0 flex-1"
                ariaLabel="Condition"
              >
                {OPS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </Picker>
              {opsValueNeeded(op) && (
                <div className="min-w-0 flex-1">
                  <ConditionValueInput
                    compact={compact}
                    block={sourceBlock}
                    value={c.value}
                    onChange={(v) => patchAt(i, { value: v })}
                  />
                </div>
              )}
            </div>

            {/* Removing the only condition would leave a route with no test at
                all, which is an unconditional jump wearing a branch's clothes. */}
            {many && (
              <button
                type="button"
                onClick={() => put(conditions.filter((_, at) => at !== i))}
                aria-label="Remove this condition"
                className="text-muted-foreground hover:text-destructive shrink-0 pt-2"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => put([...conditions, suggestNext(conditions.at(-1), ref)])}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 pt-0.5 text-[11px] font-medium"
      >
        <Plus className="size-3" />
        Add condition
      </button>
    </div>
  );
}

/**
 * The styled select, in the shape the flow inspectors keep needing.
 *
 * Native `<select>` elements were scattered through them while the shadcn
 * Select sat unused — so the panel rendered the operating system's dropdown
 * next to the app's own controls, in a different font at a different height
 * with a different focus ring.
 */
export function Picker({
  value,
  onValueChange,
  placeholder,
  className,
  size = "sm",
  ariaLabel,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size={size} aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function ConditionValueInput({
  block,
  value,
  onChange,
  compact = false,
}: {
  block: Block | null;
  value: unknown;
  onChange: (v: string | number | boolean) => void;
  compact?: boolean;
}) {
  const inputClass = compact ? "h-8 text-xs" : undefined;
  if (!block) return null;
  if (block.type === "yes_no") {
    return (
      <Picker value={String(value ?? "")} onValueChange={(v) => onChange(v === "true")} placeholder="Pick…">
        <SelectItem value="true">{block.yesLabel ?? "Yes"}</SelectItem>
        <SelectItem value="false">{block.noLabel ?? "No"}</SelectItem>
      </Picker>
    );
  }
  /*
   * A consent routes on its two buttons, like a yes/no.
   *
   * The stored answer is an object — the wording's hash and a timestamp make it
   * an audit record — and the engine compares it on its `accepted` flag, so a
   * boolean here is exactly what the rule needs.
   */
  if (block.type === "legal_consent") {
    return (
      <Picker value={String(value ?? "")} onValueChange={(v) => onChange(v === "true")} placeholder="Pick…">
        <SelectItem value="true">{block.agreeLabel || "I agree"}</SelectItem>
        <SelectItem value="false">{block.declineLabel || "I do not agree"}</SelectItem>
      </Picker>
    );
  }
  if ("options" in block && block.options) {
    return (
      <Picker value={String(value ?? "")} onValueChange={onChange} placeholder="Pick an option…">
        {block.options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </Picker>
    );
  }
  if (["rating", "nps", "opinion_scale", "number"].includes(block.type)) {
    return (
      <BufferedInput
        type="number"
        className={inputClass}
        value={String(value ?? "")}
        onCommit={(v) => onChange(Number(v))}
        placeholder="number"
      />
    );
  }
  return (
    <BufferedInput
      className={inputClass}
      value={String(value ?? "")}
      onCommit={(v) => onChange(v)}
      placeholder="value"
    />
  );
}

"use client";

import { useRef } from "react";
import { Bot, Check, ListChecks, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type InterviewMode = "template" | "hybrid" | "ai";

interface Style {
  value: InterviewMode;
  label: string;
  icon: LucideIcon;
  summary: string;
  cost: string;
  /** What happens, in the order a respondent meets it. */
  points: string[];
}

/**
 * In cost order, cheapest first, so the cards read as a scale with the
 * recommended one in the middle rather than as three unrelated products.
 */
const STYLES: Style[] = [
  {
    value: "template",
    label: "Scripted",
    icon: ListChecks,
    summary: "Your questions, word for word. No AI replies.",
    cost: "Lowest cost",
    points: [
      "Every question is asked exactly as you wrote it.",
      "Typed answers in plain words, like \"the second one\" or \"I play violin\", are still matched to your options by a fast classifier.",
      "Anything that is not an answer gets the same question again. The AI never replies.",
    ],
  },
  {
    value: "hybrid",
    label: "Hybrid",
    icon: Sparkles,
    summary: "Your questions, with AI on standby.",
    cost: "Low cost",
    points: [
      "Every question is asked exactly as you wrote it.",
      "Direct answers, typed or tapped, are recorded instantly by a fast classifier, with no AI turn. That covers names, emails, ratings, and options described in plain words.",
      "When someone asks something, pushes back or goes off topic, the AI steps in, answers, and brings them back to the form.",
    ],
  },
  {
    value: "ai",
    label: "Agentic",
    icon: Bot,
    summary: "AI runs the whole conversation.",
    cost: "Highest cost",
    points: [
      "The AI reads every message and rewords every question in its own voice.",
      "It is the most natural, and by far the most expensive to run: every single answer, even a tapped option, is a full AI call.",
    ],
  },
];

const RECOMMENDED: InterviewMode = "hybrid";

/**
 * The interview style, as three cards with the choice explained underneath.
 *
 * It was a three-way segmented control with a one-line caption, which made
 * Agentic look like the obvious pick (it was first, and the default) when it
 * is the one that costs an AI call per answer. The cards put the cost on the
 * face of each option and the recommendation on the one most forms want.
 */
export function InterviewStylePicker({
  value,
  onChange,
}: {
  value: InterviewMode;
  onChange: (mode: InterviewMode) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = STYLES.find((s) => s.value === value) ?? STYLES[1]!;

  // Arrow keys move the selection, as in any radio group.
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + STYLES.length) % STYLES.length;
    onChange(STYLES[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Interview style" className="grid gap-2 sm:grid-cols-3">
        {STYLES.map((s, i) => {
          const on = s.value === value;
          const Icon = s.icon;
          return (
            <button
              key={s.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(s.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative flex flex-col gap-2 rounded-xl border p-3 text-left",
                "transition-colors duration-[var(--duration-micro)]",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                on ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className={cn("text-sm font-medium", on && "text-primary")}>{s.label}</span>
                {s.value === RECOMMENDED && (
                  <Badge variant="brand-soft" className="ml-auto">
                    Recommended
                  </Badge>
                )}
                {on && s.value !== RECOMMENDED && <Check className="text-primary ml-auto size-4" aria-hidden />}
              </div>
              <span className="text-muted-foreground text-xs leading-snug">{s.summary}</span>
              <span
                className={cn(
                  "mt-auto text-xs font-medium",
                  s.value === "ai" ? "text-warning-soft-foreground" : "text-muted-foreground",
                )}
              >
                {s.cost}
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className={cn(
          "rounded-xl border p-3",
          selected.value === "ai" ? "border-warning/40 bg-warning-soft" : "border-border bg-muted/40",
        )}
      >
        <p className={cn("mb-1.5 text-xs font-medium", selected.value === "ai" && "text-warning-soft-foreground")}>
          {selected.value === "ai" ? "Agentic is expensive to run" : `How ${selected.label} works`}
        </p>
        <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs leading-relaxed">
          {selected.points.map((p) => (
            <li key={p} className={cn(selected.value === "ai" && "text-warning-soft-foreground")}>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

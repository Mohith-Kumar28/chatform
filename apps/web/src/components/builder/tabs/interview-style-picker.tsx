"use client";

import { useRef } from "react";
import { Bot, Check, ListChecks, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type InterviewMode = "template" | "hybrid" | "ai";

interface Style {
  value: InterviewMode;
  label: string;
  icon: LucideIcon;
  summary: string;
  goodFor: string;
  keepInMind: string;
}

/** Scripted to Agentic: from none of the conversation run by AI to all of it. */
const STYLES: Style[] = [
  {
    value: "template",
    label: "Scripted",
    icon: ListChecks,
    summary: "Your questions, word for word.",
    goodFor: "Fixed questionnaires where everyone should see exactly the same words.",
    keepInMind: "It never replies with AI. A question or off-topic reply just gets the same question again.",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    icon: Sparkles,
    summary: "Your questions, with AI when needed.",
    goodFor: "Most forms. Direct answers are taken instantly, even typed in plain words.",
    keepInMind: "The AI only speaks up when someone asks something or goes off topic.",
  },
  {
    value: "ai",
    label: "Agentic",
    icon: Bot,
    summary: "AI runs the whole conversation.",
    goodFor: "Sales, lead qualification, and anything meant to persuade. It rewords every question and talks like a person.",
    keepInMind: "Every answer is an AI call, so it costs far more to run.",
  },
];

const RECOMMENDED: InterviewMode = "hybrid";

/**
 * The interview style: three cards, and what the chosen one is good for.
 *
 * It was a three-way segmented control, which made Agentic look like the
 * obvious pick (it was first, and the default) when it is the one that costs
 * an AI call per answer.
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
              aria-describedby={on ? "interview-style-detail" : undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(s.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3 text-left",
                "transition-colors duration-[var(--duration-micro)]",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                on ? "border-primary bg-primary/[0.04]" : "border-border hover:border-primary/40",
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="text-sm font-medium">{s.label}</span>
                {on && <Check className="text-primary ml-auto size-4" aria-hidden />}
              </span>
              <span className="text-muted-foreground text-xs leading-snug">{s.summary}</span>
              {s.value === RECOMMENDED && (
                <span className="text-primary mt-auto self-end pt-1 text-xs font-medium">Recommended</span>
              )}
            </button>
          );
        })}
      </div>

      <div id="interview-style-detail" aria-live="polite" className="text-muted-foreground space-y-1 px-1 text-xs leading-relaxed">
        <p>
          <span className="text-foreground font-medium">Good for: </span>
          {selected.goodFor}
        </p>
        <p>
          <span className="text-foreground font-medium">Keep in mind: </span>
          {selected.keepInMind}
        </p>
      </div>
    </div>
  );
}

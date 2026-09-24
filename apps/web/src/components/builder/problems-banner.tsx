"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useBuilderStore } from "@/stores/builder-store";
import { publishProblems, summarizeProblems } from "./attention";
import { cn } from "@/lib/utils";

/**
 * What stops this form publishing, and a way to go to it.
 *
 * One component for the Questions list and the Flow canvas, so the two views
 * cannot count differently. "Show me" selects the first question in reading
 * order and shakes it; the Flow canvas also pans to it.
 */
export function ProblemsBanner() {
  const doc = useBuilderStore((s) => s.doc);
  const pulseAttention = useBuilderStore((s) => s.pulseAttention);
  const summary = useMemo(() => (doc ? summarizeProblems(doc, publishProblems(doc)) : null), [doc]);
  if (!summary) return null;

  const { level, count } = summary;
  return (
    <div className="px-4 pt-2">
      <button
        type="button"
        onClick={() => pulseAttention(summary.ref)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs",
          level === "error"
            ? "text-destructive bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)]"
            : "bg-[color-mix(in_oklch,var(--warning,oklch(0.75_0.15_75))_14%,transparent)] text-amber-700 dark:text-amber-400",
        )}
      >
        <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2.5} />
        <span className="min-w-0 flex-1">
          {/* Errors and warnings are not the same sentence: a warning never
              blocks a publish, and saying it in red claimed it did. */}
          {level === "error"
            ? `${count === 1 ? "1 step" : `${count} steps`} in this flow cannot be completed. Publishing is blocked until it is fixed.`
            : level === "attention"
              ? `${count === 1 ? "1 question needs" : `${count} questions need`} attention before you can publish.`
              : `${count === 1 ? "1 step" : `${count} steps`} in this flow may not do what it says. Publishing still works.`}
        </span>
        <span className="shrink-0 underline">Show me</span>
      </button>
    </div>
  );
}

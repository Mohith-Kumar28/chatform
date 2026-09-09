"use client";

import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A funnel, drawn as bars against a shared left baseline.
 *
 * Not the tapering trapezoid every analytics tool draws. That shape encodes
 * magnitude in *area*, which people read badly and which exaggerates the top of
 * every funnel; and it leaves no room for a label, so the steps end up in a
 * legend. Bars from a common baseline compare by length, which is the one
 * encoding people read accurately, and each step keeps its own name and number.
 *
 * The number that matters is between the bars, not on them. "68% published"
 * tells you where you stand; "only 31% of the people who created a form went on
 * to publish it" tells you what to fix. So the step-to-step conversion sits in
 * the gap, and the worst one is called out rather than left to be spotted.
 *
 * Every step links somewhere. A funnel that cannot be clicked into a list of the
 * accounts that fell out of it is a picture; this one is a starting point.
 */

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Share of the top of the funnel, 0–100. */
  rate: number;
}

export function FunnelBars({ steps, hrefFor }: { steps: FunnelStep[]; hrefFor?: (step: FunnelStep) => string | null }) {
  const top = steps[0]?.count ?? 0;
  if (top === 0) {
    return <p className="text-muted-foreground text-sm">No accounts signed up in this period.</p>;
  }

  // The steepest single fall, named once rather than colouring every row by how
  // bad it is. Step 0 has nothing above it to fall from.
  const drops = steps.map((s, i) => (i === 0 ? 0 : (steps[i - 1]!.count || 0) - s.count));
  const worst = drops.indexOf(Math.max(...drops.slice(1)));

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const prev = steps[i - 1];
        const stepRate = prev && prev.count > 0 ? Math.round((step.count / prev.count) * 1000) / 10 : null;
        const href = hrefFor?.(step) ?? null;
        const isWorst = i === worst && drops[i]! > 0 && steps.length > 2;

        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
                <span className="truncate">{step.label}</span>
                {/*
                  The affordance rides on the label rather than sitting on a line
                  of its own.

                  It used to be a "See these accounts" row under every step,
                  hidden with `opacity-0` — which hides ink, not space. Six steps
                  reserved roughly 110px of permanently blank page for text
                  nobody had hovered yet. An arrow that fades in beside the label
                  says the same thing and occupies a line that already exists.
                */}
                {href && (
                  <ArrowRight
                    className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity duration-[var(--duration-micro)] group-hover:opacity-100"
                    strokeWidth={2}
                    aria-hidden
                  />
                )}
              </span>
              <span className="text-muted-foreground tabular shrink-0 text-xs">
                {step.count.toLocaleString()}
                <span className="ml-1.5 opacity-70">{step.rate}%</span>
              </span>
            </div>
            <div className="bg-muted h-2.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-[var(--duration-standard)]"
                style={{
                  width: `${Math.max(step.count > 0 ? 2 : 0, (step.count / top) * 100)}%`,
                  // One hue across the funnel, darkening as it narrows: the steps
                  // are one journey, not six unrelated categories.
                  background: `color-mix(in oklch, var(--chart-1) ${100 - i * 9}%, var(--chart-2))`,
                }}
              />
            </div>
          </>
        );

        return (
          <li key={step.key}>
            {stepRate !== null && (
              <div
                className={cn(
                  "text-caption flex items-center gap-1.5 py-1 pl-3",
                  isWorst ? "text-[var(--warning)]" : "text-muted-foreground",
                )}
              >
                <TrendingDown className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                <span className="tabular">{stepRate}%</span>
                <span className="truncate">
                  continued{isWorst ? " — the biggest fall in the funnel" : ""}
                </span>
              </div>
            )}
            {href ? (
              <Link
                href={href}
                className="hover:bg-muted/50 group -mx-2 block rounded-lg px-2 py-1 transition-colors duration-[var(--duration-micro)]"
              >
                {row}
              </Link>
            ) : (
              <div className="-mx-2 px-2 py-1">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

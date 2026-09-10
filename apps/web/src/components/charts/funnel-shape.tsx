"use client";

import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";
import { Empty } from "./chart-kit";
import { cn } from "@/lib/utils";

/**
 * A funnel drawn as a funnel: one tapering shape, narrowing by exactly as much
 * as the numbers do.
 *
 * This replaced a row of left-anchored bars, and the objection to the taper is
 * worth writing down because it is real: a trapezoid encodes magnitude in
 * *area*, and area is read badly. What answers it here is that the width is
 * doing the encoding and the area merely follows — every slab is the same
 * height, so a step at 33% is a third as wide as the top and nothing else about
 * it changes. And the shape earns its place: six bars are six comparisons the
 * reader has to make, while one narrowing outline is a single picture of where
 * the business leaks.
 *
 * Three rules it keeps from the bars, because they were the good parts:
 *
 *   - **Names and numbers stay outside the shape.** Labels ride the gutters, so
 *     nothing depends on a white-on-orange contrast that holds in one theme and
 *     fails in the other, and a step at 2% is as legible as the one at 100%.
 *   - **The number that matters is between the steps.** "68% continued" is what
 *     you act on; the steepest fall says so out loud rather than waiting to be
 *     spotted.
 *   - **Every step links somewhere.** A funnel you cannot click into the list of
 *     accounts that fell out of it is a picture, not a starting point.
 *
 * The pale full-width track behind each slab is the cohort that entered at the
 * top. The gap between the shape and that track is the loss, drawn to scale —
 * which is the one thing a bar chart of the same numbers cannot show you.
 */

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Share of the top of the funnel, 0–100. */
  rate: number;
}

/** Slab height in the SVG's own units. Rendered height comes from the class. */
const H = 44;

/**
 * A step that happened is never invisible.
 *
 * One account out of nine hundred is 0.1% of the width — a shape thinner than
 * the stroke around it, which reads as zero when it is not. Three percent is
 * about two pixels at this size: enough to see, small enough that nobody
 * mistakes it for a real quantity when the number is printed beside it.
 */
const MIN_VISIBLE = 3;

export function FunnelShape({
  steps,
  hrefFor,
}: {
  steps: FunnelStep[];
  hrefFor?: (step: FunnelStep) => string | null;
}) {
  const top = steps[0]?.count ?? 0;
  if (top === 0) {
    return <Empty>No accounts signed up in this period.</Empty>;
  }

  // Half-width of each step in viewBox units, measured from the centre line.
  const half = (count: number) => (count <= 0 ? 0 : Math.max(MIN_VISIBLE, (count / top) * 100) / 2);

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

        const a = half(step.count);
        // The last slab has nothing to taper towards, so it goes down straight
        // rather than closing to a point the numbers never reach.
        const b = i === steps.length - 1 ? a : half(steps[i + 1]!.count);

        const row = (
          <div className="grid grid-cols-[minmax(4.5rem,1fr)_2.2fr_auto] items-center gap-3">
            <span className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
              <span className="truncate">{step.label}</span>
              {/* The affordance rides on the label rather than on a line of its
                  own — six steps of permanently blank hover text is 110px of
                  page spent on something nobody has hovered yet. */}
              {href && (
                <ArrowRight
                  className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity duration-[var(--duration-micro)] group-hover:opacity-100"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
            </span>

            <svg
              viewBox={`0 0 100 ${H}`}
              // Stretched, not fitted: the slab is a band of fixed height whose
              // width is the measurement, and letting the aspect ratio survive
              // would rescale the one dimension that means something.
              preserveAspectRatio="none"
              className="h-11 w-full"
              aria-hidden
            >
              {/* Everyone who entered at the top, for the loss to be measured
                  against. */}
              <rect x="0" y="0" width="100" height={H} className="fill-muted/45" />
              {step.count > 0 ? (
                <polygon
                  points={`${50 - a},0 ${50 + a},0 ${50 + b},${H} ${50 - b},${H}`}
                  style={{
                    // One hue down the whole funnel, darkening as it narrows:
                    // the steps are one journey, not six categories.
                    fill: `color-mix(in oklch, var(--chart-1) ${100 - i * 9}%, var(--chart-2))`,
                  }}
                />
              ) : (
                /* Nobody reached this step. A zero-width shape is indistinguishable
                   from a chart that failed to draw, so the centre line is marked. */
                <line
                  x1="50"
                  y1="4"
                  x2="50"
                  y2={H - 4}
                  className="stroke-muted-foreground/40"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}
            </svg>

            <span className="text-muted-foreground tabular shrink-0 text-right text-xs">
              {step.count.toLocaleString()}
              <span className="ml-1.5 opacity-70">{step.rate}%</span>
            </span>
          </div>
        );

        return (
          <li key={step.key}>
            {stepRate !== null && (
              <div
                className={cn(
                  "text-caption flex items-center justify-center gap-1.5 py-1",
                  isWorst ? "text-[var(--warning)]" : "text-muted-foreground",
                )}
              >
                <TrendingDown className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                <span className="tabular">{stepRate}%</span>
                <span className="truncate">continued{isWorst ? " — the biggest fall in the funnel" : ""}</span>
              </div>
            )}
            {href ? (
              <Link
                href={href}
                className="hover:bg-muted/40 group -mx-2 block rounded-lg px-2 py-0.5 transition-colors duration-[var(--duration-micro)]"
              >
                {row}
              </Link>
            ) : (
              <div className="-mx-2 px-2 py-0.5">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

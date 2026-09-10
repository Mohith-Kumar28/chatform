"use client";

import { useId } from "react";
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
 * it changes. And the shape earns its place: seven bars are seven comparisons
 * the reader has to make, while one narrowing outline is a single picture of
 * where the business leaks.
 *
 * Three rules it keeps from the bars, because they were the good parts:
 *
 *   - **Names and numbers stay outside the shape.** Labels ride the gutters, so
 *     nothing depends on a white-on-orange contrast that holds in one theme and
 *     fails in the other, and a step at 2% is as legible as the one at 100%.
 *   - **The number that matters is between the steps.** "83.3% continued" is
 *     what you act on, and it now carries the loss beside it — the same fact
 *     said the other way round, because "we kept 83%" and "we lost a sixth of
 *     them" prompt different amounts of urgency from the same reader.
 *   - **Every step links somewhere.** A funnel you cannot click into the list of
 *     accounts that fell out of it is a picture, not a starting point.
 *
 * ## Why it is one shape and not six
 *
 * The first version drew a separate trapezoid per row, each in its own SVG, with
 * the caption band between them. Three things went wrong, and all three were the
 * same mistake:
 *
 *   - **The silhouette broke at every caption.** A funnel read as a funnel only
 *     if you mentally bridged five gaps, and the slope changed abruptly at each
 *     one, which is what made the edges look chopped rather than drawn.
 *   - **A step at zero closed the shape to a point.** Straight lines converging
 *     on nothing make an arrowhead, and an arrowhead is a picture of a funnel
 *     that has *ended* — which is the opposite of what a zero means. Zero means
 *     nobody has got here yet.
 *   - **Flat fills banded.** Six discrete colours meeting at six hard edges read
 *     as six categories, when the whole argument of the shape is that they are
 *     one journey.
 *
 * So: one path, one gradient, one continuous outline. The rows are ordinary
 * flow above it and the shape is absolutely positioned in the lane between the
 * gutters — the gutter widths are the single `--fx-*` variables both the grid
 * and the shape's inset read, which is what keeps them aligned without a
 * subgrid.
 *
 * ## The bucket
 *
 * The sides are cubic curves whose control points sit directly above and below
 * their endpoints, so every tangent at a slab boundary is vertical and the whole
 * outline is smooth from top to bottom — no corner anywhere except the two the
 * shape genuinely has. That also means the drawing improves as the product
 * does, on its own: width is proportional to count, so as the bottom steps fill
 * the taper flattens, the curves straighten, and the triangle becomes a bucket.
 * A funnel whose base is as wide as its mouth is a product where everybody who
 * signs up pays, and it should look like one.
 *
 * The floor under all of it is `MIN_HALF`: no step, not even an empty one, is
 * drawn narrower, so the shape always has a base to stand on instead of a point
 * to end at. Steps nobody has reached continue as a dashed ghost of that width —
 * the funnel keeps going, with nothing in it.
 */

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Share of the top of the funnel, 0–100. */
  rate: number;
}

/**
 * The band a step's own width is drawn at, and the band the shape narrows
 * across. Both in CSS pixels, and both are load-bearing: the SVG's viewBox
 * height is the sum of them, drawn at exactly that height, so one viewBox unit
 * is one pixel vertically and the shape lines up with the rows beside it
 * without measuring anything at runtime.
 */
const SLAB = 42;
const NECK = 26;

/**
 * The narrowest the shape is ever drawn, as a half-width in viewBox units —
 * 2.5 of 50, so five percent of the full span.
 *
 * A step that happened is never invisible: one account out of nine hundred is
 * 0.1% of the width, which reads as zero when it is not. And a step that has
 * *not* happened is never a point: the taper runs down to this floor and the
 * ghost continues at it, so the bottom of the funnel is always a base.
 */
const MIN_HALF = 2.5;

/** Where the whole drawing is worked out, once, from nothing but the counts. */
export interface FunnelGeometry {
  /** Top of each step's row, in the SVG's units (which are pixels vertically). */
  tops: number[];
  totalH: number;
  /** The filled silhouette, or null when nobody reached even the first step. */
  d: string | null;
  /** Where the shape hands over to the dashed continuation, if it does. */
  ghostFrom: number | null;
}

/**
 * The geometry, split out from the component because it is the part that can be
 * wrong in a way nobody notices.
 *
 * A layout bug shows up the first time anyone looks at the page. A spline that
 * overshoots by two percent between two steps draws a funnel that widens where
 * the numbers narrow, and it looks like a design flourish until somebody makes
 * a decision on it — so it is a pure function of the counts, and there is a
 * test that walks the curve it returns.
 */
export function funnelGeometry(counts: number[]): FunnelGeometry {
  const n = counts.length;
  const top = counts[0] ?? 0;
  const tops = Array.from({ length: n }, (_, i) => i * (SLAB + NECK));
  const totalH = n * SLAB + (n - 1) * NECK;

  /*
    Half-width of a step, in viewBox units measured from the centre line — so a
    step at 100% is 50 and the floor is `MIN_HALF`, the same number the ghost is
    drawn at. It has to be the same number: the floor was applied to the full
    width here and to the half-width there, which made the empty continuation
    twice as wide as the narrowest live step, and the funnel widened into it.
  */
  const halves = counts.map((c) => Math.max(MIN_HALF, (Math.max(0, c) / top) * 50));

  // Everything below the last step anybody reached is drawn as a ghost. Counts
  // never rise as you descend, so the empty steps are always the trailing ones.
  const lastLive = counts.reduce((acc, c, i) => (c > 0 ? i : acc), -1);
  const ghostFrom = lastLive >= 0 && lastLive < n - 1 ? tops[lastLive + 1]! : null;

  return {
    tops,
    totalH,
    ghostFrom,
    d: top > 0 && lastLive >= 0 ? outline(halves, tops, lastLive, ghostFrom, totalH) : null,
  };
}

/**
 * A gap, not a date: `40 min`, `11 hr`, `2.4 days`.
 *
 * One significant decimal below ten days and none above it, because the
 * difference between 2.4 and 2.9 days is a difference you would act on and the
 * difference between 41 and 41.3 is not.
 */
function duration(ms: number): string {
  const mins = ms / 60_000;
  if (mins < 90) return `${Math.max(1, Math.round(mins))} min`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)} hr`;
  const raw = hours / 24;
  const days = raw < 10 ? Math.round(raw * 10) / 10 : Math.round(raw);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function FunnelShape({
  steps,
  hrefFor,
  timeToValueMs,
}: {
  steps: FunnelStep[];
  hrefFor?: (step: FunnelStep) => string | null;
  /** Median signup → first response, for the footer. Omitted when unknown. */
  timeToValueMs?: number | null;
}) {
  const gradientId = useId();
  const top = steps[0]?.count ?? 0;
  const n = steps.length;

  if (top === 0 || n === 0) {
    return <Empty>No accounts signed up in this period.</Empty>;
  }

  const { tops, totalH, d, ghostFrom } = funnelGeometry(steps.map((s) => s.count));

  // The steepest single fall, named once in the footer rather than colouring
  // every row by how bad it is. Step 0 has nothing above it to fall from.
  const drops = steps.map((s, i) => (i === 0 ? 0 : (steps[i - 1]!.count || 0) - s.count));
  const worst = drops.indexOf(Math.max(...drops.slice(1)));
  const hasWorst = worst > 0 && drops[worst]! > 0 && n > 2;

  return (
    /*
      The lane geometry lives here as variables and nowhere else, because the
      rows read them as grid columns and the shape reads them as an inset — and
      the moment those two disagree the drawing stops lining up with the names
      beside it. On a phone the gutters give up what they can spare and the
      labels keep their words; a truncated "Someone o…" beside a curve is worse
      than a narrower curve.
    */
    <div className="[--fx-gap:0.5rem] [--fx-l:9rem] [--fx-r:4.5rem] sm:[--fx-gap:0.75rem] sm:[--fx-l:9.25rem] sm:[--fx-r:6.25rem]">
      <div className="relative">
        {/*
          The shape, floated over the lane between the gutters. `pointer-events-none`
          so the rows underneath stay clickable across their whole width, and a
          wrapper rather than a rounded `<svg>` because a div's overflow clip is
          the one that is guaranteed to round SVG content in every engine.
        */}
        <div
          className="bg-muted/70 pointer-events-none absolute top-0 z-10 overflow-hidden rounded-xl"
          style={{ height: totalH, left: "calc(var(--fx-l) + var(--fx-gap))", right: "calc(var(--fx-r) + var(--fx-gap))" }}
          aria-hidden
        >
          <svg
            viewBox={`0 0 100 ${totalH}`}
            // Stretched, not fitted. Height is pinned to the rows beside it and
            // width is the measurement, so letting the aspect ratio survive
            // would rescale the one dimension that means something. Safe to do
            // to a curve: an axis scale leaves tangents matching where they
            // matched before, so the outline is as smooth after it as before.
            preserveAspectRatio="none"
            width="100%"
            height={totalH}
            shapeRendering="geometricPrecision"
            className="block"
          >
            <defs>
              {/*
                One gradient down the whole funnel, held flat across each slab
                and turned over only inside the necks — so a step still has "its"
                colour, and no two of them meet at an edge.
              */}
              <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={totalH}>
                {steps.flatMap((_, i) => {
                  /*
                    Orange into red, and deliberately not orange into `--chart-2`,
                    which is what this used to be. Those two are 100° apart on the
                    hue wheel, so a seven-step mix walks through pink and lands on
                    violet — one journey drawn as three colours, which is the
                    reading the shape exists to prevent. `--chart-5` is a third of
                    that distance away, so the ramp stays inside one family and
                    darkens as it descends.
                  */
                  const mix = 100 - (i * 75) / Math.max(1, n - 1);
                  const color = `color-mix(in oklch, var(--chart-1) ${mix}%, var(--chart-5))`;
                  return [
                    <stop key={`${i}a`} offset={tops[i]! / totalH} stopColor={color} />,
                    <stop key={`${i}b`} offset={(tops[i]! + SLAB) / totalH} stopColor={color} />,
                  ];
                })}
              </linearGradient>
            </defs>

            {d && <path d={d} fill={`url(#${gradientId})`} />}

            {ghostFrom !== null && (
              <>
                {/* Faint body, so the empty steps are a continuation of the shape
                    rather than a pair of loose lines under it. */}
                <rect
                  x={50 - MIN_HALF}
                  y={ghostFrom}
                  width={MIN_HALF * 2}
                  height={totalH - ghostFrom}
                  className="fill-muted-foreground/10"
                />
                {[-1, 1].map((side) => (
                  <line
                    key={side}
                    x1={50 + side * MIN_HALF}
                    y1={ghostFrom}
                    x2={50 + side * MIN_HALF}
                    y2={totalH}
                    className="stroke-muted-foreground/35"
                    strokeWidth="1.25"
                    strokeDasharray="4 4"
                    // Keeps the dashes square and the line hairline-thin under
                    // the horizontal stretch, which would otherwise smear both.
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </>
            )}
          </svg>
        </div>

        <ol>
          {steps.map((step, i) => {
            const next = steps[i + 1];
            // The fall *out of* this step, because the caption sits under it.
            // Undefined when nothing entered the step: no share of nobody.
            const kept = next && step.count > 0 ? Math.round((next.count / step.count) * 1000) / 10 : null;
            const lost = next ? step.count - next.count : 0;
            const href = hrefFor?.(step) ?? null;

            const row = (
              <>
                <span className="col-start-1 flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium" title={step.label}>
                    {step.label}
                  </span>
                  {href && (
                    <ArrowRight
                      className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity duration-[var(--duration-micro)] group-hover:opacity-100"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="col-start-3 flex items-baseline justify-end gap-1.5 text-right">
                  <span className="tabular text-sm font-medium">{step.count.toLocaleString()}</span>
                  <span className="text-muted-foreground tabular text-micro w-9 shrink-0 text-right">{step.rate}%</span>
                </span>
              </>
            );

            return (
              <li key={step.key}>
                {href ? (
                  <Link
                    href={href}
                    // Sits *under* the shape (which is z-10), so the hover wash
                    // reads as the row lighting up behind the funnel rather than
                    // as a panel dropped on top of it.
                    className="hover:bg-muted/50 group relative grid grid-cols-[var(--fx-l)_1fr_var(--fx-r)] items-center gap-[var(--fx-gap)] rounded-lg transition-colors duration-[var(--duration-micro)]"
                    style={{ height: SLAB }}
                  >
                    {row}
                  </Link>
                ) : (
                  <div
                    className="relative grid grid-cols-[var(--fx-l)_1fr_var(--fx-r)] items-center gap-[var(--fx-gap)]"
                    style={{ height: SLAB }}
                  >
                    {row}
                  </div>
                )}

                {/*
                  The step-over-step numbers, in the gutters the shape leaves
                  free. Kept on the left, lost on the right — the same sides the
                  names and the counts are already on, so neither ever has to be
                  read across the drawing.
                */}
                {i < n - 1 && (
                  <div
                    className="relative grid grid-cols-[var(--fx-l)_1fr_var(--fx-r)] items-center gap-[var(--fx-gap)]"
                    style={{ height: NECK }}
                  >
                    {kept !== null ? (
                      <>
                        <span
                          className={cn(
                            "text-micro col-start-1 flex items-center gap-1",
                            hasWorst && worst === i + 1 ? "text-[var(--warning)]" : "text-muted-foreground",
                          )}
                        >
                          <TrendingDown className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                          <span className="tabular">{kept}%</span>
                          {/* The arrow already says which way this goes, so on a
                              phone the word is the part that gives way. */}
                          <span className="hidden truncate sm:inline">continued</span>
                        </span>
                        {/* Nothing lost is not a loss worth printing: "−0 −0%"
                            reads as a broken number rather than as a clean step. */}
                        {lost > 0 && (
                          <span
                            className={cn(
                              "text-micro tabular col-start-3 text-right",
                              hasWorst && worst === i + 1 ? "text-[var(--warning)]" : "text-muted-foreground/70",
                            )}
                          >
                            −{lost.toLocaleString()}
                            <span className="ml-1 opacity-70">−{Math.round((100 - kept) * 10) / 10}%</span>
                          </span>
                        )}
                      </>
                    ) : (
                      /* A step nobody reached has no share to report, but the
                         band is still there — the shape is drawn against it. A
                         rule rather than a sentence: it holds the rhythm without
                         printing a percentage of nothing. */
                      <span className="bg-border/60 col-start-1 h-px w-4 self-center" aria-hidden />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/*
        What the drawing cannot say. The worst step is named in words rather than
        flagged on the row, because "the biggest fall" is a sentence about two
        steps and a caption sitting beside one of them keeps implying it belongs
        to that one alone. Time-to-value rides along because the funnel counts
        who arrived and never how long they took, and a fortnight-long path to a
        first response is a different problem from a leaky one.
      */}
      {(hasWorst || timeToValueMs != null) && (
        <dl className="text-micro text-muted-foreground mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t pt-3">
          {hasWorst && (
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <dt className="shrink-0">Biggest fall</dt>
              <dd className="text-foreground min-w-0 font-medium">
                {steps[worst - 1]!.label} → {steps[worst]!.label}
                <span className="text-muted-foreground ml-1 font-normal">
                  ({drops[worst]!.toLocaleString()} of {steps[worst - 1]!.count.toLocaleString()} stopped)
                </span>
              </dd>
            </div>
          )}
          {timeToValueMs != null && (
            <div className="flex items-baseline gap-1.5">
              <dt className="shrink-0">Signup → first response</dt>
              <dd className="text-foreground font-medium">{duration(timeToValueMs)}</dd>
              <span className="text-muted-foreground/70">median</span>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * The whole silhouette as one closed path: down the right side, across the
 * base, back up the left.
 *
 * ## Why a spline and not a stack of trapezoids
 *
 * The obvious drawing is a flat slab per step joined by a short taper, and it
 * was the drawing here first. It does not work. A vertical run meeting a curve
 * is smooth in the sense that the tangents agree and *creased* in the sense
 * that the curvature does not, so every step grew a shoulder, and seven of them
 * stacked read as a spine rather than as a vessel. Widening the taper only
 * spread the shoulders out.
 *
 * So the side is one curve for its whole length, sampled at the middle of each
 * step's row. That is where the label and the count sit, so the width beside a
 * name is still exactly that step's share of the top — the curve interpolates
 * between the measurements rather than between the edges of blocks, and there is
 * no join anywhere to crease.
 *
 * ## Why it cannot bulge
 *
 * A plain smooth spline through descending points overshoots: it dips below a
 * value and comes back up, which here would draw a funnel that narrows past a
 * step and then *widens* into it — a picture of accounts arriving from nowhere.
 * The tangents are therefore Fritsch–Carlson limited, which is the standard
 * result that a cubic stays monotone if each end's slope is within three times
 * the secant it belongs to. The two ends are pinned flat besides, so the mouth
 * and the base meet their straight runs without a corner.
 *
 * The left side is the right side walked backwards with every x mirrored about
 * the centre, so the two halves can never disagree.
 */
function outline(halves: number[], tops: number[], lastLive: number, ghostAt: number | null, totalH: number): string {
  /** One sample per live step, at the vertical middle of its row. */
  const pts = halves.slice(0, lastLive + 1).map((x, i) => ({ x, y: tops[i]! + SLAB / 2 }));
  // Where the shape hands over to the ghost, if it does: the taper has to land
  // on exactly the ghost's width, or the two draw a step between them.
  if (ghostAt !== null) pts.push({ x: MIN_HALF, y: ghostAt });

  const m = slopes(pts);
  const first = pts[0]!;
  const start = { x: first.x, y: 0 };

  type Seg = { v: number } | { c1: Point; c2: Point; p: Point };
  const segs: Seg[] = [{ v: first.y }];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const h = b.y - a.y;
    segs.push({
      c1: { x: a.x + (m[i]! * h) / 3, y: a.y + h / 3 },
      c2: { x: b.x - (m[i + 1]! * h) / 3, y: b.y - h / 3 },
      p: b,
    });
  }
  // A flat base, unless the ghost is already carrying the shape to the bottom.
  if (ghostAt === null) segs.push({ v: totalH });

  const ends: Point[] = [];
  let cursor = start;
  for (const seg of segs) {
    cursor = "v" in seg ? { x: cursor.x, y: seg.v } : seg.p;
    ends.push(cursor);
  }

  let d = `M ${50 - start.x},0 H ${50 + start.x}`;
  for (const seg of segs) {
    d += "v" in seg ? ` V ${seg.v}` : ` C ${50 + seg.c1.x},${seg.c1.y} ${50 + seg.c2.x},${seg.c2.y} ${50 + seg.p.x},${seg.p.y}`;
  }
  d += ` H ${50 - cursor.x}`;
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i]!;
    const back = i === 0 ? start : ends[i - 1]!;
    d += "v" in seg ? ` V ${back.y}` : ` C ${50 - seg.c2.x},${seg.c2.y} ${50 - seg.c1.x},${seg.c1.y} ${50 - back.x},${back.y}`;
  }
  return `${d} Z`;
}

interface Point {
  x: number;
  y: number;
}

/**
 * dx/dy at each sample, chosen so the curve through them never overshoots.
 *
 * Averaged secants for the interior, flat at both ends so the mouth and the
 * base leave vertically, then Fritsch–Carlson's limiter: where a point's two
 * slopes would carry the cubic past its own endpoints, both are scaled back
 * onto the circle of radius three. A step where nothing was lost pins its
 * neighbours flat, which is the correct picture — the funnel does not move.
 */
function slopes(pts: Point[]): number[] {
  const n = pts.length;
  if (n < 2) return [0];

  const secant = Array.from({ length: n - 1 }, (_, i) => (pts[i + 1]!.x - pts[i]!.x) / (pts[i + 1]!.y - pts[i]!.y));
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = (secant[i - 1]! + secant[i]!) / 2;

  for (let i = 0; i < n - 1; i++) {
    const s = secant[i]!;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const r = a * a + b * b;
    if (r > 9) {
      const t = 3 / Math.sqrt(r);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }
  return m;
}

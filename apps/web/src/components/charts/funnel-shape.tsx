"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
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
  /** The same stage in the preceding window of equal length. Absent means no comparison. */
  previous?: number;
  /** Median ms from signup to first reaching this stage. Null where nobody has. */
  medianMs?: number | null;
  /** The same median over the preceding window of equal length. */
  previousMedianMs?: number | null;
}

/**
 * One stage, one band, in CSS pixels — and load-bearing: the SVG's viewBox
 * height is `rows × ROW`, drawn at exactly that height, so one viewBox unit is
 * one pixel vertically and the shape lines up with the table beside it without
 * measuring anything at runtime.
 *
 * There used to be a second constant here, a shorter band *between* the stages
 * for the drop to be printed in. It is gone, and the reason it is gone is the
 * whole redesign: a row of numbers between two rows of numbers is read as a
 * third row of numbers. See the component for the rest.
 */
const ROW = 58;

/** The column headings, and the width each column gets. */
const HEAD = 32;

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

/**
 * How a stage's conversion reads at a glance: fine, middling, or bleeding.
 *
 * The bands are a judgement and they are worth being honest about — no funnel
 * arrives with its own thresholds. Eighty percent is where a step stops being
 * the thing you would look at first, and fifty is where half of everyone who
 * got there turned around, which is a fact about the step rather than about the
 * market. They are printed beside the number they colour, never instead of it,
 * so a reader who disagrees with the bands can still read the table.
 */
function verdict(kept: number | null): "good" | "ok" | "bad" | null {
  if (kept === null) return null;
  if (kept >= 80) return "good";
  if (kept >= 50) return "ok";
  return "bad";
}

/*
  The `-soft-foreground` inks, not the solid ones.

  `--success` and `--warning` are surface colours: they sit at lightness 0.63
  and 0.78, which is fine behind white text on a badge and about 2.5:1 as 14px
  type on a pale card. The soft foregrounds are the same three hues tuned to be
  *read* — dark on light, light on dark — so a stage's verdict survives the
  theme it is shown in.
*/
/**
 * How a figure moved, set under the figure itself.
 *
 * This was a column of its own — "vs prev 30d" — and it could not work there,
 * because by then the table had three numbers per row and one movement, and
 * nothing said which of the three it moved. The change belongs to the thing it
 * changed, so it sits beneath it in every column that has one.
 *
 * Grey, with only the arrow carrying colour. The figure above it is already on a
 * three-colour scale; a second full-strength signal in the same cell would
 * compete with it rather than qualify it.
 *
 * **Signed, and the sign is not the arrow's job alone.** The arrow points and it
 * is coloured, which is two ways of saying the same thing and neither of them
 * survives being read quickly in grey at eleven pixels — and for the median the
 * colour is deliberately *inverted*, so an arrow on its own is the one signal a
 * reader cannot safely infer direction from. A leading + or − says it in the
 * same characters as the number, and costs one glyph.
 */
function Movement({
  change,
  render,
  lowerIsBetter = false,
  title,
}: {
  /** Signed. Null where there is nothing comparable in the previous window. */
  change: number | null;
  /** How to write the size of the move, given its unsigned magnitude. */
  render: (magnitude: number) => string;
  /** For durations, where getting bigger is getting worse. */
  lowerIsBetter?: boolean;
  title?: string;
}) {
  /*
    Nothing to say, so it says nothing — but it still takes the line.

    A dash here was one mark per figure meaning "no comparison", and on a young
    product with no prior period that is *every* figure: twenty-one dashes, none
    of them information, drawn at the same weight as the movements they were
    standing in for. Blank is the honest rendering of an absent comparison.

    It cannot simply be omitted, though. The figure above it is centred in a
    fixed-height row, so a cell that drops to one line lifts its number out of
    alignment with the two-line cells beside it, and a table whose numbers sit at
    two heights across one row is harder to read across than one with dashes in
    it. So the line is reserved and left empty.
  */
  if (change === null) {
    return <span aria-hidden className="text-[0.6875rem] leading-[1.35]">&nbsp;</span>;
  }

  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className="text-muted-foreground tabular flex items-center justify-end gap-0.5 text-[0.6875rem] leading-[1.35]"
      title={title}
    >
      <Icon
        className={cn(
          "size-2.5 shrink-0",
          change === 0
            ? "text-muted-foreground/60"
            : good
              ? "text-[var(--success-soft-foreground)]"
              : "text-[var(--destructive-soft-foreground)]",
        )}
        strokeWidth={2.5}
        aria-hidden
      />
      {change > 0 ? "+" : change < 0 ? "−" : ""}
      {render(Math.abs(change))}
    </span>
  );
}

const TONE = {
  good: "text-[var(--success-soft-foreground)]",
  ok: "text-[var(--warning-soft-foreground)]",
  bad: "text-[var(--destructive-soft-foreground)]",
} as const;

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
  const tops = Array.from({ length: n }, (_, i) => i * ROW);
  const totalH = n * ROW;

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
  comparedTo = "the previous period",
}: {
  steps: FunnelStep[];
  hrefFor?: (step: FunnelStep) => string | null;
  /**
   * What `previous` is, named — "prev 30d", "yesterday".
   *
   * The comparison window is the page's date range, which this component cannot
   * see. The column was headed "Last period" while it could not say which one,
   * and a reader looking at a duration column two places to its left has every
   * reason to wonder whether that means yesterday or last quarter. Naming it in
   * the heading costs nothing and closes the question.
   */
  comparedTo?: string;
}) {
  const gradientId = useId();
  const top = steps[0]?.count ?? 0;
  const prevTop = steps[0]?.previous ?? 0;
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

  /*
    Column widths in one place, because five things have to agree on them: the
    heading row, every body row, the rule that crosses the whole card, the
    shape's left edge, and the hover target. `--fx-l` is the table; everything
    right of it is the drawing.
  */
  const cells =
    "grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_6rem] items-center gap-x-5";

  return (
    <div className="[--fx-l:100%] sm:[--fx-l:37rem]">
      <div className="relative">
        {/*
          Headings, which is the fix the last two attempts were both missing.

          Every earlier version printed four kinds of number down the left edge
          — a count, a share of the top, a share of the previous step, and a
          loss — in rows that alternated between two different *kinds* of row,
          and expected the reader to infer which was which from position alone.
          They could not, and nor could I when I looked at it cold. Named
          columns cost one line of small type and remove the entire question.
        */}
        <div
          className={cn(cells, "text-micro text-muted-foreground/80 items-end pb-2 [&>span]:whitespace-nowrap")}
          style={{ height: HEAD, width: "var(--fx-l)" }}
        >
          <span>Stage</span>
          <span className="text-right">Accounts</span>
          <span className="text-right">Reached</span>
          <span className="hidden text-right sm:block">Continued</span>
          {/*
            "Median time", not "Time to reach", because the heading has to name
            the statistic. A column of durations with no qualifier is read as an
            average, and the two differ by a lot here: one account that signed up
            in March and published in September moves a mean by weeks and the
            median not at all. The hover says the same thing without the word —
            "half the accounts that got here did so within…".
          */}
          <span className="hidden text-right sm:block">Median time</span>
        </div>

        {/*
          The shape, in the lane the table leaves it. `pointer-events-none` so
          the rows underneath stay clickable across their whole width, and a
          wrapper rather than a rounded `<svg>` because a div's overflow clip is
          the one that is guaranteed to round SVG content in every engine.
        */}
        <div
          className="bg-muted/70 pointer-events-none absolute right-0 z-10 hidden overflow-hidden rounded-lg sm:block"
          style={{ top: HEAD, height: totalH, left: "calc(var(--fx-l) + 0.75rem)" }}
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
                One gradient down the whole funnel, held flat across each band
                and turned over only at the boundaries — so a stage still has
                "its" colour, and no two of them meet at an edge.
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
                    <stop key={`${i}b`} offset={(tops[i]! + ROW) / totalH} stopColor={color} />,
                  ];
                })}
              </linearGradient>
            </defs>

            {d && <path d={d} fill={`url(#${gradientId})`} />}

            {ghostFrom !== null && (
              <>
                {/* Faint body, so the empty stages are a continuation of the
                    shape rather than a pair of loose lines under it. */}
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

        {/*
          One rule per stage boundary, across the table *and* the drawing.

          The previous version drew these too and they still did not land,
          because they marked the gap between two rows while the drop for that
          gap was printed inside it — so the line separated a row from its own
          caption. Now a boundary is a boundary: everything above it belongs to
          one stage, everything below it to the next, on both sides of the card.
        */}
        {steps.map((step, i) => (
          <div
            key={step.key}
            className={cn("pointer-events-none absolute inset-x-0 z-20 h-px", i === 0 ? "bg-border" : "bg-border/75")}
            style={{ top: HEAD + tops[i]! }}
            aria-hidden
          />
        ))}

        <ol>
          {steps.map((step, i) => {
            const prev = steps[i - 1];
            // The drop *into* this stage, which is where it belongs: it is the
            // thing that produced this row's number, not a fact of its own.
            const kept = prev && prev.count > 0 ? Math.round((step.count / prev.count) * 1000) / 10 : null;
            const href = hrefFor?.(step) ?? null;
            const leaks = hasWorst && worst === i;
            const tone = verdict(kept);

            /*
              The same stage, last period — as a rate, never as a count.

              Comparing "6 created a form" against last period's 4 tells you the
              cohort grew, which the Signups tile above already said. What is not
              on the page anywhere else is whether this *step* got better at its
              job, and that only shows in the rate: 66.7% against last period's
              80% is conversion lost, whatever either cohort's size.

              And it prints the old rate, not the difference between the two.
              The difference has no honest short unit: "2.4%" reads as 2.4% *of*
              90%, which is a different number, and "2.4pp" is correct and means
              nothing to anyone who has not met the abbreviation. A reader given
              92.4% in one column and 90% in the next does the comparison
              themselves, in the units they already understand, and the arrow
              has already told them which way it went.

              Blank rather than zero when last period's stage above was empty: a
              rate out of nothing is not a rate, and printing 0 would put a
              reassuring grey dash on the row that has no evidence at all.
            */
            const prevKept =
              prev && (prev.previous ?? 0) > 0 ? Math.round(((step.previous ?? 0) / prev.previous!) * 1000) / 10 : null;

            /*
              Three movements, one per figure, each against the same window.

              `Reached` and `Continued` move in percentage *points* — the plain
              difference between two rates, because 66.7 against 85.7 is nineteen
              points down and twenty-two percent down, and only one of those is
              the number anybody means. The median moves in time, and moves the
              other way: a stage that takes longer than it used to is a stage
              that got worse, which is why it is the one that reads `lowerIsBetter`.
            */
            const prevRate = prevTop > 0 ? Math.round(((step.previous ?? 0) / prevTop) * 1000) / 10 : null;
            const reachedShift = prevRate === null ? null : Math.round((step.rate - prevRate) * 10) / 10;
            const keptShift = kept !== null && prevKept !== null ? Math.round((kept - prevKept) * 10) / 10 : null;
            /*
              The median moves in per cent, and per cent is the honest unit here
              — unlike the two rates beside it, which move in *points*.

              A rate is already a percentage, so the gap between two of them can
              only be stated in points: 66.7 against 85.7 is nineteen points, and
              calling it 22% would be a second, different, true statement about
              the same pair that nobody means. A duration is not a percentage, so
              the gap between two of them is an ordinary ratio and per cent is
              exactly right. Same shape on the page, different units underneath,
              and the difference is real rather than a style choice.

              The size in minutes and hours has not gone anywhere; it is on the
              hover, where a number you occasionally want belongs.
            */
            const timeShift =
              step.medianMs != null && step.previousMedianMs != null && step.previousMedianMs > 0
                ? Math.round(((step.medianMs - step.previousMedianMs) / step.previousMedianMs) * 100)
                : null;

            const row = (
              <>
                <span className="flex min-w-0 items-center gap-1.5">
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
                {/*
                  The count carries no movement of its own — a cohort that grew
                  says something about the Signups tile, not about this stage —
                  but it reserves the line anyway. Every other figure in the row
                  sits on the upper of two lines, and a number that centres
                  itself instead lands thirteen pixels lower than the four beside
                  it, which is exactly the kind of misalignment that makes a
                  table hard to read across.
                */}
                <span className="flex flex-col items-end">
                  <span className="tabular text-sm font-semibold">{step.count.toLocaleString()}</span>
                  <Movement change={null} render={() => ""} />
                </span>
                {/*
                  The top row is 100% by definition, so it takes no colour: a
                  cell that is green whatever happens is a cell that has stopped
                  carrying information, and it sets the eye's baseline wrongly
                  for the six below it that mean something.
                */}
                <span className="flex flex-col items-end">
                  <span className={cn("tabular text-sm", i === 0 ? "text-muted-foreground" : TONE[verdict(step.rate) ?? "good"])}>
                    {step.rate}%
                  </span>
                  <Movement
                      change={i === 0 ? null : reachedShift}
                      render={(n) => `${n}pp`}
                      title={
                        reachedShift === null
                          ? `Nobody signed up in ${comparedTo}, so there is nothing to compare against.`
                          : `${step.rate}% of signups reached this stage, against ${prevRate}% in ${comparedTo}.`
                      }
                    />
                </span>

                {/*
                  Two rate columns, and there was briefly a third.

                  `Lost` printed the share of all signups that stopped at this
                  stage, on the argument that it measures a leak's *cost* while
                  `Continued` measures a step's *quality* — which is true, and
                  which missed that `Reached` already carries it. Reached falls by
                  exactly the loss each row, so the third column was the second
                  column's own first difference, set one place to the right. It
                  also invited the reading that it and `Continued` should sum to
                  100 and read as broken when they did not, because the two are
                  shares of different denominators. Where the biggest loss is
                  belongs in one sentence in the footer, and that is where it is.
                */}
                <span className="hidden flex-col items-end sm:flex">
                  <span className={cn("tabular text-sm", tone ? TONE[tone] : "text-muted-foreground", leaks && "font-semibold")}>
                    {kept === null ? <span className="text-muted-foreground opacity-40">—</span> : `${kept}%`}
                  </span>
                  <Movement
                      change={kept === null ? null : keptShift}
                      render={(n) => `${n}pp`}
                      title={
                        keptShift === null
                          ? `Nobody reached the stage above this one in ${comparedTo}, so there is nothing to compare against.`
                          : `${kept}% continued this period, against ${prevKept}% in ${comparedTo}.`
                      }
                    />
                </span>

                {/*
                  The one column that is not about volume.

                  Everything left of it counts accounts; this one counts hours,
                  and it answers the question the rest of the table cannot: a
                  stage that converts at 90% over nine days is an onboarding you
                  can leave alone right up until you notice the nine days. Read
                  down it and it is a schedule — publish within the hour, first
                  response the next morning, paid a fortnight later.

                  Median over the accounts that reached the stage, so it is blank
                  where nobody has: a duration averaged over nobody is not a
                  duration, and printing a dash is the honest version of it.
                */}
                <span className="hidden flex-col items-end sm:flex">
                  <span
                    className="text-muted-foreground tabular text-sm"
                    title={
                      step.medianMs == null
                        ? "No account has reached this stage yet"
                        : `Half the accounts that reached this stage did so within ${duration(step.medianMs)} of signing up`
                    }
                  >
                    {step.medianMs == null ? <span className="opacity-40">—</span> : duration(step.medianMs)}
                  </span>
                  <Movement
                      change={step.medianMs == null ? null : timeShift}
                      render={(n) => `${n}%`}
                      lowerIsBetter
                      title={
                        timeShift === null
                          ? `No account reached this stage in ${comparedTo}, so there is nothing to compare against.`
                          : `${duration(step.medianMs!)} this period, against ${duration(step.previousMedianMs!)} in ${comparedTo}.`
                      }
                    />
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
                    // The hit area is the whole width — the drawing is part of
                    // the row — while the cells stay inside the table's own lane.
                    className="hover:bg-muted/50 group relative flex items-center rounded-md transition-colors duration-[var(--duration-micro)]"
                    style={{ height: ROW }}
                  >
                    <span className={cn(cells, "w-[var(--fx-l)]")}>{row}</span>

                    {/*
                      What the drawing does when you point at a row.

                      The row already lit up on hover, but only in the table half
                      — the shape sat above it at `z-10` and answered nothing, so
                      pointing at the funnel highlighted a row somewhere off to
                      the left and pointing at a row left the funnel inert. Both
                      directions work already, because the drawing is
                      `pointer-events-none` and the hit test falls through to the
                      row underneath; what was missing was the drawing admitting
                      it. This band is that admission: it rides above the shape,
                      so a stage's slice of the funnel is picked out of a
                      continuous ribbon by the two rules that bound it.

                      Sized off the same `--fx-l` as everything else, and the row
                      is exactly one stage tall, so the band needs no arithmetic
                      of its own to line up with the drawing.
                    */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-0 z-30 hidden opacity-0 transition-opacity duration-[var(--duration-micro)] group-hover:opacity-100 sm:block"
                      style={{ left: "calc(var(--fx-l) + 0.75rem)" }}
                    >
                      {/*
                        Two rules and no wash.

                        There was a six-percent tint here as well, and in the
                        light theme it was the worst thing on the card: the row's
                        own hover wash tinted the table half, this one tinted the
                        lane half over a track that is already grey, and the two
                        greys met at the lane edge in a visible seam — a hover
                        state that looked like a rendering fault. A tint also
                        cannot win both grounds at once, since six percent reads
                        over the pale track and disappears over a saturated fill,
                        so the part of the band that *is* the measurement was the
                        part that stayed unmarked. A bracket at each edge is one
                        mark, on one ground, and it lands on both.
                      */}
                      <span className="bg-foreground/50 absolute inset-x-0 top-0 h-px" />
                      <span className="bg-foreground/50 absolute inset-x-0 bottom-0 h-px" />
                      {/*
                        The click, said out loud, in the empty track the funnel
                        leaves at the edge. The arrow beside the label is three
                        pixels of affordance for a whole row that navigates; this
                        is the one thing worth adding on hover that the table does
                        not already print. Withheld on an empty stage, because
                        "View 0 accounts" is a link to a blank page.
                      */}
                      {step.count > 0 && (
                        <span className="bg-background/85 text-muted-foreground text-micro absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 rounded-md border px-1.5 py-0.5 backdrop-blur-[2px]">
                          View {step.count.toLocaleString()} {step.count === 1 ? "account" : "accounts"}
                          <ArrowRight className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                        </span>
                      )}
                    </span>
                  </Link>
                ) : (
                  <div className="relative flex items-center" style={{ height: ROW }}>
                    <span className={cn(cells, "w-[var(--fx-l)]")}>{row}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/*
        The one sentence the table cannot make.

        "Biggest fall" is a claim about two stages at once, and a caption sitting
        beside one of them keeps implying it belongs to that one alone. The
        time-to-value line that used to sit here has gone into the table as
        `Time to reach`, where it is one row of a column rather than a fact
        floating under the chart — and where the other six stages get the same
        treatment instead of the first response being singled out.
      */}
      {hasWorst && (
        <p className="text-micro text-muted-foreground mt-3 flex flex-wrap items-baseline gap-x-1.5 border-t pt-3">
          <span className="shrink-0">Biggest fall</span>
          <span className="text-foreground font-medium">
            {steps[worst - 1]!.label} → {steps[worst]!.label}
          </span>
          <span>
            ({drops[worst]!.toLocaleString()} of {steps[worst - 1]!.count.toLocaleString()} stopped)
          </span>
        </p>
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
  const pts = halves.slice(0, lastLive + 1).map((x, i) => ({ x, y: tops[i]! + ROW / 2 }));
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

"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { deltaLabel } from "./format";
import { cn } from "@/lib/utils";

/**
 * A number, where it has been, and whether that is good.
 *
 * Three decisions worth stating:
 *
 * **The comparison is to the same length of time immediately before.** Thirty
 * days against the thirty before it, not against a calendar month — so the
 * figure means the same thing on the 3rd as on the 28th.
 *
 * **Up is not automatically green.** `lowerIsBetter` exists because this console
 * shows AI cost next to signups, and a cost tile that turns green as it climbs
 * is worse than no colour at all.
 *
 * **A move from a zero baseline is not a percentage.** "+∞%" and "+100%" are
 * both nonsense when last period was zero, so the tile prints the move itself —
 * "+12" — against the same named window every other tile compares to. The
 * trailing half stays the same sentence whatever the baseline was; only the
 * figure changes. See `deltaLabel`.
 */
export function KpiTile({
  label,
  value,
  previous,
  comparedTo = "previous period",
  format = (n: number) => n.toLocaleString(),
  series,
  lowerIsBetter = false,
  hint,
  sub,
}: {
  label: string;
  value: number;
  /**
   * Omit for a figure that is a standing total rather than a period count.
   *
   * "Block types in use: 26" has nothing to compare against, and inventing a
   * delta for it would be inventing a number. Without this the Product page had
   * to reach for a different component, and the same band of the page came out
   * a different height and a different shape depending which page you were on.
   */
  previous?: number;
  /**
   * What `previous` actually is, named — "prev 30 days", "yesterday".
   *
   * The comparison window is the page's date range, which the tile cannot see;
   * saying "vs previous" instead made the reader guess whether it meant the day
   * before, the month before, or all time.
   */
  comparedTo?: string;
  format?: (n: number) => string;
  series?: number[];
  lowerIsBetter?: boolean;
  hint?: string;
  /**
   * A second figure that qualifies the first, beside it — "+8 partial".
   *
   * For the case where the headline number is true but incomplete on its own.
   * "Responses collected: 12" is the finished ones, and read alone it says
   * nobody abandoned anything; the partials belong in the same glance, not on
   * another page. Deliberately not a second tile: it is not a measure of its
   * own, it is the rest of this one.
   */
  sub?: string;
}) {
  const delta = value - (previous ?? value);
  const flat = delta === 0;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  // The wording lives in `format.ts` so it can be tested without a DOM.
  const moved = deltaLabel(value, previous, comparedTo, format);

  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    /**
     * Deliberately compact.
     *
     * Six of these open every page, and at `text-h1` with generous stacking they
     * cost about 300px in two rows — the whole first screen spent on six numbers
     * before a single chart. A KPI is a glance, not a headline: the figure only
     * needs to out-weigh its own label, which 1.75rem does, and the row now fits
     * on one line at desktop width and costs roughly a third of what it did.
     */
    <div className="bg-card shadow-xs rounded-xl px-3.5 py-3">
      <p className="text-muted-foreground text-caption truncate" title={label}>
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="tabular flex items-baseline gap-1.5 text-[1.75rem] leading-none font-semibold">
          {format(value)}
          {sub && (
            <span className="text-muted-foreground text-micro truncate font-normal" title={sub}>
              {sub}
            </span>
          )}
        </p>
        {series && series.length > 1 && (
          <Sparkline
            values={series}
            width={56}
            height={18}
            color={flat ? "var(--muted-foreground)" : good ? "var(--success)" : "var(--chart-2)"}
          />
        )}
      </div>
      {/*
        A flat tile spends its line on the hint, not on the words "no change".

        Six tiles across a laptop leaves each about 240px, and "— no change 3+
        consecutive failures" truncated to "— no change 3+ con…" — the half that
        survived was the half that said nothing. When a number has not moved,
        the only thing worth the space is what it counts.
      */}
      <p
        className={cn(
          "text-micro mt-1.5 flex items-center gap-1",
          flat ? "text-muted-foreground" : good ? "text-[var(--success)]" : "text-[var(--warning-soft-foreground)]",
        )}
      >
        {moved === null ? (
          <span className="truncate" title={hint}>
            {hint ?? (previous !== undefined ? "no change" : "")}
          </span>
        ) : (
          <>
            <Icon className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="tabular shrink-0">{moved.change}</span>
            <span className="text-muted-foreground truncate" title={hint ?? moved.against}>
              {hint ?? moved.against}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

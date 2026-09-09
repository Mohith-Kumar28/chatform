"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
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
 * both nonsense when last period was zero; it says "new" instead.
 */
export function KpiTile({
  label,
  value,
  previous,
  format = (n: number) => n.toLocaleString(),
  series,
  lowerIsBetter = false,
  hint,
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
  format?: (n: number) => string;
  series?: number[];
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  const comparable = previous !== undefined;
  const delta = value - (previous ?? value);
  const pct = comparable && previous! > 0 ? Math.round((delta / previous!) * 1000) / 10 : null;
  const flat = delta === 0;
  const good = lowerIsBetter ? delta < 0 : delta > 0;

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
        <p className="tabular text-[1.75rem] leading-none font-semibold">{format(value)}</p>
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
        {!comparable || flat ? (
          <span className="truncate" title={hint}>
            {hint ?? (comparable ? "no change" : "")}
          </span>
        ) : (
          <>
            <Icon className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="tabular shrink-0">{pct === null ? "new" : `${pct > 0 ? "+" : ""}${pct}%`}</span>
            <span className="text-muted-foreground truncate" title={hint}>
              {hint ?? "vs previous"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

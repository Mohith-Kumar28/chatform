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
  previous: number;
  format?: (n: number) => string;
  series?: number[];
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  const delta = value - previous;
  const pct = previous > 0 ? Math.round((delta / previous) * 1000) / 10 : null;
  const flat = delta === 0;
  const good = lowerIsBetter ? delta < 0 : delta > 0;

  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="bg-card shadow-xs rounded-xl p-4">
      <p className="text-muted-foreground text-caption">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="tabular text-h1 leading-none">{format(value)}</p>
        {series && series.length > 1 && (
          <Sparkline
            values={series}
            color={flat ? "var(--muted-foreground)" : good ? "var(--success)" : "var(--chart-2)"}
          />
        )}
      </div>
      <p
        className={cn(
          "text-micro mt-2 flex items-center gap-1",
          flat ? "text-muted-foreground" : good ? "text-[var(--success)]" : "text-[var(--warning-soft-foreground)]",
        )}
      >
        <Icon className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
        <span className="tabular">
          {flat ? "no change" : pct === null ? "new" : `${pct > 0 ? "+" : ""}${pct}%`}
        </span>
        <span className="text-muted-foreground truncate">{hint ?? "vs previous period"}</span>
      </p>
    </div>
  );
}

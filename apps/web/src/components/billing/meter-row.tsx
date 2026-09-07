"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { LockChip } from "@/components/billing/gate";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/ui/info-hint";
import { MeterBar } from "@/components/ui/usage-meter";
import { deltaPercent, formatValue, meterTone, type MeterRowData } from "@/lib/usage/meters";
import { rowBadge, rowNote } from "@/lib/usage/copy";
import { cn } from "@/lib/utils";

/**
 * One limit, as a row in a list.
 *
 * ## Why a list and not a grid of cards
 *
 * The page was eight tiles of identical weight, and identical weight is the same as no
 * weight — nothing on it was the answer to "am I fine?", so every visit meant reading all
 * eight. Worse, a grid demands that every cell be the same shape, and these are not the
 * same shape: one is unlimited and has no bar, one is not sold on this plan and has no
 * numbers, one is a standing count that will never move. Forcing those into equal boxes
 * is what produced a hidden tile, a hole in the second row, and a CSS hack to widen the
 * orphan.
 *
 * A divided list has no such demand. A row can drop its bar, drop its figures, or carry a
 * padlock instead, and the list simply stays a list.
 */
export function MeterRow({
  row,
  resets,
  planName,
  lastMonth,
}: {
  row: MeterRowData;
  resets: string;
  planName: string;
  /** Short name of the previous month, for the comparison. */
  lastMonth: string;
}) {
  const note = rowNote(row, resets, planName);
  const badge = rowBadge(row);
  const delta = deltaPercent(row);

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      {/* Fixed width so every bar in the list starts on the same vertical line — a column
          of bars that begins at a different x per row cannot be compared at a glance. Wide
          enough for the longest label *plus* a state chip, since the chip appears exactly
          when the row most needs reading. */}
      <div className="flex min-w-0 items-center gap-1.5 sm:w-64 sm:shrink-0">
        <span className={cn("text-body truncate font-medium", row.locked && "text-muted-foreground")}>
          {row.label}
        </span>
        {row.hint && <InfoHint label={`About ${row.label}`}>{row.hint}</InfoHint>}
        {badge && (
          <Badge
            variant={badge.tone === "danger" ? "destructive" : "soft"}
            className={cn(
              "shrink-0",
              badge.tone === "warning" && "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
            )}
          >
            {badge.text}
          </Badge>
        )}
        {/* Shown, not hidden. A limit the plan does not sell is the one place on an
            account page where that capability is discoverable at all — hiding it is how
            a feature nobody sees becomes a feature nobody wants. */}
        {row.locked && <LockChip reason={{ limit: row.limitKey }} context={{ surface: "usage-row" }} />}
      </div>

      {/* The bar, or the sentence that stands in for it. Never an empty slot. */}
      <div className="min-w-0 flex-1">
        <MeterBar value={row.used} max={row.limit} tone={meterTone(row)} label={row.label} />
        {note && (
          <p
            className={cn(
              "text-micro mt-1.5",
              row.danger ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {note}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-baseline gap-2 sm:w-52 sm:justify-end">
        {row.locked ? (
          <span className="text-muted-foreground text-caption tabular">—</span>
        ) : (
          <>
            <span className={cn("tabular text-body font-medium", row.danger && "text-destructive")}>
              {formatValue(row.used, row.unit)}
            </span>
            <span className="text-muted-foreground text-caption tabular">
              {row.limit === null ? "used" : `of ${formatValue(row.limit, row.unit)}`}
            </span>
            {/* Month over month, only where it is both available and meaningful. A
                counter answers "where am I"; the delta is the only thing on the row that
                answers "am I about to have a problem". */}
            {delta !== null && (
              <span
                className="text-muted-foreground text-micro tabular inline-flex items-center gap-0.5"
                title={`vs ${lastMonth}`}
              >
                {delta > 0 ? (
                  <ArrowUpRight className="size-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden />
                )}
                {Math.abs(delta)}%
              </span>
            )}
          </>
        )}
        {row.href && (
          <Link
            href={row.href}
            className="text-muted-foreground hover:text-foreground text-micro underline-offset-2 hover:underline"
          >
            Manage
          </Link>
        )}
      </div>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { formatValue, monthlyRows, mostPressured } from "@/lib/usage/meters";
import { statusTone } from "@/lib/usage/copy";
import { cn } from "@/lib/utils";

/**
 * The one number worth a permanent place in the header — and only once it is.
 *
 * Usage had a nav slot on the argument that people check it repeatedly. That is
 * only true when something is close to running out; the rest of the time it was a
 * slot spent on a page nobody had a reason to open. So the slot went, and this
 * takes its place: nothing at all while there is nothing to say, and the actual
 * figure the moment a meter crosses into warning territory.
 *
 * Reads the same `mostPressured` and `statusTone` the usage page and the AI cap
 * banner do, so all three name the same limit at the same threshold.
 */
export function UsagePill() {
  const ent = useEntitlements();
  const row = useMemo(
    () => (ent.data ? mostPressured(monthlyRows(ent.data)) : null),
    [ent.data],
  );

  const tone = statusTone(row);
  if (!row || tone === "ok" || row.limit === null) return null;

  return (
    <Link
      href="/settings/usage"
      title={`${row.label}: ${formatValue(row.used, row.unit)} of ${formatValue(row.limit, row.unit)} used`}
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs md:inline-flex",
        "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        tone === "danger"
          ? "bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]"
          : "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
      )}
    >
      <span className="tabular font-medium">
        {formatValue(row.used, row.unit)}/{formatValue(row.limit, row.unit)}
      </span>
      <span className="opacity-80">{row.label}</span>
    </Link>
  );
}

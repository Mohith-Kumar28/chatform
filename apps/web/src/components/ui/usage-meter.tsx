import { cn } from "@/lib/utils";

/**
 * One "used of limit" bar.
 *
 * Extracted from the billing page because the team page needs exactly the
 * same thing for seats, and a second hand-rolled bar is how the two end up
 * disagreeing about what "nearly full" looks like.
 *
 * `null` means unlimited: the bar is drawn flat rather than at zero, because
 * an empty track reads as "none left" at a glance.
 */
export function UsageMeter({
  label,
  used,
  limit,
  hint,
  className,
}: {
  label: string;
  used: number;
  /** `null` for unlimited. */
  limit: number | null;
  hint?: string;
  className?: string;
}) {
  const over = limit !== null && used >= limit;
  const near = limit !== null && !over && used / limit >= 0.8;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">
          <span className={cn("tabular font-medium", over && "text-destructive")}>
            {used.toLocaleString()}
          </span>
          {" / "}
          {limit === null ? "unlimited" : limit.toLocaleString()}
        </span>
      </div>
      <div
        className="bg-muted h-2.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        {...(limit !== null ? { "aria-valuemax": limit } : {})}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
            over ? "bg-destructive" : near ? "bg-[var(--warning)]" : "bg-primary",
          )}
          style={{ width: limit === null ? "100%" : `${Math.max(pct, 2)}%` }}
        />
      </div>
      {hint && <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>}
    </div>
  );
}

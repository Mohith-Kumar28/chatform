import { cn } from "@/lib/utils";

/**
 * The one bar in the product.
 *
 * There were three: this file, a `Tile` local to the usage page, and the tone logic
 * copied between them. Three implementations of "nearly full" is how two of them end up
 * disagreeing about what nearly full looks like, and they did.
 *
 * ## Why `max === null` renders nothing
 *
 * It used to draw a *full* track for unlimited, on the reasoning that an empty one reads
 * as "none left". Both readings are wrong, and the fix for a bar that lies is not a
 * different lie: a 100%-filled track reads as "all consumed", which is the exact opposite
 * of what unlimited means. GitLab hit this on their usage quotas page and settled it the
 * same way — where a limit does not apply, hide the denominator and the bar. The caller
 * puts the word "Unlimited" in the slot instead, which is what the reader actually needed.
 */
export function MeterBar({
  value,
  max,
  tone = "neutral",
  label,
  className,
}: {
  value: number;
  /** `null` renders nothing at all, deliberately — see above. */
  max: number | null;
  tone?: "quiet" | "neutral" | "warning" | "danger";
  label: string;
  className?: string;
}) {
  if (max === null) return null;

  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div
      className={cn("bg-muted h-1.5 overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
          tone === "danger"
            ? "bg-destructive"
            : tone === "warning"
              ? "bg-[var(--warning)]"
              : // A full track that will never move is not worth the action colour. The
                // row's chip and figures already say "full"; this just draws the shape.
                tone === "quiet"
                ? "bg-foreground/20"
                : "bg-primary",
        )}
        // Zero draws nothing. A minimum sliver on an untouched meter reads as dirt on the
        // track; the floor only exists so a real, tiny value is not invisible.
        style={{ width: value === 0 ? "0%" : `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
}

/**
 * A labelled "used of limit" row, for callers outside the usage page.
 *
 * The team page needs exactly this beside its invite form, where the meter is an
 * argument for the control next to it rather than a page of its own. Signature kept
 * unchanged while the bar underneath was replaced.
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
  /** `null` for unlimited — no bar is drawn. */
  limit: number | null;
  hint?: string;
  className?: string;
}) {
  const over = limit !== null && used > limit;
  const near = limit !== null && !over && used / limit >= 0.8;

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
      <MeterBar
        value={used}
        max={limit}
        tone={over ? "danger" : near ? "warning" : "neutral"}
        label={label}
        className="h-2.5"
      />
      {hint && <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>}
    </div>
  );
}

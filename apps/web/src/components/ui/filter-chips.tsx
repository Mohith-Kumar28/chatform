"use client";

import { cn } from "@/lib/utils";

/**
 * A scrolling rail of exclusive filters.
 *
 * `SegmentedControl` is the wrong shape for this: it holds two to four modes
 * in a fixed-width track and slides a pill between them. A category list is
 * open-ended — ten template categories, a status set that grows — and has to
 * wrap or scroll. Same job, different geometry, so it is a different control
 * rather than a size variant of that one.
 */

export interface FilterChip<T extends string> {
  value: T;
  label: string;
  /** Trailing count, e.g. `Sales 4`. Hidden when undefined, not when zero. */
  count?: number;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: readonly FilterChip<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      // `-mx-1 px-1` so a focus ring on the first chip is not clipped by the
      // scroll container.
      className={cn(
        "-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
              "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
              "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "border-transparent bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.icon && <opt.icon className="size-3.5" strokeWidth={1.75} />}
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  "tabular text-[0.6875rem] leading-none",
                  active ? "opacity-70" : "opacity-60",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

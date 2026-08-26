"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * One segmented control for the whole product.
 *
 * There were four hand-rolled versions of this (builder tabs, results tabs,
 * share tabs, the dashboard create dialog), each with slightly different
 * padding, radius and active treatment — while `ui/tabs.tsx` sat unused. This
 * replaces all of them.
 *
 * The active pill is a shared `layoutId`, so it slides between options instead
 * of blinking. Under reduced motion the slide is skipped, not the highlight.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Small trailing count, e.g. `Partial 4`. */
  badge?: string | number;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "default",
  className,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "default";
  className?: string;
  ariaLabel?: string;
}) {
  // Scopes the sliding pill to this instance — two controls on one screen must
  // not animate into each other.
  const layoutGroup = useId();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "bg-muted/70 inline-flex items-center rounded-full p-1",
        size === "sm" ? "gap-0.5" : "gap-1",
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
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative isolate inline-flex items-center gap-1.5 rounded-full font-medium",
              "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
              "disabled:pointer-events-none disabled:opacity-50",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-${layoutGroup}`}
                className="bg-card shadow-xs absolute inset-0 -z-10 rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {opt.icon && <opt.icon className="size-3.5" strokeWidth={1.75} />}
            {opt.label}
            {opt.badge !== undefined && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none",
                  active ? "bg-primary-soft text-primary" : "bg-muted-foreground/15",
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useId } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
 *
 * ## Why the pill is violet
 *
 * It used to be `bg-card` — a slightly lighter grey on a grey track, which on
 * the dark theme left the selected tab nearly indistinguishable from its
 * neighbours. Violet is the brand's counterpart hue, and selection is exactly
 * what it is for: orange stays the one call to action on a screen, so a tab
 * that is merely *where you are* must not compete with the button that does
 * something. It is set here rather than at each of the dozen call sites, so
 * every segmented control in the product moves together.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Small trailing count, e.g. `Partial 4`. */
  badge?: string | number;
  disabled?: boolean;
  /** Navigate instead of calling `onChange` — for a tab that is a real route. */
  href?: string;
  /** Shown on hover. The call site must be inside a `TooltipProvider`. */
  tooltip?: React.ReactNode;
  /** Extra classes on the label, e.g. `hidden xl:inline` for a tight header. */
  labelClassName?: string;
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
  /** Omitted when every option is a link. */
  onChange?: (value: T) => void;
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
        const itemClass = cn(
          "relative isolate inline-flex items-center gap-1.5 rounded-full font-medium",
          "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
          "disabled:pointer-events-none disabled:opacity-50",
          size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
          active
            ? "text-brand-violet-soft-foreground"
            : "text-muted-foreground hover:text-foreground",
        );

        const inner = (
          <>
            {active && (
              <motion.span
                layoutId={`segmented-${layoutGroup}`}
                className="bg-brand-violet-soft shadow-xs absolute inset-0 -z-10 rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {opt.icon && <opt.icon className="size-3.5 shrink-0" strokeWidth={1.75} />}
            <span className={opt.labelClassName}>{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none",
                  active
                    ? "bg-brand-violet/20 text-brand-violet-soft-foreground"
                    : "bg-muted-foreground/15",
                )}
              >
                {opt.badge}
              </span>
            )}
          </>
        );

        const control = opt.href ? (
          <Link
            key={opt.value}
            href={opt.href}
            // A tab strip should behave like one, so every destination is
            // already there when it is clicked.
            prefetch
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={itemClass}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange?.(opt.value)}
            className={itemClass}
          >
            {inner}
          </button>
        );

        if (!opt.tooltip) return control;
        return (
          <Tooltip key={opt.value}>
            <TooltipTrigger asChild>{control}</TooltipTrigger>
            <TooltipContent side="bottom">{opt.tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

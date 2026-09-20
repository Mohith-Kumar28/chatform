"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
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
 * The active pill is one element that slides between options instead of
 * blinking. Under reduced motion the slide is skipped, not the highlight.
 *
 * It used to be a `motion` shared `layoutId`. That was the only thing left in
 * the marketing tree using the library, and it pulled ~83 KB over the wire
 * onto every public page to move one pill. The same FLIP is a `transform`
 * here: measure the active tab, park the pill on it, let a transition carry
 * it. The library is no longer a dependency of this file, of the marketing
 * pages, or of the builder chrome that also renders this control.
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
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  /**
   * The pill is positioned by writing to the DOM, not by holding a measurement
   * in state.
   *
   * A measurement is not application state — it is the browser's answer about
   * itself, and round-tripping it through `useState` would re-render the whole
   * control on every resize and every font swap to set two style properties.
   * This is the case an effect is actually for: synchronising an external
   * system with what React just rendered.
   *
   * `useLayoutEffect` so the pill is under the active option on the first
   * frame — measuring after paint would show one frame of an unhighlighted
   * strip, which is the blink this control exists to avoid. `data-placed` is
   * written on the same pass and is what turns the transition on, so the first
   * placement lands silently and only later moves slide.
   */
  useLayoutEffect(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return;

    const place = () => {
      const tab = track.querySelector<HTMLElement>('[data-active="true"]');
      if (!tab) {
        pill.style.opacity = "0";
        return;
      }
      pill.style.opacity = "1";
      pill.style.width = `${tab.offsetWidth}px`;
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      // Next frame, so the browser has committed the position above before the
      // transition exists to animate it.
      requestAnimationFrame(() => {
        pill.dataset.placed = "";
      });
    };

    place();
    // Labels reflow — a `hidden xl:inline` label appearing, a badge count
    // changing, the font swapping in — and the pill has to follow them.
    const ro = new ResizeObserver(place);
    ro.observe(track);
    for (const tab of Array.from(track.children)) ro.observe(tab);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "bg-muted/70 relative inline-flex items-center rounded-full p-1",
        size === "sm" ? "gap-0.5" : "gap-1",
        className,
      )}
    >
      {/* Hidden until measured, so nothing flashes at the left edge. The
          transition is attached by `[data-placed]` rather than by a class, so
          the first placement is instant and every later one slides. Reduced
          motion lands the pill instead of hiding it. */}
      <span
        ref={pillRef}
        aria-hidden
        className="bg-brand-violet-soft shadow-xs absolute top-1 bottom-1 left-0 z-0 rounded-full opacity-0 [&[data-placed]]:transition-[transform,width] [&[data-placed]]:duration-[var(--duration-standard)] [&[data-placed]]:ease-[var(--ease-out)] motion-reduce:transition-none"
      />
      {options.map((opt) => {
        const active = opt.value === value;
        const itemClass = cn(
          "relative z-10 inline-flex items-center gap-1.5 rounded-full font-medium",
          "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
          "disabled:pointer-events-none disabled:opacity-50",
          size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
          active
            ? "text-brand-violet-soft-foreground"
            : "text-muted-foreground hover:text-foreground",
        );

        const inner = (
          <>
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
            data-active={active}
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
            data-active={active}
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

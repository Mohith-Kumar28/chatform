"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The chart primitives the Results tabs are built from.
 *
 * Two rules hold this together, and both come out of the same observation: a
 * chart is read by a person and drawn by a machine, and the machine will
 * happily draw something unreadable.
 *
 * 1. **Colour carries identity, never rank.** `SERIES` is a fixed order,
 *    assigned to entities and never cycled — so the same answer is the same
 *    colour in every chart on the page, and filtering does not repaint the
 *    survivors. The six steps are validated for the light and dark surfaces
 *    (lightness band, chroma floor, colour-vision separation, contrast); the
 *    tokens live in `globals.css`.
 * 2. **Categories are bars, not slices, unless the whole is the point.** A
 *    horizontal bar list compares lengths against a shared baseline and has room
 *    for a real label; a donut is used only where the question is "what share of
 *    the whole", with few enough parts to tell apart. Every mark is labelled
 *    directly, so nothing depends on colour alone.
 */

export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export function seriesColor(i: number): string {
  // Never a generated hue past the palette: the seventh entity folds back onto
  // the ramp rather than inventing a colour nothing else uses.
  return SERIES[i % SERIES.length]!;
}

export function ChartCard({
  title,
  subtitle,
  aside,
  children,
  className,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card rounded-xl p-4 sm:p-5", className)}>
      {(title || aside) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-h3 leading-snug">{title}</h3>}
            {subtitle && <p className="text-muted-foreground text-caption mt-0.5">{subtitle}</p>}
          </div>
          {aside && <div className="text-muted-foreground text-caption shrink-0 whitespace-nowrap">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A single number that is the whole answer. */
export function Hero({
  value,
  label,
  tone = "default",
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const colors = {
    default: "text-foreground",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-destructive",
  } as const;
  return (
    <div>
      <p className={cn("tabular text-[1.75rem] leading-none font-semibold", colors[tone])}>{value}</p>
      <p className="text-muted-foreground text-caption mt-1">{label}</p>
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  /** Overrides the count shown on the right. */
  display?: string;
  color?: string;
}

/**
 * Ranked categories, as bars.
 *
 * Hand-drawn rather than charted: a bar chart library puts the label on an axis
 * and then truncates it to fit, which is exactly wrong when the label is
 * "Auto-saving highlighted text & quotes" and the number is a count anyone can
 * read off the end of the bar. Here the label sits above its own bar with the
 * full width of the card, the value is a direct label, and the bar is the only
 * thing carrying the comparison.
 */
export function BarList({
  items,
  total,
  colorBy = "single",
  unit = "",
  emptyLabel = "No answers yet",
}: {
  items: BarItem[];
  /** The denominator for the percentages. Defaults to the largest bar. */
  total?: number;
  /** `single` for one measure, `series` when each row is its own entity. */
  colorBy?: "single" | "series";
  unit?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const denom = total && total > 0 ? total : max;

  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => {
        const pct = Math.round((item.value / denom) * 100);
        return (
          <li key={`${item.label}-${i}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm" title={item.label}>
                {item.label}
              </span>
              <span className="text-muted-foreground tabular shrink-0 text-xs">
                {item.display ?? `${item.value}${unit}`}
                <span className="ml-1.5 opacity-70">{pct}%</span>
              </span>
            </div>
            {/* 4px rounded end, anchored to a shared baseline; the track is the
                only grid this needs. */}
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-[var(--duration-standard)]"
                style={{
                  width: `${Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100)}%`,
                  background: item.color ?? (colorBy === "series" ? seriesColor(i) : "var(--chart-1)"),
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Part-to-whole, for a question with one answer and few options.
 *
 * SVG by hand for the same reason as the bars: a charting library's donut
 * arrives with a legend that wraps, a tooltip that needs a mouse, and labels
 * that overlap at small angles. This one puts the legend in a list beside the
 * ring with the count and share spelled out, so it is readable without hovering
 * and without telling colours apart.
 */
export function Donut({
  items,
  total,
  centerValue,
  centerLabel,
}: {
  items: BarItem[];
  total: number;
  centerValue?: React.ReactNode;
  centerLabel?: React.ReactNode;
}) {
  const gradientId = useId();
  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const denom = total > 0 ? total : 1;

  // Each arc starts where the ones before it ended. Accumulated with a scan
  // rather than a running variable, so nothing is mutated across a render.
  const arcs = items.map((item, i) => ({
    item,
    i,
    dash: (item.value / denom) * c,
    offset: (items.slice(0, i).reduce((n, prev) => n + prev.value, 0) / denom) * c,
  }));

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Share of answers">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          {arcs.map(({ item, i, dash, offset: o }) => (
            <circle
              key={`${gradientId}-${i}`}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={item.color ?? seriesColor(i)}
              strokeWidth={stroke}
              // A 2px surface gap between segments, so adjacent fills read as
              // two marks rather than one band that changed colour.
              strokeDasharray={`${Math.max(0, dash - 2)} ${c - Math.max(0, dash - 2)}`}
              strokeDashoffset={-o}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </svg>
        {(centerValue !== undefined || centerLabel !== undefined) && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="tabular text-h2 leading-none">{centerValue}</p>
              <p className="text-muted-foreground text-micro mt-0.5">{centerLabel}</p>
            </div>
          </div>
        )}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-baseline gap-2 text-sm">
            <span
              className="mt-1 size-2.5 shrink-0 rounded-[3px]"
              style={{ background: item.color ?? seriesColor(i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate" title={item.label}>
              {item.label}
            </span>
            <span className="text-muted-foreground tabular shrink-0 text-xs">
              {/* `display` for the same reason `BarList` has it: a slice can be
                  a count, but it can equally be money or bytes, and printing
                  the raw number then reports 8500 where the answer is $85. */}
              {item.display ?? item.value}
              <span className="ml-1.5 opacity-70">{Math.round((item.value / denom) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A distribution over a fixed, ordered set of numbers — a 1–5 rating, an NPS
 * 0–10, a histogram bucket.
 *
 * Vertical, because the x axis is a real ordered scale and reading it left to
 * right is the point; every bar is labelled with its value underneath and its
 * count above, so the shape and the numbers arrive together.
 */
export function ColumnChart({
  bars,
  height = 132,
  colorFor,
}: {
  bars: { label: string; value: number; hint?: string }[];
  height?: number;
  colorFor?: (label: string, i: number) => string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: height + 34 }}>
      {bars.map((b, i) => (
        <div key={`${b.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={b.hint}>
          <span className="text-muted-foreground tabular text-[0.6875rem]">{b.value || ""}</span>
          <div
            className="w-full rounded-t-[4px] transition-[height] duration-[var(--duration-standard)]"
            style={{
              height: Math.max(b.value > 0 ? 3 : 1, (b.value / max) * height),
              background: b.value > 0 ? (colorFor?.(b.label, i) ?? "var(--chart-1)") : "var(--muted)",
            }}
          />
          <span className="text-muted-foreground w-full truncate text-center text-[0.6875rem]">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Two categorical axes and a count — a matrix question.
 *
 * Sequential, so one hue from light to dark: the cell's job is magnitude, and a
 * rainbow here would imply the columns mean different kinds of thing. The count
 * is printed in every cell, which is what keeps it readable for anyone the
 * shading does not reach.
 */
export function Heatmap({
  rows,
  cols,
  counts,
}: {
  rows: string[];
  cols: string[];
  counts: number[][];
}) {
  const max = Math.max(1, ...counts.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="text-muted-foreground px-1 pb-1 text-center text-xs font-medium">
                <span className="block max-w-[7rem] truncate" title={c}>
                  {c}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th className="text-muted-foreground max-w-[10rem] truncate pr-2 text-left text-xs font-medium" title={r}>
                {r}
              </th>
              {cols.map((c, ci) => {
                const n = counts[ri]?.[ci] ?? 0;
                return (
                  <td
                    key={c}
                    className="tabular rounded-md px-2 py-1.5 text-center text-xs"
                    style={{
                      background:
                        n === 0
                          ? "var(--muted)"
                          : `color-mix(in oklch, var(--chart-1) ${Math.round(18 + (n / max) * 72)}%, var(--card))`,
                    }}
                    title={`${r} · ${c}: ${n}`}
                  >
                    {n || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The legend for a chart with more than one series. Never colour alone. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="text-caption flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((s) => (
        <li key={s.label} className="text-muted-foreground flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

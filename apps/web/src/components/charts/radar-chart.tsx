"use client";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as ReRadarChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from "recharts";
import { Empty } from "./chart-kit";

/**
 * One measure across many named categories, as a shape.
 *
 * The case this exists for is feature adoption: ten capabilities, each with a
 * share of accounts using it, all measured the same way. A bar list ranks them
 * — which is the wrong question, because nobody ships against a ranking — and
 * ten rows of bars leave a card half empty. A radar answers "what does this
 * product's usage look like", and the answer is a silhouette you recognise from
 * one week to the next, so a dent appearing where there was none is visible
 * before anyone reads a number.
 *
 * Its known weakness is honoured rather than ignored: **area is not
 * comparable** — the enclosed area changes with the order of the axes, so this
 * never draws two series at once and never invites a reading of "bigger". It is
 * one shape, and every vertex is labelled with its own value in the tooltip.
 *
 * **It needs three vertices off the origin, not three axes.** Ten capabilities
 * where eight are at zero is not a shape — it is a spike and nine invisible
 * points, which reads as a chart that failed rather than as an unadopted
 * feature. `hasShape` is exported so a caller can ask before choosing this over
 * a ranked list, and the guard here is the same test.
 */

/** Whether this data would draw a polygon rather than a spike. */
export function hasShape(axes: { value: number }[]): boolean {
  return axes.filter((a) => a.value > 0).length >= 3;
}
export function RadarChart({
  axes,
  max,
  unit = "%",
  height = 260,
  color = "var(--chart-1)",
}: {
  axes: { label: string; value: number }[];
  /**
   * The outer ring. Defaults to the next round number above the largest value.
   *
   * Not 100. Adoption on a young product runs at five to fifteen percent, and
   * against a fixed 0–100 ring every one of those is a dot at the centre — a
   * chart that renders correctly and shows nothing. Scaling to the data makes
   * the differences between capabilities readable, which is the only question
   * this chart is asked; the absolute figures are in the tooltip.
   */
  max?: number;
  unit?: string;
  height?: number;
  color?: string;
}) {
  if (!hasShape(axes)) {
    return <Empty>Not enough of these are in use yet to draw a shape.</Empty>;
  }

  const peak = Math.max(...axes.map((a) => a.value), 0);
  const ceiling = max ?? Math.max(10, Math.ceil(peak / 10) * 10);

  return (
    // The floor, not the size — see the note in `pie-chart.tsx`.
    <div className="h-full min-h-0" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ReRadarChart data={axes} outerRadius="72%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            // The spokes carry the names, so a legend would be a second copy of
            // the same labels.
          />
          {/* The radius axis exists to fix the scale at 0–max. Its ticks are
              hidden: a spider chart with numbers up every spoke is unreadable,
              and the tooltip gives the exact figure on demand. */}
          <PolarRadiusAxis domain={[0, ceiling]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.22} />
          <ReTooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
            }}
            formatter={(v) => [`${v}${unit}`, ""]}
          />
        </ReRadarChart>
      </ResponsiveContainer>
    </div>
  );
}

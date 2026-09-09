"use client";

import { useId } from "react";

/**
 * The shape of a number's recent history, at the size of a line of text.
 *
 * No axes, no labels, no ticks — a sparkline that acquires them is a small bad
 * chart rather than a large piece of typography. It sits next to the figure it
 * describes and answers one question: is this going up or down, and smoothly or
 * not. The figure itself carries the magnitude.
 *
 * Drawn by hand rather than through recharts: a `ResponsiveContainer` per KPI
 * tile mounts a resize observer each, and at this size the whole component is
 * one path.
 */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  color = "var(--chart-1)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const id = useId();
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series draws down the middle rather than dividing by zero and
  // collapsing onto the baseline, which would read as "fell to nothing".
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const y = (v: number) => height - 1 - ((v - min) / span) * (height - 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      // Decorative: the value beside it is the accessible version of this.
      aria-hidden
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.24} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

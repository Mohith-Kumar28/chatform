"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { seriesColor } from "./chart-kit";

/**
 * One or more measures over time, on one shared axis.
 *
 * The rules from `chart-kit` still hold here, plus one this shape adds: **every
 * series in a frame shares a unit**. Two y-scales in one picture is the fastest
 * way to draw a correlation that is not there — put signups and revenue in the
 * same frame with different axes and the eye reads a relationship the numbers do
 * not support. So a caller who wants both draws two charts.
 *
 * The moving average is opt-in and drawn as a line over the areas rather than
 * replacing them. Daily counts on a young product are mostly weekday noise; the
 * average is what the trend actually is, and showing only the average would hide
 * the volatility that says how much to trust it.
 */

export interface TrendSeries {
  key: string;
  label: string;
  color?: string;
}

function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let k = 0; k < window; k++) sum += values[i - k] ?? 0;
    return Math.round((sum / window) * 10) / 10;
  });
}

/** "2026-09-09" → "9 Sep". Short enough that a 30-day axis does not overlap. */
function tickLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

export function TrendChart({
  days,
  series,
  data,
  height = 240,
  averageOf,
  stacked = false,
}: {
  /** `YYYY-MM-DD`, oldest first. */
  days: string[];
  series: TrendSeries[];
  data: Record<string, number[]>;
  height?: number;
  /** Draw a 7-day moving average for this series key. */
  averageOf?: string;
  stacked?: boolean;
}) {
  const rows = useMemo(() => {
    const avg = averageOf ? movingAverage(data[averageOf] ?? [], 7) : null;
    return days.map((date, i) => {
      const row: Record<string, string | number | null> = { date };
      for (const s of series) row[s.key] = data[s.key]?.[i] ?? 0;
      if (avg) row.__avg = avg[i] ?? null;
      return row;
    });
  }, [days, series, data, averageOf]);

  const empty = series.every((s) => (data[s.key] ?? []).every((v) => v === 0));

  return (
    <div className="relative" style={{ height }}>
      {empty && (
        <p className="text-muted-foreground absolute inset-0 z-1 grid place-items-center text-sm">
          Nothing recorded in this period yet
        </p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        {/*
          No negative left margin. Pulling the axis leftward saves a few pixels
          and clips the first digit off any label wider than two characters — so
          a chart reading 800 renders as "00", which is not a smaller number, it
          is a wrong one. The compact tick formatter below is what keeps the
          gutter narrow instead.
        */}
        <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? seriesColor(i)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color ?? seriesColor(i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {/* Horizontal only: the x axis is time and a vertical rule per day is
              a grid nobody reads against. */}
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="date"
            tickFormatter={tickLabel}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            // 12,400 → "12.4K". A four-figure axis label eats a third of a
            // narrow chart's width, and nobody reads an axis to the digit.
            tickFormatter={(v: number) =>
              Math.abs(v) >= 1000
                ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v)
                : String(v)
            }
          />
          <ReTooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
            }}
            labelFormatter={(d) => tickLabel(String(d))}
            formatter={(value, name) => [
              value as number,
              name === "__avg" ? "7-day average" : (series.find((s) => s.key === name)?.label ?? String(name)),
            ]}
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stackId={stacked ? "one" : undefined}
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={2}
              fill={`url(#trend-${s.key})`}
              // A dot per day turns a 365-day range into a smear.
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
          {averageOf && (
            <Line
              type="monotone"
              dataKey="__avg"
              stroke="var(--foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

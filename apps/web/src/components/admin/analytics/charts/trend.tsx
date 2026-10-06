'use client'

import { useId, type ReactNode } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { bucketTick, bucketTitle, compact, fmt, useMounted } from '../kit/format'
import { Legend } from '../kit/ui'

// Time series on the admin's buckets (epoch hours in 24h mode, UTC days otherwise). One y-axis for
// the series; the only exception is a bar chart's `backdrop`, a context area (e.g. page views behind
// clicks) on its own right-hand axis.

export type Series = { key: string; label: string; color: string }
export type TrendRow = { key: string } & Record<string, number | string>

type Props = {
  data: TrendRow[]
  series: Series[]
  kind?: 'area' | 'bar' | 'line'
  /** Bar charts only. Areas always overlap from zero: a stacked area's top line reads as its own series. */
  stacked?: boolean
  /** Admin range in days (tick density and labels). */
  range: number
  height?: number
  /** A previous-period line drawn under the data, in muted ink (same unit, same axis). */
  compare?: { key: string; label: string }
  /** Bar charts only: an area drawn behind the bars on its own right-hand axis (a different scale). */
  backdrop?: Series
  legend?: boolean
  className?: string
  empty?: ReactNode
}

export function ChartPlaceholder({ height = 240, className }: { height?: number; className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/40', className)} style={{ height }} />
}

export function configOf(series: Series[], compare?: { key: string; label: string }): ChartConfig {
  const c: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
  if (compare) c[compare.key] = { label: compare.label, color: 'var(--chart-other)' }
  return c
}

export function TrendChart({ data, series, kind = 'area', stacked = false, range, height = 240, compare, backdrop, legend = true, className, empty }: Props) {
  const mounted = useMounted()
  const id = useId().replace(/:/g, '')
  if (!mounted) return <ChartPlaceholder height={height} className={className} />
  const bg = kind === 'bar' ? backdrop : undefined
  const all = bg ? [bg, ...series] : series
  const total = data.reduce((a, r) => a + all.reduce((b, s) => b + (Number(r[s.key]) || 0), 0), 0)
  const config = configOf(all, compare)
  // Roughly six to eight labels whatever the range.
  const interval = Math.max(0, Math.ceil(data.length / 8) - 1)
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} interval={interval} tickFormatter={(k: string) => bucketTick(k, range)} />
      <YAxis tickLine={false} axisLine={false} width={40} tickMargin={4} allowDecimals={false} tickFormatter={(v: number) => compact(v)} />
      <ChartTooltip
        cursor={kind === 'bar' ? { fill: 'var(--muted)', opacity: 0.5 } : { stroke: 'var(--border)' }}
        content={<ChartTooltipContent indicator="dot" labelFormatter={(_, p) => bucketTitle(String(p?.[0]?.payload?.key ?? ''))} />}
      />
    </>
  )
  const ghost = compare ? (
    <Line dataKey={compare.key} type="monotone" stroke={`var(--color-${compare.key})`} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
  ) : null

  let chart: ReactNode
  if (kind === 'bar') {
    chart = (
      <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
        {axes}
        {bg && (
          <>
            <defs>
              <linearGradient id={`fill-${id}-${bg.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${bg.key})`} stopOpacity={0.18} />
                <stop offset="100%" stopColor={`var(--color-${bg.key})`} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis yAxisId="bg" orientation="right" tickLine={false} axisLine={false} width={40} tickMargin={4} allowDecimals={false} tickFormatter={(v: number) => compact(v)} />
            <Area
              yAxisId="bg"
              dataKey={bg.key}
              type="monotone"
              stroke={`var(--color-${bg.key})`}
              strokeWidth={1.5}
              fill={`url(#fill-${id}-${bg.key})`}
              activeDot={{ r: 3, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          </>
        )}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? 'a' : undefined}
            fill={`var(--color-${s.key})`}
            maxBarSize={24}
            // Rounded data end, square baseline: only the top segment of a stack gets the corners.
            radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
            stroke="var(--card)"
            strokeWidth={stacked ? 1 : 0}
            isAnimationActive={false}
          />
        ))}
        {ghost}
      </ComposedChart>
    )
  } else if (kind === 'line') {
    chart = (
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        {axes}
        {ghost}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive={false} />
        ))}
      </LineChart>
    )
  } else {
    chart = (
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${s.key})`} stopOpacity={0.22} />
              <stop offset="100%" stopColor={`var(--color-${s.key})`} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>
        {axes}
        {ghost}
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            fill={`url(#fill-${id}-${s.key})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    )
  }

  return (
    <div className={className}>
      {legend && (all.length > 1 || compare) && (
        <Legend
          className="mb-2"
          items={[
            // Each series with its total over the chart, so the legend answers "how many" without a hover.
            ...all.map((s) => ({ label: s.label, color: s.color, value: fmt(data.reduce((n, r) => n + (Number(r[s.key]) || 0), 0)) })),
            ...(compare ? [{ label: compare.label, color: 'var(--chart-other)' }] : []),
          ]}
        />
      )}
      <div className="relative">
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 600, height }}>
          {chart as never}
        </ChartContainer>
        {!total && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center pb-6 text-[13px] text-muted-foreground">{empty ?? 'Nothing recorded in this range yet.'}</p>
        )}
      </div>
    </div>
  )
}

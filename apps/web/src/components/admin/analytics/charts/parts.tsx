'use client'

import { useState, type ReactNode } from 'react'
import { Bar, BarChart, Cell, Label, LabelList, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, RadialBar, RadialBarChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { compact, fmt, useMounted } from '../kit/format'
import { EmptyState } from '../kit/ui'
import { ChartPlaceholder } from './trend'

// Categorical slots in validated order (styles.css). Past five, the tail folds into "Other".
export const SLOTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
export const OTHER = 'var(--chart-other)'

export type Slice = { key: string; n: number; label?: string }

/** Keeps the top `max - 1` rows and folds the rest into one "Other" row. */
export function foldOther<T extends Slice>(rows: T[], max = 5): Slice[] {
  if (rows.length <= max) return rows
  return [...rows.slice(0, max - 1), { key: 'Other', label: 'Other', n: rows.slice(max - 1).reduce((a, r) => a + r.n, 0) }]
}

/** Color for the i-th slice, with "Other" always gray. */
export const sliceColor = (s: Slice, i: number) => (s.key === 'Other' ? OTHER : SLOTS[i] ?? OTHER)

// ---------- donut ----------
/** Share of a whole. Legend beside it carries % and count, so identity never rests on color. */
export function Donut({ rows, center, size = 168, empty = 'No data in this range.', format = fmt }: { rows: Slice[]; center?: string; size?: number; empty?: ReactNode; format?: (n: number) => string }) {
  const mounted = useMounted()
  const [active, setActive] = useState<number | null>(null)
  const data = foldOther(rows.filter((r) => r.n > 0)).map((r, i) => ({ ...r, fill: sliceColor(r, i), name: r.label ?? r.key }))
  const total = data.reduce((a, r) => a + r.n, 0)
  if (!total) return <EmptyState>{empty}</EmptyState>
  const focus = active != null ? data[active] : null
  const config: ChartConfig = Object.fromEntries(data.map((d) => [d.name, { label: d.name, color: d.fill }]))
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {mounted ? (
          <ChartContainer config={config} className="aspect-square" style={{ width: size, height: size }} initialDimension={{ width: size, height: size }}>
            <PieChart>
              <Pie
                data={data}
                dataKey="n"
                nameKey="name"
                innerRadius="64%"
                outerRadius="100%"
                paddingAngle={data.length > 1 ? 1.5 : 0}
                cornerRadius={3}
                stroke="var(--card)"
                strokeWidth={1}
                isAnimationActive={false}
                onMouseEnter={(_, i) => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {data.map((d, i) => (
                  <Cell key={d.key} fill={d.fill} opacity={active == null || active === i ? 1 : 0.35} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="size-full animate-pulse rounded-full bg-muted/40" />
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="num text-lg leading-tight font-semibold">{focus ? `${Math.round((focus.n / total) * 100)}%` : format(total)}</p>
            <p className="max-w-24 truncate text-[11px] text-muted-foreground">{focus ? focus.name : (center ?? 'total')}</p>
          </div>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-1 text-[13px]">
        {data.map((d, i) => (
          <li
            key={d.key}
            className={cn('flex items-center gap-2 rounded px-1.5 py-0.5', active === i && 'bg-muted/60')}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: d.fill }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="num text-xs text-muted-foreground">{Math.round((d.n / total) * 100)}%</span>
            <span className="num w-12 text-right text-xs font-medium">{format(d.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- horizontal bars ----------
/** Ranked magnitudes with the value at the bar tip (CTR by sponsor, builds by category). */
export function HBars({
  rows,
  format = compact,
  color = 'var(--chart-1)',
  empty = 'No data in this range.',
  labelWidth = 120,
}: {
  rows: { key: string; label?: string; value: number; color?: string; hint?: string }[]
  format?: (n: number) => string
  color?: string
  empty?: ReactNode
  labelWidth?: number
}) {
  const mounted = useMounted()
  if (!rows.length || rows.every((r) => !r.value)) return <EmptyState>{empty}</EmptyState>
  const height = rows.length * 30 + 8
  if (!mounted) return <ChartPlaceholder height={height} />
  const data = rows.map((r) => ({ ...r, name: r.label ?? r.key, fill: r.color ?? color }))
  return (
    <ChartContainer config={{ value: { label: 'Value', color } }} className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 400, height }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={labelWidth} tick={{ fontSize: 12 }} interval={0} />
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent hideIndicator formatter={(v, _n, item) => (
          <div className="flex w-full justify-between gap-4">
            <span className="text-muted-foreground">{(item.payload as { hint?: string }).hint ?? 'Value'}</span>
            <span className="num font-medium">{format(Number(v))}</span>
          </div>
        )} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
          <LabelList dataKey="value" position="right" offset={6} className="fill-foreground" fontSize={11} formatter={(v: unknown) => format(Number(v))} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// ---------- radial gauge ----------
/** One rate out of 100% (approval rate, returning share, click-through). */
export function Gauge({ value, label, sub, color = 'var(--chart-1)', size = 150 }: { value: number | null; label: string; sub?: ReactNode; color?: string; size?: number }) {
  const mounted = useMounted()
  const v = value == null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size }}>
        {mounted ? (
          <ChartContainer config={{ v: { label, color } }} className="aspect-square" style={{ width: size, height: size }} initialDimension={{ width: size, height: size }}>
            <RadialBarChart data={[{ v: v * 100, fill: color }]} startAngle={90} endAngle={-270} innerRadius="74%" outerRadius="100%" barSize={12}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
              <RadialBar dataKey="v" background={{ fill: 'var(--muted)' }} cornerRadius={8} isAnimationActive={false} />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox)) return null
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 4} className="num fill-foreground text-xl font-semibold">
                          {value == null ? '–' : `${Math.round(v * 100)}%`}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 14} className="fill-muted-foreground text-[11px]">
                          {label}
                        </tspan>
                      </text>
                    )
                  }}
                />
              </PolarRadiusAxis>
            </RadialBarChart>
          </ChartContainer>
        ) : (
          <div className="size-full animate-pulse rounded-full bg-muted/40" />
        )}
      </div>
      {sub && <p className="mt-1 text-center text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ---------- 24-hour radar ----------
/** Activity by hour of day in the viewer's zone, as a clock face: the busy side bulges. */
export function HoursRadar({ values, label = 'Visitors', height = 260, note }: { values: number[]; label?: string; height?: number; note?: ReactNode }) {
  const mounted = useMounted()
  if (!values.some(Boolean)) return <EmptyState>No activity recorded yet.</EmptyState>
  if (!mounted) return <ChartPlaceholder height={height} />
  const max = Math.max(...values)
  const peak = values.indexOf(max)
  const data = values.map((n, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, n, h }))
  return (
    <div>
      <ChartContainer config={{ n: { label, color: 'var(--chart-1)' } }} className="mx-auto aspect-square" style={{ height }} initialDimension={{ width: height, height }}>
        <RadarChart data={data} outerRadius="78%">
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <PolarGrid stroke="var(--chart-grid)" />
          {/* Scale to the peak so the busiest hour touches the outer ring (the default rounds up past it). */}
          <PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false} />
          <PolarAngleAxis dataKey="hour" tick={({ x, y, payload, textAnchor }) => {
            const h = Number(String(payload.value).slice(0, 2))
            if (h % 3) return <g />
            return (
              <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="middle" className={cn('num text-[10px]', h === peak ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}>
                {String(h).padStart(2, '0')}
              </text>
            )
          }} />
          <Radar dataKey="n" fill="var(--color-n)" fillOpacity={0.22} stroke="var(--color-n)" strokeWidth={2} isAnimationActive={false} dot={{ r: 2, fillOpacity: 1 }} />
        </RadarChart>
      </ChartContainer>
      <p className="text-center text-xs text-muted-foreground">
        Busiest around <span className="num font-medium text-foreground">{String(peak).padStart(2, '0')}:00</span> your time
      </p>
      {note && <p className="mt-0.5 text-center text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

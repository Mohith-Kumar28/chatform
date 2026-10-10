'use client'

import { useMemo, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fmt, hourLabel, useMounted } from '../kit/format'

// Grid charts no chart library draws well: weekday × hour, and a GitHub-style calendar. One hue,
// light → dark (sequential), empty cells in the muted surface so "zero" never looks like "low".

const shade = (v: number, max: number) => (v ? `color-mix(in oklab, var(--chart-1) ${Math.round(14 + (v / max) * 86)}%, var(--card))` : 'var(--muted)')
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Cell({ v, max, title, children, wide = false }: { v: number; max: number; title: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`${wide ? 'h-5 sm:h-6' : 'aspect-square'} min-w-0 rounded-[2px] outline-offset-1 hover:outline-2 hover:outline-foreground/60`} style={{ background: shade(v, max) }}>
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{title}</TooltipContent>
    </Tooltip>
  )
}

function Scale({ max, label }: { max: number; label: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
      <span>Less</span>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <span key={f} className="size-2.5 rounded-[2px]" style={{ background: shade(f * max, max) }} />
      ))}
      <span>More</span>
      <span className="ml-2">{label}</span>
    </div>
  )
}

/** Counts by weekday × hour of day (viewer's zone). cells[dow 0=Mon][hour]. */
export function WeekHourHeatmap({ cells, label = 'visitors' }: { cells: number[][]; label?: string }) {
  const mounted = useMounted()
  const max = Math.max(1, ...cells.flat())
  if (!mounted) return <div className="h-56 animate-pulse rounded-md bg-muted/40" />
  return (
    <div className="space-y-2">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
        {cells.map((row, d) => (
          <div key={d} className="contents">
            <span className="self-center text-[11px] text-muted-foreground">{DOW[d]}</span>
            {row.map((v, h) => (
              <Cell key={h} wide v={v} max={max} title={<>{DOW[d]} {hourLabel(h)} · <span className="num">{fmt(v)}</span> {label}</>} />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="num flex justify-center text-[10px] whitespace-nowrap text-muted-foreground">{h % 3 ? '' : hourLabel(h)}</span>
        ))}
      </div>
      <Scale max={max} label={`peak ${fmt(max)}`} />
    </div>
  )
}

/** One cell per UTC day for the last `weeks` weeks, Monday-first columns (GitHub style, fixed cells). */
export function CalendarHeatmap({ days, weeks = 53, label }: { days: { day: string; n: number }[]; weeks?: number; label: string }) {
  const mounted = useMounted()
  const { cols, max, total, months } = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d.n]))
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
    const dow = (today.getUTCDay() + 6) % 7 // Mon = 0
    const start = new Date(today.getTime() - (dow + (weeks - 1) * 7) * 86400_000)
    const cols: { day: string; n: number; future: boolean }[][] = []
    const months: { col: number; label: string }[] = []
    for (let w = 0; w < weeks; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const t = new Date(start.getTime() + (w * 7 + d) * 86400_000)
        const key = t.toISOString().slice(0, 10)
        col.push({ day: key, n: byDay.get(key) ?? 0, future: t > today })
        if (d === 0 && t.getUTCDate() <= 7) months.push({ col: w, label: t.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) })
      }
      cols.push(col)
    }
    const vals = days.map((d) => d.n)
    return { cols, max: Math.max(1, ...vals), total: vals.reduce((a, b) => a + b, 0), months }
  }, [days, weeks])
  const CELL = 11
  const GAP = 3
  if (!mounted) return <div className="h-32 animate-pulse rounded-md bg-muted/40" />
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="w-max">
          <div className="relative mb-1 h-3.5 text-[10px] text-muted-foreground" style={{ marginLeft: 28 }}>
            {months.map((m) => (
              <span key={m.col} className="absolute" style={{ left: m.col * (CELL + GAP) }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            <div className="grid w-[25px] shrink-0 text-[10px] leading-none text-muted-foreground" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}>
              {DOW.map((d, i) => (
                <span key={d} className="self-center">{i % 2 ? '' : d}</span>
              ))}
            </div>
            <div className="grid grid-flow-col" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoColumns: `${CELL}px`, gap: GAP }}>
              {cols.flat().map((c) =>
                c.future ? (
                  <div key={c.day} />
                ) : (
                  <Cell
                    key={c.day}
                    v={c.n}
                    max={max}
                    title={
                      <>
                        {new Date(c.day + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} ·{' '}
                        <span className="num">{fmt(c.n)}</span> {label}
                      </>
                    }
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="num font-medium text-foreground">{fmt(total)}</span> {label} in the last year
        </p>
        <Scale max={max} label="" />
      </div>
    </div>
  )
}

/** Steps of a process with the share kept from the first step and from the previous one. */
export function Funnel({ steps, className }: { steps: { label: string; n: number; hint?: string }[]; className?: string }) {
  const first = steps[0]?.n ?? 0
  if (!first) return <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing entered the funnel in this range.</p>
  return (
    <ol className={cn('space-y-2.5', className)}>
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : null
        const share = s.n / first
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate" title={s.hint}>{s.label}</span>
              <span className="flex items-baseline gap-2">
                {prev != null && <span className="num text-[11px] text-muted-foreground">{prev ? `${Math.round((s.n / prev) * 100)}% of previous` : '–'}</span>}
                <span className="num font-medium">{fmt(s.n)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(share * 100, s.n ? 1.5 : 0)}%`, opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

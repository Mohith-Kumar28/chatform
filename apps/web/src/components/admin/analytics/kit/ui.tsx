'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Info, Inbox, RotateCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Spark } from '../charts/spark'
import { fmt } from './format'

// The admin console's building blocks. Dense by design: hairline borders, 8px corners, tabular
// numbers, color only where it carries meaning (series, status, deltas).

export function PageHeader({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function InfoTip({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/70 hover:text-foreground" aria-label="About this">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  )
}

/** A titled card. `flush` drops the body padding (tables that run edge to edge). */
export function Panel({
  title,
  description,
  info,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
  id,
}: {
  title?: ReactNode
  description?: ReactNode
  info?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  flush?: boolean
  id?: string
}) {
  return (
    <section id={id} className={cn('flex min-w-0 flex-col rounded-lg border bg-card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-1">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-1.5 text-[13px] font-medium">
                {title}
                {info && <InfoTip>{info}</InfoTip>}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(flush ? 'mt-2' : 'p-4 pt-2', 'min-w-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Signed change vs a previous period. `invert` when going down is the good direction. */
export function Delta({ now, prev, invert = false, className }: { now: number; prev: number | null | undefined; invert?: boolean; className?: string }) {
  if (prev == null) return null
  if (!prev) return now ? <span className={cn('text-[11px] font-medium text-muted-foreground', className)}>new</span> : null
  const d = ((now - prev) / prev) * 100
  const up = d >= 0
  const good = up !== invert
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn('num inline-flex items-center gap-0.5 rounded px-1 py-px text-[11px] font-medium', good ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad', className)}
      title={`${fmt(now)} vs ${fmt(prev)} in the previous period`}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(d) >= 10 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1)}%
    </span>
  )
}

export type StatProps = {
  label: string
  value: ReactNode
  delta?: { now: number; prev: number | null | undefined; invert?: boolean }
  sub?: ReactNode
  spark?: number[]
  to?: string
  search?: Record<string, string | undefined>
  info?: ReactNode
  tone?: 'default' | 'warn' | 'bad'
}

export function Stat({ label, value, delta, sub, spark, to, search, info, tone = 'default' }: StatProps) {
  const params = useSearchParams()
  const body = (
    <div className={cn('flex h-full flex-col bg-card px-4 py-3.5 transition-colors', to && 'group-hover:bg-muted/40')}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone !== 'default' && <span className={cn('size-1.5 rounded-full', tone === 'warn' ? 'bg-warn' : 'bg-bad')} />}
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="num text-2xl font-semibold tracking-tight">{value}</span>
        {delta && <Delta {...delta} />}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      {spark && spark.length > 1 && (
        <div className="mt-auto pt-2">
          <Spark values={spark} />
        </div>
      )}
    </div>
  )
  if (!to) return body
  return (
    // Keep the time range and the audience when jumping to another admin page.
    <Link href={`${to}?${carried(params, search)}`} className="group block h-full">
      {body}
    </Link>
  )
}

function carried(params: URLSearchParams, search?: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  for (const key of ['range', 'audience']) {
    const v = params.get(key)
    if (v) q.set(key, v)
  }
  for (const [k, v] of Object.entries(search ?? {})) if (v) q.set(k, v)
  return q.toString()
}

/** KPI cells joined into one strip by hairlines. */
export function StatStrip({ items, className }: { items: StatProps[]; className?: string }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-3 lg:grid-cols-5', 6: 'sm:grid-cols-3 xl:grid-cols-6' }[items.length] ?? 'sm:grid-cols-3 xl:grid-cols-6'
  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border', cols, className)}>
      {items.map((s) => (
        <Stat key={s.label} {...s} />
      ))}
    </div>
  )
}

/** A compact single-choice control (chart metric switches, filters). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
}: {
  value: T
  onChange: (v: T) => void
  options: readonly (readonly [T, ReactNode])[]
  label: string
  size?: 'sm' | 'xs'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border bg-muted/50 p-0.5">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-[5px] font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
            value === v ? 'bg-background text-foreground shadow-xs ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ children, icon: Icon = Inbox, className }: { children: ReactNode; icon?: typeof Inbox; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center text-[13px] text-muted-foreground', className)}>
      <Icon className="size-5 opacity-60" aria-hidden />
      <div className="max-w-sm">{children}</div>
    </div>
  )
}

/** A panel whose data didn't load (stats object restarting): says so and offers a retry, the page stays up. */
export function Degraded({ what = 'These stats', error, onRetry, className }: { what?: string; error?: string; onRetry: () => Promise<unknown>; className?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-3 rounded-md border border-warn/30 bg-warn/5 px-3 py-2.5 text-[13px]', className)}>
      <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
      <span className="min-w-0 flex-1">
        {what} didn&rsquo;t load this time. <span className="text-muted-foreground">Usually a restart after a deploy; retry in a moment.</span>
        {error && <span className="block truncate text-xs text-muted-foreground" title={error}>{error}</span>}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await onRetry().finally(() => setBusy(false))
        }}
        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
      >
        <RotateCw className={cn('size-3', busy && 'animate-spin')} /> Retry
      </button>
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  published: 'bg-good',
  approved: 'bg-good',
  accepted: 'bg-good',
  live: 'bg-good',
  active: 'bg-good',
  sent: 'bg-good',
  draft: 'bg-warn',
  new: 'bg-primary',
  queued: 'bg-primary',
  pending: 'bg-warn',
  rejected: 'bg-bad',
  failed: 'bg-bad',
  expired: 'bg-bad',
  hidden: 'bg-muted-foreground/50',
  done: 'bg-muted-foreground/50',
  removed: 'bg-muted-foreground/50',
  off: 'bg-muted-foreground/50',
  skipped: 'bg-muted-foreground/50',
}

/** A state with its dot: never color alone, the word is always there. */
export function StatusPill({ status, label, className }: { status: string; label?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium whitespace-nowrap capitalize', className)}>
      <span className={cn('size-1.5 rounded-full', STATUS_TONE[status] ?? 'bg-muted-foreground/50')} aria-hidden />
      {label ?? status}
    </span>
  )
}

export type RankedRow = { key: string; n: number; label?: ReactNode; icon?: ReactNode; href?: string }

/** Ranked horizontal bars behind the labels (Plausible style): share of total and count. */
export function RankedList({
  rows,
  empty = 'Nothing here yet.',
  limit = 8,
  valueLabel,
  color = 'var(--chart-1)',
  format = fmt,
  onSelect,
  onHover,
  active,
}: {
  rows: RankedRow[]
  empty?: ReactNode
  limit?: number
  valueLabel?: string
  color?: string
  format?: (n: number) => string
  /** Makes rows buttons (with a chevron) that report their key. */
  onSelect?: (key: string) => void
  onHover?: (key: string | null) => void
  /** Key of a row to highlight, e.g. the one hovered elsewhere. */
  active?: string | null
}) {
  const [all, setAll] = useState(false)
  if (!rows.length) return <EmptyState>{empty}</EmptyState>
  const max = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((a, r) => a + r.n, 0)
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <div>
      {valueLabel && (
        <p className="mb-1 flex justify-end gap-3 px-2 text-[11px] text-muted-foreground">
          <span className="w-9 text-right">Share</span>
          <span className="w-12 text-right">{valueLabel}</span>
          {onSelect && <span className="-ml-1 w-3.5" />}
        </p>
      )}
      <ul className="space-y-0.5" onMouseLeave={onHover && (() => onHover(null))}>
        {shown.map((r) => {
          const inner = (
            <>
              <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${(r.n / max) * 100}%`, background: `color-mix(in oklab, ${color} 13%, transparent)` }} />
              {r.icon && <span className="relative shrink-0">{r.icon}</span>}
              <span className={cn('relative min-w-0 flex-1 truncate', onSelect && 'decoration-muted-foreground/50 decoration-dotted underline-offset-[3px] group-hover:underline')}>{r.label ?? r.key}</span>
              <span className="num relative w-9 text-right text-xs text-muted-foreground">{Math.round((r.n / total) * 100)}%</span>
              <span className="num relative w-12 text-right text-xs font-medium">{format(r.n)}</span>
              {onSelect && <ChevronRight className="relative -ml-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />}
            </>
          )
          const cls = cn('relative flex items-center gap-2 rounded px-2 py-1 text-[13px]', active === r.key && 'bg-muted/60')
          return (
            <li key={r.key} title={`${r.key}: ${format(r.n)}`} onMouseEnter={onHover && (() => onHover(r.key))}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(r.key)} className={cn(cls, 'group w-full cursor-pointer text-left hover:bg-muted/60')}>
                  {inner}
                </button>
              ) : r.href ? (
                <a href={r.href} target="_blank" rel="noreferrer" className={cn(cls, 'hover:bg-muted/50')}>
                  {inner}
                </a>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > limit && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
          {all ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

/** Loading placeholder shaped like the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg border bg-card', className)} />
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      <Skeleton className="h-28" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  )
}

/** A legend for charts with two or more series (identity is never color alone). */
export function Legend({ items, className }: { items: { label: ReactNode; color: string; value?: ReactNode }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: it.color }} aria-hidden />
          {it.label}
          {it.value != null && <span className="num font-medium text-foreground">{it.value}</span>}
        </li>
      ))}
    </ul>
  )
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between gap-3 first:mt-0">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {actions}
    </div>
  )
}

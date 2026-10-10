'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

// Number and time formatting shared by every admin page. Numbers are en-US (thousands commas);
// times are the viewer's local zone, which the server can't know, so anything time-of-day renders
// only after mount (useMounted) to keep server and client HTML identical.

export const fmt = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('en-US'))

/** 1,284 · 12.9K · 4.2M */
export function compact(n: number) {
  if (Math.abs(n) < 10_000) return n.toLocaleString('en-US')
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
export const pctLabel = (a: number, b: number, digits = 0) => (b ? `${((a / b) * 100).toFixed(digits)}%` : '–')
export const ctr = (clicks: number, impressions: number) => pctLabel(clicks, impressions, 1)
export const money = (n: number) => `$${n.toLocaleString('en-US')}`

/** 45s · 12m · 3h 20m · 2d 4h */
export function duration(ms: number | null | undefined) {
  if (ms == null) return '–'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`
}

export const flag = (cc: string | null | undefined) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : ''

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
export function countryName(cc: string) {
  try {
    return regionNames?.of(cc) ?? cc
  } catch {
    return cc
  }
}

export function langName(k: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(k) ?? k
  } catch {
    return k
  }
}

/** An hour of the day on a 12-hour clock: 0 is "12 AM", 20 is "8 PM". */
export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`

/** When a bucket starts, on a 12-hour clock in the viewer's zone. Minutes show only where the zone has them: India's hours start at :30. */
export const hh = (d: Date) => {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * False on the server and during hydration, true once the page runs in the browser. Components that
 * mount after hydration get true on their first render, so they don't flash a placeholder.
 */
const noopSubscribe = () => () => {}
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

/** Re-renders every `ms` with the current time (live countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/**
 * Labels for the admin's time buckets: an epoch hour ("492873") in 24h mode, otherwise a UTC day
 * ("2026-09-25"). Hours show in the viewer's zone; days are UTC days (how the server counts them).
 */
export function bucketStart(key: string) {
  return /^\d+$/.test(key) ? Number(key) * 3600_000 : Date.parse(key)
}
export function bucketTick(key: string, range: number) {
  const s = new Date(bucketStart(key))
  if (/^\d+$/.test(key)) return hh(s)
  return s.toLocaleDateString('en-US', { timeZone: 'UTC', ...(range > 14 ? { day: 'numeric' } : { month: 'short', day: 'numeric' }) })
}
export function bucketTitle(key: string) {
  const s = new Date(bucketStart(key))
  if (/^\d+$/.test(key)) return `${s.toLocaleDateString('en-US', { weekday: 'short' })} ${hh(s)}–${hh(new Date(s.getTime() + 3600_000))}`
  return s.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
}

/** Every bucket key in the admin range, oldest first (same keys StatsDO.analytics returns). */
export function rangeKeys(days: number, now = Date.now()) {
  if (days === 1) {
    const h = Math.floor(now / 3600_000)
    return Array.from({ length: 24 }, (_, i) => String(h - 23 + i))
  }
  return Array.from({ length: days }, (_, i) => new Date(now - (days - 1 - i) * 86400_000).toISOString().slice(0, 10))
}

export const rangeLabel = (days: number) => (days === 1 ? 'last 24 hours' : `last ${days} days`)
export const unitLabel = (days: number) => (days === 1 ? 'hour' : 'day')

export function ago(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

'use client'

import { DEVICE_LABELS } from '@repo/form-schema'
import type { GetApiAdminTraffic200 } from '@/lib/api/generated.schemas'
import { RANGE_DAYS } from '../range-picker'
import { bucketStart, countryName, rangeKeys } from './kit/format'
import type { Analytics, Count } from './types'
import { OTHER, SLOTS } from './charts/parts'
import type { Series, TrendRow } from './charts/trend'

// Derived traffic numbers shared by the Dashboard and Traffic pages. Hourly counts arrive as UTC
// epoch hours; everything time-of-day is folded into the viewer's zone here (call after mount).

/** Page views by local weekday × hour, by local hour, and when hourly collection began. */
export function localHours(hours: Analytics['hours']) {
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  const byHour = Array(24).fill(0) as number[]
  for (const h of hours) {
    const t = new Date(h.hour * 3600_000)
    heat[(t.getDay() + 6) % 7][t.getHours()] += h.views
    byHour[t.getHours()] += h.views
  }
  const since = hours.length ? Math.min(...hours.map((h) => h.hour)) * 3600_000 : null
  return { heat, byHour, since }
}

/** Page views over the last 24 hours by hour, split new vs returning, whatever range is picked. */
export function last24(a: Analytics): TrendRow[] {
  const nowHour = Math.floor(Date.now() / 3600_000)
  const hourRows = new Map(a.hours.map((h) => [h.hour, h]))
  const newRows = new Map((a.newViewsByHour ?? []).map((h) => [Number(h.hour), h.n]))
  return Array.from({ length: 24 }, (_, i) => {
    const hour = nowHour - 23 + i
    const views = hourRows.get(hour)?.views ?? 0
    const fresh = Math.min(views, newRows.get(hour) ?? 0)
    return { key: String(hour), views, fresh, ret: views - fresh }
  })
}

/** Range buckets as chart rows: page views, and those from new / returning readers. */
export function bucketRows(a: Analytics): TrendRow[] {
  return a.buckets.map((b) => ({ key: b.key, views: b.views, fresh: b.newViews, ret: Math.max(0, b.views - b.newViews) }))
}

/** The one traffic chart: page views, and the new / returning split, drawn overlapping. */
export const TRAFFIC_SERIES: Series[] = [
  { key: 'views', label: 'Views', color: 'var(--chart-1)' },
  { key: 'fresh', label: 'New', color: 'var(--chart-2)' },
  { key: 'ret', label: 'Returning', color: 'var(--chart-3)' },
]


/** Page views by source per bucket: the top four sources get a series each, the rest fold into Other. */
export function sourceSeries(a: Analytics) {
  const top = a.sources.slice(0, 4).map((r) => r.key)
  // Series keys must be CSS-safe (they become --color-<key>), so sources map to s0..s3.
  const keyOf = (source: string) => {
    const i = top.indexOf(source)
    return i >= 0 ? `s${i}` : 'other'
  }
  const series: Series[] = [
    ...top.map((k, i) => ({ key: `s${i}`, label: k, color: SLOTS[i] })),
    ...(a.sources.length > 4 ? [{ key: 'other', label: 'Other', color: OTHER }] : []),
  ]
  const rows: TrendRow[] = a.buckets.map((b) => {
    const row: TrendRow = { key: b.key }
    for (const s of series) row[s.key] = 0
    for (const c of a.sourceBuckets) if (c.key === b.key) row[keyOf(c.source)] = (Number(row[keyOf(c.source)]) || 0) + c.n
    return row
  })
  return { series, rows }
}

export type Report = GetApiAdminTraffic200

function tally(rows: Count[]): Count[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + r.n)
  return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n)
}

/**
 * The API's report as the shape the panels read. Everything is a count of page views; a bucket
 * with no row is a zero, so a quiet day is a dip in the chart and not a missing point.
 */
export function toAnalytics(r: Report): Analytics {
  const hourly = r.bucket === 'hour'
  const keyOf = (at: number) => (hourly ? String(Math.floor(at / 3600_000)) : new Date(at).toISOString().slice(0, 10))
  const byKey = new Map(r.series.map((p) => [keyOf(p.at), p]))
  const buckets = rangeKeys(RANGE_DAYS[r.range]).map((key) => {
    const p = byKey.get(key)
    const views = p?.views ?? 0
    return { key, start: bucketStart(key), views, visitors: p?.visitors ?? 0, newVisitors: p?.newVisitors ?? 0, newViews: Math.min(views, p?.newViews ?? 0) }
  })
  const views = (rows: { key: string; views: number }[]) => rows.map((b) => ({ key: b.key, n: b.views }))
  return {
    granularity: r.bucket,
    buckets,
    hours: r.hourly.map((h) => ({ hour: Math.floor(h.at / 3600_000), views: h.views, visitors: h.visitors })),
    newViewsByHour: r.hourly.map((h) => ({ hour: Math.floor(h.at / 3600_000), n: h.newViews })),
    totals: {
      visitors: r.totals.visitors,
      views: r.totals.views,
      newVisitors: r.totals.newVisitors,
      returning: Math.max(0, r.totals.visitors - r.totals.newVisitors),
      newViews: buckets.reduce((n, b) => n + b.newViews, 0),
      allTime: r.allTime,
      online: r.online,
    },
    countries: tally(r.geo.map((g) => ({ key: g.country, n: g.views }))),
    cities: r.geo
      .filter((g) => g.city)
      .slice(0, 10)
      .map((g) => ({ key: g.city, country: g.country, n: g.views })),
    points: r.geo
      .filter((g) => g.lat || g.lon)
      .map((g) => ({ lat: g.lat, lon: g.lon, n: g.views, label: g.city || countryName(g.country), country: g.country })),
    places: r.geo.map((g) => ({ country: g.country, region: g.region || null, city: g.city || null, n: g.views })),
    devices: r.devices.map((d) => ({ key: DEVICE_LABELS[d.key] ?? d.key, n: d.views })),
    browsers: views(r.browsers),
    os: views(r.oses),
    referrers: views(r.referrers),
    sources: (() => {
      const signups = new Map<string, number>()
      for (const s of r.signupsBySource) signups.set(s.source, (signups.get(s.source) ?? 0) + s.signups)
      return r.sources.map((s) => ({ key: s.source, channel: s.channel, views: s.views, visits: s.visits, signups: signups.get(s.source) ?? 0 }))
    })(),
    channels: views(r.channels),
    campaigns: views(r.campaigns),
    sourceBuckets: r.sourceSeries.map((p) => ({ key: keyOf(p.at), source: p.source, n: p.views })),
    // A form reached by its link and inside an embed is one form.
    pages: tally(r.pages.map((p) => ({ key: p.path, n: p.views }))),
    landings: tally(r.entries.map((p) => ({ key: p.path, n: p.visits }))),
    languages: views(r.languages),
    loyalty: r.loyalty,
    depth: r.depth,
  }
}

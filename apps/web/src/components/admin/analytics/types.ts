// The shape every copied analytics component reads. `traffic.ts` builds it from the API's report.

export type Count = { key: string; n: number }
export type SourceRow = { key: string; channel: string; views: number; visits: number; signups: number }
// A time bucket: a UTC day ("2026-09-25") or, in 24-hour mode, an epoch hour ("492873").
export type Bucket = { key: string; start: number; views: number; visitors: number; newVisitors: number; newViews: number }
export type Analytics = {
  granularity: 'day' | 'hour'
  buckets: Bucket[]
  hours: { hour: number; views: number; visitors: number }[] // epoch hour (UTC); the client buckets into local time
  newViewsByHour: { hour: number; n: number }[] // page views by people on their first day, each of the last 24 hours
  totals: { visitors: number; views: number; newVisitors: number; returning: number; newViews: number; allTime: number; online: number }
  countries: Count[]
  cities: (Count & { country: string | null })[]
  points: { lat: number; lon: number; n: number; label: string; country: string | null }[]
  places: { country: string; region: string | null; city: string | null; n: number }[]
  devices: Count[]
  browsers: Count[]
  os: Count[]
  referrers: Count[]
  sources: SourceRow[]
  channels: Count[]
  campaigns: Count[]
  sourceBuckets: { key: string; source: string; n: number }[] // page views per bucket per source
  pages: Count[]
  landings: Count[]
  languages: Count[]
  loyalty: Count[] // page views, by how many distinct days the reader has come
  depth: Count[] // page views, by how many pages the visit opened
}

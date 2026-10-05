'use client'

import { Donut } from './charts/parts'
import { flag, langName, pct, useMounted } from './kit/format'
import { Panel, RankedList } from './kit/ui'
import type { Analytics } from './types'

// Where the page views come from (Visitors page, Audience tab): devices, pages, places, loyalty and
// languages for the selected range. Every panel counts page views.

export function Audience({ a }: { a: Analytics; days: number }) {
  const mounted = useMounted()
  const hourly = a.granularity === 'hour'
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Devices">
          <Donut rows={a.devices} center="views" empty="Devices appear as pages are viewed." />
        </Panel>
        <Panel title="Browsers">
          <Donut rows={a.browsers} center="views" empty="Browsers appear as pages are viewed." />
        </Panel>
        <Panel title="Operating systems" className="md:col-span-2 xl:col-span-1">
          <Donut rows={a.os} center="views" empty="Operating systems appear as pages are viewed." />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top pages">
          <RankedList rows={a.pages} valueLabel="Views" limit={10} empty={hourly ? 'Hourly page data is collected from now on.' : 'Pages appear as people read them.'} />
        </Panel>
        <Panel title="Landing pages" description="Where visits started">
          <RankedList rows={a.landings} valueLabel="Views" limit={10} color="var(--chart-2)" empty="Landing pages appear as people arrive." />
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Cities" description="Approximate, from IP geolocation">
          <RankedList rows={a.cities.map((c) => ({ key: c.key, n: c.n, icon: flag(c.country) }))} valueLabel="Views" limit={10} empty="Cities appear as pages are viewed." />
        </Panel>
        <Loyalty a={a} />
        <Depth a={a} />
        <Panel title="Languages" description="Browser language" className="md:col-span-2 xl:col-span-3">
          <RankedList rows={a.languages.map((l) => ({ ...l, label: mounted ? langName(l.key) : l.key }))} valueLabel="Views" limit={10} empty="Languages appear as pages are viewed." />
        </Panel>
      </div>

    </div>
  )
}

// Page views split by how many different days the reader has been on the site: ordered parts of one
// whole, so a donut, with the returning share called out in the description.
export function Loyalty({ a }: { a: Analytics }) {
  const total = a.loyalty.reduce((s, r) => s + r.n, 0)
  const back = total - (a.loyalty.find((r) => r.key === '1 day')?.n ?? 0)
  return (
    <Panel
      title="How often they come back"
      description={total ? `${pct(back, total)}% from people who came back` : 'By how many days the reader has visited'}
      info="Each page view, grouped by how many different days its reader has opened the site."
    >
      <Donut rows={a.loyalty} center="views" empty="Fills in as people return." />
    </Panel>
  )
}

export function Depth({ a }: { a: Analytics }) {
  return (
    <Panel title="How deep they go" description="By how many pages the visit opened">
      <Donut rows={a.depth} center="views" empty="Fills in as people browse." />
    </Panel>
  )
}

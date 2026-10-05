'use client'

import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Analytics } from './types'
import { WorldMap } from './charts/world-map'
import { countryName, flag, fmt, pct, useMounted } from './kit/format'
import { RankedList, type RankedRow } from './kit/ui'

// Where visitors are: the map and the country list as one panel. Picking a country (on either side)
// zooms the map into it and swaps the list for its regions and cities; Back or Esc returns to the world.

function tally(rows: { key: string; n: number; label?: RankedRow['label'] }[]): RankedRow[] {
  const m = new Map<string, RankedRow>()
  for (const r of rows) {
    const cur = m.get(r.key)
    if (cur) cur.n += r.n
    else m.set(r.key, { ...r })
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

// Only the geo fields are read, so the public sponsors page can pass its cached subset.
export function Geography({ a, unit = 'visitors' }: { a: Pick<Analytics, 'countries' | 'points' | 'places'>; unit?: 'visitors' | 'views' }) {
  const Unit = unit === 'views' ? 'Views' : 'Visitors'
  const where = unit === 'views' ? 'Where views come from' : 'Where visitors are'
  const mounted = useMounted()
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const total = a.countries.reduce((s, c) => s + c.n, 0)
  const country = selected ? a.countries.find((c) => c.key === selected) : undefined

  // The range can change under a selection; drop it if that country no longer has visitors.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the selection outlived its data
    if (selected && !country) setSelected(null)
  }, [selected, country])
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const { regions, cities } = useMemo(() => {
    const here = (a.places ?? []).filter((p) => p.country === selected)
    return {
      regions: tally(here.map((p) => ({ key: p.region ?? 'Not reported', n: p.n }))),
      cities: tally(
        here.map((p) => {
          const city = p.city ?? 'Not reported'
          return {
            key: p.region ? `${city}, ${p.region}` : city,
            n: p.n,
            label: (
              <>
                {city}
                {p.region && p.region !== city && <span className="text-muted-foreground"> · {p.region}</span>}
              </>
            ),
          }
        }),
      ),
    }
  }, [a.places, selected])

  const pick = (cc: string) => {
    setHovered(null)
    setSelected(cc)
  }

  return (
    <section className="grid min-w-0 rounded-lg border bg-card lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <div className="px-4 pt-3.5 pb-1">
          <h2 className="text-[13px] font-medium">{country ? `${where} in ${countryName(country.key)}` : where}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {country ? 'Bubbles by city · hover one for its places' : `Countries shaded by ${unit}, bubbles by city · click a country to zoom in`}
          </p>
        </div>
        <div className="p-4 pt-2">
          {mounted ? (
            <WorldMap unit={unit} points={a.points} countries={a.countries} selected={selected} hovered={hovered} onSelect={pick} onHover={setHovered} />
          ) : (
            <div className="aspect-[2.2/1]" />
          )}
        </div>
      </div>

      <div className="relative min-w-0 border-t lg:border-t-0 lg:border-l">
        <div className="flex flex-col lg:absolute lg:inset-0 lg:overflow-y-auto">
          {country ? (
            <div key={country.key} className="animate-in fade-in slide-in-from-right-2 duration-300">
              {/* Stays pinned while the regions/cities list scrolls under it (the panel only scrolls from lg). */}
              <div className="bg-card px-4 pt-3 pb-2 lg:sticky lg:top-0 lg:z-10 lg:border-b">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <ArrowLeft className="size-3.5" /> All countries
                </button>
                <h3 className="mt-2 flex items-center gap-2 text-[15px] font-medium">
                  <span>{flag(country.key)}</span>
                  {countryName(country.key)}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="num font-medium text-foreground">{fmt(country.n)}</span> {unit} ·{' '}
                  <span className="num">{pct(country.n, total)}%</span> of all
                </p>
              </div>
              <div className="px-2 pt-3 pb-4">
                <p className="mb-1 px-2 text-xs font-medium">States & regions</p>
                <RankedList rows={regions} valueLabel={Unit} limit={8} empty="Regions appear as new visitors arrive." />
                <p className="mt-5 mb-1 px-2 text-xs font-medium">Cities</p>
                <RankedList rows={cities} valueLabel={Unit} limit={10} color="var(--chart-2)" empty="Cities appear as new visitors arrive." />
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <h2 className="px-4 pt-3.5 pb-1 text-[13px] font-medium">Countries</h2>
              <div className="px-2 pt-2 pb-4">
                <RankedList
                  rows={a.countries.map((c) => ({ ...c, icon: flag(c.key), label: mounted ? countryName(c.key) : c.key }))}
                  valueLabel={Unit}
                  limit={12}
                  onSelect={pick}
                  onHover={setHovered}
                  active={hovered}
                  empty="Countries appear as new visitors arrive."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

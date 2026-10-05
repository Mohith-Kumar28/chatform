'use client'

// World map: countries shaded by visitors + clustered city bubbles, zoomable into one country. d3-geo (no chart library has a
// geographic view); the outlines load on demand so they only ship to the Traffic page.
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { countryName, fmt } from '../kit/format'

// ---------- shared tooltip ----------
type Tip = { x: number; y: number; title: string; rows: [string, string, string?][]; hint?: string } | null

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x, 90), width - 90)
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md"
      style={{ left, top: tip.y - 8 }}
    >
      <p className="mb-1 font-medium">{tip.title}</p>
      {tip.rows.map(([label, value, color]) => (
        <p key={label} className="flex items-center gap-2 text-muted-foreground">
          {color && <span className="size-2 rounded-full" style={{ background: color }} />}
          <span>{label}</span>
          <span className="ml-auto pl-3 num text-foreground">{value}</span>
        </p>
      ))}
      {tip.hint && <p className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">{tip.hint}</p>}
    </div>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// ---------- world map: countries shaded by visitors + clustered city bubbles ----------
type Point = { lat: number; lon: number; n: number; label: string; country?: string | null }

// world-atlas names that don't match Intl's English region names, keyed by ISO alpha-2.
const ATLAS_NAME: Record<string, string> = {
  US: 'United States of America', CD: 'Dem. Rep. Congo', CG: 'Congo', DO: 'Dominican Rep.', FK: 'Falkland Is.', TF: 'Fr. S. Antarctic Lands',
  CI: "Côte d'Ivoire", CF: 'Central African Rep.', GQ: 'Eq. Guinea', SZ: 'eSwatini', PS: 'Palestine', MM: 'Myanmar', TR: 'Turkey',
  SB: 'Solomon Is.', BA: 'Bosnia and Herz.', MK: 'Macedonia', TT: 'Trinidad and Tobago', SS: 'S. Sudan', EH: 'W. Sahara',
}
const atlasName = (cc: string) => ATLAS_NAME[cc] ?? countryName(cc)

type Cluster = { x: number; y: number; n: number; members: Point[] }

// Greedy pixel clustering: biggest places first; anything whose bubble would overlap an existing
// bubble merges into it (weighted centre), so dense regions read as one bigger dot, not a smear.
function clusterPoints(points: Point[], project: (p: [number, number]) => [number, number] | null, radius: (n: number) => number) {
  const out: Cluster[] = []
  for (const p of [...points].sort((a, b) => b.n - a.n)) {
    const xy = project([p.lon, p.lat])
    if (!xy) continue
    const hit = out.find((c) => Math.hypot(c.x - xy[0], c.y - xy[1]) < (radius(c.n) + radius(p.n)) * 0.7)
    if (hit) {
      const n = hit.n + p.n
      hit.x = (hit.x * hit.n + xy[0] * p.n) / n
      hit.y = (hit.y * hit.n + xy[1] * p.n) / n
      hit.n = n
      hit.members.push(p)
    } else out.push({ x: xy[0], y: xy[1], n: p.n, members: [p] })
  }
  return out
}

// A country's main landmass: drops far-off parts (Alaska and Hawaii, French Guiana, Chukotka across
// the date line) so zooming frames the country people picture, not a whole hemisphere.
function mainland(f: GeoJSON.Feature, area: (o: GeoJSON.Feature) => number): GeoJSON.Feature {
  if (f.geometry?.type !== 'MultiPolygon') return f
  const parts = f.geometry.coordinates.map((c) => ({ c, a: area({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } }) }))
  const max = Math.max(...parts.map((p) => p.a))
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: parts.filter((p) => p.a >= max * 0.3).map((p) => p.c) } }
}

const NO_COUNTRIES: { key: string; n: number }[] = []
const ZOOM_EASE = 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)'

type Geo = { features: GeoJSON.Feature[]; d3: typeof import('d3-geo') }
function loadAtlas(which: '110m' | '50m') {
  const atlas = which === '110m' ? import('world-atlas/countries-110m.json') : import('world-atlas/countries-50m.json')
  return Promise.all([atlas, import('topojson-client'), import('d3-geo')]).then(([atlas, topo, d3]): Geo => {
    const t = (atlas.default ?? atlas) as unknown as Parameters<typeof topo.feature>[0]
    const fc = topo.feature(t, t.objects.countries) as unknown as GeoJSON.FeatureCollection
    return { features: fc.features.filter((f) => f.properties?.name !== 'Antarctica'), d3 }
  })
}

/**
 * Countries shaded by visitors with clustered city bubbles. With `selected` (an ISO code) the map
 * zooms into that country and shows only its places; `hovered` highlights a country from outside.
 */
export function WorldMap({
  points,
  countries = NO_COUNTRIES,
  selected = null,
  hovered = null,
  onSelect,
  onHover,
  unit = 'visitors',
}: {
  unit?: 'visitors' | 'views'
  points: Point[]
  countries?: { key: string; n: number }[]
  selected?: string | null
  hovered?: string | null
  onSelect?: (cc: string) => void
  onHover?: (cc: string | null) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [geo, setGeo] = useState<Geo | null>(null)
  // Finer outlines, fetched the first time someone zooms in (the 110m set is too coarse up close
  // and leaves out small countries like Singapore).
  const [fine, setFine] = useState<Geo | null>(null)
  const [hover, setHover] = useState<{ kind: 'bubble'; i: number } | { kind: 'country'; cc: string; x: number; y: number } | null>(null)
  const [failed, setFailed] = useState(false)
  // New data can have fewer clusters than the hovered index: drop the hover rather than read past the end.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the hover indexes into data that just changed
  useEffect(() => setHover(null), [points, countries, selected])
  useEffect(() => {
    // Loaded on demand so the country outlines only ship to this page.
    loadAtlas('110m').then(setGeo, () => setFailed(true))
  }, [])
  useEffect(() => {
    if (selected && !fine) loadAtlas('50m').then(setFine, () => {})
  }, [selected, fine])
  const height = Math.round(width * 0.46)
  const byCode = useMemo(() => new Map(countries.map((c) => [c.key, c])), [countries])
  const codeByName = useMemo(() => new Map(countries.map((c) => [atlasName(c.key), c.key])), [countries])
  const total = countries.reduce((a, c) => a + c.n, 0)
  const maxCountry = Math.max(1, ...countries.map((c) => c.n))

  // The world projection is always fitted to the coarse outlines so swapping in the fine ones doesn't shift anything.
  const shapes = fine ?? geo
  const { paths, proj, path } = useMemo(() => {
    if (!geo || !shapes) return { paths: [] as { name: string; d: string; f: GeoJSON.Feature }[], proj: null, path: null }
    const proj = geo.d3.geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [width - 4, height - 4],
      ],
      { type: 'FeatureCollection', features: geo.features } as never,
    )
    const path = geo.d3.geoPath(proj)
    return { paths: shapes.features.map((f) => ({ name: String(f.properties?.name ?? ''), d: path(f) ?? '', f })), proj, path }
  }, [geo, shapes, width, height])

  // Zoom: scale + translate the drawn world so the selected country fills ~80% of the frame.
  const zoom = useMemo(() => {
    if (!selected || !proj || !path || !shapes) return { k: 1, x: 0, y: 0 }
    const f = paths.find((p) => p.name === atlasName(selected))?.f
    let box: [[number, number], [number, number]] | null = f ? path.bounds(mainland(f, shapes.d3.geoArea)) : null
    if (!box || !Number.isFinite(box[0][0])) {
      // No outline for it: frame its visitors instead.
      const xy = points.filter((p) => p.country === selected).map((p) => proj([p.lon, p.lat])).filter((v): v is [number, number] => !!v)
      if (!xy.length) return { k: 1, x: 0, y: 0 }
      const xs = xy.map((v) => v[0])
      const ys = xy.map((v) => v[1])
      box = [
        [Math.min(...xs) - 4, Math.min(...ys) - 4],
        [Math.max(...xs) + 4, Math.max(...ys) + 4],
      ]
    }
    const [[x0, y0], [x1, y1]] = box
    const k = Math.min(40, Math.max(1, 0.8 * Math.min(width / Math.max(1, x1 - x0), height / Math.max(1, y1 - y0))))
    return { k, x: width / 2 - k * ((x0 + x1) / 2), y: height / 2 - k * ((y0 + y1) / 2) }
  }, [selected, proj, path, paths, shapes, points, width, height])

  // Bubbles live outside the zoomed group (so they don't scale); they're clustered in screen space.
  const shown = useMemo(() => (selected ? points.filter((p) => p.country === selected) : points), [points, selected])
  const maxN = Math.max(1, ...shown.map((p) => p.n))
  const rMax = Math.max(14, Math.min(28, width / 34))
  const radius = (n: number) => 4 + Math.sqrt(n / maxN) * (rMax - 4)
  const clusters = useMemo(() => {
    if (!proj) return []
    const project = (p: [number, number]) => {
      const xy = proj(p)
      return xy ? ([xy[0] * zoom.k + zoom.x, xy[1] * zoom.k + zoom.y] as [number, number]) : null
    }
    return clusterPoints(shown, project, radius)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `radius` is a function of `shown` and `width`, both listed
  }, [shown, proj, zoom, width])
  const maxCluster = Math.max(1, ...clusters.map((c) => c.n))
  const cr = (n: number) => 4 + Math.sqrt(n / maxCluster) * (rMax - 4)
  const shade = (n: number, boost = 0) => `color-mix(in oklab, var(--chart-1) ${Math.round(14 + boost + Math.sqrt(n / maxCountry) * 46)}%, var(--muted))`
  const highlight = hover?.kind === 'country' ? hover.cc : hovered

  let tip: Tip = null
  if (hover?.kind === 'bubble' && clusters[hover.i]) {
    const c = clusters[hover.i]
    const places = [...c.members].sort((a, b) => b.n - a.n)
    tip = {
      x: c.x,
      y: c.y - cr(c.n),
      title: places.length > 1 ? `${places[0].label || 'Unknown'} + ${places.length - 1} nearby` : places[0].label || 'Unknown',
      rows: [...places.slice(0, 5).map((p) => [p.label || 'Unknown', fmt(p.n)] as [string, string]), ...(places.length > 1 ? [['Total', fmt(c.n)] as [string, string]] : [])],
      hint: !selected && onSelect && places[0].country ? `Click to zoom into ${countryName(places[0].country)}` : undefined,
    }
  } else if (hover?.kind === 'country') {
    const c = byCode.get(hover.cc)
    tip = {
      x: hover.x,
      y: hover.y,
      title: countryName(hover.cc),
      rows: [
        [unit === 'views' ? 'Views' : 'Visitors', fmt(c?.n ?? 0)],
        ['Share', `${Math.round(((c?.n ?? 0) / Math.max(1, total)) * 100)}%`],
      ],
      hint: onSelect && hover.cc !== selected ? 'Click to zoom in' : undefined,
    }
  }
  const legend = [maxCluster, Math.max(1, Math.round(maxCluster / 4)), 1].filter((v, i, a) => a.indexOf(v) === i)
  const outline = highlight ? paths.find((p) => p.name === atlasName(highlight)) : undefined
  // Up close, name the biggest places so the bubbles read without hovering.
  const labelled = selected ? new Set([...clusters].sort((a, b) => b.n - a.n).slice(0, 8)) : null

  return (
    <div
      ref={ref}
      className="relative"
      onMouseLeave={() => {
        setHover(null)
        onHover?.(null)
      }}
    >
      <svg width={width} height={height} role="img" aria-label={selected ? `Map of ${unit} by location in ${countryName(selected)}` : `Map of ${unit} by location`}>
        <defs>
          <radialGradient id="bubble-glow">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </radialGradient>
        </defs>
        <g style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})`, transformOrigin: '0 0', transition: ZOOM_EASE }}>
          {paths.map((p) => {
            const cc = codeByName.get(p.name)
            const c = cc ? byCode.get(cc) : undefined
            const dim = selected && cc !== selected
            return (
              <path
                key={p.name}
                d={p.d}
                fill={c ? shade(c.n, cc === highlight ? 16 : 0) : 'var(--muted)'}
                fillOpacity={dim ? 0.45 : 1}
                stroke="var(--card)"
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
                className={cn('transition-[fill,fill-opacity] duration-200', c && cc !== selected && onSelect && 'cursor-pointer')}
                onMouseMove={(e) => {
                  if (!cc || !c) {
                    setHover(null)
                    return onHover?.(null)
                  }
                  const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
                  setHover({ kind: 'country', cc, x: e.clientX - r.left, y: e.clientY - r.top })
                  if (highlight !== cc) onHover?.(cc)
                }}
                onClick={() => cc && c && cc !== selected && onSelect?.(cc)}
              />
            )
          })}
          {outline && (
            <path d={outline.d} fill="none" stroke="var(--chart-1)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </g>
        {/* Re-keyed per view so the bubbles fade in once the zoom has mostly settled. Biggest first so smaller ones stay on top and hoverable. */}
        <g key={selected ?? 'world'} className="animate-in fade-in" style={{ animationDuration: '400ms', animationDelay: selected ? '450ms' : '250ms', animationFillMode: 'both' }}>
          {clusters.map((c, i) => {
            const top = [...c.members].sort((a, b) => b.n - a.n)[0]
            return (
              <g
                key={`${Math.round(c.x)},${Math.round(c.y)}`}
                onMouseEnter={() => setHover({ kind: 'bubble', i })}
                onClick={() => !selected && top.country && byCode.has(top.country) && onSelect?.(top.country)}
                className={!selected && onSelect && top.country ? 'cursor-pointer' : 'cursor-default'}
              >
                <circle cx={c.x} cy={c.y} r={cr(c.n) * 1.9} fill="url(#bubble-glow)" pointerEvents="none" />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={cr(c.n)}
                  fill="var(--chart-1)"
                  fillOpacity={hover?.kind === 'bubble' && hover.i === i ? 0.95 : 0.78}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                {cr(c.n) >= 11 && (
                  <text x={c.x} y={c.y + 3.5} textAnchor="middle" className="pointer-events-none fill-white num text-[10px] font-medium">
                    {c.n >= 1000 ? `${(c.n / 1000).toFixed(1)}k` : c.n}
                  </text>
                )}
                {labelled?.has(c) && top.label && (
                  <text
                    x={c.x + cr(c.n) + 4}
                    y={c.y + 3.5}
                    className="pointer-events-none fill-foreground text-[11px] font-medium"
                    stroke="var(--card)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {top.label}
                    {c.members.length > 1 ? ` +${c.members.length - 1}` : ''}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      {clusters.length > 0 && (
        <div className="pointer-events-none absolute bottom-1 left-1 flex items-end gap-2 rounded-md bg-card/80 px-2 py-1 text-[10px] text-muted-foreground">
          {legend.map((v) => (
            <span key={v} className="flex flex-col items-center gap-0.5">
              <svg width={cr(v) * 2 + 2} height={cr(v) * 2 + 2}>
                <circle cx={cr(v) + 1} cy={cr(v) + 1} r={cr(v)} fill="var(--chart-1)" fillOpacity={0.78} />
              </svg>
              {fmt(v)}
            </span>
          ))}
          <span className="pb-0.5 pl-1">{selected ? `${unit} by city` : `${unit} · shading = by country`}</span>
        </div>
      )}
      <Tooltip tip={tip} width={width} />
      {failed && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">The map outlines didn’t load. Reload to try again.</p>}
      {!points.length && !countries.length && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Locations appear as new visitors arrive.</p>
      )}
      {selected && !shown.length && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">No city locations for these visitors yet.</p>
      )}
    </div>
  )
}

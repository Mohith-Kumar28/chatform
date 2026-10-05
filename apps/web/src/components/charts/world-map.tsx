"use client";

import { memo, useMemo, useRef, useState } from "react";
import { COUNTRY_SHAPES, WORLD_HEIGHT, WORLD_TOP_LAT, WORLD_WIDTH } from "./world-path";

export interface MapPoint {
  lat: number;
  lon: number;
  count: number;
  /** How many of `count` finished. The rest are drawn in the "didn't finish" colour. */
  completed: number;
  /** "Brooklyn, New York, United States": what the hover says. */
  label: string;
  /** Emoji flag for the hover, or "". */
  flag?: string;
  /** ISO 3166 alpha-2, which country's shading and zoom the dot belongs to. */
  country?: string | null;
  /** Lit up while the list beside the map hovers this dot's region. */
  highlight?: boolean;
}

export interface MapCountry {
  count: number;
  completed: number;
  /** "India", for the hover. */
  name: string;
  flag?: string;
}

const K = WORLD_WIDTH / 360;
const x = (lon: number) => (lon + 180) * K;
const y = (lat: number) => (WORLD_TOP_LAT - lat) * K;

/** The quietest place, in screen-sized viewBox units (the map is 1000 wide, ~800px on screen). */
const R_MIN = 8;
/** The busiest place. */
const R_MAX = 28;
/** Every place the same size, which is where every young form starts. */
const R_EVEN = 17;
/** Most a zoom magnifies, so a country the size of a city does not fill the card with one dot. */
const MAX_ZOOM = 12;
/** Least a zoomed country is framed as, in world units, for the ones too small to draw. */
const MIN_FRAME = 24;

/**
 * Between R_MIN and R_MAX, by where a place sits between the quietest and the
 * busiest. By area (the square root), so twice the people is twice the ink.
 *
 * Until the counts differ there is nothing to compare, so every dot is one
 * comfortable size. A log-scaled ceiling was tried first and drew a form's
 * first handful of responses as specks nobody could find on the map.
 */
function radius(count: number, min: number, max: number): number {
  if (max <= min) return R_EVEN;
  return R_MIN + Math.sqrt((count - min) / (max - min)) * (R_MAX - R_MIN);
}

/** The translate and scale that fit `box` in the map with a margin, centred. */
function frame(box: [number, number, number, number]): { s: number; tx: number; ty: number } {
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = Math.max(x1 - x0, MIN_FRAME);
  const h = Math.max(y1 - y0, MIN_FRAME);
  const s = Math.min(MAX_ZOOM, (WORLD_WIDTH * 0.85) / w, (WORLD_HEIGHT * 0.85) / h);
  return { s, tx: WORLD_WIDTH / 2 - cx * s, ty: WORLD_HEIGHT / 2 - cy * s };
}

type Hover = { kind: "dot"; p: MapPoint } | { kind: "country"; code: string };

/**
 * Where responses came from: countries shaded by how many, one dot per city.
 *
 * Area rather than radius tracks the count, so a city with four times the
 * responses reads as four times the ink rather than sixteen. Each dot is two
 * discs on one centre: the outer one is everyone who started there, in the
 * "didn't finish" colour, and the inner one is the share of them who finished,
 * again by area. A solid dot finished; a ring with a small core is where people
 * are giving up.
 *
 * Clicking a country hands it to `onSelect`; with `focus` set the map zooms to
 * that country, fades the rest, and sizes the dots against each other within
 * it, so a country with one big city still shows its small ones apart. Dots
 * and borders keep their screen size through the zoom.
 */
export function WorldMap({
  points,
  countries,
  focus = null,
  hoverCountry = null,
  onHoverCountry,
  onSelect,
}: {
  points: MapPoint[];
  countries: Record<string, MapCountry>;
  focus?: string | null;
  /** Owned by the parent, so the list beside the map and the map light up together. */
  hoverCountry?: string | null;
  onHoverCountry?: (code: string | null) => void;
  onSelect?: (code: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [cursor, setCursor] = useState<{ left: number; top: number } | null>(null);

  const visible = useMemo(
    () => (focus ? points.filter((p) => p.country === focus) : points),
    [points, focus],
  );

  const view = useMemo(() => {
    if (!focus) return { s: 1, tx: 0, ty: 0 };
    const shape = COUNTRY_SHAPES[focus];
    if (shape) return frame(shape.box);
    if (visible.length === 0) return { s: 1, tx: 0, ty: 0 };
    const xs = visible.map((p) => x(p.lon));
    const ys = visible.map((p) => y(p.lat));
    return frame([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }, [focus, visible]);

  const dots = useMemo(() => {
    const counts = visible.map((p) => p.count);
    const max = Math.max(1, ...counts);
    const min = Math.min(max, ...counts);
    return (
      [...visible]
        // Biggest first, so a small city beside a big one stays on top and hoverable.
        .sort((a, b) => b.count - a.count)
        .map((p) => {
          const r = radius(p.count, min, max) / view.s;
          const share = p.count > 0 ? Math.min(1, p.completed / p.count) : 0;
          return { p, cx: x(p.lon), cy: y(p.lat), r, inner: r * Math.sqrt(share) };
        })
    );
  }, [visible, view.s]);

  const maxCountry = useMemo(() => Math.max(1, ...Object.values(countries).map((c) => c.count)), [countries]);

  const tip = hover?.kind === "dot" ? hover.p : hover?.kind === "country" ? countries[hover.code] : null;
  const litCountry = hover?.kind === "country" ? hover.code : hoverCountry;

  function move(e: React.MouseEvent) {
    const box = wrap.current?.getBoundingClientRect();
    if (box) setCursor({ left: e.clientX - box.left, top: e.clientY - box.top });
  }

  function enterCountry(code: string | null) {
    setHover(code ? { kind: "country", code } : null);
    onHoverCountry?.(code);
  }

  return (
    <div ref={wrap} className="relative overflow-hidden" onMouseMove={move} onMouseLeave={() => enterCountry(null)}>
      <svg
        viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Map of ${visible.length} places responses came from`}
      >
        <g
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
            transformOrigin: "0 0",
            transition: "transform 500ms cubic-bezier(0.2, 0, 0, 1)",
          }}
        >
          <Countries
            countries={countries}
            max={maxCountry}
            focus={focus}
            lit={litCountry}
            onEnter={enterCountry}
            onSelect={onSelect}
          />
          {dots.map(({ p, cx, cy, r, inner }) => {
            const active = (hover?.kind === "dot" && hover.p === p) || p.highlight;
            return (
              <g
                key={`${p.lat},${p.lon},${p.label}`}
                className={onSelect && !focus && p.country ? "cursor-pointer" : "cursor-default"}
                onMouseEnter={() => {
                  setHover({ kind: "dot", p });
                  onHoverCountry?.(p.country ?? null);
                }}
                onMouseLeave={() => enterCountry(null)}
                onClick={() => !focus && p.country && onSelect?.(p.country)}
              >
                {/* Translucent with a firmer edge: the land shows through, and two
                    overlapping places still read as two circles. */}
                <circle
                  cx={cx}
                  cy={cy}
                  style={{ r, transition: "r 500ms cubic-bezier(0.2, 0, 0, 1), fill-opacity 150ms" }}
                  fill="var(--chart-2)"
                  fillOpacity={active ? 0.6 : 0.32}
                  stroke="var(--chart-2)"
                  strokeOpacity={0.8}
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
                {inner > 0 && (
                  <circle
                    cx={cx}
                    cy={cy}
                    style={{ r: inner, transition: "r 500ms cubic-bezier(0.2, 0, 0, 1)" }}
                    fill="var(--chart-1)"
                    fillOpacity={active ? 0.85 : 0.6}
                    stroke="var(--chart-1)"
                    strokeOpacity={0.9}
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
                {/* A bigger invisible target than the smallest dots draw. */}
                <circle cx={cx} cy={cy} r={Math.max(r, 6 / view.s)} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>
      {tip && cursor && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
          style={{ left: cursor.left, top: cursor.top - 12 }}
        >
          <p className="font-medium">
            {tip.flag && <span className="mr-1">{tip.flag}</span>}
            {"label" in tip ? tip.label : tip.name}
          </p>
          <p className="text-muted-foreground tabular mt-0.5">
            {tip.count} started · {tip.completed} finished
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Every country, shaded by its share of the busiest one. By square root, like
 * the dots, so the runner-up to a country with ten times the people is still
 * visibly tinted rather than indistinguishable from none.
 *
 * Memoised apart from the dots: hovering a dot re-renders a handful of circles
 * and never the 120KB of coastline.
 */
const Countries = memo(function Countries({
  countries,
  max,
  focus,
  lit,
  onEnter,
  onSelect,
}: {
  countries: Record<string, MapCountry>;
  max: number;
  focus: string | null;
  lit: string | null;
  onEnter: (code: string | null) => void;
  onSelect?: (code: string) => void;
}) {
  return (
    <g strokeLinejoin="round">
      {Object.entries(COUNTRY_SHAPES).map(([code, { d }]) => {
        const c = countries[code];
        const faded = focus !== null && code !== focus;
        const on = lit === code;
        const clickable = !!c && !!onSelect && focus !== code;
        // Zoomed in, the country is the backdrop for its dots, so it steps back.
        const opacity = !c ? 0 : focus === code ? 0.18 : 0.14 + Math.sqrt(c.count / max) * 0.46;
        return (
          <path
            key={code}
            d={d}
            fill={c ? "var(--chart-1)" : "var(--muted-foreground)"}
            fillOpacity={faded ? (c ? opacity * 0.35 : 0.08) : c ? (on ? opacity + 0.15 : opacity) : 0.2}
            stroke={on && c ? "var(--chart-1)" : "var(--card)"}
            strokeWidth={on && c ? 1.4 : 0.6}
            vectorEffect="non-scaling-stroke"
            className={clickable ? "cursor-pointer transition-[fill-opacity] duration-150" : "transition-[fill-opacity] duration-150"}
            onMouseEnter={c ? () => onEnter(code) : undefined}
            onMouseLeave={c ? () => onEnter(null) : undefined}
            onClick={clickable ? () => onSelect!(code) : undefined}
          />
        );
      })}
    </g>
  );
});

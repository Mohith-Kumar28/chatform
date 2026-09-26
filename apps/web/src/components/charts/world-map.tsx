"use client";

import { memo, useMemo, useState } from "react";
import { WORLD_HEIGHT, WORLD_PATH, WORLD_TOP_LAT, WORLD_WIDTH } from "./world-path";

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
}

const K = WORLD_WIDTH / 360;
const x = (lon: number) => (lon + 180) * K;
const y = (lat: number) => (WORLD_TOP_LAT - lat) * K;

/** The quietest place, in viewBox units (the map is 1000 wide, ~800px on screen). */
const R_MIN = 8;
/** The busiest place. */
const R_MAX = 28;
/** Every place the same size, which is where every young form starts. */
const R_EVEN = 17;

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

/**
 * Where responses came from, one dot per city, sized by how many.
 *
 * Area rather than radius tracks the count, so a city with four times the
 * responses reads as four times the ink rather than sixteen. Each dot is two
 * discs on one centre: the outer one is everyone who started there, in the
 * "didn't finish" colour, and the inner one is the share of them who finished,
 * again by area. A solid dot finished; a ring with a small core is where people
 * are giving up.
 *
 * The land is one static path and memoised apart from the dots, so hovering
 * re-renders a handful of circles and never the 25KB of coastline.
 */
export function WorldMap({ points }: { points: MapPoint[] }) {
  const [hover, setHover] = useState<MapPoint | null>(null);

  const dots = useMemo(() => {
    const counts = points.map((p) => p.count);
    const max = Math.max(1, ...counts);
    const min = Math.min(max, ...counts);
    return (
      [...points]
        // Biggest first, so a small city beside a big one stays on top and hoverable.
        .sort((a, b) => b.count - a.count)
        .map((p) => {
          const r = radius(p.count, min, max);
          const share = p.count > 0 ? Math.min(1, p.completed / p.count) : 0;
          return { p, cx: x(p.lon), cy: y(p.lat), r, inner: r * Math.sqrt(share) };
        })
    );
  }, [points]);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Map of ${points.length} places responses came from`}
      >
        <Land />
        {dots.map(({ p, cx, cy, r, inner }) => {
          const active = hover === p;
          return (
            <g
              key={`${p.lat},${p.lon}`}
              className="cursor-default"
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover((h) => (h === p ? null : h))}
            >
              {/* Translucent with a firmer edge: the land shows through, and two
                  overlapping places still read as two circles. */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--chart-2)"
                fillOpacity={active ? 0.55 : 0.32}
                stroke="var(--chart-2)"
                strokeOpacity={0.8}
                strokeWidth={1.2}
                className="transition-[fill-opacity] duration-150"
              />
              {inner > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={inner}
                  fill="var(--chart-1)"
                  fillOpacity={active ? 0.8 : 0.6}
                  stroke="var(--chart-1)"
                  strokeOpacity={0.9}
                  strokeWidth={1.2}
                  pointerEvents="none"
                />
              )}
              {/* A bigger invisible target than the smallest dots draw. */}
              <circle cx={cx} cy={cy} r={Math.max(r, 6)} fill="transparent">
                <title>{`${p.label}: ${p.count}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
          style={{
            left: `${(x(hover.lon) / WORLD_WIDTH) * 100}%`,
            top: `calc(${(y(hover.lat) / WORLD_HEIGHT) * 100}% - 12px)`,
          }}
        >
          <p className="font-medium">
            {hover.flag && <span className="mr-1">{hover.flag}</span>}
            {hover.label}
          </p>
          <p className="text-muted-foreground tabular mt-0.5">
            {hover.count} started · {hover.completed} finished
          </p>
        </div>
      )}
    </div>
  );
}

/** Land in the muted ink at low strength, borders cut in the card colour: reads in both themes. */
const Land = memo(function Land() {
  return <path d={WORLD_PATH} fill="var(--muted-foreground)" fillOpacity={0.2} stroke="var(--card)" strokeWidth={0.6} />;
});

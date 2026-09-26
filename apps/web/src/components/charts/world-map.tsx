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

/** Smallest dot, in viewBox units (the map is 1000 wide): still a hover target. */
const R_MIN = 2.2;
/** Largest dot, for the busiest place on a busy form. */
const R_MAX = 15;

/**
 * The radius for the busiest place, which depends on how busy that is.
 *
 * Scaling only against the leader made one response in each of three cities
 * three of the biggest dots the map can draw, which says "lots of people here"
 * about three people. The ceiling now grows with the leader's count, on a log
 * scale: one response is a dot, a hundred is a disc, and nothing grows past
 * R_MAX however big the form gets.
 */
function topRadius(max: number): number {
  return Math.min(R_MAX, 3.2 + 2.6 * Math.log2(Math.max(1, max)));
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
    const max = Math.max(1, ...points.map((p) => p.count));
    const top = topRadius(max);
    return (
      [...points]
        // Biggest first, so a small city beside a big one stays on top and hoverable.
        .sort((a, b) => b.count - a.count)
        .map((p) => {
          const r = R_MIN + Math.sqrt(p.count / max) * (top - R_MIN);
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
              {/* A ring in the card colour, so overlapping dots stay two marks. */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--chart-2)"
                fillOpacity={active ? 0.95 : 0.75}
                stroke="var(--card)"
                strokeWidth={1}
                className="transition-[fill-opacity] duration-150"
              />
              {inner > 0 && (
                <circle cx={cx} cy={cy} r={inner} fill="var(--chart-1)" fillOpacity={active ? 1 : 0.9} pointerEvents="none" />
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

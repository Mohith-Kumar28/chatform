"use client";

import { useState } from "react";
import { WORLD_HEIGHT, WORLD_PATH, WORLD_TOP_LAT, WORLD_WIDTH } from "./world-path";

export interface MapPoint {
  lat: number;
  lon: number;
  count: number;
  /** "Brooklyn, New York, United States": what the hover says. */
  label: string;
}

const K = WORLD_WIDTH / 360;

/**
 * Where responses came from, one dot per city, sized by how many.
 *
 * Area rather than radius tracks the count, so a city with four times the
 * responses reads as four times the ink rather than sixteen. One hue: the map
 * says "where" and the size says "how many", and nothing else is encoded.
 */
export function WorldMap({ points }: { points: MapPoint[] }) {
  const [hover, setHover] = useState<MapPoint | null>(null);
  const max = Math.max(1, ...points.map((p) => p.count));
  // Biggest first, so a small city beside a big one stays on top and hoverable.
  const sorted = [...points].sort((a, b) => b.count - a.count);

  const x = (lon: number) => (lon + 180) * K;
  const y = (lat: number) => (WORLD_TOP_LAT - lat) * K;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Map of ${points.length} places responses came from`}
      >
        {/* Land in the muted ink at low strength, borders cut in the card colour: reads in both themes. */}
        <path d={WORLD_PATH} fill="var(--muted-foreground)" fillOpacity={0.2} stroke="var(--card)" strokeWidth={0.6} />
        {sorted.map((p) => {
          const r = 3 + Math.sqrt(p.count / max) * 11;
          const active = hover === p;
          return (
            <circle
              key={`${p.lat},${p.lon}`}
              cx={x(p.lon)}
              cy={y(p.lat)}
              r={r}
              fill="var(--chart-1)"
              fillOpacity={active ? 0.9 : 0.55}
              stroke="var(--chart-1)"
              strokeWidth={1}
              className="cursor-default transition-[fill-opacity] duration-150"
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover((h) => (h === p ? null : h))}
            >
              <title>{`${p.label}: ${p.count}`}</title>
            </circle>
          );
        })}
      </svg>
      {hover && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
          style={{
            left: `${(x(hover.lon) / WORLD_WIDTH) * 100}%`,
            top: `calc(${(y(hover.lat) / WORLD_HEIGHT) * 100}% - 10px)`,
          }}
        >
          <span className="font-medium">{hover.label}</span>
          <span className="text-muted-foreground"> · {hover.count} {hover.count === 1 ? "response" : "responses"}</span>
        </div>
      )}
    </div>
  );
}

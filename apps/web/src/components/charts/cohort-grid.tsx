"use client";

import { Empty } from "./chart-kit";
import { cn } from "@/lib/utils";

/**
 * Weekly retention, as a triangle.
 *
 * Every cell is "of the accounts that signed up in this week, what share were
 * still doing something k weeks later". Two things about the shape are
 * deliberate:
 *
 * **The rows get shorter as they go down, and that is the honest drawing.** A
 * cohort three weeks old cannot have a week-8 number. Filling those cells with
 * zero — which is what a rectangular grid forces — reports a collapse that has
 * not happened, and it is the single most common way a retention chart lies.
 * Missing weeks are simply absent here.
 *
 * **A tiny cohort is marked, not hidden.** One account out of two is 50%
 * retention and means nothing; the cohort size sits beside every row, and rows
 * below a handful of accounts are drawn faintly so the eye does not read noise
 * as signal.
 *
 * Sequential shading in one hue, because the cell's job is magnitude. The number
 * is printed in every cell, so the chart is readable for anyone the shading does
 * not reach.
 */

export interface Cohort {
  /** `YYYY-MM-DD` of the week's start. */
  cohort: string;
  size: number;
  /** Index 0 is the signup week itself. `null` where the week has not happened. */
  retention: (number | null)[];
}

/**
 * Below this, a percentage is arithmetic rather than evidence.
 *
 * Exported because the caveat about faded rows belongs on the card's title as a
 * hint, not as a footnote printed under the grid — it is the same sentence
 * every time, and a caveat that is always on screen stops being read.
 */
export const NOISE_FLOOR = 5;

/** Wide enough for "100%", narrow enough that four weeks is not the whole card. */
const CELL = 72;

function weekLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

export function CohortGrid({ cohorts }: { cohorts: Cohort[] }) {
  const rows = cohorts.filter((c) => c.size > 0);
  if (rows.length === 0) {
    return <Empty>No cohorts yet — this fills in as accounts sign up.</Empty>;
  }
  const widest = Math.max(...rows.map((r) => r.retention.length));

  return (
    <div className="overflow-x-auto">
      {/*
        `w-full` with every column pinned and a spacer soaking up the remainder.

        Two failure modes, and the fix has to avoid both. Sized to its content,
        the table sat at the left edge of a card several times its width. Sized
        `w-full` with the week columns splitting the slack, three weeks of data
        drew cells 200px wide — a grid whose cell size reports how *little* data
        there is. Fixed cells and a trailing spacer keep the cell a cell: the
        card is filled, the table is left-aligned inside it, and a year of
        cohorts scrolls sideways rather than shrinking.
      */}
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="text-muted-foreground w-28 pr-2 pb-1 text-left text-xs font-medium">Signed up</th>
            <th className="text-muted-foreground w-16 px-1 pb-1 text-right text-xs font-medium">Accounts</th>
            {Array.from({ length: widest }, (_, k) => (
              <th
                key={k}
                style={{ width: CELL }}
                className="text-muted-foreground px-1 pb-1 text-center text-xs font-medium"
              >
                {k === 0 ? "Wk 0" : `+${k}`}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const thin = row.size < NOISE_FLOOR;
            return (
              <tr key={row.cohort} className={cn(thin && "opacity-55")}>
                <th className="text-muted-foreground w-28 pr-2 text-left text-xs font-medium whitespace-nowrap">
                  {weekLabel(row.cohort)}
                </th>
                <td
                  className="tabular text-muted-foreground w-16 px-1 text-right text-xs"
                  title={thin ? "Too few accounts for these percentages to mean much" : undefined}
                >
                  {row.size}
                </td>
                {row.retention.map((cell, k) => (
                  <td
                    key={k}
                    className="tabular rounded-md px-2 py-1.5 text-center text-xs"
                    style={{
                      width: CELL,
                      background:
                        cell === null || cell === 0
                          ? "var(--muted)"
                          : `color-mix(in oklch, var(--chart-1) ${Math.round(14 + (cell / 100) * 76)}%, var(--card))`,
                    }}
                    title={`${weekLabel(row.cohort)} cohort, week ${k}: ${cell === null ? "not yet" : `${cell}%`}`}
                  >
                    {cell === null ? "" : `${Math.round(cell)}%`}
                  </td>
                ))}
                {/* The triangle: no cells at all for weeks this cohort has not lived through. */}
                {Array.from({ length: widest - row.retention.length }, (_, k) => (
                  <td key={`pad-${k}`} style={{ width: CELL }} />
                ))}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

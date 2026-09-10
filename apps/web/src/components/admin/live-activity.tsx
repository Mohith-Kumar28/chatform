"use client";

import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { getGetApiAdminLiveQueryKey, useGetApiAdminLive } from "@/lib/api/admin/admin";
import { ChartCard, seriesColor } from "@/components/charts/chart-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";

/**
 * Is anything happening *right now*.
 *
 * Every other number on this console is arithmetic done earlier: the rollup
 * runs on the cron, the overview is cached for five minutes, and the shortest
 * range the picker offers is a whole day. That is the right trade for "how did
 * the quarter go" and the wrong one for the ten minutes after a launch tweet or
 * a deploy — which is the only moment anybody actually refreshes a dashboard.
 *
 * So this reads the source tables per minute, and says the window out loud in
 * its own title. A live tile that is quietly five minutes stale is worse than
 * no tile at all, because it is believed.
 *
 * Stacked bars rather than five lines: the question is "is there a pulse", and
 * the height of one bar per minute answers it before any colour is read. What
 * each colour is stays in the counts underneath, where it can be read at
 * leisure.
 */

interface LiveEvent {
  key: string;
  label: string;
  total: number;
  counts: number[];
}

interface Live {
  minutes: number;
  until: number;
  total: number;
  events: LiveEvent[];
}

/** How often the tile re-asks. Three times a bucket, so a bar fills as it happens. */
const POLL_MS = 20_000;

/**
 * The card owns its own header.
 *
 * The pulse and the event count in the corner come off the same poll that draws
 * the bars, and lifting them into the page would mean the page holding a second
 * subscription to the same query purely to title a card it does not own.
 */
export function LiveActivity({ className, height = 190 }: { className?: string; height?: number }) {
  const { data, isPending } = useGetApiAdminLive({
    query: {
      queryKey: getGetApiAdminLiveQueryKey(),
      refetchInterval: POLL_MS,
      // A tile whose whole claim is "right now" must not show a half-hour-old
      // picture for twenty seconds after the reader comes back to the tab.
      refetchOnWindowFocus: true,
      // …and it must not blank itself to a skeleton on each of those refetches,
      // which would jump the axis three times a minute.
      placeholderData: (prev) => prev,
    },
  });

  const live = apiData<Live>(data);
  const events = useMemo(() => live?.events ?? [], [live?.events]);
  const minutes = live?.minutes ?? 30;

  /**
   * How far apart the axis labels sit, in minutes.
   *
   * Read in fives, because that is how anyone reads a clock backwards: -5, -10,
   * -15 lands without arithmetic, where the old every-tenth-minute labelling
   * gave three marks across the whole window and left every bar between them to
   * be counted by eye. Kept to multiples of five as the window grows, and
   * widened once about six labels stop fitting the column.
   */
  const labelStep = Math.max(5, Math.ceil(minutes / 6 / 5) * 5);

  const rows = useMemo(
    () =>
      Array.from({ length: minutes }, (_, i) => {
        // Oldest bucket first; the last one is the minute in progress.
        const row: Record<string, number> = { ago: minutes - 1 - i };
        for (const e of events) row[e.key] = e.counts[i] ?? 0;
        return row;
      }),
    [minutes, events],
  );

  return (
    <ChartCard
      className={className}
      title="Live activity"
      // The window is named in the subtitle because this tile is believed: a
      // reader who has to hunt for what "live" covers will assume this second.
      subtitle={`Every event, minute by minute, for the last ${minutes} minutes.`}
      aside={isPending ? null : <LivePulse total={live?.total ?? 0} />}
    >
      {isPending ? (
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      ) : (
        <div className="flex h-full flex-col gap-3">
          {(live?.total ?? 0) === 0 ? (
            <div className="grid place-items-center" style={{ minHeight: Math.min(height, 140) }}>
              <p className="text-muted-foreground text-sm">Nothing in the last {minutes} minutes</p>
            </div>
          ) : (
            <div style={{ height }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={1}>
                  <XAxis
                    dataKey="ago"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    // Every fifth minute, and "now" at the right edge. A label
                    // per minute is thirty labels in a column this narrow.
                    tickFormatter={(ago: number) =>
                      ago % labelStep !== 0 ? "" : ago === 0 ? "now" : `-${ago}m`
                    }
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <ReTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      fontSize: "0.8125rem",
                    }}
                    labelFormatter={(ago) => (Number(ago) === 0 ? "this minute" : `${ago} min ago`)}
                    formatter={(value, name) => [
                      value as number,
                      events.find((e) => e.key === name)?.label ?? String(name),
                    ]}
                  />
                  {events.map((e, i) => (
                    <Bar key={e.key} dataKey={e.key} stackId="live" fill={seriesColor(i)} maxBarSize={14} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/*
            The legend carries the counts, so a colour nobody can name still
            answers "how many". Quiet kinds stay listed rather than vanishing —
            a legend that changes shape as traffic arrives has to be re-read
            every time you look at it.
          */}
          <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1">
            {events.map((e, i) => (
              <li key={e.key} className="text-caption flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    background: seriesColor(i),
                    opacity: e.total > 0 ? 1 : 0.35,
                  }}
                  aria-hidden
                />
                <span className={e.total > 0 ? "" : "text-muted-foreground"}>{e.label}</span>
                <span className="tabular text-muted-foreground">{e.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

/** The live mark for the card header, beside the chart it describes. */
function LivePulse({ total }: { total: number }) {
  return (
    <span className="text-caption text-muted-foreground flex items-center gap-1.5">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--success)] opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-[var(--success)]" />
      </span>
      {total.toLocaleString()} {total === 1 ? "event" : "events"}
    </span>
  );
}

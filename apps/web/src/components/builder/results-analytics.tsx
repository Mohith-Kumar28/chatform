"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Clock, Eye, Gauge, TrendingDown, Users } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { BarList, ChartCard, ColumnChart, Donut, Legend } from "@/components/charts/chart-kit";
import { WorldMap } from "@/components/charts/world-map";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How the form itself is doing — as opposed to what people said, which is the
 * Summary tab.
 *
 * Five questions, in the order someone actually asks them: how many people are
 * coming, is that going up or down, where do the ones who leave give up, how
 * long does this take, and who are they. Everything here is one measure per
 * chart against one axis; where two things share a picture they share a unit
 * (people), because two y-scales in one frame is the fastest way to draw a
 * correlation that is not there.
 */

export interface AnalyticsPayload {
  views: number;
  starts: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  avgDurationMs: number | null;
  medianDurationMs: number | null;
  perBlock: { blockRef: string; blockType: string; title: string; answered: number; answerRate: number; dropOff: number }[];
  daily: { date: string; views: number; starts: number; completed: number }[];
  bySource: { source: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDevice: { mobile: number; desktop: number } | null;
  /** From the respondent details recorded at session open; empty on older responses. */
  places?: { country: string | null; region: string | null; city: string | null; lat: number; lon: number; count: number }[];
  byBrowser?: { label: string; count: number }[];
  byOs?: { label: string; count: number }[];
  byChannel?: { label: string; count: number }[];
  byReferrer?: { label: string; count: number }[];
  durationBuckets: { label: string; count: number }[];
}

const CHANNEL_LABELS: Record<string, string> = {
  link: "Direct link",
  inline: "Inline embed",
  popup: "Popup",
  side_tab: "Side tab",
  fullpage: "Full-page embed",
  embed: "Embedded",
  api: "API",
};

const SOURCE_LABELS: Record<string, string> = {
  chat: "Direct link",
  embed: "Embedded",
  api: "API",
};

export function ResultsAnalytics({ analytics }: { analytics: AnalyticsPayload }) {
  const { daily, perBlock } = analytics;
  const hasTraffic = daily.some((d) => d.views > 0 || d.starts > 0);

  const series = daily.map((d) => ({
    date: d.date,
    views: d.views,
    completed: d.completed,
    unfinished: Math.max(0, d.starts - d.completed),
  }));

  // The steepest single fall in the funnel, named once rather than colouring
  // every row by how bad it is.
  const worstDrop = perBlock.reduce<{ ref: string; drop: number } | null>(
    (acc, b) => (b.dropOff > (acc?.drop ?? 0) ? { ref: b.blockRef, drop: b.dropOff } : acc),
    null,
  );

  const places = analytics.places ?? [];
  const channels = analytics.byChannel ?? [];
  const referrers = analytics.byReferrer ?? [];
  const browsers = analytics.byBrowser ?? [];
  const systems = analytics.byOs ?? [];

  const device = analytics.byDevice;
  const deviceTotal = (device?.mobile ?? 0) + (device?.desktop ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Views" value={analytics.views} icon={Eye} />
        <StatCard label="Started" value={analytics.starts} icon={Users} />
        <StatCard label="Completed" value={analytics.completed} icon={CheckCircle2} tone="success" />
        <StatCard label="Completion rate" value={`${analytics.completionRate}%`} icon={Gauge} tone="primary" />
        <StatCard label="Median time" value={formatDuration(analytics.medianDurationMs)} icon={Clock} />
        <StatCard label="Didn't finish" value={analytics.abandoned} icon={TrendingDown} tone="warning" />
      </div>

      <ChartCard
        title="Responses over time"
        subtitle="Views, and what came of them, day by day."
        aside={<Legend items={[
          { label: "Completed", color: "var(--chart-1)" },
          { label: "Didn't finish", color: "var(--chart-2)" },
          { label: "Views", color: "var(--muted-foreground)" },
        ]} />}
      >
        {!hasTraffic ? (
          <p className="text-muted-foreground text-sm">No visits in the last 30 days.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                interval="preserveStartEnd"
                minTickGap={28}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              {/* One axis. Views, starts and completions are all counts of
                  people, so they belong on the same scale — a second axis here
                  would let any two of them be drawn as if they tracked. */}
              <YAxis
                allowDecimals={false}
                width={38}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <ReTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                labelFormatter={(v) => longDate(String(v))}
                formatter={(value, name) => [value as number, String(name)]}
                contentStyle={TOOLTIP_STYLE}
              />
              <Area
                type="monotone"
                dataKey="views"
                name="Views"
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                fill="var(--muted)"
                fillOpacity={0.5}
                dot={false}
              />
              <Bar dataKey="completed" name="Completed" stackId="r" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="unfinished" name="Didn't finish" stackId="r" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Where people drop off"
        subtitle="Of everyone who started, the share still answering by each question."
        aside={
          worstDrop && worstDrop.drop > 0 ? (
            <span className="text-destructive">Biggest fall: −{worstDrop.drop} points</span>
          ) : null
        }
      >
        {perBlock.length === 0 ? (
          <p className="text-muted-foreground text-sm">No responses yet.</p>
        ) : (
          <ol className="space-y-3">
            {perBlock.map((b, i) => (
              <li key={b.blockRef}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm" title={b.title}>
                    <span className="text-muted-foreground mr-1.5 text-xs">{i + 1}</span>
                    {b.title}
                  </span>
                  <span className="tabular text-muted-foreground shrink-0 text-xs">
                    {b.dropOff > 0 && (
                      <span
                        className={cn(
                          "mr-2",
                          worstDrop?.ref === b.blockRef ? "text-destructive font-medium" : "opacity-70",
                        )}
                      >
                        −{b.dropOff}
                      </span>
                    )}
                    {b.answered} · {b.answerRate}%
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${b.answerRate}%`,
                      // One measure, one hue — the funnel is a single series,
                      // and the only thing that changes down it is magnitude.
                      background:
                        worstDrop?.ref === b.blockRef ? "var(--destructive)" : "var(--chart-1)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="How long it takes" subtitle={`Average ${formatDuration(analytics.avgDurationMs)}, median ${formatDuration(analytics.medianDurationMs)}.`}>
          {analytics.durationBuckets.every((b) => b.count === 0) ? (
            <p className="text-muted-foreground text-sm">Nobody has finished yet.</p>
          ) : (
            <ColumnChart bars={analytics.durationBuckets.map((b) => ({ label: b.label, value: b.count }))} />
          )}
        </ChartCard>

        <ChartCard title="Where they came from" subtitle="How the form was opened, and from where.">
          <div className="space-y-5">
            {/* The finer channel once responses carry one; the coarse source until then. */}
            <BarList
              items={
                channels.length > 0
                  ? channels.map((c) => ({ label: CHANNEL_LABELS[c.label] ?? c.label, value: c.count }))
                  : analytics.bySource.map((s) => ({
                      label: SOURCE_LABELS[s.source] ?? s.source,
                      value: s.count,
                    }))
              }
              total={analytics.starts}
              colorBy="series"
              emptyLabel="No responses yet"
            />
            {referrers.length > 0 && (
              <div>
                <p className="text-muted-foreground text-micro mb-2 font-medium tracking-wide uppercase">
                  Referring sites
                </p>
                <BarList items={referrers.map((r) => ({ label: r.label, value: r.count }))} total={analytics.starts} />
              </div>
            )}
            {analytics.byCountry.length > 0 && (
              <div>
                <p className="text-muted-foreground text-micro mb-2 font-medium tracking-wide uppercase">
                  Top countries
                </p>
                <BarList
                  items={analytics.byCountry.map((c) => ({ label: countryName(c.country), value: c.count }))}
                  total={analytics.starts}
                />
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {places.length > 0 && (
        <ChartCard
          title="Where people are"
          subtitle="One dot per city, from each respondent's internet connection. Accurate to the city, not the street."
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <WorldMap
              points={places.map((p) => ({
                lat: p.lat,
                lon: p.lon,
                count: p.count,
                label: placeLabel(p),
              }))}
            />
            <div>
              <p className="text-muted-foreground text-micro mb-2 font-medium tracking-wide uppercase">
                Top cities
              </p>
              <BarList
                items={places.slice(0, 8).map((p) => ({ label: placeLabel(p), value: p.count }))}
                total={places.reduce((sum, p) => sum + p.count, 0)}
              />
            </div>
          </div>
        </ChartCard>
      )}

      {(browsers.length > 0 || systems.length > 0) && (
        <ChartCard title="Browsers and systems" subtitle="Taken from the browser that opened the form.">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-micro mb-2 font-medium tracking-wide uppercase">Browser</p>
              <BarList items={browsers.map((b) => ({ label: b.label, value: b.count }))} total={analytics.starts} />
            </div>
            <div>
              <p className="text-muted-foreground text-micro mb-2 font-medium tracking-wide uppercase">
                Operating system
              </p>
              <BarList items={systems.map((o) => ({ label: o.label, value: o.count }))} total={analytics.starts} />
            </div>
          </div>
        </ChartCard>
      )}

      {deviceTotal > 0 && (
        <ChartCard title="Phone or laptop" subtitle="Taken from the browser that opened the form.">
          <Donut
            items={[
              { label: "Phone", value: device?.mobile ?? 0 },
              { label: "Laptop or desktop", value: device?.desktop ?? 0 },
            ]}
            total={deviceTotal}
            centerValue={`${Math.round(((device?.mobile ?? 0) / deviceTotal) * 100)}%`}
            centerLabel="on a phone"
          />
        </ChartCard>
      )}
    </div>
  );
}

export const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize: "0.8125rem",
} as const;

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function longDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** "Brooklyn, New York, United States", with whatever parts were recorded. */
function placeLabel(p: { country: string | null; region: string | null; city: string | null }): string {
  const parts = [p.city, p.region !== p.city ? p.region : null, p.country ? countryName(p.country) : null];
  return parts.filter(Boolean).join(", ") || "Unknown place";
}

/** ISO-3166 alpha-2 from the edge, spelled out where the browser can. */
function countryName(code: string): string {
  if (!code || code.length !== 2) return code || "Unknown";
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

"use client";

import { Fragment, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Clock, Eye, Gauge, TrendingDown, Users } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { CHANNEL_LABELS, DEVICE_LABELS, countryFlag, countryName } from "@repo/form-schema";
import { ChartCard, ColumnChart, Donut, Empty, FinishRing, Legend } from "@/components/charts/chart-kit";
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

export interface Segment {
  label: string;
  count: number;
  /** How many of `count` finished. Absent on responses from before it was sent. */
  completed?: number;
}

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
  places?: { country: string | null; region: string | null; city: string | null; lat: number; lon: number; count: number; completed?: number }[];
  byBrowser?: Segment[];
  byOs?: Segment[];
  byChannel?: Segment[];
  byReferrer?: Segment[];
  byCampaign?: Segment[];
  byDeviceType?: Segment[];
  byLanguage?: Segment[];
  /** Seven rows, Monday first, of 24 hours on the respondent's own clock. */
  byWeekHour?: number[][];
  durationBuckets: { label: string; count: number }[];
}

const SOURCE_LABELS: Record<string, string> = {
  chat: "Direct link",
  embed: "Embedded",
  api: "API",
};

/** Device type keeps its colour whichever of them is biggest. */
const DEVICE_COLORS: Record<string, string> = {
  desktop: "var(--chart-1)",
  mobile: "var(--chart-2)",
  tablet: "var(--chart-3)",
  bot: "var(--chart-6)",
};

/**
 * The fewest days the over-time chart draws. A form one day old is one bar the
 * width of the card otherwise, which reads as a block rather than a day.
 */
const MIN_DAYS = 5;

export function ResultsAnalytics({ analytics }: { analytics: AnalyticsPayload }) {
  const { perBlock } = analytics;

  /*
    From the first day anything happened, not from thirty days ago. A form
    published on Tuesday used to be drawn across a month of empty days with its
    whole life squeezed into the right-hand edge.
  */
  const daily = useMemo(() => {
    const first = analytics.daily.findIndex((d) => d.views > 0 || d.starts > 0);
    if (first < 0) return [];
    return analytics.daily.slice(Math.max(0, Math.min(first, analytics.daily.length - MIN_DAYS)));
  }, [analytics.daily]);

  const series = daily.map((d) => ({
    date: d.date,
    views: d.views,
    completed: d.completed,
    unfinished: Math.max(0, d.starts - d.completed),
  }));

  const places = analytics.places ?? [];
  const channels = analytics.byChannel ?? [];
  const referrers = analytics.byReferrer ?? [];
  const campaigns = analytics.byCampaign ?? [];
  const browsers = analytics.byBrowser ?? [];
  const systems = analytics.byOs ?? [];
  const languages = analytics.byLanguage ?? [];
  const weekHour = analytics.byWeekHour ?? [];
  const hasWeekHour = weekHour.some((row) => row.some((n) => n > 0));

  // The finer device type once responses carry one; the phone-or-not split until then.
  const devices: Segment[] =
    (analytics.byDeviceType ?? []).length > 0
      ? analytics.byDeviceType!
      : analytics.byDevice
        ? [
            { label: "desktop", count: analytics.byDevice.desktop },
            { label: "mobile", count: analytics.byDevice.mobile },
          ].filter((d) => d.count > 0)
        : [];
  const deviceTotal = devices.reduce((n, d) => n + d.count, 0);
  const phones = devices.find((d) => d.label === "mobile")?.count ?? 0;

  const channelItems: Segment[] =
    channels.length > 0
      ? channels.map((c) => ({ ...c, label: CHANNEL_LABELS[c.label] ?? c.label }))
      : analytics.bySource.map((s) => ({ label: SOURCE_LABELS[s.source] ?? s.source, count: s.count }));

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
        subtitle="From the first visit to today."
        aside={<Legend items={[
          { label: "Completed", color: "var(--chart-1)" },
          { label: "Didn't finish", color: "var(--chart-2)" },
          { label: "Views", color: "var(--muted-foreground)" },
        ]} />}
      >
        {series.length === 0 ? (
          <Empty>No visits yet.</Empty>
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
              <Bar dataKey="completed" name="Completed" stackId="r" fill="var(--chart-1)" maxBarSize={48} radius={[0, 0, 0, 0]} />
              <Bar dataKey="unfinished" name="Didn't finish" stackId="r" fill="var(--chart-2)" maxBarSize={48} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <DropOffCard perBlock={perBlock} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="How long it takes" subtitle={`Average ${formatDuration(analytics.avgDurationMs)}, median ${formatDuration(analytics.medianDurationMs)}.`}>
          {analytics.durationBuckets.every((b) => b.count === 0) ? (
            <Empty>Nobody has finished yet.</Empty>
          ) : (
            <ColumnChart bars={analytics.durationBuckets.map((b) => ({ label: b.label, value: b.count }))} />
          )}
        </ChartCard>

        <ChartCard title="When they start" subtitle="On their own clock, so you know when to send or post.">
          {hasWeekHour ? <WeekHourGrid grid={weekHour} /> : <Empty>No responses with a time zone yet.</Empty>}
        </ChartCard>
      </div>

      {places.length > 0 && (
        <ChartCard
          title="Where people are"
          subtitle="Everyone who started. Bigger dot, more people."
          aside={<Legend items={[
            { label: "Finished", color: "var(--chart-1)" },
            { label: "Didn't finish", color: "var(--chart-2)" },
          ]} />}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <WorldMap
              points={places.map((p) => ({
                lat: p.lat,
                lon: p.lon,
                count: p.count,
                completed: p.completed ?? 0,
                label: placeLabel(p),
                flag: countryFlag(p.country),
              }))}
            />
            <ol className="divide-y self-start">
              {places.slice(0, 8).map((p) => (
                <li key={`${p.lat},${p.lon}`} className="flex items-center gap-2.5 py-2 first:pt-0">
                  <span className="w-5 shrink-0 text-base leading-none" aria-hidden>
                    {countryFlag(p.country) || "·"}
                  </span>
                  <span className="min-w-0 flex-1" title={placeLabel(p)}>
                    <span className="block truncate text-sm">{p.city ?? p.region ?? countryName(p.country) ?? "Unknown"}</span>
                    {p.city && p.region && p.region !== p.city && (
                      <span className="text-muted-foreground block truncate text-xs">{p.region}</span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-sm">{p.count}</span>
                  {p.completed !== undefined && <FinishRing completed={p.completed} total={p.count} label="" />}
                </li>
              ))}
            </ol>
          </div>
        </ChartCard>
      )}

      {(deviceTotal > 0 || browsers.length > 0 || systems.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deviceTotal > 0 && (
            <ChartCard title="Device">
              <Donut
                size={120}
                legend="below"
                items={devices.map((d) => ({
                  label: DEVICE_LABELS[d.label] ?? d.label,
                  value: d.count,
                  color: DEVICE_COLORS[d.label],
                  note: finishNote(d),
                }))}
                total={deviceTotal}
                centerValue={`${Math.round((phones / deviceTotal) * 100)}%`}
                centerLabel="on a phone"
                ariaLabel="Responses by device"
              />
            </ChartCard>
          )}
          {browsers.length > 0 && (
            <ChartCard title="Browser">
              <SegmentDonut segments={browsers} ariaLabel="Responses by browser" />
            </ChartCard>
          )}
          {systems.length > 0 && (
            <ChartCard title="Operating system">
              <SegmentDonut segments={systems} ariaLabel="Responses by operating system" />
            </ChartCard>
          )}
        </div>
      )}

      <div className={cn("grid gap-4", languages.length > 0 && "lg:grid-cols-2")}>
        <ChartCard title="Where they came from" subtitle="How the form was opened, and which sites sent them.">
          <div className="space-y-5">
            <SegmentDonut segments={channelItems} ariaLabel="Responses by channel" emptyLabel="No responses yet." legend="beside" />
            {referrers.length > 0 && <SegmentRows title="Referring sites" segments={referrers} />}
            {campaigns.length > 0 && <SegmentRows title="Campaigns (utm_source)" segments={campaigns} />}
          </div>
        </ChartCard>

        {languages.length > 0 && (
          <ChartCard title="Language" subtitle="Their browser's language. Worth translating for any big slice.">
            <SegmentDonut
              segments={languages.map((l) => ({ ...l, label: languageName(l.label) }))}
              ariaLabel="Responses by language"
              legend="beside"
            />
          </ChartCard>
        )}
      </div>
    </div>
  );
}

/** "67% finish" for a segment that knows its completions. */
function finishNote(s: Segment): React.ReactNode {
  return s.completed === undefined ? undefined : <FinishRing completed={s.completed} total={s.count} />;
}

/** Part of the whole, with each slice's finish rate beside it. */
function SegmentDonut({
  segments,
  ariaLabel,
  emptyLabel,
  legend = "below",
}: {
  segments: Segment[];
  ariaLabel: string;
  emptyLabel?: string;
  /** `beside` in a half-width card, where a key below splits into two cramped columns. */
  legend?: "beside" | "below";
}) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  const lead = segments[0];
  return (
    <Donut
      size={120}
      legend={legend}
      items={segments.map((s) => ({ label: s.label, value: s.count, note: finishNote(s) }))}
      total={total}
      // The biggest slice, named: "60% Chrome" is the sentence the ring is for.
      centerValue={lead && total > 0 ? `${Math.round((lead.count / total) * 100)}%` : undefined}
      centerLabel={lead?.label}
      ariaLabel={ariaLabel}
      emptyLabel={emptyLabel}
    />
  );
}

/** A short ranked list with no bars: the names are the point, and the finish rate beside them. */
function SegmentRows({ title, segments }: { title: string; segments: Segment[] }) {
  return (
    <div>
      <p className="text-muted-foreground text-micro mb-1.5 font-medium tracking-wide uppercase">{title}</p>
      <ol className="divide-y">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate" title={s.label}>
              {s.label}
            </span>
            <span className="tabular shrink-0">{s.count}</span>
            {finishNote(s)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The share still answering, question by question, as one falling line.
 *
 * It was a stack of progress bars, one per question, which is the same picture
 * as every other card on the page and hides the thing a funnel is for: the
 * shape. A curve that runs flat and then drops off a cliff at question 6 says
 * "question 6" before any number is read. The cliff gets a red dot, and the
 * question's title is on the hover.
 */
function DropOffCard({ perBlock }: { perBlock: AnalyticsPayload["perBlock"] }) {
  const data = useMemo(
    () => [
      { n: 0, label: "Start", rate: 100, answered: null as number | null, drop: 0, title: "Everyone who started" },
      ...perBlock.map((b, i) => ({
        n: i + 1,
        label: `Q${i + 1}`,
        rate: b.answerRate,
        answered: b.answered as number | null,
        drop: b.dropOff,
        title: b.title,
      })),
    ],
    [perBlock],
  );
  const worst = data.reduce<(typeof data)[number] | null>((acc, d) => (d.drop > (acc?.drop ?? 0) ? d : acc), null);
  const gradientId = useId();

  return (
    <ChartCard
      title="Where people drop off"
      subtitle="Of everyone who started, the share still answering at each question."
      aside={
        worst ? (
          <span className="text-destructive">
            Biggest fall: {worst.label}, −{worst.drop} points
          </span>
        ) : null
      }
    >
      {perBlock.length === 0 ? (
        <Empty>No responses yet.</Empty>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -6 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={16}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={(v) => `${v}%`}
                width={44}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <ReTooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const d = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-popover text-popover-foreground max-w-64 rounded-md border px-2.5 py-1.5 text-xs shadow-sm">
                      <p className="font-medium">
                        {d.n > 0 && <span className="text-muted-foreground mr-1">{d.label}</span>}
                        {d.title}
                      </p>
                      <p className="text-muted-foreground tabular mt-0.5">
                        {d.rate}% still here
                        {d.answered !== null && ` · ${d.answered} answered`}
                        {d.drop > 0 && <span className="text-destructive"> · −{d.drop} points</span>}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={{ r: 3, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {worst && (
                <ReferenceDot
                  x={worst.label}
                  y={worst.rate}
                  r={6}
                  fill="var(--destructive)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
          {worst && (
            <p className="text-muted-foreground text-caption mt-2 truncate" title={worst.title}>
              <span className="text-foreground">{worst.label}</span> · {worst.title}
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Weekday by hour, one square each, darker where more people started.
 *
 * The busiest slot is named under the grid until something is hovered, so the
 * card answers "when" without asking anyone to find the darkest square.
 */
function WeekHourGrid({ grid }: { grid: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const busiest = useMemo(() => {
    let best = { d: 0, h: 0, n: -1 };
    grid.forEach((row, d) => row.forEach((n, h) => (n > best.n ? (best = { d, h, n }) : null)));
    return best;
  }, [grid]);
  const shown = hover ?? busiest;
  const shownN = grid[shown.d]?.[shown.h] ?? 0;

  return (
    <div>
      <div className="grid grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-[3px]" onMouseLeave={() => setHover(null)}>
        {WEEKDAYS.map((day, d) => (
          <Fragment key={day}>
            <span className="text-muted-foreground self-center text-[0.625rem]">{day}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = grid[d]?.[h] ?? 0;
              const active = shown.d === d && shown.h === h;
              return (
                <span
                  key={h}
                  onMouseEnter={() => setHover({ d, h })}
                  className={cn("aspect-square rounded-[3px]", active && "ring-foreground/60 ring-1")}
                  style={{
                    background:
                      n === 0 ? "var(--muted)" : `color-mix(in oklch, var(--chart-1) ${Math.round(25 + (n / max) * 75)}%, var(--card))`,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-muted-foreground text-center text-[0.625rem] tabular">
            {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
      </div>
      <p className="text-caption mt-3">
        <span className="text-muted-foreground">{hover ? "" : "Busiest: "}</span>
        {WEEKDAYS[shown.d]} {hourLabel(shown.h)} to {hourLabel((shown.h + 1) % 24)}
        <span className="text-muted-foreground tabular">
          {" "}
          · {shownN} {shownN === 1 ? "start" : "starts"}
        </span>
      </p>
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
  const parts = [p.city, p.region !== p.city ? p.region : null, countryName(p.country)];
  return parts.filter(Boolean).join(", ") || "Unknown place";
}

/** "en" as "English". */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

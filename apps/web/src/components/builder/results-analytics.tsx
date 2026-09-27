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
import { Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, Gauge, TrendingDown, Users } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
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
  /** Model calls that failed over the period; each turn carried on without AI. */
  aiFallbacks?: { calls: number; sessions: number; reasons: { code: string; count: number }[] };
}

const FALLBACK_REASONS: Record<string, string> = {
  credits_exhausted: "AI credits ran out",
  rate_limited: "AI provider was busy",
  timeout: "AI took too long",
  provider_error: "AI provider error",
  no_output: "AI gave no usable reply",
  unknown: "Other",
};

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
  // Everyone started counts every response; the map only the ones with a location.
  const unplaced = Math.max(0, analytics.starts - places.reduce((n, p) => n + p.count, 0));
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

      {analytics.aiFallbacks && analytics.aiFallbacks.calls > 0 && (
        <div className="bg-card shadow-xs flex items-center gap-2 rounded-xl px-4 py-3">
          <Bot className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <p className="text-body min-w-0 flex-1">
            AI fallbacks: <span className="tabular font-medium">{analytics.aiFallbacks.calls}</span>
            <span className="text-muted-foreground">
              {" "}in {analytics.aiFallbacks.sessions} {analytics.aiFallbacks.sessions === 1 ? "conversation" : "conversations"}
            </span>
          </p>
          <InfoHint label="About AI fallbacks">
            <p>The AI didn&apos;t answer, so these turns used your own question wording instead. Respondents could still finish.</p>
            <ul className="mt-2 space-y-0.5">
              {analytics.aiFallbacks.reasons.map((r) => (
                <li key={r.code} className="flex justify-between gap-4">
                  <span>{FALLBACK_REASONS[r.code] ?? r.code}</span>
                  <span className="tabular">{r.count}</span>
                </li>
              ))}
            </ul>
          </InfoHint>
        </div>
      )}

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

      {places.length > 0 && <WhereCard places={places} unplaced={unplaced} />}

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

type Place = NonNullable<AnalyticsPayload["places"]>[number];

/** Rows the country list shows before "Show all". */
const COUNTRY_ROWS = 12;

/**
 * The map and, beside it, the list it is read with: countries first, and a
 * click on either one zooms into that country and swaps the list for its
 * regions, each with its cities. Hovering a row lights up the country (or the
 * region's dots) on the map, and hovering the map lights up the row.
 *
 * Counted from `places`, the same rows the dots are drawn from, so the list
 * and the map never disagree about a country.
 */
function WhereCard({ places, unplaced }: { places: Place[]; unplaced: number }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverCountry, setHoverCountry] = useState<string | null>(null);
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const total = places.reduce((n, p) => n + p.count, 0);

  const countries = useMemo(() => {
    const by = new Map<string, { code: string; name: string; flag: string; count: number; completed: number }>();
    for (const p of places) {
      if (!p.country) continue;
      const c = by.get(p.country) ?? {
        code: p.country,
        name: countryName(p.country) ?? p.country,
        flag: countryFlag(p.country),
        count: 0,
        completed: 0,
      };
      c.count += p.count;
      c.completed += p.completed ?? 0;
      by.set(p.country, c);
    }
    return [...by.values()].sort((a, b) => b.count - a.count);
  }, [places]);

  const shading = useMemo(() => Object.fromEntries(countries.map((c) => [c.code, c])), [countries]);
  const focused = focus ? countries.find((c) => c.code === focus) : undefined;

  const regions = useMemo(() => {
    if (!focus) return [];
    const by = new Map<string, { name: string; count: number; cities: { name: string; count: number }[] }>();
    for (const p of places) {
      if (p.country !== focus) continue;
      const name = p.region ?? p.city ?? "Unknown";
      const r = by.get(name) ?? { name, count: 0, cities: [] };
      r.count += p.count;
      if (p.city && p.city !== name) r.cities.push({ name: p.city, count: p.count });
      by.set(name, r);
    }
    return [...by.values()]
      .map((r) => ({ ...r, cities: r.cities.sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.count - a.count);
  }, [places, focus]);

  const points = places.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    count: p.count,
    completed: p.completed ?? 0,
    label: placeLabel(p),
    flag: countryFlag(p.country),
    country: p.country,
    highlight: hoverRegion !== null && (p.region ?? p.city ?? "Unknown") === hoverRegion,
  }));

  function select(code: string | null) {
    setFocus(code);
    setHoverCountry(null);
    setHoverRegion(null);
  }

  const rows = showAll ? countries : countries.slice(0, COUNTRY_ROWS);

  return (
    <ChartCard
      title="Where people are"
      subtitle="Everyone who started. Bigger dot, more people."
      aside={<Legend items={[
        { label: "Finished", color: "var(--chart-1)" },
        { label: "Didn't finish", color: "var(--chart-2)" },
      ]} />}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <WorldMap
          points={points}
          countries={shading}
          focus={focus}
          hoverCountry={hoverCountry}
          onHoverCountry={setHoverCountry}
          onSelect={select}
        />
        <div className="self-start">
          {focused ? (
            <>
              <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => select(null)}>
                <ChevronLeft />
                All countries
              </Button>
              <div className="mb-2 flex items-center gap-2.5">
                <span className="w-5 shrink-0 text-base leading-none" aria-hidden>{focused.flag || "·"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{focused.name}</span>
                <span className="text-muted-foreground tabular text-xs">{percent(focused.count, total)}</span>
                <span className="tabular w-10 text-right text-sm font-medium">{focused.count}</span>
              </div>
              <GeoHeader label="Region" />
              <ol>
                {regions.map((r) => (
                  <GeoRow
                    key={r.name}
                    name={r.name}
                    sub={r.cities.map((c) => (r.cities.length > 1 ? `${c.name} ${c.count}` : c.name)).join(" · ")}
                    count={r.count}
                    share={r.count / focused.count}
                    active={hoverRegion === r.name}
                    onHover={(on) => setHoverRegion(on ? r.name : null)}
                  />
                ))}
              </ol>
            </>
          ) : (
            <>
              <GeoHeader label="Country" />
              <ol>
                {rows.map((c) => (
                  <GeoRow
                    key={c.code}
                    flag={c.flag}
                    name={c.name}
                    count={c.count}
                    share={c.count / total}
                    title={`${c.completed} finished, ${c.count - c.completed} didn't finish`}
                    active={hoverCountry === c.code}
                    onHover={(on) => setHoverCountry(on ? c.code : null)}
                    onClick={() => select(c.code)}
                  />
                ))}
              </ol>
              {countries.length > COUNTRY_ROWS && (
                <Button variant="link" size="sm" className="text-muted-foreground mt-1 px-0" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer" : `Show all ${countries.length}`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {unplaced > 0 && (
        <p className="text-muted-foreground text-caption mt-3">
          {unplaced} {unplaced === 1 ? "response has" : "responses have"} no location, from before it was recorded.
        </p>
      )}
    </ChartCard>
  );
}

function GeoHeader({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground text-caption flex items-center gap-2.5 px-2 pb-1.5">
      <span className="flex-1">{label}</span>
      <span>Share</span>
      <span className="w-10 text-right">People</span>
    </div>
  );
}

/**
 * One row of the list: a bar behind it the width of its share, like the
 * reference analytics tools draw it, so the list reads as a chart too. With
 * `onClick` it is a button, and the chevron and underline on hover say so.
 */
function GeoRow({
  flag,
  name,
  sub,
  count,
  share,
  title,
  active,
  onHover,
  onClick,
}: {
  flag?: string;
  name: string;
  sub?: string;
  count: number;
  share: number;
  title?: string;
  active: boolean;
  onHover: (on: boolean) => void;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn("absolute inset-y-0.5 left-0 rounded-md bg-[var(--chart-1)] transition-opacity", active ? "opacity-25" : "opacity-10")}
        style={{ width: `${Math.max(2, share * 100)}%` }}
      />
      {flag !== undefined && (
        <span className="relative w-5 shrink-0 text-base leading-none" aria-hidden>{flag || "·"}</span>
      )}
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className={cn("truncate text-sm", onClick && "decoration-muted-foreground/50 underline-offset-2 group-hover:underline")}>{name}</span>
          {onClick && (
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          )}
        </span>
        {sub && <span className="text-muted-foreground block truncate text-xs">{sub}</span>}
      </span>
      <span className="text-muted-foreground tabular relative text-xs">{sharePercent(share)}</span>
      <span className="tabular relative w-10 text-right text-sm">{count}</span>
    </>
  );
  const cls = "group relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left";
  return (
    <li title={title} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {onClick ? (
        <button type="button" className={cn(cls, "focus-visible:ring-ring cursor-pointer outline-none focus-visible:ring-2")} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function percent(n: number, of: number): string {
  return of > 0 ? sharePercent(n / of) : "";
}

/** "<1%" rather than "0%" for a share that exists but rounds away. */
function sharePercent(share: number): string {
  return share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`;
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

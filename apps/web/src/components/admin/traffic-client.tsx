"use client";

import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { countryFlag, countryName } from "@repo/form-schema";
import {
  getGetApiAdminTrafficLiveQueryKey,
  getGetApiAdminTrafficQueryKey,
  useGetApiAdminTraffic,
  useGetApiAdminTrafficLive,
} from "@/lib/api/admin/admin";
import type { GetApiAdminTraffic200, GetApiAdminTrafficLive200 } from "@/lib/api/generated.schemas";
import { BarList, ChartCard, Donut, Empty, Heatmap, Legend, SERIES, type BarItem } from "@/components/charts/chart-kit";
import { WorldMap, type MapCountry, type MapPoint } from "@/components/charts/world-map";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { COMPARED_TO, RangePicker, useRange, type Range } from "./range-picker";
import { compact } from "./format";

/**
 * Who comes to chatform, from where, what they look at, and how fast it feels.
 *
 * Every number is first-party: the page-view beacon in `lib/analytics/track.ts`,
 * read back from `TrafficDO` by `GET /api/admin/traffic`. Sign-ups come
 * from the accounts table, so a visitor and a sign-up are never the same guess.
 *
 * Top to bottom in the order the questions get asked: how many, when, right
 * now, where in the product, where from, which pages, which places, on what,
 * and how fast.
 */

const TRAFFIC_RANGES = ["1d", "7d", "30d", "90d"] as const satisfies readonly Range[];

type Report = GetApiAdminTraffic200;
type Live = GetApiAdminTrafficLive200;

/** The product's areas, as a person would name them. */
export const AREA_LABEL: Record<string, string> = {
  marketing: "Website",
  docs: "Docs",
  auth: "Sign-in",
  app: "Dashboard",
  builder: "Form builder",
  form: "Filling a form",
  embed: "Embedded form",
};

const areaLabel = (key: string) => AREA_LABEL[key] ?? key;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
export const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Every bucket in the range, zero-filled, so a quiet hour is a dip and not a missing point. */
function fillSeries(report: Report) {
  const size = report.bucket === "hour" ? HOUR : DAY;
  const span = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 }[report.range] ?? 7;
  const end = Math.floor(Date.now() / size) * size;
  const start = end - (report.bucket === "hour" ? 23 : span - 1) * size;
  const byAt = new Map(report.series.map((p) => [p.at, p]));
  const signups = new Map(report.signupSeries.map((p) => [p.at, p.signups]));
  const rows = [];
  for (let at = start; at <= end; at += size) {
    const p = byAt.get(at);
    rows.push({
      at,
      visitors: p?.visitors ?? 0,
      newVisitors: p?.newVisitors ?? 0,
      views: p?.views ?? 0,
      signups: signups.get(at) ?? 0,
    });
  }
  return rows;
}

function tick(at: number, bucket: "hour" | "day") {
  const d = new Date(at);
  return bucket === "hour"
    ? d.toLocaleTimeString("en", { hour: "numeric" })
    : d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

const CHART_SERIES = [
  { key: "visitors", label: "Visitors", color: SERIES[0] },
  { key: "newVisitors", label: "New visitors", color: SERIES[1] },
  { key: "views", label: "Pageviews", color: SERIES[2] },
] as const;

function TrafficChart({ report }: { report: Report }) {
  const rows = useMemo(() => fillSeries(report), [report]);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="at"
          tickFormatter={(v: number) => tick(v, report.bucket)}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <ReTooltip
          labelFormatter={(v) =>
            new Date(Number(v)).toLocaleString("en", report.bucket === "hour"
              ? { weekday: "short", hour: "numeric", minute: "2-digit" }
              : { weekday: "short", day: "numeric", month: "short" })
          }
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="visitors" name="Visitors" stroke={SERIES[0]} fill={SERIES[0]} fillOpacity={0.18} strokeWidth={2} />
        <Area type="monotone" dataKey="newVisitors" name="New visitors" stroke={SERIES[1]} fill={SERIES[1]} fillOpacity={0.12} strokeWidth={1.5} />
        <Line type="monotone" dataKey="views" name="Pageviews" stroke={SERIES[2]} dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
        <Bar dataKey="signups" name="Sign-ups" fill={SERIES[3]} barSize={6} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function LiveCard({ className }: { className?: string }) {
  const { data, isPending } = useGetApiAdminTrafficLive({
    query: {
      queryKey: getGetApiAdminTrafficLiveQueryKey(),
      // The server keeps each answer for 15s; asking twice as often gains nothing.
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  });
  const live = apiData<Live | undefined>(data);
  const bars = useMemo(() => {
    if (!live) return [];
    const from = live.until - live.minutes * 60_000;
    return live.visitors.map((v, i) => ({ at: from + i * 60_000, visitors: v, views: live.views[i] ?? 0 }));
  }, [live]);

  return (
    <ChartCard
      className={className}
      title="Last 30 minutes"
      hint="Visitors a minute at a time. Online now is everyone who opened a page in the last five minutes."
      aside={
        live ? (
          <span className="text-foreground flex items-center gap-1.5 font-medium">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            {live.online.toLocaleString()} online now
          </span>
        ) : null
      }
    >
      {isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : !live || live.visitors.every((v) => v === 0) ? (
        <Empty>Nobody has opened a page in the last 30 minutes.</Empty>
      ) : (
        <div className="space-y-3">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={bars} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
              <XAxis dataKey="at" hide />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <ReTooltip
                labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="visitors" name="Visitors" fill={SERIES[0]} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <BarList
            items={live.pages.slice(0, 6).map((p) => ({ label: `${areaLabel(p.area)} · ${p.path}`, value: p.visitors }))}
            emptyLabel="Nobody on a page right now."
          />
        </div>
      )}
    </ChartCard>
  );
}

/** Weekday × hour, in the reader's own zone. */
function WeekHour({ hourly }: { hourly: { at: number; visitors: number }[] }) {
  const counts = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (const h of hourly) {
      const d = new Date(h.at);
      const day = (d.getDay() + 6) % 7;
      grid[day]![d.getHours()]! += h.visitors;
    }
    return grid;
  }, [hourly]);
  return (
    <Heatmap
      rows={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
      cols={Array.from({ length: 24 }, (_, i) => String(i))}
      counts={counts}
    />
  );
}

function Geography({ report }: { report: Report }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverCountry, setHoverCountry] = useState<string | null>(null);

  const { points, countries, list } = useMemo(() => {
    const byCountry = new Map<string, number>();
    const pts: MapPoint[] = [];
    for (const g of report.geo) {
      byCountry.set(g.country, (byCountry.get(g.country) ?? 0) + g.visitors);
      if (g.lat || g.lon) {
        pts.push({
          lat: g.lat,
          lon: g.lon,
          count: g.visitors,
          // Traffic has no "finished"; every dot is drawn whole.
          completed: g.visitors,
          label: [g.city, g.region, countryName(g.country) ?? g.country].filter(Boolean).join(", "),
          flag: countryFlag(g.country),
          country: g.country,
        });
      }
    }
    const shaded: Record<string, MapCountry> = {};
    for (const [code, count] of byCountry) {
      shaded[code] = { count, completed: count, name: countryName(code) ?? code, flag: countryFlag(code) };
    }
    const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
    return { points: pts, countries: shaded, list: ranked };
  }, [report.geo]);

  const cities = useMemo(
    () =>
      report.geo
        .filter((g) => g.country === focus && g.city)
        .slice(0, 12)
        .map((g) => ({ label: [g.city, g.region].filter(Boolean).join(", "), value: g.visitors })),
    [report.geo, focus],
  );

  return (
    <ChartCard
      title="Where they are"
      aside={focus ? (
        <button type="button" className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => setFocus(null)}>
          All countries
        </button>
      ) : undefined}
    >
      {report.geo.length === 0 ? (
        <Empty>Places appear as visitors arrive.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <WorldMap
              points={points}
              countries={countries}
              focus={focus}
              hoverCountry={hoverCountry}
              onHoverCountry={setHoverCountry}
              onSelect={(code) => setFocus((f) => (f === code ? null : code))}
            />
          </div>
          <div>
            {focus ? (
              <BarList items={cities} unit=" visitors" emptyLabel="No cities recorded." />
            ) : (
              <BarList
                items={list.slice(0, 12).map(([code, count]) => ({
                  label: `${countryFlag(code)} ${countryName(code) ?? code}`,
                  value: count,
                }))}
                unit=" visitors"
                selected={null}
                onSelect={(i) => {
                  const code = i === null ? null : (list[i]?.[0] ?? null);
                  setFocus(code);
                }}
              />
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

type PageView = "top" | "entry" | "exit";

function Pages({ report }: { report: Report }) {
  const [view, setView] = useState<PageView>("top");
  const [area, setArea] = useState<string>("all");
  const areas = useMemo(() => ["all", ...new Set(report.pages.map((p) => p.area))], [report.pages]);
  const rows: BarItem[] = useMemo(() => {
    const keep = (a: string) => area === "all" || a === area;
    const label = (a: string, p: string) => (area === "all" ? `${areaLabel(a)} · ${p}` : p);
    if (view === "exit") return report.exits.filter((p) => keep(p.area)).map((p) => ({ label: label(p.area, p.path), value: p.visits }));
    const list = view === "entry" ? report.entries : report.pages;
    return list.filter((p) => keep(p.area)).map((p) => ({ label: label(p.area, p.path), value: view === "entry" ? p.visits : p.views }));
  }, [report, view, area]);

  return (
    <ChartCard
      title="Pages"
      hint="Top counts pageviews. Entry is the first page of a visit, exit the last."
    >
      {/* In the body rather than the header's aside, which never wraps: six areas do not fit a phone. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* One pill cannot wrap, so on a phone it scrolls within its own row. */}
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            size="sm"
            value={area}
            onChange={setArea}
            options={areas.map((a) => ({ value: a, label: a === "all" ? "All" : areaLabel(a) }))}
            ariaLabel="Area"
          />
        </div>
        <SegmentedControl
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "top", label: "Top" },
            { value: "entry", label: "Entry" },
            { value: "exit", label: "Exit" },
          ]}
          ariaLabel="Which pages"
        />
      </div>
      <BarList items={rows.slice(0, 15)} unit={view === "top" ? " views" : " visits"} emptyLabel="No pages in this period." />
    </ChartCard>
  );
}

/** Web vitals thresholds, from web.dev: good at or under the first, poor above the second. */
const VITAL_LIMITS = { lcp: [2500, 4000], inp: [200, 500], ttfb: [800, 1800], cls: [0.1, 0.25] } as const;

function Vital({ value, kind }: { value: number | null | undefined; kind: keyof typeof VITAL_LIMITS }) {
  if (value == null) return <span className="text-muted-foreground">–</span>;
  const [good, poor] = VITAL_LIMITS[kind];
  const tone = value <= good ? "text-emerald-600 dark:text-emerald-400" : value <= poor ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const text = kind === "cls" ? value.toFixed(2) : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
  return <span className={tone}>{text}</span>;
}

type VitalsRow = Report["vitals"]["byArea"][number];

const vitalColumns = (first: string, labelOf: (key: string) => string) => [
  { key: "key", header: first, render: (r: VitalsRow) => labelOf(r.key) },
  { key: "lcp", header: "LCP", numeric: true, width: "5.5rem", render: (r: VitalsRow) => <Vital value={r.lcp} kind="lcp" /> },
  { key: "inp", header: "INP", numeric: true, width: "5.5rem", render: (r: VitalsRow) => <Vital value={r.inp} kind="inp" /> },
  { key: "ttfb", header: "TTFB", numeric: true, width: "5.5rem", render: (r: VitalsRow) => <Vital value={r.ttfb} kind="ttfb" /> },
  { key: "cls", header: "CLS", numeric: true, width: "4.5rem", render: (r: VitalsRow) => <Vital value={r.cls} kind="cls" /> },
  { key: "samples", header: "Pages", numeric: true, width: "5rem", render: (r: VitalsRow) => compact(r.samples) },
];

export function TrafficClient() {
  const range = useRange(TRAFFIC_RANGES, "7d");
  const { data, isPending } = useGetApiAdminTraffic(
    { range: range as (typeof TRAFFIC_RANGES)[number] },
    {
      query: {
        queryKey: getGetApiAdminTrafficQueryKey({ range: range as (typeof TRAFFIC_RANGES)[number] }),
        // The same as the server's cache for the period: asking sooner returns the same answer.
        staleTime: range === "1d" ? 60_000 : 300_000,
        placeholderData: keepPreviousData,
      },
    },
  );

  const report = apiData<Report | undefined>(data);
  const comparedTo = COMPARED_TO[range];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Traffic</h1>
        <RangePicker ranges={TRAFFIC_RANGES} fallback="7d" />
      </div>

      {isPending || !report ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <TrafficBody report={report} comparedTo={comparedTo} />
      )}
    </div>
  );
}

function TrafficBody({ report, comparedTo }: { report: Report; comparedTo: string }) {
  const t = report.totals;
  const p = report.previous;
  const series = useMemo(() => fillSeries(report), [report]);
  const signupsBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of report.signupsBySource) m.set(s.source, (m.get(s.source) ?? 0) + s.signups);
    return m;
  }, [report.signupsBySource]);

  type SourceRow = Report["sources"][number] & { signups: number };
  const sourceRows: SourceRow[] = report.sources.map((s) => ({ ...s, signups: signupsBySource.get(s.source) ?? 0 }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Visitors"
          value={t.visitors}
          previous={p.visitors}
          series={series.map((r) => r.visitors)}
          comparedTo={comparedTo}
          sub={`${compact(t.newVisitors)} new`}
          about="Browsers, counted once each for the whole period. The same person on a phone and a laptop is two."
        />
        <KpiTile
          label="Visits"
          value={t.visits}
          previous={p.visits}
          comparedTo={comparedTo}
          about="A visit ends after 30 minutes without a page, or when the same tab arrives from a new link."
        />
        <KpiTile label="Pageviews" value={t.views} previous={p.views} series={series.map((r) => r.views)} comparedTo={comparedTo} />
        <KpiTile
          label="Bounce rate"
          value={pct(t.bounced, t.visits)}
          previous={pct(p.bounced, p.visits)}
          format={(n) => `${n}%`}
          comparedTo={comparedTo}
          lowerIsBetter
          about="Visits that saw one page and left."
        />
        <KpiTile
          label="Time per visit"
          value={t.visits > 0 ? t.engagedMs / t.visits : 0}
          previous={p.visits > 0 ? p.engagedMs / p.visits : 0}
          format={duration}
          comparedTo={comparedTo}
          about="Time the page was on screen, averaged over visits. A tab left open in the background does not count."
        />
        <KpiTile
          label="Sign-ups"
          value={report.signups.value}
          previous={report.signups.previous}
          series={series.map((r) => r.signups)}
          comparedTo={comparedTo}
          sub={`${pct(report.signups.value, t.visitors)}% of visitors`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Visitors"
        >
          <div className="mb-3">
            <Legend items={[...CHART_SERIES.map((s) => ({ label: s.label, color: s.color })), { label: "Sign-ups", color: SERIES[3] }]} />
          </div>
          <TrafficChart report={report} />
        </ChartCard>
        <LiveCard className="lg:col-span-2" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Where in chatform" hint="Visitors per part of the product. One person can be in several.">
          <BarList
            items={report.areas.map((a) => ({ label: areaLabel(a.key), value: a.visitors }))}
            total={t.visitors}
            unit=" visitors"
            emptyLabel="No visits in this period."
          />
        </ChartCard>
        <ChartCard title="People using the dashboard" hint="Signed-in people who opened the dashboard or the builder.">
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["Today", report.activeUsers.day],
                ["7 days", report.activeUsers.week],
                ["30 days", report.activeUsers.month],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
                <div className="text-muted-foreground text-caption">{label}</div>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Channels">
          <Donut
            items={report.channels.map((c, i) => ({ label: c.key, value: c.visitors, color: SERIES[i % SERIES.length] }))}
            total={report.channels.reduce((n, c) => n + c.visitors, 0)}
            centerValue={compact(t.visitors)}
            centerLabel="visitors"
            ariaLabel="Visitors by channel"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Sources"
        hint="Tagged links win over the referrer, because in-app browsers send none. Sign-ups are credited to the visit they signed up on, or the first page they ever saw when that visit came from nowhere."
      >
        <DataTable
          rows={sourceRows}
          minWidth="36rem"
          empty="No visits in this period."
          columns={[
            { key: "source", header: "Source", render: (r) => r.source },
            { key: "channel", header: "Channel", width: "7rem", muted: true, render: (r) => r.channel },
            { key: "visitors", header: "Visitors", numeric: true, width: "6rem", render: (r) => r.visitors.toLocaleString() },
            { key: "visits", header: "Visits", numeric: true, width: "6rem", render: (r) => r.visits.toLocaleString() },
            { key: "signups", header: "Sign-ups", numeric: true, width: "6rem", render: (r) => r.signups.toLocaleString() },
            {
              key: "conv",
              header: "Converts",
              numeric: true,
              width: "6rem",
              render: (r) => (r.visitors > 0 && r.signups > 0 ? `${pct(r.signups, r.visitors)}%` : "–"),
            },
          ]}
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Referring sites">
          <BarList items={report.referrers.map((r) => ({ label: r.key, value: r.visitors }))} unit=" visitors" emptyLabel="No referrers in this period." />
        </ChartCard>
        <ChartCard title="Campaigns" hint="The utm_campaign on the link they arrived by.">
          <BarList items={report.campaigns.map((r) => ({ label: r.key, value: r.visitors }))} unit=" visitors" emptyLabel="No tagged links in this period." />
        </ChartCard>
      </div>

      <Pages report={report} />

      <Geography report={report} />

      <div className="grid gap-3 lg:grid-cols-4">
        <ChartCard title="Devices">
          <Donut
            items={report.devices.map((d, i) => ({ label: d.key, value: d.visitors, color: SERIES[i % SERIES.length] }))}
            total={report.devices.reduce((n, d) => n + d.visitors, 0)}
            legend="below"
            ariaLabel="Visitors by device"
          />
        </ChartCard>
        <ChartCard title="Browsers">
          <BarList items={report.browsers.map((b) => ({ label: b.key, value: b.visitors }))} unit=" visitors" emptyLabel="None yet." />
        </ChartCard>
        <ChartCard title="Operating systems">
          <BarList items={report.oses.map((b) => ({ label: b.key, value: b.visitors }))} unit=" visitors" emptyLabel="None yet." />
        </ChartCard>
        <ChartCard title="Languages">
          <BarList items={report.languages.map((b) => ({ label: b.key, value: b.visitors }))} unit=" visitors" emptyLabel="None yet." />
        </ChartCard>
      </div>

      {report.hourly?.some((h) => h.visitors > 0) && (
        <ChartCard title="Busiest hours" hint="Visitors by weekday and hour, in your time zone. Up to the last 30 days.">
          <WeekHour hourly={report.hourly} />
        </ChartCard>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          className="min-w-0"
          title="Page speed by area"
          hint="The 75th percentile, as measured in visitors' browsers. Green is good, amber needs work, red is poor, by Google's thresholds. Safari reports no LCP or INP."
        >
          <DataTable rows={report.vitals.byArea} columns={vitalColumns("Area", areaLabel)} empty="No measurements yet." minWidth="30rem" />
        </ChartCard>
        <ChartCard className="min-w-0" title="Page speed by country" hint="Where a slow page is usually a long way from the server.">
          <DataTable
            rows={report.vitals.byCountry}
            columns={vitalColumns("Country", (c) => `${countryFlag(c)} ${countryName(c) ?? c}`)}
            empty="No measurements yet."
            minWidth="30rem"
          />
        </ChartCard>
      </div>
    </>
  );
}

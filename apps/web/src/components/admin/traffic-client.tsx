"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  getGetApiAdminLiveQueryKey,
  getGetApiAdminTrafficLiveQueryKey,
  getGetApiAdminTrafficQueryKey,
  useGetApiAdminLive,
  useGetApiAdminTraffic,
  useGetApiAdminTrafficLive,
} from "@/lib/api/admin/admin";
import type { GetApiAdminLive200, GetApiAdminTrafficLive200 } from "@/lib/api/generated.schemas";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { apiData } from "@/lib/api/payload";
import { RANGE_DAYS, RangePicker, useRange, type Range } from "./range-picker";
import { Depth, Loyalty } from "./analytics/audience";
import { ChartPlaceholder, TrendChart } from "./analytics/charts/trend";
import { Donut, HoursRadar } from "./analytics/charts/parts";
import { WeekHourHeatmap } from "./analytics/charts/grids";
import { AnalyticsFrame, AudiencePills, CampaignSelect, useAudience, useCampaign, type Audience } from "./analytics/controls";
import { Geography } from "./analytics/geography";
import { DataTable, type Column } from "./analytics/kit/data-table";
import { fmt, pct, rangeLabel, unitLabel, useMounted } from "./analytics/kit/format";
import { Degraded, PageHeader, PageSkeleton, Panel, RankedList, SectionTitle, StatStrip, type StatProps } from "./analytics/kit/ui";
import { localHours, sourceSeries, toAnalytics, type Report } from "./analytics/traffic";
import { TrafficPanel } from "./analytics/traffic-panel";
import type { Analytics, SourceRow } from "./analytics/types";

/**
 * Who comes, when, from where, and what they read.
 *
 * The layout and every panel are shipwithmuse's admin Traffic page
 * (`components/admin/analytics/` holds its components), read from our own
 * store through `GET /api/admin/traffic`. Two things are ours: the audience
 * (the site's visitors and a form's respondents are never one number), and the
 * sections that product does not have (who is here now, sign-ups, exit pages,
 * page speed).
 */

type Live = GetApiAdminTrafficLive200;

export const TRAFFIC_RANGES = ["1d", "7d", "30d", "90d"] as const satisfies readonly Range[];
type TrafficRange = (typeof TRAFFIC_RANGES)[number];

export const AREA_LABEL: Record<string, string> = {
  marketing: "Website",
  docs: "Docs",
  auth: "Sign-in",
  app: "Dashboard",
  builder: "Form builder",
  form: "Form link",
  embed: "Embedded form",
};

/** 45s, 3m 05s. */
export const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/**
 * One report per audience, period and campaign, under one key: every page that shows traffic
 * shares it. With a `campaign`, only the visits that came from it.
 */
export function useTrafficReport(range: Range, audience: Audience, campaign?: string) {
  const shown: TrafficRange = (TRAFFIC_RANGES as readonly Range[]).includes(range) ? (range as TrafficRange) : "90d";
  const params = { range: shown, audience, ...(campaign ? { campaign } : {}) };
  const query = useGetApiAdminTraffic(params, {
    query: {
      queryKey: getGetApiAdminTrafficQueryKey(params),
      // The same as the server's cache for the period: asking sooner returns the same answer.
      staleTime: shown === "1d" ? 60_000 : 300_000,
      placeholderData: keepPreviousData,
    },
  });
  const report = apiData<Report | undefined>(query.data);
  const analytics = useMemo(() => (report ? toAnalytics(report) : null), [report]);
  return { ...query, report, analytics, days: RANGE_DAYS[shown], shown };
}

export function TrafficClient() {
  const range = useRange(TRAFFIC_RANGES);
  const audience = useAudience();
  const campaign = useCampaign();
  const { report, analytics, days, isPending, isError, refetch } = useTrafficReport(range, audience, campaign);
  const mounted = useMounted();
  const tz = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <AnalyticsFrame>
      <PageHeader
        title="Traffic"
        description={
          <>
            {audience === "site" ? "People on chatform" : "People filling in forms"}
            {campaign && <> who came from {campaign}</>} · all counts are page views · {rangeLabel(days)}
            {tz && <> · times in {tz}</>}
          </>
        }
        actions={
          <>
            <AudiencePills />
            <CampaignSelect />
            <RangePicker ranges={TRAFFIC_RANGES} />
          </>
        }
      />
      {isError ? (
        <Degraded what="Traffic stats" onRetry={refetch} />
      ) : isPending || !report || !analytics ? (
        <PageSkeleton />
      ) : (
        <TrafficBody report={report} a={analytics} days={days} audience={audience} campaign={campaign} />
      )}
    </AnalyticsFrame>
  );
}

function TrafficBody({ report, a, days, audience, campaign }: { report: Report; a: Analytics; days: number; audience: Audience; campaign?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  /** Narrow the whole page to one campaign: the same thing the dropdown in the header does. */
  const pickCampaign = (key: string) => {
    const q = new URLSearchParams(search.toString());
    q.set("campaign", key);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const mounted = useMounted();
  const hourly = a.granularity === "hour";
  const t = a.totals;
  const now = report.totals;
  const prev = report.previous;
  const hours = useMemo(() => (mounted ? localHours(a.hours) : null), [a, mounted]);
  const src = useMemo(() => sourceSeries(a), [a]);
  const unit = unitLabel(days);
  const short = hourly ? "24h" : `${days}d`;
  const site = audience === "site";
  // Today is the reader's own day, from their midnight; unknown until the page is in the browser.
  const today = useMemo(() => {
    if (!mounted) return 0;
    const midnight = new Date().setHours(0, 0, 0, 0);
    // A report cached before this field existed has none.
    return (report.signups.recent ?? []).filter((at) => at >= midnight).length;
  }, [mounted, report.signups.recent]);

  const stats: StatProps[] = [
    {
      label: `Page views · ${short}`,
      value: fmt(t.views),
      delta: { now: now.views, prev: prev.views },
      sub: `${(t.views / Math.max(1, t.visitors)).toFixed(1)} per visitor`,
      spark: a.buckets.map((b) => b.views),
    },
    { label: "Views from new visitors", value: fmt(t.newViews), sub: "people on their first day here", spark: a.buckets.map((b) => b.newViews) },
    {
      label: "Views from returning visitors",
      value: `${pct(t.views - t.newViews, t.views)}%`,
      sub: `${fmt(t.views - t.newViews)} of ${fmt(t.views)} views`,
      info: "Page views by people who had been here on an earlier day.",
    },
    {
      label: `Unique visitors · ${short}`,
      value: fmt(t.visitors),
      delta: { now: now.visitors, prev: prev.visitors },
      sub: `${pct(now.bounced, now.visits)}% left after one page · ${duration(now.visits ? now.engagedMs / now.visits : 0)} per visit`,
      to: "/admin/visitors",
    },
    { label: "Active last hour", value: fmt(t.online), sub: "seen in the last hour", to: "/admin/visitors", search: { sort: "recent" } },
    ...(site
      ? [
          {
            label: `Sign-ups · ${short}`,
            value: fmt(report.signups.value),
            delta: { now: report.signups.value, prev: report.signups.previous },
            sub: (
              <>
                {today > 0 && <span className="num font-medium text-good">+{fmt(today)} today · </span>}
                {pct(report.signups.value, t.visitors)}% of visitors
              </>
            ),
            spark: signupSpark(report, a),
          } satisfies StatProps,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <StatStrip items={stats} />

      <div className="grid gap-4 xl:grid-cols-3">
        <TrafficPanel a={a} days={days} className="xl:col-span-2" />
        <LivePanel audience={audience} campaign={campaign} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Devices">
          <Donut rows={a.devices} center="views" empty="Devices appear as pages are viewed." />
        </Panel>
        <Panel title="Operating systems">
          <Donut rows={a.os} center="views" empty="Operating systems appear as pages are viewed." />
        </Panel>
        <Panel title="Browsers" className="md:col-span-2 xl:col-span-1">
          <Donut rows={a.browsers} center="views" empty="Browsers appear as pages are viewed." />
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Loyalty a={a} />
        <Depth a={a} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="When people visit" description="Weekday by hour, in your time zone" className="xl:col-span-2">
          {hours ? <WeekHourHeatmap cells={hours.heat} label="views" /> : <div className="h-56" />}
        </Panel>
        <Panel
          title="Busiest hours"
          description={`Each hour of day added up over the ${rangeLabel(Math.min(days, 30))}`}
          info="Every day in the range is summed per hour of day (your time), so 8 PM is all views between 8 PM and 9 PM across those days."
        >
          {hours ? <HoursRadar values={hours.byHour} label="Views" height={240} note={`${fmt(hours.byHour.reduce((s, n) => s + n, 0))} views`} /> : <div className="h-60" />}
        </Panel>
      </div>

      <SectionTitle>Sources</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`Sources per ${unit}`} info="The top four sources get their own color; everything else is Other.">
          <TrendChart
            data={src.rows}
            series={src.series.length ? src.series : [{ key: "none", label: "Views", color: "var(--chart-1)" }]}
            kind="bar"
            stacked
            range={days}
            height={240}
            empty="Sources appear as pages are viewed."
          />
        </Panel>
        <Panel title="Channels">
          <Donut rows={a.channels} center="views" empty="Channels appear as pages are viewed." />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Where views come from" description="Reddit, LinkedIn, X, Google, ChatGPT…" flush>
          <SourceTable rows={a.sources} signups={site} />
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Apps like LinkedIn, Reddit, Discord and WhatsApp often hide where a click came from. Share links with <code>?ref=reddit</code> or{" "}
            <code>?utm_source=linkedin&amp;utm_campaign=launch</code>, or make one in{" "}
            <Link href="/admin/campaigns" className="underline underline-offset-2">
              Campaigns
            </Link>
            , so they count under the right platform.
          </p>
        </Panel>
        <div className="grid gap-4">
          <Panel title="Referring sites">
            <RankedList rows={a.referrers} valueLabel="Views" empty="Sites that link here show up as people click through." limit={6} />
          </Panel>
          <Panel title="Campaigns">
            <RankedList
              rows={a.campaigns}
              valueLabel="Views"
              empty="Links made in Campaigns show up here."
              limit={6}
              onSelect={campaign ? undefined : pickCampaign}
            />
          </Panel>
        </div>
      </div>

      <SectionTitle>Geography</SectionTitle>
      <Geography a={a} unit="views" />

      <SectionTitle>{site ? "Content" : "Forms"}</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={site ? "Top pages" : "Top forms"}>
          <RankedList rows={a.pages} valueLabel="Views" limit={10} empty="Pages appear as people read them." />
        </Panel>
        <Panel title="Landing pages" description="Where visits started">
          <RankedList rows={a.landings} valueLabel="Visits" limit={10} color="var(--chart-2)" empty="Landing pages appear as people arrive." />
        </Panel>
        <Panel title="Exit pages" description="Where visits ended">
          <RankedList
            rows={mergeByPath(report.exits)}
            valueLabel="Visits"
            limit={10}
            color="var(--chart-3)"
            empty="Exit pages appear as visits end."
          />
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title={site ? "Where in chatform" : "Link or embed"}
          description={site ? "Page views per part of the product" : "Forms opened by their link, and forms embedded in a site"}
        >
          <Donut rows={report.areas.map((x) => ({ key: AREA_LABEL[x.key] ?? x.key, n: x.views }))} center="views" empty="Fills in as pages are viewed." />
        </Panel>
        {site ? (
          <Panel title="People using the dashboard" description="Signed in, on the dashboard or the builder" flush>
            <StatStrip
              className="rounded-none border-x-0 border-b-0"
              items={[
                { label: "Today", value: fmt(report.activeUsers.day) },
                { label: "Last 7 days", value: fmt(report.activeUsers.week) },
                { label: "Last 30 days", value: fmt(report.activeUsers.month) },
              ]}
            />
          </Panel>
        ) : (
          <Panel title="Languages" description="Browser language">
            <RankedList rows={a.languages} valueLabel="Views" limit={8} empty="Languages appear as pages are viewed." />
          </Panel>
        )}
      </div>

      <SectionTitle>Page speed</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By area" info="The 75th percentile of each measure: three visits in four were at least this fast." flush>
          <VitalsTable rows={report.vitals.byArea.map((v) => ({ ...v, key: AREA_LABEL[v.key] ?? v.key }))} first="Area" />
        </Panel>
        <Panel title="By country" info="Where a slow page is usually a long way from the server." flush>
          <VitalsTable rows={report.vitals.byCountry} first="Country" />
        </Panel>
      </div>
    </div>
  );
}

/** Sign-ups per bucket, in the buckets the traffic chart uses. */
function signupSpark(report: Report, a: Analytics): number[] {
  const byStart = new Map(report.signupSeries.map((p) => [p.at, p.signups]));
  return a.buckets.map((b) => byStart.get(b.start) ?? 0);
}

/** A form reached by its link and inside an embed is one form. */
function mergeByPath(rows: { path: string; visits: number }[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.path, (m.get(r.path) ?? 0) + r.visits);
  return [...m].map(([key, n]) => ({ key, n })).sort((x, y) => y.n - x.n);
}

// Platforms the views came from, with a share bar behind the name.
function SourceTable({ rows, signups }: { rows: SourceRow[]; signups: boolean }) {
  const total = rows.reduce((n, r) => n + r.views, 0);
  const max = Math.max(1, ...rows.map((r) => r.views));
  const columns = useMemo<Column<SourceRow>[]>(
    () => [
      {
        id: "key",
        header: "Source",
        sort: (r) => r.key.toLowerCase(),
        cell: (r) => (
          <span className="relative block py-0.5">
            <span className="absolute inset-y-0 left-0 rounded bg-chart-1/12" style={{ width: `${(r.views / max) * 100}%` }} />
            <span className="relative px-1.5 font-medium">{r.key}</span>
          </span>
        ),
        className: "min-w-44",
      },
      { id: "channel", header: "Channel", sort: (r) => r.channel, cell: (r) => <span className="text-xs text-muted-foreground">{r.channel}</span> },
      {
        id: "views",
        header: "Views",
        num: true,
        sort: (r) => r.views,
        info: "Page views during visits that came from this source",
        cell: (r) => (
          <>
            {fmt(r.views)} <span className="text-xs text-muted-foreground">{pct(r.views, total)}%</span>
          </>
        ),
      },
      { id: "visits", header: "Visits", num: true, sort: (r) => r.visits, info: "Separate arrivals from this source", cell: (r) => fmt(r.visits) },
      ...(signups
        ? [
            {
              id: "signups",
              header: "Sign-ups",
              num: true,
              sort: (r: SourceRow) => r.signups,
              info: "Accounts created on a visit from this source",
              cell: (r: SourceRow) => (r.signups ? fmt(r.signups) : <span className="text-muted-foreground">0</span>),
            } satisfies Column<SourceRow>,
          ]
        : []),
    ],
    [max, total, signups],
  );
  return <DataTable columns={columns} data={rows} getRowId={(r) => `${r.key}|${r.channel}`} empty="Sources appear as pages are viewed." />;
}

type VitalRow = Report["vitals"]["byArea"][number];
const VITAL_LIMITS = { lcp: [2500, 4000], inp: [200, 500], ttfb: [800, 1800], cls: [0.1, 0.25] } as const;

function Vital({ value, kind }: { value: number | null; kind: keyof typeof VITAL_LIMITS }) {
  if (value == null) return <span className="text-muted-foreground">–</span>;
  const [good, poor] = VITAL_LIMITS[kind];
  const tone = value <= good ? "text-good" : value <= poor ? "text-warn" : "text-bad";
  const text = kind === "cls" ? value.toFixed(2) : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
  return <span className={tone}>{text}</span>;
}

function VitalsTable({ rows, first }: { rows: VitalRow[]; first: string }) {
  const columns: Column<VitalRow>[] = [
    { id: "key", header: first, cell: (r) => <span className="font-medium">{r.key}</span> },
    { id: "lcp", header: "LCP", num: true, sort: (r) => r.lcp ?? -1, info: "Largest contentful paint: when the main content showed.", cell: (r) => <Vital value={r.lcp} kind="lcp" /> },
    { id: "inp", header: "INP", num: true, sort: (r) => r.inp ?? -1, info: "Interaction to next paint: how long a tap or click took to show.", cell: (r) => <Vital value={r.inp} kind="inp" /> },
    { id: "ttfb", header: "TTFB", num: true, sort: (r) => r.ttfb ?? -1, info: "Time to first byte: how long the server took to answer.", cell: (r) => <Vital value={r.ttfb} kind="ttfb" /> },
    { id: "cls", header: "CLS", num: true, sort: (r) => r.cls ?? -1, info: "Cumulative layout shift: how much the page jumped while loading.", cell: (r) => <Vital value={r.cls} kind="cls" /> },
    { id: "samples", header: "Pages", num: true, sort: (r) => r.samples, cell: (r) => fmt(r.samples) },
  ];
  return <DataTable columns={columns} data={rows} getRowId={(r) => r.key} empty="Fills in as pages finish loading." />;
}

/** What the bars of the last half hour are made of, in stacking order. Six kinds at most: one per chart colour. */
const LIVE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

/**
 * Everything that happened in the last half hour, a minute at a time and split by what it was
 * (pages opened on the site, forms opened, responses finished, sign-ups, forms created), then who
 * is here now and on which page. The activity is the whole platform's, whichever audience is
 * picked. Who is here follows the audience. The Overview shows this same panel, for the site.
 */
export function LivePanel({ audience, campaign, className }: { audience: Audience; campaign?: string; className?: string }) {
  const mounted = useMounted();
  const params = { audience, ...(campaign ? { campaign } : {}) };
  const { data } = useGetApiAdminTrafficLive(params, {
    query: { queryKey: getGetApiAdminTrafficLiveQueryKey(params), refetchInterval: 30_000, staleTime: 15_000 },
  });
  const here = apiData<Live | undefined>(data);
  const activity = useGetApiAdminLive({
    query: { queryKey: getGetApiAdminLiveQueryKey(), refetchInterval: 20_000, refetchOnWindowFocus: true, placeholderData: (prev) => prev },
  });
  const live = apiData<GetApiAdminLive200 | undefined>(activity.data);
  const events = useMemo(() => live?.events ?? [], [live?.events]);
  const minutes = live?.minutes ?? 30;
  // Series keys become CSS variables, so each kind is e0, e1, … rather than its own name.
  const bars = useMemo(
    () =>
      Array.from({ length: minutes }, (_, i) => {
        const row: Record<string, number> = { ago: minutes - 1 - i };
        events.forEach((e, k) => (row[`e${k}`] = e.counts[i] ?? 0));
        return row;
      }),
    [events, minutes],
  );
  const config = Object.fromEntries(events.map((e, k) => [`e${k}`, { label: e.label, color: LIVE_COLORS[k % LIVE_COLORS.length] }]));

  return (
    <Panel
      className={className}
      title="Last 30 minutes"
      description="Everything that happened, a minute at a time"
      actions={
        here ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <span className="relative flex size-2">
              {here.online > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />}
              <span className={`relative inline-flex size-2 rounded-full ${here.online > 0 ? "bg-good" : "bg-muted-foreground/40"}`} />
            </span>
            <span className="num">{fmt(here.online)}</span> here now
          </span>
        ) : null
      }
    >
      {!mounted || !live ? (
        <ChartPlaceholder height={150} />
      ) : (
        <>
          {/* Quiet kinds stay listed, dimmed: a legend that changes shape has to be re-read every time. */}
          <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {events.map((e, k) => (
              <li key={e.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: LIVE_COLORS[k % LIVE_COLORS.length], opacity: e.total > 0 ? 1 : 0.35 }} aria-hidden />
                {e.label}
                <span className={`num font-medium ${e.total > 0 ? "text-foreground" : ""}`}>{fmt(e.total)}</span>
              </li>
            ))}
          </ul>
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 150 }} initialDimension={{ width: 400, height: 150 }}>
            <BarChart data={bars} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="ago" tickLine={false} axisLine={false} tickMargin={6} interval={4} tickFormatter={(m: number) => (m === 0 ? "now" : `-${m}m`)} />
              <YAxis tickLine={false} axisLine={false} width={24} tickMargin={4} allowDecimals={false} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={<ChartTooltipContent indicator="dot" labelFormatter={(_, p) => minutesAgo(Number(p?.[0]?.payload?.ago ?? 0))} />}
              />
              {events.map((e, k) => (
                <Bar key={e.key} dataKey={`e${k}`} stackId="live" fill={`var(--color-e${k})`} maxBarSize={14} isAnimationActive={false} />
              ))}
            </BarChart>
          </ChartContainer>
        </>
      )}
      <p className="mt-4 mb-1 px-2 text-xs font-medium">Open right now</p>
      <RankedList
        rows={(here?.pages ?? []).map((p) => ({ key: p.path, n: p.visitors }))}
        valueLabel="People"
        limit={5}
        empty="Nobody has a page open right now."
      />
    </Panel>
  );
}

const minutesAgo = (m: number) => (m === 0 ? "This minute" : m === 1 ? "1 minute ago" : `${m} minutes ago`);

/**
 * The Traffic page's lead chart and its two headline cells, for the Overview. Always the site's
 * visitors, and the same report under the same key, so opening Traffic afterwards asks nothing
 * new. The Overview reaches back a year and traffic ninety days: a longer range shows ninety.
 */
export function TrafficSummary({ range }: { range: Range }) {
  const { report, analytics: a, days, shown, isError, refetch } = useTrafficReport(range, "site");
  return (
    <AnalyticsFrame>
      <SectionTitle
        actions={
          <Link href={`/admin/traffic?range=${shown}`} className="text-xs text-muted-foreground hover:text-foreground">
            Traffic details →
          </Link>
        }
      >
        Traffic
      </SectionTitle>
      {isError ? (
        <Degraded what="Traffic stats" onRetry={refetch} />
      ) : !report || !a ? (
        <ChartPlaceholder height={300} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <TrafficPanel a={a} days={days} className="xl:col-span-2" height={250} />
          <StatStrip
            className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-1"
            items={[
              {
                label: `Page views · ${a.granularity === "hour" ? "24h" : `${days}d`}`,
                value: fmt(a.totals.views),
                delta: { now: report.totals.views, prev: report.previous.views },
                sub: `${fmt(a.totals.visitors)} unique visitors`,
                spark: a.buckets.map((b) => b.views),
                to: "/admin/traffic",
              },
              { label: "Active last hour", value: fmt(a.totals.online), sub: `${fmt(a.totals.allTime)} visitors all time`, to: "/admin/visitors", search: { sort: "recent" } },
            ]}
          />
        </div>
      )}
    </AnalyticsFrame>
  );
}

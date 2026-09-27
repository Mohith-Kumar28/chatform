"use client";

import { useState } from "react";
import { useGetApiAdminLatency } from "@/lib/api/admin/admin";
import { ChartCard, Legend, SERIES } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { COMPARED_TO, RangePicker, useRange } from "./range-picker";
import { compact, relativeDay } from "./format";

/**
 * How long respondents wait for the form to answer them.
 *
 * Percentiles rather than an average, because the average is fine and the
 * slow tail is what people remember. The breakdown is there to say *why* the
 * tail is slow: an extra model step, the last question, a phone on a bad
 * connection, one form.
 */

interface Pct {
  turns: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface Latency {
  totals: Pct & { prev: Pct; serverP50: number; cacheHitRate: number; prevCacheHitRate: number };
  days: string[];
  p50Series: number[];
  p95Series: number[];
  breakdowns: { dimension: string; rows: (Pct & { key: string })[] }[];
  slowest: {
    sessionId: string;
    formTitle: string | null;
    createdAt: number;
    waitMs: number;
    serverMs: number | null;
    path: string | null;
    isFinal: boolean;
    steps: number | null;
    tools: string | null;
    device: string | null;
    browser: string | null;
    country: string | null;
  }[];
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** The server's path names, as a person would say them. Unknown keys show as themselves. */
const PATH_LABEL: Record<string, string> = {
  agent: "AI reply",
  gate: "Answer check (Jev)",
  deterministic: "Instant (no model)",
  "action:submit": "Submit button",
  "action:skip": "Skip",
};

const label = (dimension: string, key: string) => (dimension === "Path" ? (PATH_LABEL[key] ?? key) : key);

/** Warn at the tail we are trying to get rid of. */
const slow = (ms: number) => (ms > 4000 ? "text-[var(--warning-soft-foreground)]" : undefined);

export function LatencyClient() {
  const range = useRange();
  const { data, isPending } = useGetApiAdminLatency({ range });

  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  return <LatencyView l={apiData<Latency>(data) ?? ({} as Latency)} />;
}

export function LatencyView({ l }: { l: Latency }) {
  const range = useRange();
  const [dimension, setDimension] = useState("Path");
  const t = l.totals ?? ({ prev: {} } as Latency["totals"]);
  const p = t.prev ?? ({} as Pct);
  const compared = COMPARED_TO[range];
  const breakdowns = l.breakdowns ?? [];
  const current = breakdowns.find((b) => b.dimension === dimension) ?? breakdowns[0];
  // A day with no turns has no percentile; drawn as a gap, not as an instant reply.
  const gap = (xs: number[] | undefined) => (xs ?? []).map((v) => (v > 0 ? v / 1000 : null));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Latency</h1>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Median wait"
          value={t.p50 ?? 0}
          previous={p.p50 ?? 0}
          comparedTo={compared}
          format={secs}
          lowerIsBetter
          about={`p50: half of all replies started faster than this. The server's own share of it was ${secs(t.serverP50 ?? 0)}; the rest is the respondent's network.`}
        />
        <KpiTile label="p90" value={t.p90 ?? 0} previous={p.p90 ?? 0} comparedTo={compared} format={secs} lowerIsBetter />
        <KpiTile label="p95" value={t.p95 ?? 0} previous={p.p95 ?? 0} comparedTo={compared} format={secs} lowerIsBetter />
        <KpiTile
          label="p99"
          value={t.p99 ?? 0}
          previous={p.p99 ?? 0}
          comparedTo={compared}
          format={secs}
          lowerIsBetter
          about="The slowest one reply in a hundred."
        />
        <KpiTile label="Turns" value={t.turns ?? 0} previous={p.turns ?? 0} comparedTo={compared} format={compact} />
        <KpiTile
          label="Prompt cache hits"
          value={t.cacheHitRate ?? 0}
          previous={t.prevCacheHitRate ?? 0}
          comparedTo={compared}
          format={(n) => `${n}%`}
          about="Share of the AI's input tokens served from OpenRouter's prompt cache, on turns where the AI ran."
        />
      </div>

      <ChartCard
        title="Wait over time"
        hint="Time from pressing send to the first sign of a reply, as the respondent's browser measured it. Where the browser never reported, the server's own time stands in. Test and preview sessions are left out."
        aside={
          <Legend
            items={[
              { label: "p50", color: SERIES[0]! },
              { label: "p95", color: SERIES[1]! },
            ]}
          />
        }
      >
        <TrendChart
          days={l.days ?? []}
          series={[
            { key: "p50", label: "p50 (s)" },
            { key: "p95", label: "p95 (s)" },
          ]}
          data={{ p50: gap(l.p50Series), p95: gap(l.p95Series) }}
        />
      </ChartCard>

      <ChartCard
        title="Where it's slow"
        aside={
          <Select value={current?.dimension ?? dimension} onValueChange={setDimension}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {breakdowns.map((b) => (
                <SelectItem key={b.dimension} value={b.dimension}>
                  {b.dimension}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <DataTable
          rows={current?.rows ?? []}
          minWidth="28rem"
          empty="No turns in this period."
          columns={[
            { key: "key", header: current?.dimension ?? "", render: (r) => label(current?.dimension ?? "", r.key) },
            { key: "turns", header: "Turns", width: "4.5rem", numeric: true, render: (r) => compact(r.turns) },
            { key: "p50", header: "p50", width: "4rem", numeric: true, render: (r) => secs(r.p50) },
            { key: "p90", header: "p90", width: "4rem", numeric: true, render: (r) => secs(r.p90) },
            {
              key: "p95",
              header: "p95",
              width: "4rem",
              numeric: true,
              render: (r) => <span className={slow(r.p95)}>{secs(r.p95)}</span>,
            },
            {
              key: "p99",
              header: "p99",
              width: "4rem",
              numeric: true,
              render: (r) => <span className={slow(r.p99)}>{secs(r.p99)}</span>,
            },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Slowest replies"
        hint="Wait is what the respondent saw; server is our share of it. Steps is how many AI round trips the turn took."
      >
        <DataTable
          rows={l.slowest ?? []}
          minWidth="50rem"
          empty="No turns in this period."
          columns={[
            {
              key: "form",
              header: "Form",
              render: (r) => (
                <span title={r.sessionId}>
                  {r.formTitle ?? "Unknown form"}
                  {r.isFinal && <span className="text-muted-foreground ml-1.5">· last question</span>}
                </span>
              ),
            },
            { key: "wait", header: "Wait", width: "4rem", numeric: true, render: (r) => <span className={slow(r.waitMs)}>{secs(r.waitMs)}</span> },
            { key: "server", header: "Server", width: "4.5rem", numeric: true, render: (r) => (r.serverMs == null ? "—" : secs(r.serverMs)) },
            { key: "path", header: "Path", width: "8.5rem", render: (r) => (r.path ? (PATH_LABEL[r.path] ?? r.path) : "—") },
            { key: "steps", header: "Steps", width: "3.5rem", numeric: true, render: (r) => <span title={r.tools ?? undefined}>{r.steps ?? "—"}</span> },
            { key: "device", header: "Device", width: "10rem", render: (r) => [r.device, r.browser].filter(Boolean).join(" · ") || "—" },
            { key: "country", header: "Country", width: "4.5rem", render: (r) => r.country ?? "—" },
            { key: "when", header: "When", width: "5.5rem", muted: true, render: (r) => relativeDay(r.createdAt) },
          ]}
        />
      </ChartCard>
    </div>
  );
}

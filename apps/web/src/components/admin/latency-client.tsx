"use client";

import { useState } from "react";
import { useGetApiAdminLatency, useGetApiAdminLatencyGeneration } from "@/lib/api/admin/admin";
import { BarList, ChartCard, Legend, SERIES } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/** One model call inside a turn. */
interface Call {
  model: string | null;
  provider: string | null;
  firstMs: number | null;
  ms: number;
  tools: string[];
  id: string | null;
  stalled: boolean;
}

type Slow = Latency["slowest"][number];

export interface Latency {
  totals: Pct & { prev: Pct; ai?: Pct & { prev: Pct }; serverP50: number; cacheHitRate: number; prevCacheHitRate: number };
  days: string[];
  p50Series: number[];
  p95Series: number[];
  aiP50Series?: number[];
  parts?: { key: string; ms: number; turns: number }[];
  calls?: {
    model: string;
    provider: string;
    calls: number;
    firstP50: number;
    firstP90: number;
    p50: number;
    p90: number;
    stalls: number;
  }[];
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
    stalls?: number;
    calls?: Call[];
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

/** The parts of an AI reply, in the order they happen. */
const PART_LABEL: Record<string, string> = {
  gate: "Answer check (Jev)",
  prep: "Getting ready",
  first_call: "First model call",
  later_calls: "Later model calls",
  network: "Network",
};

/** Why a turn needed a second model call. See `whyNotSettled` on the server. */
const SECOND_LABEL: Record<string, string> = {
  one_call: "One call was enough",
  no_text: "Did not ask the next question",
  not_announced: "Next question depends on the answer",
  asked_question: "Respondent asked something",
  route_changed: "The flow went elsewhere",
  rejected: "Tool call was refused",
  other_tool: "Lookup or changed answer",
  several_tools: "Several tool calls",
  flow_refused: "The flow refused the answer",
  review: "On the review step",
};

const label = (dimension: string, key: string) =>
  dimension === "Path"
    ? (PATH_LABEL[key] ?? key)
    : dimension === "Why a second call"
      ? (SECOND_LABEL[key] ?? key)
      : key;

/** "google/gemini-3.7-flash-20260813" as "gemini-3.7-flash". */
const modelName = (id: string | null) => (id ? id.replace(/^[^/]+\//, "").replace(/-\d{8}$/, "") : "Unknown model");

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
  const [inspected, setInspected] = useState<Slow | null>(null);
  const t = l.totals ?? ({ prev: {} } as Latency["totals"]);
  const p = t.prev ?? ({} as Pct);
  const ai = t.ai ?? ({ prev: {} } as Pct & { prev: Pct });
  const parts = (l.parts ?? []).filter((x) => x.turns > 0);
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
        <KpiTile
          label="AI reply p50"
          value={ai.p50 ?? 0}
          previous={ai.prev?.p50 ?? 0}
          comparedTo={compared}
          format={secs}
          lowerIsBetter
          about={`Only the ${compact(ai.turns ?? 0)} turns where the AI model ran. Most turns need no model and answer at once, so the figures above mostly describe those.`}
        />
        <KpiTile
          label="AI reply p90"
          value={ai.p90 ?? 0}
          previous={ai.prev?.p90 ?? 0}
          comparedTo={compared}
          format={secs}
          lowerIsBetter
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
              { label: "AI reply p50", color: SERIES[2]! },
            ]}
          />
        }
      >
        <TrendChart
          days={l.days ?? []}
          series={[
            { key: "p50", label: "p50 (s)" },
            { key: "p95", label: "p95 (s)" },
            { key: "ai", label: "AI reply p50 (s)" },
          ]}
          data={{ p50: gap(l.p50Series), p95: gap(l.p95Series), ai: gap(l.aiP50Series) }}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Where an AI reply's time goes"
          hint="The median of each part, over AI replies in this period, and its share of them added together. Medians do not add up to the median reply. The two model parts are counted only on turns recorded since each call began being timed."
        >
          <BarList
            items={parts.map((x) => ({ label: PART_LABEL[x.key] ?? x.key, value: x.ms, display: secs(x.ms) }))}
            total={parts.reduce((n, x) => n + x.ms, 0)}
            emptyLabel="No AI replies in this period."
          />
        </ChartCard>

        <ChartCard
          title="Model calls"
          hint="Every call the AI model made in this period, by who served it. First token is the wait before any output; a stall is a call cut off for saying nothing."
        >
          <DataTable
            rows={l.calls ?? []}
            minWidth="30rem"
            empty="No model calls recorded in this period."
            columns={[
              {
                key: "model",
                header: "Model and provider",
                render: (r) => (
                  <>
                    <span className="block truncate">{modelName(r.model)}</span>
                    <span className="text-muted-foreground block truncate text-xs">{r.provider}</span>
                  </>
                ),
              },
              { key: "calls", header: "Calls", width: "3.5rem", numeric: true, render: (r) => compact(r.calls) },
              { key: "first", header: "First token", width: "5.5rem", numeric: true, render: (r) => secs(r.firstP50) },
              { key: "p50", header: "p50", width: "3.5rem", numeric: true, render: (r) => secs(r.p50) },
              { key: "p90", header: "p90", width: "3.5rem", numeric: true, render: (r) => <span className={slow(r.p90)}>{secs(r.p90)}</span> },
              {
                key: "stalls",
                header: "Stalls",
                width: "3.5rem",
                numeric: true,
                render: (r) => <span className={r.stalls > 0 ? slow(Infinity) : undefined}>{r.stalls}</span>,
              },
            ]}
          />
        </ChartCard>
      </div>

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
        hint="Wait is what the respondent saw; server is our share of it. Steps is how many AI round trips the turn took: select it to see each call."
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
            {
              key: "steps",
              header: "Steps",
              width: "3.5rem",
              numeric: true,
              render: (r) =>
                r.calls?.length ? (
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    title={r.tools ?? undefined}
                    onClick={() => setInspected(r)}
                  >
                    {r.steps ?? r.calls.length}
                  </button>
                ) : (
                  <span title={r.tools ?? undefined}>{r.steps ?? "—"}</span>
                ),
            },
            { key: "device", header: "Device", width: "10rem", render: (r) => [r.device, r.browser].filter(Boolean).join(" · ") || "—" },
            { key: "country", header: "Country", width: "4.5rem", render: (r) => r.country ?? "—" },
            { key: "when", header: "When", width: "5.5rem", muted: true, render: (r) => relativeDay(r.createdAt) },
          ]}
        />
      </ChartCard>

      <Dialog open={inspected !== null} onOpenChange={(open) => !open && setInspected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inspected?.formTitle ?? "Unknown form"} · {secs(inspected?.waitMs ?? 0)}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {(inspected?.calls ?? []).map((call, i) => (
              <CallDetail key={`${call.id ?? "call"}-${i}`} n={i + 1} call={call} />
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One model call of a slow reply, with OpenRouter's own record of the providers it tried. */
function CallDetail({ n, call }: { n: number; call: Call }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">
          {n}. {modelName(call.model)}
          <span className="text-muted-foreground ml-1.5 font-normal">· {call.provider ?? "Unknown provider"}</span>
        </span>
        <span className={call.stalled ? slow(Infinity) : "tabular-nums"}>
          {call.stalled ? `Cut off after ${secs(call.ms)}` : secs(call.ms)}
        </span>
      </div>
      {!call.stalled && (
        <p className="text-muted-foreground text-sm">
          First token {call.firstMs == null ? "not recorded" : secs(call.firstMs)}
          {call.tools.length > 0 && ` · ${call.tools.join(", ")}`}
        </p>
      )}
      {call.id && <Attempts id={call.id} />}
    </div>
  );
}

function Attempts({ id }: { id: string }) {
  const { data, isPending } = useGetApiAdminLatencyGeneration({ id });
  if (isPending) return <Skeleton className="h-5 w-48 rounded" />;
  const generation = apiData<{ generation: { attempts: { provider: string | null; status: number | null; ms: number | null }[] } | null }>(data)
    ?.generation;
  // OpenRouter keeps these for a while, not for ever.
  if (!generation) return <p className="text-muted-foreground text-sm">OpenRouter no longer has this call.</p>;
  return (
    <ul className="text-muted-foreground space-y-0.5 text-sm">
      {generation.attempts.map((a, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span>
            Tried {a.provider ?? "unknown"}
            <span className={a.status === 200 ? "ml-1.5" : `ml-1.5 ${slow(Infinity)}`}>
              {a.status === 200 ? "answered" : `failed (${a.status ?? "no status"})`}
            </span>
          </span>
          <span className="tabular-nums">{a.ms == null ? "—" : secs(a.ms)}</span>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useState } from "react";
import { useGetApiAdminAi } from "@/lib/api/admin/admin";
import { BarList, ChartCard, Donut, Empty, Legend, SERIES } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { RangePicker, useRange } from "./range-picker";
import { compact, money, usd } from "./format";

/**
 * What the product costs to run.
 *
 * Every response on this platform is an LLM conversation, so this is the one
 * line that scales with usage rather than headcount — and the reason the free
 * tier has an AI cap where responses are unlimited.
 *
 * Two numbers here matter more than the total. **Cost per conversation** is the
 * unit economics of the whole business: it is what has to stay below what a
 * response is worth. And the **margin table** names the accounts where it
 * already has not.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

interface Ai {
  days: string[];
  costSeries: number[];
  tokenSeries: number[];
  callSeries: number[];
  byModel: { key: string; value: number }[];
  byKind: { key: string; value: number }[];
  costByKind: { key: string; value: number }[];
  totals: {
    costUsd: number;
    unpricedCalls: number;
    tokens: number;
    calls: number;
    errors: number;
    errorRate: number;
    costPerConversationUsd: number;
    pricedConversations: number;
    conversations: number;
  };
  previous: {
    costUsd: number;
    tokens: number;
    calls: number;
    errorRate: number;
    costPerConversationUsd: number;
    conversations: number;
  };
  latency: { model: string; calls: number; p50: number; p90: number; errorRate: number }[];
  breakdown?: Breakdown[];
  topSpenders: Row[];
  lossMakers: Row[];
}

/**
 * The `kind` values `ai_generations` actually carries, spelled the way they are
 * written — `interview_turn`, not `interview`. An unmapped key falls through to
 * its raw form rather than disappearing, so a new kind shows up as itself
 * instead of silently vanishing from the chart.
 */
const KIND_LABEL: Record<string, string> = {
  interview_turn: "Conversation turns",
  extraction: "Answer extraction",
  generate: "Form generation",
  generate_stream: "Form generation (streamed)",
  edit: "Builder edits",
  edit_question: "Builder edits (clarifying)",
  clarify: "Clarifying questions",
  research: "Website research",
  knowledge_ocr: "Reading uploads",
  edit_retry: "Builder edits (retried)",
  edit_review: "Builder edits (checked)",
  feedback_tag: "Feedback tagging",
  feedback_issue: "Feedback triage",
};

/** One purpose's spend, split by what it bought. See `breakdown` on `/admin/ai`. */
interface Breakdown {
  kind: string;
  calls: number;
  costUsd: number;
  splitCostUsd: number;
  inputUsd: number;
  cachedUsd: number;
  outputUsd: number;
  reasoningUsd: number;
  otherUsd: number;
  toolStepsUsd: number;
  steps: number;
  toolCalls: number;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
}

const BREAKDOWN_KEYS = [
  "calls", "costUsd", "splitCostUsd", "inputUsd", "cachedUsd", "outputUsd", "reasoningUsd", "otherUsd",
  "toolStepsUsd", "steps", "toolCalls", "promptTokens", "completionTokens", "cacheReadTokens", "reasoningTokens",
] as const;

/** Every purpose added together: what the donut shows with nothing picked. */
function sumBreakdown(rows: Breakdown[]): Breakdown {
  const total = { kind: "all" } as Breakdown;
  for (const k of BREAKDOWN_KEYS) total[k] = rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  return total;
}

/**
 * The parts, in a fixed order with a fixed colour each. The colour follows the
 * part, never its rank, so "Thinking" is the same colour on every purpose and
 * picking another row never repaints the ring.
 */
const PARTS = [
  { key: "inputUsd", label: "Input", color: SERIES[0] },
  { key: "cachedUsd", label: "Cached input", color: SERIES[1] },
  { key: "outputUsd", label: "Reply", color: SERIES[2] },
  { key: "reasoningUsd", label: "Thinking", color: SERIES[3] },
  { key: "otherUsd", label: "Web search & fees", color: SERIES[4] },
] as const;

/**
 * The ring for one purpose, or for all of them.
 *
 * Only the calls that could be broken down are drawn. Anything written before
 * the breakdown existed is a total with no parts, and it is said in a line
 * under the ring rather than drawn as a grey slice that looks like a sixth
 * kind of spending.
 */
function CostParts({ b, label }: { b: Breakdown | null; label: string }) {
  if (!b || b.splitCostUsd <= 0) {
    return <Empty>No breakdown for {label.toLowerCase()} in this period yet. Calls are split from the day the breakdown shipped.</Empty>;
  }
  const items = PARTS.map((p) => ({ label: p.label, value: b[p.key], display: usd(b[p.key]), color: p.color })).filter(
    (i) => i.value > 0,
  );
  const unsplit = Math.max(0, b.costUsd - b.splitCostUsd);
  const toolShare = b.splitCostUsd > 0 ? Math.round((b.toolStepsUsd / b.splitCostUsd) * 100) : 0;
  return (
    <div className="space-y-4">
      <Donut items={items} total={b.splitCostUsd} centerValue={usd(b.splitCostUsd)} centerLabel="spent" ariaLabel={`What ${label.toLowerCase()} spend bought`} />
      <dl className="text-caption grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Tool round trips</dt>
          <dd className="tabular">
            {usd(b.toolStepsUsd)} <span className="text-muted-foreground">({toolShare}%)</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tool calls</dt>
          <dd className="tabular">
            {compact(b.toolCalls)} <span className="text-muted-foreground">over {compact(b.steps)} steps</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Input per call</dt>
          <dd className="tabular">{b.calls > 0 ? compact(b.promptTokens / b.calls) : "0"} tokens</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Thinking share</dt>
          <dd className="tabular">
            {b.completionTokens > 0 ? Math.round((b.reasoningTokens / b.completionTokens) * 100) : 0}%
          </dd>
        </div>
      </dl>
      {unsplit > 0.000001 && (
        <p className="text-muted-foreground text-caption">
          {usd(unsplit)} more was spent before the breakdown existed and is left out of the ring.
        </p>
      )}
    </div>
  );
}

export function AiClient() {
  const range = useRange();
  const { data, isPending } = useGetApiAdminAi({ range });
  // Which purpose the breakdown is showing; null is all of them.
  const [selectedKind, setSelectedKind] = useState<string | null>(null);

  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const a = apiData<Ai>(data) ?? ({} as Ai);
  const t = a.totals ?? ({} as Ai["totals"]);
  // The same window immediately before, so each tile shows a movement rather
  // than a caption explaining itself. Same comparison the Overview tiles make.
  const p = a.previous ?? ({} as Ai["previous"]);
  const days = a.days ?? [];
  // Spend per purpose, keyed for lookup beside the call counts.
  const costOfKind = new Map((a.costByKind ?? []).map((k) => [k.key, k.value] as const));
  const byKind = a.byKind ?? [];
  const breakdown = a.breakdown ?? [];
  const selectedIndex = selectedKind ? byKind.findIndex((k) => k.key === selectedKind) : -1;
  const selectedBreakdown = selectedKind
    ? (breakdown.find((b) => b.kind === selectedKind) ?? null)
    : breakdown.length > 0
      ? sumBreakdown(breakdown)
      : null;
  const selectedLabel = selectedKind ? (KIND_LABEL[selectedKind] ?? selectedKind) : "All purposes";
  // Cost and speed per model, joined into one table: they are the two halves of
  // the same trade-off and used to sit in two cards listing the same models.
  const costOfModel = new Map((a.byModel ?? []).map((m) => [m.key, m.value] as const));
  const modelSpend = (a.byModel ?? []).reduce((n, m) => n + m.value, 0);
  const modelRows = [
    ...(a.latency ?? []).map((l) => ({ ...l, cost: costOfModel.get(l.model) ?? 0 })),
    ...(a.byModel ?? [])
      .filter((m) => !(a.latency ?? []).some((l) => l.model === m.key))
      .map((m) => ({ model: m.key, calls: 0, p50: 0, p90: 0, errorRate: 0, cost: m.value })),
  ].sort((x, y) => y.cost - x.cost || y.calls - x.calls);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">AI cost</h1>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {/*
          Every tile compares against the same length of time immediately
          before, as the Overview tiles do. They used to be handed their own
          value as `previous`, so all six printed "no change" for ever and the
          line under each number was spent on a caveat about its denominator
          instead. The caveats still exist, in the tooltip, where a caveat you
          need once belongs.
        */}
        <KpiTile
          label="Spend"
          value={t.costUsd ?? 0}
          previous={p.costUsd ?? 0}
          comparedTo="the period before"
          series={a.costSeries}
          format={usd}
          lowerIsBetter
          hint="as billed by OpenRouter"
          about={
            (t.unpricedCalls ?? 0) > 0
              ? `Summed from what OpenRouter charged, never computed here. ${(t.unpricedCalls ?? 0).toLocaleString()} calls in this window came back with no cost and are left out rather than counted as free.`
              : "Summed from what OpenRouter charged, never computed here."
          }
        />
        <KpiTile
          label="Per conversation"
          value={t.costPerConversationUsd ?? 0}
          previous={p.costPerConversationUsd ?? 0}
          comparedTo="the period before"
          format={usd}
          lowerIsBetter
          hint="what one chat costs us"
          about={
            (t.pricedConversations ?? 0) > 0
              ? `Averaged over the ${(t.pricedConversations ?? 0).toLocaleString()} conversations whose cost is actually known. Dividing by every conversation would read far too low while unpriced history is still in range.`
              : "No conversation in this window has a known cost yet."
          }
        />
        <KpiTile
          label="Tokens"
          value={t.tokens ?? 0}
          previous={p.tokens ?? 0}
          comparedTo="the period before"
          series={a.tokenSeries}
          format={compact}
        />
        <KpiTile
          label="Model calls"
          value={t.calls ?? 0}
          previous={p.calls ?? 0}
          comparedTo="the period before"
          series={a.callSeries}
          format={compact}
        />
        <KpiTile
          label="Conversations"
          value={t.conversations ?? 0}
          previous={p.conversations ?? 0}
          comparedTo="the period before"
          format={compact}
        />
        <KpiTile
          label="Error rate"
          value={t.errorRate ?? 0}
          previous={p.errorRate ?? 0}
          comparedTo="the period before"
          format={(n) => `${n}%`}
          lowerIsBetter
          hint={`${(t.errors ?? 0).toLocaleString()} failed`}
        />
      </div>

      <ChartCard
        title="Spend over time"
        /**
         * Rows written before the cutover have no cost at all — they were
         * priced by a stale rate table we have since deleted, and without a
         * generation id they cannot be looked up. The subtitle says so rather
         * than letting a flat early stretch read as a cheap fortnight.
         */
        subtitle="As charged by OpenRouter. Earlier days read as zero — they predate it."
        aside={<Legend items={[{ label: "Cost", color: SERIES[0]! }]} />}
      >
        <TrendChart
          days={days}
          series={[{ key: "cost", label: "Cost ($)" }]}
          data={{ cost: a.costSeries ?? [] }}
          averageOf="cost"
        />
      </ChartCard>

      {/*
        Two thirds and one third of one row. The models table is five short
        columns and was taking a full-width row to say very little, while the
        donut card beside it is the one people came to read. Below `xl` they
        stack, because the money card's own two halves need the width more than
        the row does.
      */}
      <div className="grid gap-3 xl:grid-cols-3">
      <ChartCard
        className="xl:col-span-2"
        title="Where the money goes"
        subtitle="Pick a purpose to see what its spend bought. Nothing picked shows the whole period."
        hint="Each call's cost is what OpenRouter charged. It is split into parts by OpenRouter's own live rates for the model that ran, so the parts always add back up to the charge. Input is the prompt sent fresh; cached input is prompt served from the provider's cache at a fraction of the rate; thinking is output the model spends reasoning and nobody sees; web search & fees is whatever no token accounts for. Tool round trips are the steps after a tool call, which re-send the whole prompt: a different cut of the same money, not another part."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-muted-foreground text-caption mb-2">Calls by purpose</p>
            <BarList
              /*
                Bars stay sized by call count, since that is what "calls by purpose"
                means, with the spend carried alongside. The two rarely rank the
                same way, and the gap is the interesting part: a purpose that is
                2% of calls and most of the bill is the one worth making cheaper,
                and a count-only chart hides exactly that.
              */
              items={byKind.map((k) => {
                const cost = costOfKind.get(k.key) ?? 0;
                return {
                  label: KIND_LABEL[k.key] ?? k.key,
                  value: k.value,
                  display: cost > 0 ? `${compact(k.value)} · ${usd(cost)}` : compact(k.value),
                  // Neutral on purpose: the ring beside it owns the colours in
                  // this card, and an orange bar next to an orange "Input" slice
                  // reads as the same thing.
                  color: "var(--muted-foreground)",
                };
              })}
              total={byKind.reduce((n, k) => n + k.value, 0)}
              emptyLabel="No model calls in this period."
              selected={selectedIndex >= 0 ? selectedIndex : null}
              onSelect={(i) => setSelectedKind(i === null ? null : (byKind[i]?.key ?? null))}
            />
          </div>
          <div>
            <p className="text-muted-foreground text-caption mb-2">{selectedLabel}: what it bought</p>
            <CostParts b={selectedBreakdown} label={selectedLabel} />
          </div>
        </div>
      </ChartCard>

      {/*
        Latency belongs on this page rather than a general health one: the
        number people feel is how long the interviewer takes to answer, and
        that is a per-model property traded off directly against cost.
      */}
      <ChartCard
        title="Models"
        subtitle="What each cost, and how fast it answered."
        hint="p50 is the median call and p90 the slow tenth, both measured end to end. Share is this model's cut of the period's spend. A model with no calls recorded has latency of 0."
      >
        <DataTable
          rows={modelRows}
          empty="No model calls in this period."
          columns={[
            { key: "model", header: "Model", render: (m) => m.model.split("/").pop() ?? m.model },
            { key: "calls", header: "Calls", width: "3.5rem", numeric: true, render: (m) => compact(m.calls) },
            {
              key: "cost",
              header: "Cost",
              width: "6.5rem",
              numeric: true,
              // Cost and its share in one cell: two columns of money in a third
              // of a row left the model name with nothing to be read in.
              render: (m) => (
                <>
                  {usd(m.cost)}
                  <span className="text-muted-foreground ml-1.5 opacity-70">
                    {modelSpend > 0 ? Math.round((m.cost / modelSpend) * 100) : 0}%
                  </span>
                </>
              ),
            },
            { key: "p50", header: "p50", width: "4rem", numeric: true, render: (m) => `${(m.p50 / 1000).toFixed(1)}s` },
            {
              key: "p90",
              header: "p90",
              width: "4rem",
              numeric: true,
              render: (m) => (
                <span className={m.p90 > 15_000 ? "text-[var(--warning-soft-foreground)]" : undefined}>
                  {(m.p90 / 1000).toFixed(1)}s
                </span>
              ),
            },
          ]}
        />
      </ChartCard>
      </div>

      {/*
        The margin table. A free account costing real money is a marketing
        expense; a paid one costing more than it pays is a pricing bug.
      */}
      <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        title="Costing more than they pay"
        subtitle="AI spend above revenue. Free accounts appear once they cost more than a few cents."
        hint="Revenue is monthly; spend is over the selected period. The two line up exactly at 30 days — over 90, an account can look like a loss-maker only because it is being compared against one month of income. An account marked comped was granted its plan by hand and pays nothing by design."
      >
        <DataTable
          rows={a.lossMakers ?? []}
          hrefFor={(row) => `/admin/accounts/${str(row, "org_id")}`}
          empty="Nobody is costing more than they pay."
          columns={[
            { key: "name", header: "Account", render: (row) => str(row, "name") },
            {
              key: "plan",
              // Wide enough for the badge around the longest plan name: the
              // cell clips, and at 5.5rem "business" lost its last letters to
              // an ellipsis sitting outside the pill.
              header: "Plan",
              width: "6.5rem",
              render: (row) => (
                <Badge
                  className={
                    str(row, "plan") === "free" ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary"
                  }
                >
                  {str(row, "plan")}
                </Badge>
              ),
            },
            { key: "conversations", header: "Chats", width: "5rem", numeric: true, render: (row) => compact(num(row, "conversations")) },
            { key: "tokens", header: "Tokens", width: "5.5rem", numeric: true, render: (row) => compact(num(row, "tokens")) },
            { key: "cost", header: "Costs us", width: "6rem", numeric: true, render: (row) => usd(num(row, "cost_usd")) },
            {
              key: "mrr",
              header: "Pays us",
              width: "6rem",
              numeric: true,
              /*
                A paid plan against no revenue reads as a broken billing lookup,
                and for a comped account it is not one — the plan was granted by
                hand and never charged for. Saying so is the difference between
                a pricing bug and a deliberate expense.
              */
              render: (row) =>
                num(row, "mrr_cents") > 0 ? (
                  money(num(row, "mrr_cents"))
                ) : (
                  <span className="text-muted-foreground">{num(row, "comped") > 0 ? "comped" : "—"}</span>
                ),
            },
          ]}
        />
      </ChartCard>

        <ChartCard title="Biggest AI users" subtitle="By spend in this period, whatever they pay.">
        <DataTable
          rows={a.topSpenders ?? []}
          hrefFor={(row) => `/admin/accounts/${str(row, "org_id")}`}
          empty="No AI usage in this period."
          columns={[
            { key: "name", header: "Account", render: (row) => str(row, "name") },
            { key: "plan", header: "Plan", width: "5.5rem", render: (row) => str(row, "plan") },
            { key: "calls", header: "Calls", width: "5rem", numeric: true, render: (row) => compact(num(row, "calls")) },
            { key: "tokens", header: "Tokens", width: "5.5rem", numeric: true, render: (row) => compact(num(row, "tokens")) },
            { key: "cost", header: "Cost", width: "6rem", numeric: true, render: (row) => usd(num(row, "cost_usd")) },
          ]}
        />
        </ChartCard>
      </div>
    </div>
  );
}

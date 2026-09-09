"use client";

import { useGetApiAdminAi } from "@/lib/api/admin/admin";
import { BarList, ChartCard, Legend, SERIES } from "@/components/charts/chart-kit";
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
  totals: {
    costMicro: number;
    tokens: number;
    calls: number;
    errors: number;
    errorRate: number;
    costPerConversationMicro: number;
    conversations: number;
  };
  latency: { model: string; calls: number; p50: number; p90: number; errorRate: number }[];
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
  research: "Website research",
};

/** USD micros → cents, so a dollars-axis chart reads correctly. */
const microToCents = (micro: number) => micro / 10_000;

export function AiClient() {
  const range = useRange();
  const { data, isPending } = useGetApiAdminAi({ range });

  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const a = apiData<Ai>(data) ?? ({} as Ai);
  const t = a.totals ?? ({} as Ai["totals"]);
  const days = a.days ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">AI cost</h1>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Spend"
          value={t.costMicro ?? 0}
          previous={t.costMicro ?? 0}
          series={a.costSeries}
          format={usd}
          lowerIsBetter
          hint="in this period"
        />
        <KpiTile
          label="Per conversation"
          value={t.costPerConversationMicro ?? 0}
          previous={t.costPerConversationMicro ?? 0}
          format={usd}
          lowerIsBetter
          hint="the unit economics"
        />
        <KpiTile
          label="Tokens"
          value={t.tokens ?? 0}
          previous={t.tokens ?? 0}
          series={a.tokenSeries}
          format={compact}
        />
        <KpiTile label="Model calls" value={t.calls ?? 0} previous={t.calls ?? 0} series={a.callSeries} format={compact} />
        <KpiTile label="Conversations" value={t.conversations ?? 0} previous={t.conversations ?? 0} format={compact} />
        <KpiTile
          label="Error rate"
          value={t.errorRate ?? 0}
          previous={t.errorRate ?? 0}
          format={(n) => `${n}%`}
          lowerIsBetter
          hint={`${(t.errors ?? 0).toLocaleString()} failed calls`}
        />
      </div>

      <ChartCard
        title="Spend over time"
        aside={<Legend items={[{ label: "Cost", color: SERIES[0]! }]} />}
      >
        <TrendChart
          days={days}
          series={[{ key: "cost", label: "Cost ($)" }]}
          data={{ cost: (a.costSeries ?? []).map((m) => Math.round(microToCents(m)) / 100) }}
          averageOf="cost"
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Cost by model">
          <BarList
            items={(a.byModel ?? []).map((m) => ({
              label: m.key.split("/").pop() ?? m.key,
              value: m.value,
              display: usd(m.value),
            }))}
            total={(a.byModel ?? []).reduce((n, m) => n + m.value, 0)}
            colorBy="series"
            emptyLabel="No model calls in this period."
          />
        </ChartCard>

        <ChartCard title="Calls by purpose" subtitle="What the platform is asking models to do.">
          <BarList
            items={(a.byKind ?? []).map((k) => ({
              label: KIND_LABEL[k.key] ?? k.key,
              value: k.value,
              display: compact(k.value),
            }))}
            total={(a.byKind ?? []).reduce((n, k) => n + k.value, 0)}
            colorBy="series"
            emptyLabel="No model calls in this period."
          />
        </ChartCard>

        {/*
          Latency belongs on this page rather than a general health one: the
          number people feel is how long the interviewer takes to answer, and
          that is a per-model property traded off directly against cost.
        */}
        <ChartCard title="How fast each model answers" subtitle="Median and 90th percentile.">
          <DataTable
            rows={a.latency ?? []}
            empty="No latency recorded."
            columns={[
              { key: "model", header: "Model", render: (m) => m.model.split("/").pop() ?? m.model },
              { key: "calls", header: "Calls", width: "4.5rem", numeric: true, render: (m) => compact(m.calls) },
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
            { key: "cost", header: "Costs us", width: "6rem", numeric: true, render: (row) => usd(num(row, "cost_micro")) },
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
            { key: "cost", header: "Cost", width: "6rem", numeric: true, render: (row) => usd(num(row, "cost_micro")) },
          ]}
        />
        </ChartCard>
      </div>
    </div>
  );
}

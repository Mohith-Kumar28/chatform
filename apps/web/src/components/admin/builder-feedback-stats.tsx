"use client";

import { builderAreaLabel } from "@repo/form-schema";
import { useGetApiAdminFeedbackBuilderStats } from "@/lib/api/admin/admin";
import { ChartCard, ColumnChart, Legend, seriesColor } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { COMPARED_TO, useRange } from "./range-picker";
import { faceFor } from "./feedback-faces";
import { kindLabel } from "./builder-feedback-issues";
import { capitalise } from "./builder-feedback-dialog";

/**
 * The numbers under the builders' inbox: how much is arriving, of what kind,
 * about which part of the product, and from whom.
 *
 * The respondent stats' shape. Every table row links into the inbox narrowed to
 * it, because the only question a cluster raises is "show me those".
 */

interface Keyed {
  key: string;
  label: string | null;
  value: number;
}

interface Stats {
  days: string[];
  total: number;
  previousTotal: number;
  bugs: number;
  previousBugs: number;
  features: number;
  previousFeatures: number;
  accounts: number;
  previousAccounts: number;
  average: number | null;
  previousAverage: number | null;
  unresolved: number;
  series: { byKind: { kind: string; counts: number[] }[] };
  distribution: { rating: number; count: number }[];
  byArea: Keyed[];
  byPlan: Keyed[];
  topAccounts: Keyed[];
}

export function BuilderFeedbackStats() {
  const range = useRange();
  const { data, isPending } = useGetApiAdminFeedbackBuilderStats({ range });

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const s = apiData<Stats>(data) ?? ({} as Stats);
  const comparedTo = COMPARED_TO[range];
  const byKind = s.series?.byKind ?? [];
  const volume = (s.days ?? []).map((_, i) => byKind.reduce((n, b) => n + (b.counts[i] ?? 0), 0));
  const rated = (s.distribution ?? []).reduce((n, d) => n + d.count, 0);
  const pctOf = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : undefined);

  const countColumns = (header: string, labelOf: (row: Keyed) => string) => [
    { key: "label", header, render: labelOf },
    { key: "n", header: "Reports", numeric: true, width: "5rem", render: (row: Keyed) => row.value.toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Reports" value={s.total ?? 0} previous={s.previousTotal} series={volume} comparedTo={comparedTo} />
        <KpiTile
          label="Bugs"
          value={s.bugs ?? 0}
          previous={s.previousBugs}
          comparedTo={comparedTo}
          sub={pctOf(s.bugs ?? 0, s.total ?? 0)}
          lowerIsBetter
        />
        <KpiTile
          label="Feature requests"
          value={s.features ?? 0}
          previous={s.previousFeatures}
          comparedTo={comparedTo}
          sub={pctOf(s.features ?? 0, s.total ?? 0)}
        />
        <KpiTile
          label="Accounts writing in"
          value={s.accounts ?? 0}
          previous={s.previousAccounts}
          comparedTo={comparedTo}
          about="Distinct accounts that sent anything in the period. One team sending five reports is one voice."
        />
        <KpiTile
          label="Average rating"
          value={s.average ?? 0}
          previous={s.previousAverage ?? undefined}
          format={(n) => (s.average === null ? "Too few" : n.toFixed(1))}
          comparedTo={comparedTo}
          about="The mean of the faces on reports sent as Feedback, 1 to 5. Shown once there are five of them."
        />
        <KpiTile
          label="Unresolved"
          value={s.unresolved ?? 0}
          about="Every report still marked new, across all time. The period picker does not narrow this."
          lowerIsBetter
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Reports over time"
          subtitle="Each day's reports, by kind."
          aside={<Legend items={byKind.map((b, i) => ({ label: kindLabel(b.kind), color: seriesColor(i) }))} />}
        >
          <TrendChart
            days={s.days ?? []}
            series={byKind.map((b, i) => ({ key: b.kind, label: kindLabel(b.kind), color: seriesColor(i) }))}
            data={Object.fromEntries(byKind.map((b) => [b.kind, b.counts]))}
            stacked
            shape="bar"
            height={240}
          />
        </ChartCard>

        <ChartCard title="How they rated us" subtitle={rated ? `${rated.toLocaleString()} rated reports` : "No ratings in this period"}>
          <ColumnChart
            bars={(s.distribution ?? []).map((d) => ({
              label: faceFor(d.rating).label,
              value: d.count,
              hint: pctOf(d.count, rated),
            }))}
            colorFor={(_label, i) => faceFor(i + 1).color}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Which part of the product" subtitle="Each links to its reports.">
          <DataTable
            rows={s.byArea ?? []}
            columns={countColumns("Area", (a) => builderAreaLabel(a.key) ?? a.key)}
            hrefFor={(a) => inboxHref({ area: a.key })}
            empty="Nothing sent in this period."
          />
        </ChartCard>

        <ChartCard title="Which plan they are on" subtitle="The plan when they wrote in.">
          <DataTable
            rows={s.byPlan ?? []}
            columns={countColumns("Plan", (p) => capitalise(p.key))}
            hrefFor={(p) => inboxHref({ plan: p.key })}
            empty="Nothing sent in this period."
          />
        </ChartCard>

        <ChartCard title="Accounts writing most" subtitle="Each links to its reports.">
          <DataTable
            rows={s.topAccounts ?? []}
            columns={countColumns("Account", (a) => a.label ?? a.key)}
            hrefFor={(a) => inboxHref({ orgId: a.key })}
            empty="Nothing sent in this period."
          />
        </ChartCard>
      </div>
    </div>
  );
}

/** The builders' reports list, narrowed to one cluster and opened across every status. */
function inboxHref(filter: Record<string, string>): string {
  const q = new URLSearchParams({ view: "admins", list: "reports", status: "all", ...filter });
  return `/admin/feedback?${q.toString()}`;
}

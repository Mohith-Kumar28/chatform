"use client";

import { useState } from "react";
import { feedbackTopicLabel } from "@repo/form-schema";
import { useGetApiAdminFeedbackStats } from "@/lib/api/admin/admin";
import { ChartCard, ColumnChart, Legend } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { DataTable, type Column } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { COMPARED_TO, useRange } from "./range-picker";
import { faceFor } from "./feedback-faces";

/**
 * The numbers above the inbox: is anything wrong, which way is it going, where.
 *
 * Three questions, three rows. The tiles say how much. The chart says when, and
 * its colours say how it felt. The distribution and the three cluster tables say where,
 * and every cluster row links into the inbox filtered to it, because the only
 * question a cluster raises is "show me those reports".
 */

interface Cluster {
  key: string | null;
  label: string | null;
  slug: string | null;
  orgId: string | null;
  count: number;
  average: number | null;
}

interface Stats {
  days: string[];
  total: number;
  previousTotal: number;
  average: number | null;
  previousAverage: number | null;
  withNote: number;
  previousWithNote: number;
  respondents: number;
  previousRespondents: number;
  bad: number;
  previousBad: number;
  unresolved: number;
  distribution: { rating: number; count: number }[];
  series: {
    volume: number[];
    withNote: number[];
    average: (number | null)[];
    byRating: { rating: number; counts: number[] }[];
  };
  bySource: { key: string; value: number }[];
  topForms: Cluster[];
  topAccounts: Cluster[];
  topTopics: { key: string; value: number }[];
}

type VolumeView = "total" | "rating";

export function FeedbackStats() {
  const range = useRange();
  const [view, setView] = useState<VolumeView>("rating");
  const { data, isPending } = useGetApiAdminFeedbackStats({ range });

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
  const days = s.days ?? [];
  const pctOf = (n: number) => (s.total > 0 ? `${Math.round((n / s.total) * 100)}%` : undefined);

  const clusterColumns: Column<Cluster>[] = [
    { key: "label", header: "Name", render: (c) => c.label ?? c.key ?? "since deleted" },
    { key: "count", header: "Reports", numeric: true, width: "5rem", render: (c) => c.count.toLocaleString() },
    {
      key: "avg",
      header: "Avg",
      numeric: true,
      width: "4rem",
      // A mean of two reports is noise wearing a measurement's clothes.
      render: (c) => (c.average === null ? "—" : c.average.toFixed(1)),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Reports"
          value={s.total ?? 0}
          previous={s.previousTotal}
          series={s.series?.volume}
          comparedTo={comparedTo}
          // More reports is not good news, even when it means more people found the link.
          lowerIsBetter
        />
        <KpiTile
          label="Average rating"
          value={s.average ?? 0}
          previous={s.previousAverage ?? undefined}
          format={(n) => (s.average === null ? "—" : n.toFixed(1))}
          comparedTo={comparedTo}
          about="The mean of the five faces, 1 to 5, over reports not marked spam."
        />
        <KpiTile
          label="Bad or terrible"
          value={s.bad ?? 0}
          previous={s.previousBad}
          comparedTo={comparedTo}
          sub={pctOf(s.bad ?? 0)}
          lowerIsBetter
        />
        <KpiTile
          label="With a note"
          value={s.withNote ?? 0}
          previous={s.previousWithNote}
          comparedTo={comparedTo}
          sub={pctOf(s.withNote ?? 0)}
          about="Reports that said something as well as picking a face — the ones that can be acted on."
        />
        <KpiTile
          label="People reporting"
          value={s.respondents ?? 0}
          previous={s.previousRespondents}
          comparedTo={comparedTo}
          about="Distinct respondents. One person filing three reports about the same broken picker is one voice, not three."
        />
        {/* A standing queue, not a count for this period — so no comparison to invent. */}
        <KpiTile
          label="Unresolved"
          value={s.unresolved ?? 0}
          about="Every report still marked new, across all time. The period picker does not narrow this — old work is still work."
          lowerIsBetter
        />
      </div>

      {/*
        One chart for "when", coloured by rating — so volume and sentiment are
        read off the same bars. A second chart of the daily average sat beside
        it and said the same thing worse: the colours of a stacked bar already
        show whether a day went red or green.
      */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Reports over time"
          subtitle="Each day's reports, coloured by how they rated it."
          aside={
            <div className="flex items-center gap-3">
              {view === "rating" && (
                <Legend items={[5, 4, 3, 2, 1].map((r) => ({ label: faceFor(r).label, color: faceFor(r).color }))} />
              )}
              <SegmentedControl
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: "rating", label: "By rating" },
                  { value: "total", label: "Total" },
                ]}
                ariaLabel="How to split the reports"
              />
            </div>
          }
        >
          {view === "total" ? (
            <TrendChart
              days={days}
              series={[{ key: "volume", label: "Reports" }]}
              data={{ volume: s.series?.volume ?? [] }}
              averageOf="volume"
              height={240}
            />
          ) : (
            <TrendChart
              days={days}
              // Worst at the bottom of the stack, so a red band growing from the
              // baseline is the first thing the eye meets.
              series={[1, 2, 3, 4, 5].map((r) => ({ key: `r${r}`, label: faceFor(r).label, color: faceFor(r).color }))}
              data={Object.fromEntries((s.series?.byRating ?? []).map((b) => [`r${b.rating}`, b.counts]))}
              stacked
              shape="bar"
              height={240}
            />
          )}
        </ChartCard>

        <ChartCard
          title="How they rated it"
          subtitle={
            (s.bySource ?? [])
              .map((b) => `${b.value.toLocaleString()} ${b.key === "embed" ? "from embeds" : "from the hosted page"}`)
              .join(" · ") || undefined
          }
        >
          <ColumnChart
            bars={(s.distribution ?? []).map((d) => ({
              label: faceFor(d.rating).label,
              value: d.count,
              hint: pctOf(d.count),
            }))}
            colorFor={(_label, i) => faceFor(i + 1).color}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Forms it happens on" subtitle="Each links to its reports.">
          <DataTable
            rows={s.topForms ?? []}
            columns={clusterColumns}
            hrefFor={(c) => inboxHref({ formId: c.key })}
            empty="No form has a report in this period."
          />
        </ChartCard>

        <ChartCard title="Accounts they come from" subtitle="Each links to its reports.">
          <DataTable
            rows={s.topAccounts ?? []}
            columns={clusterColumns}
            hrefFor={(c) => inboxHref({ orgId: c.key })}
            empty="No account has a report in this period."
          />
        </ChartCard>

        <ChartCard
          title="What it is about"
          subtitle="Read from each note when it arrives."
          hint="Every note is classified once, into a fixed list, by a small model — fixed so that the same problem counts as the same problem. Reports with no words have no topic."
        >
          <DataTable
            rows={(s.topTopics ?? []).map((t) => ({ key: t.key, value: t.value }))}
            columns={[
              { key: "topic", header: "Topic", render: (t) => feedbackTopicLabel(t.key) ?? t.key },
              { key: "n", header: "Reports", numeric: true, width: "5rem", render: (t) => t.value.toLocaleString() },
            ]}
            hrefFor={(t) => inboxHref({ topic: t.key })}
            empty="Nothing classified in this period yet."
          />
        </ChartCard>
      </div>
    </div>
  );
}

/** The inbox, narrowed to one cluster and opened across every status. */
function inboxHref(filter: Record<string, string | null>): string {
  const q = new URLSearchParams({ status: "all" });
  for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
  return `/admin/feedback?${q.toString()}`;
}

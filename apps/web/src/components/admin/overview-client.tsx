"use client";

import { useState } from "react";
import { useGetApiAdminOverview } from "@/lib/api/admin/admin";
import { ChartCard, Donut, Legend, SERIES } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { FunnelBars, type FunnelStep } from "@/components/charts/funnel-bars";
import { CohortGrid, type Cohort } from "@/components/charts/cohort-grid";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "./kpi-tile";
import { ActionQueue } from "./action-queue";
import { RangePicker, useRange } from "./range-picker";
import { apiData } from "@/lib/api/payload";
import { money, usd, relativeDay } from "./format";

interface Overview {
  days: string[];
  kpis: Record<string, { value: number; previous: number }>;
  series: Record<string, number[]>;
  funnel: FunnelStep[];
  planMix: { plan: string; orgs: number }[];
  mrrSeries: number[];
  cohorts: Cohort[];
  formStatsAsOf: number | null;
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

/** Which cohort each funnel step drops you into on the accounts page. */
const FUNNEL_COHORT: Record<string, string | null> = {
  signed_up: null,
  created_form: "created_form",
  published: "published",
  first_response: "first_response",
  ten_responses: "ten_responses",
  paid: "paid",
};

const GROWTH_VIEWS = {
  acquisition: {
    label: "Acquisition",
    series: [
      { key: "signups", label: "Signups" },
      { key: "orgs_created", label: "New accounts" },
    ],
    averageOf: "signups",
  },
  building: {
    label: "Building",
    series: [
      { key: "forms_created", label: "Forms created" },
      { key: "forms_published", label: "Published" },
    ],
    averageOf: "forms_created",
  },
  collecting: {
    label: "Collecting",
    series: [
      { key: "responses_completed", label: "Completed" },
      { key: "responses_started", label: "Started" },
    ],
    averageOf: "responses_completed",
  },
} as const;

type GrowthView = keyof typeof GROWTH_VIEWS;

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", business: "Business" };

export function OverviewClient() {
  const range = useRange();
  const [view, setView] = useState<GrowthView>("acquisition");
  const { data, isPending } = useGetApiAdminOverview({ range });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const o = apiData<Overview>(data) ?? ({} as Overview);
  const days = o.days ?? [];
  const kpi = (key: string) => o.kpis?.[key] ?? { value: 0, previous: 0 };
  const planTotal = (o.planMix ?? []).reduce((n, p) => n + p.orgs, 0);
  const growth = GROWTH_VIEWS[view];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Overview</h1>
          <p className="text-muted-foreground text-caption mt-0.5">
            Every organization, every form, every response — across the whole platform.
          </p>
        </div>
        <RangePicker />
      </div>

      {/* Where things stand. Deltas compare to the same length of time before. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Signups" {...kpi("signups")} series={o.series?.signups} />
        <KpiTile label="New accounts" {...kpi("orgs_created")} series={o.series?.orgs_created} />
        <KpiTile label="Forms created" {...kpi("forms_created")} series={o.series?.forms_created} />
        <KpiTile
          label="Responses collected"
          {...kpi("responses_completed")}
          series={o.series?.responses_completed}
        />
        <KpiTile
          label="MRR"
          {...kpi("mrr_cents")}
          series={o.mrrSeries}
          format={money}
          hint="vs a period ago"
        />
        <KpiTile
          label="AI spend"
          {...kpi("ai_cost_micro")}
          series={o.series?.ai_cost_micro}
          format={usd}
          // The one tile where climbing is bad.
          lowerIsBetter
        />
      </div>

      {/*
        The funnel is tall and the plan mix is short, so the right-hand column
        stacks two cards rather than letting one stretch to the funnel's height
        with nothing in the bottom half. It also puts the two commercial charts
        — who is on what, and what that is worth — next to each other.
      */}
      <div className="grid items-start gap-3 lg:grid-cols-5">
        {/*
          The funnel gets the wider column because it is the chart that
          produces work. Everything else describes; this one accuses.
        */}
        <ChartCard
          className="lg:col-span-3"
          title="From signup to paying"
          subtitle="Accounts that signed up in this period, and how far each one got."
        >
          <FunnelBars
            steps={o.funnel ?? []}
            hrefFor={(step) => {
              // Carry the period too, so the list is cohorted on the same window
              // the funnel counted — otherwise a 30-day bar links into an
              // all-time list and the two numbers differ for no visible reason.
              const days = RANGE_DAYS[range];
              const cohort = FUNNEL_COHORT[step.key];
              return cohort
                ? `/admin/accounts?cohort=${cohort}&since=${days}`
                : `/admin/accounts?since=${days}`;
            }}
          />
        </ChartCard>

        <div className="grid gap-3 lg:col-span-2">
          <ChartCard title="Who is on what" subtitle="Every organization, by the plan it is on today.">
            <Donut
              items={(o.planMix ?? []).map((p) => ({ label: PLAN_LABEL[p.plan] ?? p.plan, value: p.orgs }))}
              total={planTotal}
              centerValue={planTotal.toLocaleString()}
              centerLabel="accounts"
            />
          </ChartCard>

          <ChartCard
            title="Recurring revenue"
            subtitle="Monthly equivalent — a yearly plan counts as a twelfth per month."
            aside={<Legend items={[{ label: "MRR", color: SERIES[0]! }]} />}
          >
            <TrendChart
              days={days}
              series={[{ key: "mrr", label: "MRR" }]}
              // Cents to dollars: an axis in cents reads as a revenue figure a
              // hundred times larger than it is.
              data={{ mrr: (o.mrrSeries ?? []).map((c) => Math.round(c / 100)) }}
              height={180}
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title="Growth"
        subtitle="Daily, with a seven-day average over the noise."
        aside={
          <div className="flex items-center gap-3">
            <Legend items={growth.series.map((s, i) => ({ label: s.label, color: SERIES[i]! }))} />
            <SegmentedControl
              size="sm"
              value={view}
              onChange={setView}
              options={Object.entries(GROWTH_VIEWS).map(([value, v]) => ({ value: value as GrowthView, label: v.label }))}
              ariaLabel="What to plot"
            />
          </div>
        }
      >
        <TrendChart
          days={days}
          series={growth.series.map((s) => ({ ...s }))}
          data={o.series ?? {}}
          averageOf={growth.averageOf}
        />
      </ChartCard>

      {/* Full width: the triangle grows a column per week, and a half-width card
          would start scrolling it sideways within three months. */}
      <ChartCard
        title="Do they come back?"
        subtitle="Of the accounts that signed up in a week, the share still collecting or building later."
      >
        <CohortGrid cohorts={o.cohorts ?? []} />
      </ChartCard>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-h3">What needs you today</h2>
          {o.formStatsAsOf && (
            <p className="text-muted-foreground text-micro">Form breakdown last rebuilt {relativeDay(o.formStatsAsOf)}</p>
          )}
        </div>
        <ActionQueue />
      </div>
    </div>
  );
}

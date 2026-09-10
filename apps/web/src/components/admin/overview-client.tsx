"use client";

import { useState } from "react";
import { useGetApiAdminOverview } from "@/lib/api/admin/admin";
import { ChartCard, Legend, SERIES } from "@/components/charts/chart-kit";
import { PieChart } from "@/components/charts/pie-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { FunnelShape, type FunnelStep } from "@/components/charts/funnel-shape";
import { CohortGrid, NOISE_FLOOR, type Cohort } from "@/components/charts/cohort-grid";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "./kpi-tile";
import { ActionQueue } from "./action-queue";
import { LiveActivity } from "./live-activity";
import { COMPARED_TO, RANGE_DAYS, RangePicker, useRange } from "./range-picker";
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
  timeToValueMs: number | null;
}

/** Which cohort each funnel step drops you into on the accounts page. */
const FUNNEL_COHORT: Record<string, string | null> = {
  signed_up: null,
  created_form: "created_form",
  published: "published",
  form_opened: "form_opened",
  first_response: "first_response",
  ten_responses: "ten_responses",
  paid: "paid",
};

/**
 * The three things that grow, named as the things themselves.
 *
 * These were "Acquisition", "Building" and "Collecting" — the funnel stage each
 * one belongs to rather than what is being counted. That reads fine to whoever
 * drew the funnel and to nobody else: "Collecting" plotting a series called
 * "Started" leaves the reader working out whether the subject is forms,
 * sessions or answers. Say the noun. The verb tenses on the series then have
 * something to attach to — "Started" under "Answers" can only mean one thing.
 */
const GROWTH_VIEWS = {
  /**
   * Arrivals against who is still here.
   *
   * The second series was "New accounts" — `orgs_created` — which is the same
   * number as Signups by construction: signing up creates the organization, so
   * the two lines traced each other exactly and the chart looked like it had
   * plotted one series twice. Active accounts is the fact that pairs with
   * signups and is not derivable from it: an account that collected a response
   * or edited a form that day, new or not.
   */
  people: {
    label: "People",
    series: [
      { key: "signups", label: "Signups" },
      { key: "active_orgs", label: "Active accounts" },
    ],
    averageOf: "signups",
  },
  forms: {
    label: "Forms",
    series: [
      { key: "forms_created", label: "Created" },
      { key: "forms_published", label: "Published" },
    ],
    averageOf: "forms_created",
  },
  answers: {
    label: "Answers",
    series: [
      { key: "responses_started", label: "Started" },
      { key: "responses_completed", label: "Finished" },
    ],
    averageOf: "responses_started",
  },
} as const;

type GrowthView = keyof typeof GROWTH_VIEWS;

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", business: "Business" };

export function OverviewClient() {
  const range = useRange();
  const [view, setView] = useState<GrowthView>("people");
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
  // Started in this window and still unfinished when their day ended — the same
  // union the results table calls partial, counted in the rollup.
  const partials = kpi("responses_partial").value;
  const growth = GROWTH_VIEWS[view];
  const comparedTo = COMPARED_TO[range];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Overview</h1>
        <RangePicker />
      </div>

      {/* Where things stand. Deltas compare to the same length of time before. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Signups" {...kpi("signups")} series={o.series?.signups} comparedTo={comparedTo} />
        {/*
          Not "New accounts", which was Signups again under a second name —
          the sign-up creates the organization. The number worth the tile beside
          arrivals is how many accounts actually did anything, which is the one
          of the two that can fall while the other rises.

          The headline counts each account once for the whole period; the
          sparkline is the daily figure, so it will not add up to it. That is
          the point of a distinct count, and the hint says so.
        */}
        <KpiTile
          label="Active accounts"
          {...kpi("active_orgs")}
          series={o.series?.active_orgs}
          comparedTo={comparedTo}
          hint="Accounts that collected a response or edited a form in this period, counted once each. The sparkline is the daily count."
        />
        <KpiTile
          label="Forms created"
          {...kpi("forms_created")}
          series={o.series?.forms_created}
          comparedTo={comparedTo}
        />
        {/*
          Finished responses, with the unfinished ones beside them.

          The tile counted completions only, so a form that half the world
          walked out of reported the same number as one nobody abandoned — and
          the abandonment is the more actionable half. The partials ride in the
          same tile rather than taking a seventh: they are not a measure of
          their own, they are the rest of this one.
        */}
        <KpiTile
          label="Responses collected"
          {...kpi("responses_completed")}
          series={o.series?.responses_completed}
          comparedTo={comparedTo}
          sub={partials > 0 ? `+${partials.toLocaleString()} partial` : undefined}
        />
        <KpiTile label="MRR" {...kpi("mrr_cents")} series={o.mrrSeries} format={money} comparedTo={comparedTo} />
        <KpiTile
          label="AI spend"
          {...kpi("ai_cost_micro")}
          series={o.series?.ai_cost_micro}
          format={usd}
          comparedTo={comparedTo}
          // The one tile where climbing is bad.
          lowerIsBetter
        />
      </div>

      {/*
        What is happening, before why it is happening.

        This row used to sit third, under the funnel. But the tiles above it
        answer "how much" and the two charts here answer "when" — the same
        question at two speeds, a 30-day trend beside the last half hour — so
        they belong in the same glance as the numbers they explain. The funnel
        and the plan split are the follow-up question, and follow-ups can wait
        one scroll.

        Growth gives up two columns to the live tile: a trend is a chart you
        study, a pulse is a chart you glance at, and both are wanted at the same
        moment — after a launch or a deploy.
      */}
      <div className="grid gap-3 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Growth"
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

        <LiveActivity className="lg:col-span-2" />
      </div>

      {/*
        Then why: where the arrivals go, and what they are worth.

        Two rows of two, rather than one tall card beside a stack of short ones.
        The funnel takes the wider column in both because it is the chart that
        produces work — everything else describes, this one accuses. The cards
        beside it are not pinned to the top: `ChartCard` fills its grid cell, so
        a row bottoms out on one line instead of three.
      */}
      <div className="grid gap-3 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="From signup to paying"
          subtitle="Accounts that signed up in this period, and how far each one got."
        >
          <FunnelShape
            steps={o.funnel ?? []}
            timeToValueMs={o.timeToValueMs ?? null}
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

        {/*
          A pie rather than the donut it was: the split *is* the question here,
          and the total it used to hold in its middle is a smaller fact that now
          rides in the corner. Naming each wedge on itself also retired the
          "N paying accounts, M trialing" line that used to sit underneath.
        */}
        <ChartCard
          className="lg:col-span-2"
          title="Who is on what"
          aside={`${planTotal.toLocaleString()} accounts`}
        >
          <PieChart
            items={(o.planMix ?? []).map((p) => ({ label: PLAN_LABEL[p.plan] ?? p.plan, value: p.orgs }))}
            total={planTotal}
            height={240}
            emptyLabel="No accounts yet."
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        {/* The triangle grows a column per week, so it takes the wider half. */}
        <ChartCard
          className="lg:col-span-3"
          title="Do they come back?"
          hint={`Each row is the accounts that signed up in that week; each cell is the share of them still collecting or building that many weeks later. Faded rows have fewer than ${NOISE_FLOOR} accounts — their percentages move too much to read as a trend.`}
        >
          <CohortGrid cohorts={o.cohorts ?? []} />
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Recurring revenue"
          hint="Monthly equivalent — a yearly plan counts as a twelfth per month, and manually comped accounts count as nothing."
          aside={<Legend items={[{ label: "MRR", color: SERIES[0]! }]} />}
        >
          <TrendChart
            days={days}
            series={[{ key: "mrr", label: "MRR" }]}
            // Cents to dollars: an axis in cents reads as a revenue figure a
            // hundred times larger than it is.
            data={{ mrr: (o.mrrSeries ?? []).map((c) => Math.round(c / 100)) }}
            height={190}
          />
        </ChartCard>
      </div>

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

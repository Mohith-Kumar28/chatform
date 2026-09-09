"use client";

import Link from "next/link";
import { useGetApiAdminRevenue } from "@/lib/api/admin/admin";
import { ChartCard, Legend, SERIES } from "@/components/charts/chart-kit";
import { PieChart } from "@/components/charts/pie-chart";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { TrendChart } from "@/components/charts/trend-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { KpiTile } from "./kpi-tile";
import { RangePicker, useRange } from "./range-picker";
import { money, relativeDay } from "./format";

/**
 * The money page.
 *
 * The chart that earns its place here is the last one: **which paywall people
 * hit, and whether they then paid**. Everything above it describes what already
 * happened; that one says what to do next. A feature dozens of accounts reach
 * for and few convert on is either priced wrong or does not deliver once bought;
 * a feature nobody reaches for at all is a tier boundary in the wrong place.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

interface Revenue {
  days: string[];
  mrrSeries: number[];
  payingSeries: number[];
  mrrByPlan: { plan: string; orgs: number; mrrCents: number }[];
  totals: {
    mrrCents: number;
    arrCents: number;
    payingOrgs: number;
    arpaCents: number;
    trialing: number;
    atRiskCents: number;
    collectedCents: number;
    failedCents: number;
    refundedCents: number;
  };
  paymentsSeries: { date: string; succeeded: number; failed: number }[];
  statusBoard: { status: string; orgs: number; mrrCents: number }[];
  upgradeFunnel: {
    feature: string;
    orgs: number;
    denials: number;
    converted: number;
    conversion: number;
    topSurface: string | null;
  }[];
  cancellations: Row[];
  comped: Row[];
  recentPayments: Row[];
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-[var(--success-soft)] text-[var(--success)]",
  trialing: "bg-primary-soft text-primary",
  cancelling: "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
  past_due: "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
  on_hold: "bg-[var(--destructive-soft)] text-destructive",
  canceled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

const feature = (key: string) => key.replaceAll("_", " ");

export function RevenueClient() {
  const range = useRange();
  const { data, isPending } = useGetApiAdminRevenue({ range });

  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  const r = apiData<Revenue>(data) ?? ({} as Revenue);
  const t = r.totals ?? ({} as Revenue["totals"]);
  const days = r.days ?? [];

  const planTotal = (r.mrrByPlan ?? []).reduce((n, p) => n + p.orgs, 0);
  const funnel = [...(r.upgradeFunnel ?? [])];

  // Two rates the tables underneath exist to explain, pulled out as gauges.
  const paywallOrgs = funnel.reduce((n, f) => n + f.orgs, 0);
  const paywallPaid = funnel.reduce((n, f) => n + f.converted, 0);
  const payments = r.recentPayments ?? [];
  const paymentsOk = payments.filter((row) => str(row, "status") === "succeeded").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Revenue</h1>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="MRR"
          value={t.mrrCents ?? 0}
          previous={r.mrrSeries?.[0] ?? 0}
          series={r.mrrSeries}
          format={money}
          comparedTo="period start"
        />
        <KpiTile label="ARR" value={t.arrCents ?? 0} previous={t.arrCents ?? 0} format={money} hint="MRR × 12" />
        <KpiTile
          label="Paying accounts"
          value={t.payingOrgs ?? 0}
          previous={r.payingSeries?.[0] ?? 0}
          series={r.payingSeries}
          comparedTo="period start"
        />
        <KpiTile
          label="Revenue per account"
          value={t.arpaCents ?? 0}
          previous={t.arpaCents ?? 0}
          format={money}
          hint="per paying account"
        />
        <KpiTile
          label="Collected"
          value={t.collectedCents ?? 0}
          previous={t.collectedCents ?? 0}
          format={money}
          hint="in this period"
        />
        {/* The one tile you want at zero. */}
        <KpiTile
          label="At risk"
          value={t.atRiskCents ?? 0}
          previous={t.atRiskCents ?? 0}
          format={money}
          lowerIsBetter
          hint="dunning or cancelling"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Recurring revenue"
          hint="Monthly equivalent — a yearly plan counts as a twelfth per month, and manually comped accounts count as nothing."
          aside={<Legend items={[{ label: "MRR", color: SERIES[0]! }]} />}
        >
          <TrendChart
            days={days}
            series={[{ key: "mrr", label: "MRR" }]}
            data={{ mrr: (r.mrrSeries ?? []).map((c) => Math.round(c / 100)) }}
          />
        </ChartCard>

        {/* The split is the question; the total is already the first KPI tile,
            so it moves to the corner and the footnote it used to carry goes
            with it. */}
        <ChartCard
          title="Revenue by plan"
          aside={`${planTotal.toLocaleString()} paying${t.trialing ? ` · ${t.trialing} trialing` : ""}`}
        >
          <PieChart
            items={(r.mrrByPlan ?? []).map((p) => ({
              label: p.plan,
              value: p.mrrCents,
              display: money(p.mrrCents),
            }))}
            total={(r.mrrByPlan ?? []).reduce((n, p) => n + p.mrrCents, 0)}
            height={200}
            emptyLabel="Nothing recurring yet."
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Subscription states" subtitle="With the revenue standing behind each.">
          <ul className="space-y-2">
            {(r.statusBoard ?? []).map((s) => (
              <li key={s.status} className="flex items-baseline justify-between gap-3 text-sm">
                <Badge className={STATUS_TONE[s.status] ?? "bg-muted text-muted-foreground"}>
                  {s.status.replaceAll("_", " ")}
                </Badge>
                <span className="text-muted-foreground tabular text-xs">
                  {s.orgs} {s.orgs === 1 ? "account" : "accounts"}
                  <span className="text-foreground ml-2">{money(s.mrrCents)}</span>
                </span>
              </li>
            ))}
            {(r.statusBoard ?? []).length === 0 && (
              <li className="text-muted-foreground text-sm">No subscriptions yet.</li>
            )}
          </ul>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Payments"
          aside={
            <Legend
              items={[
                { label: "Collected", color: SERIES[0]! },
                { label: "Failed", color: SERIES[1]! },
              ]}
            />
          }
        >
          <TrendChart
            days={days}
            series={[
              { key: "succeeded", label: "Collected" },
              { key: "failed", label: "Failed" },
            ]}
            data={{
              succeeded: (r.paymentsSeries ?? []).map((d) => Math.round(d.succeeded / 100)),
              failed: (r.paymentsSeries ?? []).map((d) => Math.round(d.failed / 100)),
            }}
            // Charges are discrete events on a day, not a quantity flowing
            // between days: an area here draws revenue on the afternoons
            // between two payments.
            shape="bar"
            height={200}
          />
        </ChartCard>
      </div>

      {/*
        The most actionable chart in the console.

        `feature_access_log` has recorded every paywall hit since it was built
        and nothing has ever read it. Each row is an account that tried to do
        something its plan does not allow — a list of the exact moments people
        wanted to pay us more.
      */}
      <ChartCard
        title="Which wall they hit"
        subtitle="Accounts that reached for a locked feature, and how many of them went on to buy."
        hint="A feature several accounts reach for and none buy is priced wrong or does not deliver once bought. One nobody reaches for at all is a tier boundary in the wrong place."
      >
        {/*
          The gauge sits beside the table, not in the card's header slot: the
          header is a single row, so a 150px gauge in it pushed the table that
          far down and left a band of empty card under the subtitle.
        */}
        <div className="flex flex-wrap-reverse items-start gap-6">
          <div className="min-w-72 flex-1">
            <DataTable
              rows={funnel}
              empty="Nobody has hit a paywall yet."
              columns={[
                { key: "feature", header: "Feature", render: (f) => feature(f.feature) },
                {
                  key: "surface",
                  header: "Where",
                  width: "12rem",
                  render: (f) => f.topSurface ?? <span className="text-muted-foreground">—</span>,
                },
                { key: "orgs", header: "Accounts", width: "7rem", numeric: true, render: (f) => f.orgs },
                { key: "denials", header: "Attempts", width: "7rem", numeric: true, render: (f) => f.denials },
                { key: "converted", header: "Then paid", width: "7rem", numeric: true, render: (f) => f.converted },
                {
                  key: "conversion",
                  header: "Conversion",
                  width: "8rem",
                  numeric: true,
                  render: (f) => (
                    <span
                      className={
                        f.orgs >= 3 && f.conversion === 0
                          ? "text-[var(--warning-soft-foreground)]"
                          : f.conversion >= 20
                            ? "text-[var(--success)]"
                            : undefined
                      }
                    >
                      {f.conversion}%
                    </span>
                  ),
                },
              ]}
            />
          </div>
          {paywallOrgs > 0 && (
            <RadialGauge
              value={(paywallPaid / paywallOrgs) * 100}
              label="went on to pay"
              caption={`${paywallPaid} of ${paywallOrgs}`}
              size={116}
            />
          )}
        </div>
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Leaving, or already gone" subtitle="Newest first.">
          <DataTable
            rows={r.cancellations ?? []}
            hrefFor={(row) => `/admin/accounts/${str(row, "org_id")}`}
            empty="Nobody is cancelling."
            columns={[
              { key: "name", header: "Account", render: (row) => str(row, "name") },
              { key: "plan", header: "Plan", width: "6rem", render: (row) => str(row, "plan_id") },
              {
                key: "status",
                header: "Status",
                width: "8rem",
                render: (row) => {
                  // The tone follows the word on the badge, not the raw column.
                  // An account with `cancel_at_period_end` is still `active` in
                  // `subscriptions.status`, so keying the colour off the column
                  // printed "cancelling" in the green reserved for healthy
                  // subscriptions — on the one table whose entire job is to
                  // show the unhealthy ones.
                  const label = num(row, "cancel_at_period_end") === 1 ? "cancelling" : str(row, "status");
                  return (
                    <Badge className={STATUS_TONE[label] ?? "bg-muted text-muted-foreground"}>{label}</Badge>
                  );
                },
              },
              { key: "mrr", header: "Was worth", width: "7rem", numeric: true, render: (row) => money(num(row, "mrr_cents")) },
              { key: "when", header: "Changed", width: "7rem", muted: true, render: (row) => relativeDay(num(row, "updated_at")) },
            ]}
          />
        </ChartCard>

        <ChartCard title="Comped accounts" hint="On a paid plan through a manual grant — these pay nothing, and are excluded from every revenue figure on this page.">
          <DataTable
            rows={r.comped ?? []}
            hrefFor={(row) => `/admin/accounts/${str(row, "org_id")}`}
            empty="No manual grants outstanding."
            columns={[
              { key: "name", header: "Account", render: (row) => str(row, "name") },
              { key: "plan", header: "Plan", width: "6rem", render: (row) => str(row, "plan_id") },
              { key: "forms", header: "Forms", width: "6rem", numeric: true, render: (row) => num(row, "forms") },
              { key: "since", header: "Since", width: "7rem", muted: true, render: (row) => relativeDay(num(row, "created_at")) },
            ]}
          />
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
      <ChartCard className="lg:col-span-3" title="Recent payments" subtitle="Newest first.">
        <DataTable
          rows={r.recentPayments ?? []}
          empty="No payments recorded."
          columns={[
            {
              key: "name",
              header: "Account",
              render: (row) => (
                <Link href={`/admin/accounts/${str(row, "org_id")}`} className="hover:text-primary truncate">
                  {str(row, "name")}
                </Link>
              ),
            },
            {
              key: "status",
              header: "Status",
              width: "8rem",
              render: (row) => (
                <Badge
                  className={
                    str(row, "status") === "succeeded"
                      ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : "bg-[var(--destructive-soft)] text-destructive"
                  }
                >
                  {str(row, "status")}
                </Badge>
              ),
            },
            { key: "amount", header: "Amount", width: "7rem", numeric: true, render: (row) => money(num(row, "amount_cents")) },
            { key: "at", header: "When", width: "7rem", muted: true, render: (row) => relativeDay(num(row, "at")) },
            {
              key: "invoice",
              header: "Invoice",
              width: "6rem",
              render: (row) =>
                str(row, "invoice_url") ? (
                  <a
                    href={str(row, "invoice_url")}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-xs hover:underline"
                  >
                    open
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
          ]}
        />
      </ChartCard>

        {/* The rate the list is evidence for, so the card next to it is not a
            metre of empty surface. */}
        <ChartCard title="Charges that went through" dense>
          {payments.length > 0 ? (
            <RadialGauge
              value={(paymentsOk / payments.length) * 100}
              label="of recent charges succeeded"
              caption={`${paymentsOk} of ${payments.length}`}
              tone={paymentsOk === payments.length ? "success" : "warning"}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No payments recorded.</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

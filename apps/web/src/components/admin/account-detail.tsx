"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getGetApiAdminAccountsByOrgIdQueryKey, useGetApiAdminAccountsByOrgId } from "@/lib/api/admin/admin";
import { ChartCard } from "@/components/charts/chart-kit";
import { MeterBar } from "@/components/ui/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { isPlanId } from "@repo/entitlements";
import { apiData } from "@/lib/api/payload";
import { AccountActions, RevokeOverride, entitlementLabel } from "./account-actions";
import { DataTable } from "./data-table";
import { compact, money, relativeDay } from "./format";

/**
 * One account, in the order the questions get asked.
 *
 * Who are they, what are they paying, what have they built, what are they
 * bumping into, and what has happened lately. The last of those — which paywall
 * this account keeps hitting — is the only screen in the console that tells you
 * what a *specific* customer would pay for, which is why it sits beside the
 * subscription rather than at the bottom.
 *
 * Forms are listed by title, size and how they are performing, and no further.
 * There is no way from here into a response, and that is deliberate: the
 * console reads what people built, never what their respondents typed.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

export function AccountDetail({ orgId }: { orgId: string }) {
  const { data, isPending, isError, refetch } = useGetApiAdminAccountsByOrgId(orgId, {
    query: { queryKey: getGetApiAdminAccountsByOrgIdQueryKey(orgId), retry: false },
  });

  const d = apiData<Partial<Record<string, unknown>>>(data);
  if (isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (isError || !d?.org) {
    return <EmptyState title="No such account" description="It may have been deleted since this link was made." />;
  }

  const org = (d.org ?? {}) as Row;
  const sub = (d.subscription ?? null) as Row | null;
  const members = (d.members ?? []) as Row[];
  const forms = (d.forms ?? []) as Row[];
  const usage = (d.usage ?? []) as Row[];
  const limits = (d.limits ?? {}) as Record<string, number | null>;
  const overrides = (d.overrides ?? []) as Row[];
  const audit = (d.audit ?? []) as Row[];
  const denials = (d.denials ?? []) as Row[];

  const plan = sub ? str(sub, "plan_id") : "free";
  const mrr = sub
    ? str(sub, "cycle") === "yearly"
      ? num(sub, "price_yearly_cents") / 12
      : num(sub, "price_monthly_cents")
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/accounts"
          className="text-muted-foreground hover:text-foreground text-caption mb-3 inline-flex items-center gap-1 transition-colors duration-[var(--duration-micro)]"
        >
          <ChevronLeft className="size-3.5" strokeWidth={2} aria-hidden />
          Accounts
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{str(org, "name")}</h1>
          <Badge>{plan}</Badge>
          {sub && str(sub, "status") !== "active" && (
            <Badge className="bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]">
              {str(sub, "status")}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-caption mt-1">
          {str(org, "slug")} · joined {relativeDay(num(org, "created_at"))} · {members.length}{" "}
          {members.length === 1 ? "member" : "members"}
        </p>

        <div className="mt-3">
          <AccountActions
            orgId={orgId}
            orgName={str(org, "name")}
            plan={isPlanId(plan) ? plan : "free"}
            limits={limits}
            owner={
              /* The owner if there is one, otherwise whoever joined first —
                 an account with no owner row still needs to be reproducible. */
              (() => {
                const pick =
                  members.find((m) => str(m, "role").includes("owner")) ?? members[0];
                return pick
                  ? { id: str(pick, "id"), name: str(pick, "name"), email: str(pick, "email") }
                  : null;
              })()
            }
            onChanged={() => void refetch()}
          />
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <ChartCard title="Subscription" className="lg:col-span-1">
          {sub ? (
            <dl className="space-y-2 text-sm">
              <Field label="Plan" value={`${str(sub, "plan_name")} · ${str(sub, "cycle")}`} />
              <Field label="Monthly equivalent" value={money(mrr)} />
              <Field label="Status" value={str(sub, "status")} />
              <Field label="Seats" value={str(sub, "seats")} />
              <Field label="Renews" value={relativeDay(num(sub, "current_period_end"))} />
              {num(sub, "grace_until") > 0 && (
                <Field label="Grace ends" value={relativeDay(num(sub, "grace_until"))} />
              )}
              {str(sub, "dodo_subscription_id").startsWith("internal_manual_") && (
                <p className="text-muted-foreground text-micro pt-1">
                  Granted by hand, not through a Dodo checkout — this account pays nothing.
                </p>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">On Free. No subscription row.</p>
          )}

          {overrides.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-caption mb-2 font-medium">Given free</p>
              <ul className="space-y-1">
                {overrides.map((o, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground min-w-0 truncate">
                      <span className="text-foreground">{entitlementLabel(str(o, "key"))}</span>
                      {str(o, "kind") === "limit" && ` — ${str(o, "value") || "unlimited"}`}
                      {str(o, "reason") && ` · ${str(o, "reason")}`}
                      {num(o, "expires_at") > 0 && ` · until ${relativeDay(num(o, "expires_at"))}`}
                    </span>
                    <RevokeOverride orgId={orgId} keyName={str(o, "key")} onChanged={() => void refetch()} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        {/*
          Meters against each metric's own plan limit, not bars against each
          other.

          A `BarList` here was actively misleading: it scales every row to the
          largest one, so 18 responses beside 58,200 AI tokens rendered as "0%"
          — two different units sharing one axis, which is precisely the
          comparison the chart kit exists to prevent. What a usage number needs
          is its own ceiling: 18 out of 20 and 18 out of 50,000 are the same
          number and completely different situations.
        */}
        <ChartCard title="Usage this month" subtitle="Against what their plan allows." className="lg:col-span-1">
          {usage.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing metered yet this month.</p>
          ) : (
            <ul className="space-y-3">
              {usage.map((u, i) => {
                const metric = str(u, "metric");
                const used = num(u, "used");
                const cap = limits[`${metric}_per_month`] ?? null;
                const ratio = cap && cap > 0 ? used / cap : 0;
                return (
                  <li key={i}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-sm">{metric.replaceAll("_", " ")}</span>
                      <span className="text-muted-foreground tabular shrink-0 text-xs">
                        {compact(used)}
                        <span className="ml-1.5 opacity-70">
                          {cap === null ? "unlimited" : `of ${compact(cap)}`}
                        </span>
                      </span>
                    </div>
                    <MeterBar
                      value={used}
                      max={cap}
                      label={`${metric} usage`}
                      tone={ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "neutral"}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>

        {/*
          The most commercially useful panel in the console: not "would this
          segment pay", but "this named account tried to do this N times and
          could not".
        */}
        <ChartCard
          title="Walls they hit"
          subtitle="Locked features they reached for."
          className="lg:col-span-1"
        >
          {denials.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              They have not run into a paywall. Nothing to sell them yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {denials.map((f, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{str(f, "feature").replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground text-micro">
                      {str(f, "surface") || "—"} · last {relativeDay(num(f, "last_denied_at"))}
                      {num(f, "converted_at") > 0 && " · then upgraded"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-xs">{num(f, "denial_count")}×</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/*
        `DataTable` rather than a hand-rolled `<Table>`, so this aligns and
        sizes like the other twelve tables in the console instead of letting
        five integer columns share the width equally with the title.
      */}
      <ChartCard title="Forms" aside={`${forms.length} live · newest first`}>
        <DataTable
          rows={forms}
          empty="This account has never built a form."
          columns={[
            { key: "title", header: "Title", render: (f) => <span className="font-medium">{str(f, "title")}</span> },
            {
              key: "status",
              header: "Status",
              width: "7.5rem",
              render: (f) => <Badge className="bg-muted text-muted-foreground">{str(f, "status")}</Badge>,
            },
            { key: "blocks", header: "Questions", width: "7rem", numeric: true, render: (f) => num(f, "blocks") },
            { key: "started", header: "Started", width: "6rem", numeric: true, render: (f) => num(f, "started") },
            { key: "completed", header: "Completed", width: "7rem", numeric: true, render: (f) => num(f, "completed") },
            {
              key: "rate",
              header: "Completion",
              width: "7rem",
              numeric: true,
              render: (f) =>
                num(f, "started") > 0 ? (
                  `${Math.round((num(f, "completed") / num(f, "started")) * 100)}%`
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            {
              key: "updated",
              header: "Updated",
              width: "7rem",
              muted: true,
              render: (f) => relativeDay(num(f, "updated_at")),
            },
          ]}
        />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="People">
          <ul className="space-y-2">
            {members.map((m, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{str(m, "name") || str(m, "email")}</span>
                  <span className="text-muted-foreground text-micro truncate">{str(m, "email")}</span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {str(m, "role")} · seen {relativeDay(num(m, "last_session_at"))}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Recent activity" aside="from this account's audit log">
          {audit.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {audit.slice(0, 12).map((a, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{str(a, "action")}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {str(a, "actor_label") || str(a, "actor_type")} · {relativeDay(num(a, "created_at"))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-caption">{label}</dt>
      <dd className="tabular text-right">{value}</dd>
    </div>
  );
}

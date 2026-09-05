"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import { PLANS, PLAN_LIST, yearlyPerMonthCents, yearlySavingPercent, type LimitKey, type MetricKey, type PlanId } from "@repo/entitlements";
import { ApiError } from "@/lib/api/mutator";
import {
  useGetApiBillingInvoices,
  getGetApiBillingInvoicesQueryKey,
  usePostApiBillingCheckout,
  usePostApiBillingChangePlan,
  usePostApiBillingPortal,
} from "@/lib/api/billing/billing";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { UsageMeter } from "@/components/ui/usage-meter";
import { cn } from "@/lib/utils";

/**
 * Plan, usage, upgrade, invoices, portal — one page.
 *
 * Replaces `/usage`, which showed three meters read from a payload it had mistyped. Note
 * what is *not* here: cancellation, payment methods and receipts all live in the Dodo
 * customer portal. Rebuilding those would mean duplicating the source of truth for money,
 * and adding cancellation friction is the one dark pattern that reliably backfires.
 */

/** The meters worth showing, in the order someone would look for them. */
const METERS: { metric: MetricKey; limit: LimitKey; label: string; hint?: string }[] = [
  { metric: "responses", limit: "responses_ceiling_per_month", label: "Responses this month", hint: "Unlimited, up to a monthly ceiling for fair use." },
  {
    metric: "ai_conversations",
    limit: "ai_conversations_per_month",
    label: "AI conversations",
    hint: "Past this, forms keep collecting but ask their questions directly rather than conversationally.",
  },
  { metric: "ai_generations", limit: "ai_generations_per_month", label: "AI form generations" },
  { metric: "api_requests", limit: "api_requests_per_month", label: "API requests" },
];

const GAUGES: { key: string; limit: LimitKey; label: string }[] = [
  { key: "forms_count", limit: "forms_count", label: "Forms" },
  { key: "seats", limit: "seats", label: "Team members" },
  { key: "workspaces_count", limit: "workspaces_count", label: "Workspaces" },
  { key: "file_storage_mb", limit: "file_storage_mb", label: "File storage (MB)" },
];

interface Invoice {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  invoice_url: string | null;
  paid_at: number | null;
  created_at: number;
}

export default function BillingPage() {
  const params = useSearchParams();
  const ent = useEntitlements();
  const [cycle, setCycle] = useState<"monthly" | "yearly">(
    params.get("cycle") === "monthly" ? "monthly" : "yearly",
  );
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  /**
   * The post-checkout message is *derived* from the URL rather than copied into state by an
   * effect. Same reason as everywhere else: a value you can read is not state, and syncing
   * it costs a render for nothing.
   */
  const checkout = params.get("checkout");
  const notice =
    actionNotice ??
    (checkout === "success"
      ? "Thanks — your plan is being activated. It may take a moment to appear."
      : checkout === "cancelled"
        ? "Checkout cancelled. Nothing was charged."
        : null);

  const { data: rawInvoices } = useGetApiBillingInvoices({
    query: { queryKey: getGetApiBillingInvoicesQueryKey(), enabled: ent.allows("billing", "read") },
  });
  const invoices = rawInvoices as { invoices: Invoice[] } | undefined;

  const checkoutMutation = usePostApiBillingCheckout();
  const changePlanMutation = usePostApiBillingChangePlan();
  const portalMutation = usePostApiBillingPortal();

  const plan = ent.data ? PLANS[ent.data.planId] : null;
  const canManage = ent.allows("billing", "manage");

  /**
   * One button for both paths.
   *
   * An org with no subscription goes through checkout; one that already pays goes through
   * change-plan, because a second checkout would leave them with two subscriptions and two
   * charges. The API enforces this too — this just avoids showing a button that 409s.
   */
  const choose = async (target: PlanId) => {
    setBusy(target);
    setError(null);
    try {
      if (ent.data?.planId === "free") {
        const res = (await checkoutMutation.mutateAsync({
          data: { planId: target, cycle } as never,
        })) as unknown as { url: string };
        window.location.assign(res.url);
      } else {
        await changePlanMutation.mutateAsync({ data: { planId: target, cycle } as never });
        setActionNotice(
          target === "free"
            ? "Your plan will change at the end of the billing period."
            : `Moved to ${PLANS[target].name}.`,
        );
        setBusy(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setError(null);
    try {
      const res = (await portalMutation.mutateAsync()) as unknown as { url: string };
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the billing portal.");
    }
  };

  if (ent.isLoading || !ent.data || !plan) {
    /*
      Shaped like the page it precedes, rather than three generic bars. The
      header here is a title with a plan badge and a line of meta beneath it,
      so the skeleton is too — otherwise the title jumps down and the badge
      appears out of nowhere the moment the answer lands, which is the thing
      that reads as a glitch.
    */
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-8 space-y-2.5">
          <Skeleton className="h-9 w-56" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </header>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-10 mb-4 h-7 w-24" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const d = ent.data;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-h1">Plan &amp; usage</h1>
        <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={d.planId === "free" ? "secondary" : "default"}>{d.planName}</Badge>
          {d.cycle && <span>billed {d.cycle}</span>}
          {d.periodEnd && (
            <span>
              {d.cancelAtPeriodEnd ? "ends" : "renews"} {new Date(d.periodEnd).toLocaleDateString()}
            </span>
          )}
          <span className="text-muted-foreground">· you are {d.roleLabel.toLowerCase()}</span>
        </p>
      </header>

      {/* A failed renewal is not a lock-out. Say what is happening and how to fix it. */}
      {d.inGrace && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning-soft-foreground)]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">We couldn&apos;t take your last payment.</p>
            <p className="mt-0.5">
              Everything still works while we retry. Update your card in the billing portal to keep it
              that way — nothing you have collected is affected either way.
            </p>
            {canManage && (
              <Button variant="outline" size="sm" className="mt-2.5" onClick={openPortal}>
                Update payment method
              </Button>
            )}
          </div>
        </div>
      )}

      {notice && <p className="mb-6 rounded-xl bg-[var(--muted)] p-4 text-sm">{notice}</p>}
      {error && <p className="text-destructive mb-6 rounded-xl bg-[var(--destructive-soft)] p-4 text-sm">{error}</p>}

      {/* ── usage ── */}
      <section className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">This period</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {METERS.map((m) => {
              const limit = d.limits[m.limit];
              // A metric this plan does not sell at all is noise, not information.
              if (limit === 0) return null;
              return (
                <UsageMeter
                  key={m.metric}
                  label={m.label}
                  used={d.usage[m.metric] ?? 0}
                  limit={limit}
                  hint={m.hint}
                />
              );
            })}
          </CardContent>
        </Card>

        {/* Gauges are a current count against a ceiling, not a period total —
            so they read as figures rather than as bars that never move. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GAUGES.map((g) => {
            const limit = d.limits[g.limit];
            const used = d.gauges[g.key] ?? 0;
            return (
              <StatCard
                key={g.key}
                label={g.label}
                tone={limit !== null && used >= limit ? "warning" : "default"}
                value={
                  <>
                    {used.toLocaleString()}
                    <span className="text-muted-foreground text-sm font-normal">
                      {" / "}
                      {limit === null ? "∞" : limit.toLocaleString()}
                    </span>
                  </>
                }
              />
            );
          })}
        </div>

        <p className="text-muted-foreground text-xs">
          Monthly counters reset on{" "}
          {new Date(d.periodResetsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.
        </p>
      </section>

      {/* ── plans ── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h2">Plans</h2>
          {/* The product's one segmented control, rather than a fourth
              hand-rolled version of it. */}
          <SegmentedControl
            size="sm"
            ariaLabel="Billing cycle"
            value={cycle}
            onChange={(v) => setCycle(v as "yearly" | "monthly")}
            options={[
              { value: "yearly", label: `Yearly · save ${yearlySavingPercent(PLANS.pro)}%` },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_LIST.map((p) => {
            const isCurrent = p.id === d.planId;
            const perMonth = cycle === "yearly" ? yearlyPerMonthCents(p) : p.priceMonthlyCents;
            return (
              <Card key={p.id} className={cn(isCurrent && "ring-2 ring-[var(--primary)]")}>
                <CardContent className="pt-5">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display font-semibold tracking-tight">{p.name}</h3>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs text-pretty">{p.tagline}</p>
                  <p className="mt-3">
                    <span className="font-display text-2xl font-semibold tracking-tight tabular-nums">
                      ${(perMonth / 100).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground text-xs">{p.id === "free" ? " forever" : "/mo"}</span>
                  </p>
                  {!isCurrent && p.id !== "free" && (
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      disabled={!canManage || busy !== null}
                      onClick={() => choose(p.id)}
                    >
                      {busy === p.id ? "Working…" : d.planId === "free" ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                    </Button>
                  )}
                  {!isCurrent && p.id === "free" && d.planId !== "free" && (
                    <p className="text-muted-foreground mt-3 text-xs">
                      Cancel from the billing portal to move back to Free at the end of your period.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!canManage && (
          <p className="text-muted-foreground mt-3 text-xs">
            Only an owner can change the plan. Ask whoever set up this organization.
          </p>
        )}

        <p className="text-muted-foreground mt-3 text-xs">
          <Link href="/pricing" className="underline">
            Compare every feature and limit
          </Link>
        </p>
      </section>

      {/* ── portal + invoices ── */}
      <section className="mt-10 grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Billing details</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Payment method, invoices, tax details and cancellation are all handled by our payment
              provider.
            </p>
            <Button variant="outline" size="sm" className="mt-3" disabled={!canManage} onClick={openPortal}>
              <CreditCard className="size-3.5" />
              Open billing portal
              <ExternalLink className="size-3" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {!invoices?.invoices.length ? (
              <p className="text-muted-foreground text-xs">No payments yet.</p>
            ) : (
              <Table>
                <TableBody>
                  {invoices.invoices.slice(0, 5).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-muted-foreground pl-0 text-xs">
                        {new Date(inv.paid_at ?? inv.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        ${(inv.amount_cents / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="w-px">
                        {inv.status !== "succeeded" && (
                          <Badge variant="secondary" className="text-[0.625rem]">
                            {inv.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="w-px pr-0">
                        {inv.invoice_url && (
                          <a href={inv.invoice_url} target="_blank" rel="noreferrer" aria-label="Open invoice">
                            <ArrowUpRight className="text-muted-foreground hover:text-foreground size-3.5 transition-colors" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

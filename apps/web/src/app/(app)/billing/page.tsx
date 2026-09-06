"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import { PLANS, isPlanId, type LimitKey, type MetricKey, type PlanId } from "@repo/entitlements";
import { ApiError } from "@/lib/api/mutator";
import { usePostApiBillingCheckout, usePostApiBillingPortal } from "@/lib/api/billing/billing";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { UsageMeter } from "@/components/ui/usage-meter";

/**
 * What you are on, what you have used, and one door to everything else.
 *
 * This page used to carry three plan cards, a billing-cycle toggle and a payments table.
 * All three are gone, and the reasoning is worth keeping:
 *
 * - The cards were a second pricing page that could disagree with the first, and their
 *   "Current" badge compared plan id only. A customer on Pro *monthly* looking at the
 *   yearly column saw "Current" and no button, so the one switch they wanted — monthly to
 *   yearly — was the one the page made impossible.
 * - The buy buttons drove our own change-plan endpoint. Reconciling a change we had
 *   originated is precisely what charged a customer for Business and left them on Pro.
 * - The payments table listed `payment_link` as though it were an invoice, so the receipt
 *   arrow opened a pay-this page for money already taken.
 *
 * Dodo's portal does all three properly — plan switching across a product collection,
 * invoices with PDFs and tax, payment methods, cancellation — and it is the system of
 * record for money either way. So the money lives there and the entitlement story lives
 * here: what the plan is, what it allows, and how much of it is left.
 *
 * The one exception is a first purchase. A free org has no Dodo customer yet and so has
 * no portal to open; `/pricing` sends them here with `?plan=`, and checkout starts below.
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

export default function BillingPage() {
  const params = useSearchParams();
  const ent = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The post-checkout message is *derived* from the URL rather than copied into state by an
   * effect. Same reason as everywhere else: a value you can read is not state, and syncing
   * it costs a render for nothing.
   */
  const checkout = params.get("checkout");
  const notice =
    checkout === "success"
      ? "Thanks — your plan is being activated. It may take a moment to appear."
      : checkout === "cancelled"
        ? "Checkout cancelled. Nothing was charged."
        : null;

  const checkoutMutation = usePostApiBillingCheckout();
  const portalMutation = usePostApiBillingPortal();

  const plan = ent.data ? PLANS[ent.data.planId] : null;
  const canManage = ent.allows("billing", "manage");

  /** Which plan `/pricing` sent them here to buy, if any. */
  const wanted = params.get("plan");
  const intended: PlanId | null = wanted && isPlanId(wanted) && wanted !== "free" ? wanted : null;
  const cycle = params.get("cycle") === "monthly" ? "monthly" : "yearly";

  /**
   * The first purchase, and the only one this app starts.
   *
   * Everything after it — upgrade, downgrade, switching monthly to yearly — happens in the
   * portal, because a paid org already has a Dodo customer and the portal can move it
   * between products in the collection without us reconciling anything.
   */
  const startCheckout = async (target: PlanId) => {
    setBusy(true);
    setError(null);
    try {
      const res = (await checkoutMutation.mutateAsync({
        data: { planId: target, cycle } as never,
      })) as unknown as { url: string };
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  };

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = (await portalMutation.mutateAsync()) as unknown as { url: string };
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the billing portal.");
      setBusy(false);
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
        <Skeleton className="mt-10 h-40 w-full rounded-xl" />
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

      {/* ── the one door ── */}
      <section className="mt-10">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-display text-base">
              {d.planId === "free" ? "Get more out of it" : "Plan & billing"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.planId === "free" ? (
              <>
                <p className="text-muted-foreground max-w-prose text-sm text-pretty">
                  Pro and Business add your own branding, deeper analytics, verified respondents
                  and a bigger AI allowance. Nothing you have already collected changes.
                </p>
                <Button
                  size="lg"
                  className="mt-4"
                  disabled={!canManage || busy}
                  onClick={() => startCheckout(intended ?? "pro")}
                >
                  {busy ? "Opening checkout…" : intended ? `Continue to ${PLANS[intended].name}` : "See plans"}
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground max-w-prose text-sm text-pretty">
                  {/* Naming what is behind a link that leaves the site is the whole job here:
                      the reason people do not click through to a portal is that they cannot
                      tell whether the thing they came for is on the other side. */}
                  Switch plan, move between monthly and yearly, update your card, download
                  invoices, change tax details or cancel — all with our payment provider.
                </p>
                <Button size="lg" className="mt-4" disabled={!canManage || busy} onClick={openPortal}>
                  <CreditCard className="size-4" />
                  {busy ? "Opening…" : "Manage plan & billing"}
                  <ExternalLink className="size-3.5" />
                </Button>
              </>
            )}

            {!canManage && (
              <p className="text-muted-foreground mt-3 text-xs">
                Only an owner can change the plan. Ask whoever set up this organization.
              </p>
            )}

            <p className="text-muted-foreground mt-4 text-xs">
              <Link href="/pricing" className="underline">
                Compare every feature and limit
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, ExternalLink, Sparkles, TriangleAlert } from "lucide-react";
import { isPlanId, type LimitKey, type MetricKey } from "@repo/entitlements";
import { usePlansDialog } from "@/stores/paywall-store";
import { useGetApiBillingPlans } from "@/lib/api/billing/billing";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useBillingActions } from "@/hooks/use-billing-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * What this account has used, and what more would cost.
 *
 * ## Why this page is called Usage
 *
 * It was `/billing`, titled "Plan & usage", and it was neither. The money moved to the
 * payment provider's portal a while ago — invoices, cards, tax, cancellation are all
 * theirs, and duplicating them here is how the two end up disagreeing. What is left is
 * the entitlement story: the meters, and one door to the portal. That is a usage page,
 * so it is at `/usage` and `/billing` redirects here.
 *
 * ## Why the prices are at the top and the cards are in a dialog
 *
 * The plan cards used to sit at the bottom, under four meters and a stat row, on the
 * page every Upgrade button in the product navigated to. Someone who pressed Upgrade
 * arrived at a screen with no price on it and had to scroll to find the thing they had
 * just asked for. Now the ask is a band above the meters that names both prices, and
 * pressing it opens `PlansDialog` — which is the same dialog every other Upgrade control
 * in the product now raises in place, without navigating at all.
 *
 * ## Why almost all the prose is gone
 *
 * A meter is a number against a limit. Every caveat printed under one — the fair-use
 * ceiling, what happens past the AI cap — was read once and then became furniture the
 * numbers had to be found between. The caveats still matter, so they are behind the info
 * icons rather than deleted.
 *
 * The post-checkout banner is gone too. "Checkout cancelled. Nothing was charged." is a
 * notice about something that did not happen, pinned to the top of a page that has
 * nothing to do with it, and it survived every subsequent reload because it lived in the
 * URL. Success is now a toast and the parameter is stripped either way.
 */

interface Meter {
  metric: MetricKey;
  limit: LimitKey;
  label: string;
  hint?: string;
}

/** The month's allowances, in the order somebody would look for them. */
const MONTHLY: Meter[] = [
  {
    metric: "responses",
    limit: "responses_ceiling_per_month",
    label: "Responses",
    hint: "Responses are unlimited on every plan. The figure on the right is a fair-use ceiling on any single month, not an allowance you are spending.",
  },
  {
    metric: "ai_conversations",
    limit: "ai_conversations_per_month",
    label: "AI conversations",
    hint: "Past this, forms keep collecting. They ask their questions directly instead of conversationally, so nothing breaks and no answers are lost.",
  },
  { metric: "ai_generations", limit: "ai_generations_per_month", label: "Form generations" },
  { metric: "api_requests", limit: "api_requests_per_month", label: "API requests" },
];

/** Current counts against a ceiling — these do not reset with the month. */
const GAUGES: { key: string; limit: LimitKey; label: string; storage?: boolean }[] = [
  { key: "forms_count", limit: "forms_count", label: "Forms" },
  { key: "seats", limit: "seats", label: "Members" },
  { key: "workspaces_count", limit: "workspaces_count", label: "Workspaces" },
  { key: "file_storage_mb", limit: "file_storage_mb", label: "Storage", storage: true },
];

const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)} GB` : `${Math.round(n)} MB`);
const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

export default function UsagePage() {
  return (
    // `useSearchParams` needs one, and a skeleton is the right thing behind it.
    <Suspense fallback={<UsageSkeleton />}>
      <Usage />
    </Suspense>
  );
}

function Usage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ent = useEntitlements();
  const openPlans = usePlansDialog((s) => s.openPlans);
  const { busy, error, openPortal } = useBillingActions();
  const catalogue = useGetApiBillingPlans();

  /**
   * The query string is read once and then swept.
   *
   * Both parameters are instructions for this arrival — a checkout that just finished,
   * or a tier `/pricing` sent someone here to buy — and neither is true of the page a
   * minute later. Leaving them in the URL is what made "Checkout cancelled" a permanent
   * fixture of a bookmark.
   */
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const checkout = params.get("checkout");
    const wanted = params.get("plan");
    const cycle = params.get("cycle");

    if (checkout === "success") {
      toast.success("Payment received — your plan is being activated.");
    }
    if (wanted && isPlanId(wanted) && wanted !== "free") {
      openPlans({ plan: wanted, cycle: cycle === "monthly" ? "monthly" : "yearly" });
    }
    if (checkout || wanted || cycle) router.replace(pathname, { scroll: false });
  }, [params, router, pathname, openPlans]);

  if (!ent.data) return <UsageSkeleton />;

  const d = ent.data;
  const free = d.planId === "free";
  const canManage = ent.allows("billing", "manage");

  const rows =
    ((catalogue.data as { plans?: { id: string; priceYearlyPerMonthCents: number }[] } | undefined)?.plans ?? []);
  const price = (id: string) => rows.find((r) => r.id === id)?.priceYearlyPerMonthCents ?? null;
  const proPrice = price("pro");
  const businessPrice = price("business");

  const resets = new Date(d.periodResetsAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-h1">Usage</h1>
          <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant={free ? "secondary" : "default"}>{d.planName}</Badge>
            {d.cycle && <span>billed {d.cycle}</span>}
            {d.periodEnd && (
              <span>
                {d.cancelAtPeriodEnd ? "ends" : "renews"}{" "}
                {new Date(d.periodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
          </p>
        </div>

        {/* One ask per screen. A paying customer's is the portal; a free account's is the
            band below, which carries the prices with it. */}
        {!free && (
          <Button variant="outline" disabled={!canManage || busy} onClick={openPortal}>
            <CreditCard className="size-4" aria-hidden />
            {busy ? "Opening…" : "Manage billing"}
            <ExternalLink className="size-3.5" aria-hidden />
          </Button>
        )}
      </header>

      {/* A failed renewal is not a lock-out, and the fix is one button. */}
      {d.inGrace && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning-soft-foreground)]">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <p className="flex-1">
            <span className="font-medium">Payment failed.</span> Everything keeps working while we retry.
          </p>
          {canManage && (
            <Button variant="outline" size="sm" onClick={openPortal}>
              Update card
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="text-destructive mb-5 rounded-xl bg-[var(--destructive-soft)] px-4 py-3 text-sm">{error}</p>
      )}

      {/* ── the ask, above the numbers rather than beneath them ── */}
      {free && (
        <div className="bg-brand-violet-soft text-brand-violet-soft-foreground mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl px-4 py-3">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
            <Sparkles className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            {proPrice !== null && businessPrice !== null ? (
              <>
                <span className="font-semibold">Pro {dollars(proPrice)}/mo</span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span className="font-semibold">Business {dollars(businessPrice)}/mo</span>
                <span className="text-xs opacity-70">billed yearly</span>
              </>
            ) : (
              <span className="font-semibold">More AI, your branding, verified respondents</span>
            )}
          </p>
          <Button variant="gradient" size="sm" shape="pill" onClick={() => openPlans()}>
            See plans
          </Button>
        </div>
      )}

      {/* ── the month ── */}
      <section>
        <SectionHead title="This month" meta={`Resets ${resets}`} />
        {/* Two up, and a lone last tile widens to fill the row rather than leaving a
            hole beside it. Free — the plan most of these pages belong to — sells three
            of these four metrics, so the odd count is the common case, not the edge. */}
        <div className="grid gap-3 sm:grid-cols-2 [&>*:last-child:nth-child(odd)]:sm:col-span-2">
          {MONTHLY.map((m) => {
            const limit = d.limits[m.limit];
            // A metric this plan does not sell at all is noise, not information.
            if (limit === 0) return null;
            return (
              <Tile
                key={m.metric}
                label={m.label}
                hint={m.hint}
                used={d.usage[m.metric] ?? 0}
                limit={limit}
              />
            );
          })}
        </div>
      </section>

      {/* ── the account ── */}
      <section className="mt-8">
        <SectionHead title="Your workspace" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GAUGES.map((g) => (
            <Tile
              key={g.key}
              label={g.label}
              used={d.gauges[g.key] ?? 0}
              limit={d.limits[g.limit]}
              format={g.storage ? mb : undefined}
              compact
            />
          ))}
        </div>
      </section>

      {!canManage && (
        <p className="text-muted-foreground mt-8 text-xs">Only an owner can change the plan.</p>
      )}
    </div>
  );
}

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-muted-foreground text-micro font-semibold tracking-[0.08em] uppercase">{title}</h2>
      {meta && <p className="text-muted-foreground text-micro tabular">{meta}</p>}
    </div>
  );
}

/**
 * One number against its ceiling.
 *
 * The same shape for both halves of the page, in two densities, because a monthly
 * allowance and a standing count are read the same way — "how much of this do I have
 * left" — and giving them two different treatments was most of what made the old page
 * feel assembled rather than designed.
 *
 * Three bar tones, not two. *At* the limit is amber: a one-seat plan sits at 1/1 for its
 * whole life, and painting that steady state in the colour used for failure told every
 * solo account something was broken. Red means `used > limit`, which the server clamps
 * and so should almost never appear.
 */
function Tile({
  label,
  hint,
  used,
  limit,
  format = (n: number) => n.toLocaleString(),
  compact,
}: {
  label: string;
  hint?: string;
  used: number;
  /** `null` is unlimited. */
  limit: number | null;
  format?: (n: number) => string;
  compact?: boolean;
}) {
  const over = limit !== null && used > limit;
  const near = limit !== null && !over && limit > 0 && used / limit >= 0.8;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  return (
    <div className="bg-card shadow-xs rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption text-muted-foreground leading-tight">{label}</p>
        {hint && <InfoHint label={`About ${label}`}>{hint}</InfoHint>}
      </div>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("tabular", compact ? "text-h2" : "text-h1", over && "text-destructive")}>
          {format(used)}
        </span>
        <span className="text-muted-foreground text-caption tabular">
          / {limit === null ? "∞" : format(limit)}
        </span>
      </p>

      <div
        className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        {...(limit !== null ? { "aria-valuemax": limit } : {})}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
            limit === null
              ? // Unlimited draws a full, quiet track. An empty one reads as "none left",
                // which is the opposite of what it means.
                "bg-primary/25"
              : over
                ? "bg-destructive"
                : near
                  ? "bg-[var(--warning)]"
                  : "bg-primary",
          )}
          /* Nothing used draws nothing. A 2% sliver on an untouched account reads as a
             speck of dirt on the track rather than as a quantity. */
          style={{ width: limit === null ? "100%" : used === 0 ? "0%" : `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

/** Shaped like the page it precedes, so nothing jumps when the answer lands. */
function UsageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 space-y-2.5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-56" />
      </header>
      <Skeleton className="mb-6 h-14 w-full rounded-xl" />
      <Skeleton className="mb-3 h-3 w-24" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-8 mb-3 h-3 w-28" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

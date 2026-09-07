"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import { isPlanId } from "@repo/entitlements";
import { usePlansDialog } from "@/stores/paywall-store";
import { useGetApiBillingPlans } from "@/lib/api/billing/billing";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useBillingActions } from "@/hooks/use-billing-actions";
import { MeterRow } from "@/components/billing/meter-row";
import { UsageHeadline } from "@/components/billing/usage-headline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { gaugeRows, monthlyRows, mostPressured } from "@/lib/usage/meters";
import { statusTone } from "@/lib/usage/copy";

/**
 * What this account has used, and what more would cost.
 *
 * ## The question this page answers
 *
 * One: *am I okay?* Almost nobody opens a usage page to audit nine figures — they open it
 * because something felt slow, or a teammate could not be added, or they are deciding
 * whether to pay. The previous version made them work that out for themselves by scanning
 * eight identically-weighted tiles for a colour, which is the page declining to do its
 * only job. Now a sentence at the top says it, and the lists below are there for the
 * person who came to check one specific number.
 *
 * ## Why lists, not a grid of cards
 *
 * Because these rows are not the same shape as each other. Responses is unlimited and has
 * no bar; API requests is not sold on Free and has no figures; seats is a standing count
 * managed on another page. A grid insists every cell match, and that insistence is what
 * produced a hidden tile, a hole in the second row, and a selector to widen the orphan. A
 * divided list lets each row be what it is.
 *
 * ## Where the money lives
 *
 * The price is in the header, on every plan, including Free — where it names what the
 * paid tiers cost. That is deliberate: someone pressing Upgrade anywhere in the product
 * lands here, and arriving at a screen with no price on it was the original complaint.
 * What it is *not* is a promotional band across the top of the data, which is a billing
 * page behaving like a second marketing site. The commercial ask moves to whichever meter
 * is actually running out, and the screen's single gradient goes with it.
 */
export default function UsagePage() {
  return (
    // `useSearchParams` needs one, and a skeleton is the right thing behind it.
    <Suspense fallback={<UsageSkeleton />}>
      <Usage />
    </Suspense>
  );
}

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

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
   * Both parameters are instructions for this arrival — a checkout that just finished, or
   * a tier `/pricing` sent someone here to buy — and neither is true of the page a minute
   * later. Leaving them in the URL is what made a post-checkout notice a permanent fixture
   * of a bookmark. Note there is no cancelled state: a checkout somebody backed out of
   * produced nothing to report, and reporting it anyway pinned an apology to the top of a
   * page about something else.
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

  const d = ent.data;
  const monthly = useMemo(() => (d ? monthlyRows(d) : []), [d]);
  const gauges = useMemo(() => (d ? gaugeRows(d) : []), [d]);
  const pressured = useMemo(() => mostPressured([...monthly, ...gauges]), [monthly, gauges]);

  /**
   * A failed fetch used to render the skeleton forever.
   *
   * Every gated control in the product treats "no answer yet" as "carry on", which is
   * right for a padlock and wrong for the one page whose entire subject is the payload.
   */
  if (ent.isError && !d) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-h1 mb-6">Usage</h1>
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load your usage"
          description="The figures for this organization didn't come back. Nothing is wrong with your plan."
          action={
            <Button variant="outline" onClick={() => ent.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!d) return <UsageSkeleton />;

  const free = d.planId === "free";
  const canManage = ent.allows("billing", "manage");

  const rows =
    (catalogue.data as { plans?: { id: string; priceYearlyPerMonthCents: number }[] } | undefined)?.plans ?? [];
  const price = (id: string) => rows.find((r) => r.id === id)?.priceYearlyPerMonthCents ?? null;
  const proPrice = price("pro");
  const businessPrice = price("business");
  const mine = price(d.planId);

  const resets = new Date(d.periodResetsAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
  const lastMonth = new Date(new Date().setDate(0)).toLocaleDateString(undefined, { month: "long" });

  /**
   * Exactly one gradient on the screen, and it follows the pressure.
   *
   * DESIGN.md reserves the gradient for the commercial ask and caps it at one per screen —
   * the moment a second appears, the first stops meaning anything. So it is not pinned to
   * a control: with nothing running out it sits on "See plans" in the header, and the
   * instant a meter is actually near its ceiling it moves to the button attached to that
   * meter, which is the ask that has a reason behind it. A paying account with nothing
   * under pressure gets no gradient at all, which is correct — there is nothing to ask.
   */
  const gradientOnHeadline = canManage && pressured !== null && statusTone(pressured) !== "ok";
  const gradientOnHeader = free && !gradientOnHeadline;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-h1">Usage</h1>
          {/* What am I on, what does it cost, and when does it renew — the three things a
              plan summary owes, on one line, above everything else. */}
          <p className="text-muted-foreground text-body mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant={free ? "secondary" : "brand-soft"}>{d.planName}</Badge>
            <span className="tabular">{free ? "$0/mo" : mine !== null ? `${dollars(mine)}/mo` : "—"}</span>
            {d.cycle && <span>billed {d.cycle}</span>}
            {d.periodEnd && (
              <>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span>
                  {d.cancelAtPeriodEnd ? "ends" : "renews"}{" "}
                  {new Date(d.periodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </>
            )}
          </p>
          {/* On Free there is no price of its own to show, and that is precisely the
              account that came here to find one. */}
          {free && proPrice !== null && businessPrice !== null && (
            <p className="text-muted-foreground text-caption mt-1.5 tabular">
              Pro {dollars(proPrice)}/mo · Business {dollars(businessPrice)}/mo, billed yearly
            </p>
          )}
        </div>

        {free ? (
          canManage && (
            <Button
              variant={gradientOnHeader ? "gradient" : "outline"}
              size="sm"
              shape="pill"
              onClick={() => openPlans()}
            >
              See plans
            </Button>
          )
        ) : (
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

      {/* Soft ground, soft ink. `text-destructive` on this background is the ~1.4:1
          pairing that shipped once already, and it only reveals itself in dark mode. */}
      {error && (
        <p className="mb-5 rounded-xl bg-[var(--destructive-soft)] px-4 py-3 text-sm text-[var(--destructive-soft-foreground)]">
          {error}
        </p>
      )}

      <UsageHeadline
        pressured={pressured}
        resets={resets}
        gradient={gradientOnHeadline}
        canManage={canManage}
      />

      <section>
        <SectionHead title="This month" meta={`Resets ${resets}`} />
        <ul className="bg-card shadow-xs divide-border/60 divide-y rounded-xl">
          {monthly.map((row) => (
            <MeterRow key={row.id} row={row} resets={resets} planName={d.planName} lastMonth={lastMonth} />
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <SectionHead title="Your workspace" />
        <ul className="bg-card shadow-xs divide-border/60 divide-y rounded-xl">
          {gauges.map((row) => (
            <MeterRow key={row.id} row={row} resets={resets} planName={d.planName} lastMonth={lastMonth} />
          ))}
        </ul>
      </section>

      {/* Naming the role beats naming the rule: "only an owner" invites "so what am I?" */}
      {!canManage && (
        <p className="text-muted-foreground mt-8 text-xs">
          Only an owner can change the plan{d.roleLabel ? `. You're ${d.roleLabel} here` : ""}.
        </p>
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

/** Shaped like the page it precedes, so nothing jumps when the answer lands. */
function UsageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 space-y-2.5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-64" />
      </header>
      <Skeleton className="mb-6 h-12 w-full rounded-xl" />
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-[17.5rem] w-full rounded-xl" />
      <Skeleton className="mt-8 mb-3 h-3 w-28" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { Crown, TriangleAlert } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { cn } from "@/lib/utils";

/**
 * What this account is paying for, worn in the header.
 *
 * This slot used to hold a usage counter — "0/200 AI chats" — which spent
 * essentially its whole life reading zero, repeated a meter that `/billing`
 * already shows in full, and duplicated the warning that `AiCapBanner` puts on
 * the dashboard the moment either number gets close. Three copies of a number,
 * two of them silent.
 *
 * A plan mark is the better tenant for the space. It is the one piece of account
 * state that is true all month rather than only interesting at the end of it,
 * and someone who has just paid for Pro should be able to see that they did —
 * upgrading is otherwise completely invisible from every screen except the one
 * they bought it on.
 *
 * ## Why violet, and why the free plan gets a quieter one
 *
 * Violet, per DESIGN.md §4.1b: orange is the action colour and every primary
 * button in the product wears it. A plan you already hold is a statement of
 * fact, not something to press — the same division that keeps the nav pill
 * violet.
 *
 * Free still gets a mark, in muted outline. Partly so the header does not change
 * shape when someone upgrades, but mostly so that it *does* change colour: a
 * grey word becoming a violet crown is what makes the upgrade legible as a
 * reward. It is hidden on phones, where it is only a nudge and the width is
 * worth more.
 *
 * A lapsed subscription is amber rather than violet. A proud crown over a
 * payment that failed is the badge lying, and this is often the only place
 * someone would find out before the plan drops.
 */
export function PlanBadge() {
  const ent = useEntitlements();

  /**
   * A placeholder of roughly the badge's width, rather than nothing.
   *
   * Returning `null` while entitlements are in flight made the header re-lay-out
   * the moment they landed — the theme toggle and the avatar slid left, which
   * reads as the page glitching rather than as data arriving. Everything to the
   * left of this is fixed-width, so holding the space is enough to stop it.
   */
  if (!ent.ready) {
    return <span aria-hidden className="bg-muted/60 hidden h-6 w-16 animate-pulse rounded-full md:inline-block" />;
  }
  if (!ent.data) return null;

  const { planId, planName, status, inGrace, cancelAtPeriodEnd, periodEnd } = ent.data;
  const paid = planId !== "free";
  const lapsed = paid && (inGrace || (status !== "active" && status !== "trialing"));

  const ends = periodEnd ? new Date(periodEnd).toLocaleDateString() : null;

  if (!paid) {
    return (
      <Link
        href="/billing"
        title="You're on the Free plan. See what the paid plans add."
        className={cn(
          "border-border text-muted-foreground hidden items-center rounded-full border px-2.5 py-0.5 text-xs md:inline-flex",
          "hover:text-foreground hover:border-foreground/30 transition-colors duration-[var(--duration-micro)]",
        )}
      >
        Free
      </Link>
    );
  }

  return (
    <Link
      href="/billing"
      title={
        lapsed
          ? `Your ${planName} subscription needs attention — ${status.replace(/_/g, " ")}. Update payment to keep it.`
          : cancelAtPeriodEnd && ends
            ? `${planName} — ends ${ends}, and does not renew.`
            : `You're on ${planName}.${ends ? ` Renews ${ends}.` : ""}`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        "transition-colors duration-[var(--duration-micro)]",
        lapsed
          ? "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)] hover:brightness-[0.97]"
          : "bg-brand-violet-soft text-brand-violet-soft-foreground hover:bg-brand-violet-soft/70",
      )}
    >
      {lapsed ? (
        <TriangleAlert className="size-3" strokeWidth={2.25} aria-hidden />
      ) : (
        <Crown className="size-3" strokeWidth={2.25} aria-hidden />
      )}
      {planName}
    </Link>
  );
}

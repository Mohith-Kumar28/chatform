"use client";

import Link from "next/link";
import { Crown, Sparkles, TriangleAlert } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Button } from "@/components/ui/button";
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
 * Free does not get a mark at all — it gets the ask.
 *
 * "Free" in a muted outline was a label for a state nobody chose and nobody is
 * proud of, sitting in the most valuable strip of the product and saying
 * nothing a reader could act on. It was also the only invitation to pay
 * anywhere outside `/billing`, dressed as the thing least likely to be pressed.
 *
 * So: a gradient button, which DESIGN.md §4.1b reserves for exactly this — the
 * commercial ask, at most one per screen, and this is the one. The shape still
 * changes when somebody upgrades, and it changes in the right direction: the
 * loudest control in the header becomes a quiet violet crown, which is what
 * makes having paid legible. Hidden on phones, where the width is worth more.
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
    /*
      To `/billing`, which is the plan picker — three plans, monthly against
      yearly, and a button on each that opens Dodo's own hosted checkout for
      the one chosen.

      Deliberately not straight to Dodo. A checkout URL is minted per plan and
      per cycle (`POST /billing/checkout` takes both), so jumping there from a
      header button would mean choosing on the customer's behalf and calling it
      "pick a plan". The screen that lets them actually pick is ours, and the
      payment page one click later is Dodo's.
    */
    return (
      <Button asChild variant="gradient" size="sm" className="hidden rounded-full md:inline-flex">
        <Link href="/billing" title="See the paid plans and what they add.">
          <Sparkles className="size-3.5" strokeWidth={2.25} aria-hidden />
          Upgrade
        </Link>
      </Button>
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

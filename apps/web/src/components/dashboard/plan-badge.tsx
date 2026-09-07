"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, TriangleAlert } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePlansDialog } from "@/stores/paywall-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What this account is paying for, worn in the header.
 *
 * This slot used to hold a usage counter — "0/200 AI chats" — which spent
 * essentially its whole life reading zero, repeated a meter that `/usage`
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
 * ## Why the paid mark is violet, and why free gets a button instead
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
 * anywhere outside `/usage`, dressed as the thing least likely to be pressed.
 *
 * So: a button — the `gradient` one, at `sm`. The sweep is reserved for the
 * commercial ask (DESIGN.md 4.1b) and this is the only one that exists outside
 * `/usage`, so the header is where the reservation gets spent rather than
 * where it gets wasted. What it is not is a soft violet pill, which was a
 * control wearing the shape of the badge beside it.
 *
 * The header still changes when somebody upgrades — from a word you press to a
 * crown and a plan name — and it stays hidden on phones, where the width is
 * worth more.
 *
 * A lapsed subscription is amber rather than violet. A proud crown over a
 * payment that failed is the badge lying, and this is often the only place
 * someone would find out before the plan drops.
 */
export function PlanBadge() {
  const ent = useEntitlements();
  const openPlans = usePlansDialog((s) => s.openPlans);
  const onUsage = usePathname() === "/settings/usage";

  /**
   * A placeholder of roughly the badge's width, rather than nothing.
   *
   * Returning `null` while entitlements are in flight made the header re-lay-out
   * the moment they landed — the theme toggle and the avatar slid left, which
   * reads as the page glitching rather than as data arriving. Everything to the
   * left of this is fixed-width, so holding the space is enough to stop it.
   */
  if (!ent.ready) {
    return <span aria-hidden className="bg-muted/60 hidden h-8 w-20 animate-pulse rounded-md md:inline-block" />;
  }
  if (!ent.data) return null;

  const { planId, planName, status, inGrace, cancelAtPeriodEnd, periodEnd } = ent.data;
  const paid = planId !== "free";
  const lapsed = paid && (inGrace || (status !== "active" && status !== "trialing"));

  const ends = periodEnd ? new Date(periodEnd).toLocaleDateString() : null;

  if (!paid) {
    /*
      Opens the plan picker in place; it does not navigate.

      It used to be a link to the plan page — which meant pressing Upgrade from
      the builder cost you the builder, and landed on a page whose cards were
      below the fold, so the prices were not even on screen on arrival. The
      dialog puts them where the click was, and `PlansDialog` reads the same
      seeded catalogue `/pricing` does, so nothing drifts.

      (It briefly pointed at Dodo's hosted storefront, too. That page lists
      products, not plans — no comparison, no sense of which tier is for whom,
      and a look that is theirs rather than ours.)

      Silent on `/usage`. The gradient is reserved for the commercial ask and
      capped at one per screen (DESIGN.md §4.1b) — the moment a second appears,
      neither is the money moment any more. `/usage` states the prices itself
      and carries its own ask beside them, attached to whichever meter is
      actually running out, so the generic chrome button is the one that yields.
    */
    if (onUsage) return null;

    return (
      <Button
        variant="gradient"
        size="sm"
        shape="pill"
        className="hidden md:inline-flex"
        onClick={() => openPlans()}
        title="See the paid plans and what they add."
      >
        Upgrade
      </Button>
    );
  }

  return (
    <Link
      href="/settings/usage"
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

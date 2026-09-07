"use client";

import Link from "next/link";
import { Crown, TriangleAlert } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { plansLinkProps, STOREFRONT_URL } from "@/lib/billing/storefront";
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
 * So: a button, in the violet family the paid crown already lives in, because
 * violet is what a plan is about here.
 *
 * Not the gradient fill, and the reason is the ink rather than the gesture.
 * Every brand fill in this product carries `--on-primary` — a near-black —
 * because both brand hues are light enough that white on them misses AA, and
 * `tests/token-contrast.test.ts` holds that line. That trade is right on a
 * large call to action and wrong at 12px in a header, where it reads as black
 * text on a poster. `--brand-violet-soft` under `--brand-violet-soft-foreground`
 * is a real violet on a pale violet, clears AA with room to spare, and both
 * halves invert with the theme.
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
      To Dodo's Storefront when one is published, and to `/billing` otherwise —
      see `lib/billing/storefront.ts` for why that is a deployment decision.

      What it is NOT is a checkout URL. Those are minted per plan and per cycle
      (`POST /billing/checkout` takes both), so a header button that went
      straight to one would be choosing on the customer's behalf and calling it
      "pick a plan". Both destinations here let them actually pick.
    */
    const plans = plansLinkProps();
    const upgradeClass = cn(
      "hidden items-center rounded-full px-3 py-1 text-xs font-semibold md:inline-flex",
      "bg-brand-violet-soft text-brand-violet-soft-foreground",
      "hover:bg-brand-violet-soft/70 transition-colors duration-[var(--duration-micro)]",
    );
    // One word, no icon. A sparkle next to "Upgrade" is decoration on a control
    // whose label already says everything it does, and at this size it only
    // competed with the word for the same few pixels.
    return STOREFRONT_URL ? (
      // Somebody else's site, so a new tab — and `plansLinkProps` carries the
      // `rel` that a `_blank` link is not safe without.
      <a {...plans} title="Compare the plans." className={upgradeClass}>
        Upgrade
      </a>
    ) : (
      <Link href={plans.href} title="See the paid plans and what they add." className={upgradeClass}>
        Upgrade
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

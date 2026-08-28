import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUESTION_TYPE_COUNT } from "./question-types";

/**
 * One plan card, for both places that sell plans.
 *
 * It takes a plain shape rather than the entitlements `Plan` type, because the
 * two callers legitimately read from different sources: the landing page reads
 * `PLAN_LIST` from `@repo/entitlements` (the authoring path), and `/pricing`
 * reads `/api/billing/plans` (the *seeded* catalogue, so what that page
 * promises is what the gates actually enforce). Typing this against either one
 * would have forced the other to hand-roll a second card, and two card styles
 * for the same product is a drift waiting to happen — which is what was
 * already shipping.
 *
 * The highlight lists went from five and six lines to three. A plan card is a
 * decision surface, not a specification: six ticks of near-equal weight is a
 * spec sheet that happens to have a button on it, and the reader ends up
 * comparing eighteen lines across three columns to find the two that differ.
 * Three lines each, chosen as the ones that change between tiers; the full
 * matrix is on `/pricing` for anyone who wants it.
 */

export interface PlanCardPlan {
  id: string;
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  priceYearlyPerMonthCents: number;
  yearlySavingPercent: number;
}

/** The three lines that decide each tier. Not a summary of the tier. */
export const PLAN_HIGHLIGHTS: Record<string, readonly string[]> = {
  free: [
    "Unlimited responses",
    "200 AI conversations a month",
    `All ${QUESTION_TYPE_COUNT} question types, logic and endings`,
  ],
  pro: [
    "2,000 AI conversations a month",
    "Persona, goal and a knowledge base",
    "Your logo and fonts, no chatform badge",
  ],
  business: [
    "10,000 AI conversations a month",
    "Verified respondents — Google or SMS",
    "Pick the model that runs the interview",
  ],
};

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

export function PlanCard({
  plan,
  annual,
  featured,
  ctaHref = "/signin",
  ctaLabel,
  /** Priced-but-unbuilt feature names, already lowercased by the caller. */
  soonLabels,
  /** Shown under the CTA when this environment has no checkout product. */
  note,
}: {
  plan: PlanCardPlan;
  annual: boolean;
  featured?: boolean;
  ctaHref?: string;
  ctaLabel?: string;
  soonLabels?: readonly string[];
  note?: string;
}) {
  const free = plan.priceMonthlyCents === 0;
  const perMonth = annual ? plan.priceYearlyPerMonthCents : plan.priceMonthlyCents;

  return (
    <div
      style={featured ? { background: "var(--primary-soft)" } : undefined}
      className={cn(
        "relative flex flex-col rounded-2xl p-6",
        featured
          ? "ring-primary/35 shadow-md ring-2"
          : "bg-card border-border/70 shadow-xs border",
      )}
    >
      {featured && (
        <span className="bg-primary text-primary-foreground text-micro absolute -top-3 left-6 rounded-full px-3 py-1 font-semibold">
          Most popular
        </span>
      )}

      <h3 className="text-h1 font-display font-bold tracking-[-0.02em]">{plan.name}</h3>
      <p className="text-caption text-muted-foreground mt-1 min-h-[2.5rem] leading-snug">
        {plan.tagline}
      </p>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-display-lg font-display tabular font-bold tracking-[-0.03em]">
          {dollars(perMonth)}
        </span>
        {!free && <span className="text-body text-muted-foreground">/month</span>}
      </p>
      <p className="text-caption text-muted-foreground mt-1 min-h-[1.25rem]">
        {free
          ? "Free forever. No card."
          : annual
            ? `${dollars(plan.priceYearlyCents)} billed yearly — save ${plan.yearlySavingPercent}%`
            : `${dollars(plan.priceMonthlyCents * 12)} a year at this rate`}
      </p>

      <Button
        asChild
        shape="pill"
        variant={featured ? "default" : "outline"}
        className="mt-5 w-full"
      >
        <Link href={ctaHref}>
          {ctaLabel ?? (free ? "Start free" : `Start with ${plan.name}`)}
        </Link>
      </Button>

      {/* Never offer a button that 503s: if the environment has no checkout
          product for this plan, say so rather than letting someone click into a
          dead end. */}
      {note && <p className="text-micro text-muted-foreground mt-2 text-center">{note}</p>}

      <ul className="mt-6 flex flex-col gap-2.5">
        {(PLAN_HIGHLIGHTS[plan.id] ?? []).map((line) => (
          <li key={line} className="text-body flex items-start gap-2.5">
            <Check className="text-primary mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {plan.id !== "free" && (
        <p className="text-micro text-muted-foreground mt-auto pt-5">
          Everything in {plan.id === "pro" ? "Free" : "Pro"}, plus the above.
        </p>
      )}

      {/* Priced but unbuilt features are named on the card that sells them, not
          only in the matrix further down. */}
      {soonLabels && soonLabels.length > 0 && (
        <p className="text-micro text-muted-foreground mt-1.5">
          Coming soon: {soonLabels.join(", ")}.
        </p>
      )}
    </div>
  );
}

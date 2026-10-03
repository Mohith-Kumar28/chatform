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
 * On how many lines a card carries: three was too few.
 *
 * It went six → three to stop the card reading as a spec sheet, and that was
 * the right instinct aimed at the wrong number. The actual failure was that
 * three lines could not show what a tier *unlocks* — two of Pro's three were
 * spent on a quota and a badge, so the page's answer to "what do I get for
 * $16" was "more conversations", and the three columns looked like one product
 * metered three ways. Pro turns on the agent brief, the follow-up sequence and
 * the whole analytics surface; none of that was on the card.
 *
 * Five, and the additive line moved ABOVE the list. "Everything in Free, plus"
 * read after five ticks is a correction; read before them it is the frame that
 * makes the five mean something. What is still not here is the matrix — the
 * link under the cards goes to it, and that link is now on both surfaces
 * rather than only the landing page.
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

/**
 * The lines that decide each tier, and every one of them is a real entitlement:
 * check against `PLANS` in `@repo/entitlements` before editing.
 *
 * Shaped after Youform's cards, which answer the same three questions ours
 * must: what is free, what the money turns on, and how many people can use it.
 * Nothing marked `soon` in the catalogue is here, and neither is the knowledge
 * base on Pro: it is already on Free.
 */
export const PLAN_HIGHLIGHTS: Record<string, readonly string[]> = {
  free: [
    "Unlimited responses",
    `All ${QUESTION_TYPE_COUNT} question types`,
    "Logic, scoring and multiple endings",
    "200 AI conversations a month",
    "Google Sheets, webhooks and file uploads",
    "A knowledge base your form answers from",
    "One user",
  ],
  // brand_logo + custom_fonts + remove_branding · collect_payments ·
  // partial_responses + followup_email · advanced_analytics +
  // conversation_analytics · respondent_auth_* · agent_persona + agent_guardrails
  pro: [
    "Your logo and fonts, no chatform badge",
    "Collect payments with Stripe",
    "Partial responses and follow-up emails",
    "Advanced analytics and drop-off",
    "Respondent sign-in by Google, email or SMS",
    "2,000 AI conversations, persona and guardrails",
    "Up to 3 team members",
  ],
  // verified_answers · one_response_per_identity · activity_log
  business: [
    "Verified answers, by emailed or texted code",
    "One response per verified person",
    "Activity log with CSV export",
    "10,000 AI conversations a month",
    "5 team members included",
    "Extra seats at $10 a month each",
  ],
};

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

export function PlanCard({
  plan,
  annual,
  featured,
  ctaHref = "/signin?mode=signup",
  ctaLabel,
  onCta,
  ctaDisabled,
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
  /**
   * Buy from here rather than navigate.
   *
   * The two public callers link out — the landing page and `/pricing` are read
   * by people who are not signed in, and the next step is an account. `/billing`
   * is read by someone who already has one, and for them the next step is the
   * checkout itself; sending them to a URL that re-renders the page they are on
   * so they can press a second button is a step that exists only because the
   * card could not do anything but link.
   */
  onCta?: () => void;
  ctaDisabled?: boolean;
  soonLabels?: readonly string[];
  note?: string;
}) {
  const free = plan.priceMonthlyCents === 0;
  const perMonth = annual ? plan.priceYearlyPerMonthCents : plan.priceMonthlyCents;

  return (
    <div
      // The featured card is framed in violet and its button is orange — the
      // mark's two hues, split the way the mark splits them. It used to be
      // orange on orange: the wash, the ring, the "Most popular" tab and the
      // CTA were one colour, so the only thing on the card you could actually
      // click was the least distinguishable thing on it. Emphasis and action
      // are different jobs and now they are different hues.
      style={featured ? { background: "var(--brand-violet-soft)" } : undefined}
      className={cn(
        "relative flex flex-col rounded-2xl p-6",
        featured
          ? "ring-brand-violet/35 shadow-md ring-2"
          : "bg-card border-border/70 shadow-xs border",
      )}
    >
      {featured && (
        <span className="bg-brand-violet text-brand-violet-foreground text-micro absolute -top-3 left-6 rounded-full px-3 py-1 font-semibold">
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
          ? "Forever. No credit card, no trial countdown."
          : annual
            ? `Billed yearly at ${dollars(plan.priceYearlyCents)}, save ${plan.yearlySavingPercent}%`
            : `Billed monthly, or ${dollars(plan.priceYearlyPerMonthCents)}/month billed yearly`}
      </p>

      {/* The featured card's button is the page's ask, so it takes both hues
          rather than one. On the violet wash the sweep starts orange and lands
          near the card's own colour — the card frames it instead of competing
          with it, which is what the flat-orange button on this ground never
          quite did. Every other card stays `outline`: three loud buttons in a
          row is a row with no recommendation in it. */}
      {onCta ? (
        <Button
          shape="pill"
          variant={featured ? "gradient" : "outline"}
          className="mt-5 w-full"
          disabled={ctaDisabled}
          onClick={onCta}
        >
          {ctaLabel ?? (free ? "Start free" : `Start with ${plan.name}`)}
        </Button>
      ) : (
        <Button
          asChild
          shape="pill"
          variant={featured ? "gradient" : "outline"}
          className="mt-5 w-full"
        >
          <Link href={ctaHref}>
            {ctaLabel ?? (free ? "Start free" : `Start with ${plan.name}`)}
          </Link>
        </Button>
      )}

      {/* Never offer a button that 503s: if the environment has no checkout
          product for this plan, say so rather than letting someone click into a
          dead end. */}
      {note && <p className="text-micro text-muted-foreground mt-2 text-center">{note}</p>}

      {/* The frame, before the list rather than after it. */}
      {plan.id !== "free" && (
        <p className="text-caption mt-6 font-medium">
          Everything in {plan.id === "pro" ? "Free" : "Pro"}, plus:
        </p>
      )}

      <ul className={cn("flex flex-col gap-2.5", plan.id === "free" ? "mt-6" : "mt-3")}>
        {(PLAN_HIGHLIGHTS[plan.id] ?? []).map((line) => (
          <li key={line} className="text-body flex items-start gap-2.5">
            {/* The ticks take the card's own hue so they sit on its ground
                rather than on top of it — orange ink on the violet wash is
                the one place these two genuinely fight. */}
            <Check
              className={cn(
                "mt-0.5 size-4 shrink-0",
                featured ? "text-brand-violet-soft-foreground" : "text-primary",
              )}
              strokeWidth={2.5}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* Priced but unbuilt features are named on the card that sells them, not
          only in the matrix further down. */}
      {soonLabels && soonLabels.length > 0 && (
        <p className="text-micro text-muted-foreground mt-auto pt-5">
          Coming soon: {soonLabels.join(", ")}.
        </p>
      )}
    </div>
  );
}

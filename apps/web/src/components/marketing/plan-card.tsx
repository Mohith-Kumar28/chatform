import Link from "next/link";
import { Check } from "lucide-react";
import type { Plan } from "@repo/entitlements";
import { FEATURES, yearlyPerMonthCents, yearlySavingPercent } from "@repo/entitlements";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Everything on this card is read from `packages/entitlements/src/plans.ts` —
 * price, tagline, feature list and limits. There is no second copy of the
 * pricing to drift out of sync, which is the whole reason that catalogue is
 * typed.
 */

const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

/** The three or four lines that sell each tier, over the raw feature keys. */
const HIGHLIGHTS: Record<string, readonly string[]> = {
  free: [
    "Unlimited responses, up to 5,000 a month",
    "200 AI conversations a month",
    "All 26 question types, logic and endings",
    "Link, QR and all four embed modes",
    "Webhooks, transcripts and CSV export",
  ],
  pro: [
    "2,000 AI conversations a month",
    "Persona, goal and a 20k-character knowledge base",
    "Partial responses and advanced analytics",
    "Your logo, your fonts, no chatform badge",
    "Headless API — 50,000 requests a month",
    "3 seats",
  ],
  business: [
    "10,000 AI conversations a month",
    "Google and SMS respondent verification",
    "One response per verified identity",
    "Pick the model that runs the interview",
    "Activity log",
    "5 seats, then $10 each",
  ],
};

export function PlanCard({
  plan,
  annual,
  featured,
}: {
  plan: Plan;
  annual: boolean;
  featured?: boolean;
}) {
  const free = plan.priceMonthlyCents === 0;
  const perMonth = annual ? yearlyPerMonthCents(plan) : plan.priceMonthlyCents;
  const saving = yearlySavingPercent(plan);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6",
        featured
          ? "border-primary/50 bg-card shadow-lg ring-primary/15 ring-1"
          : "border-border/70 bg-card shadow-xs",
      )}
    >
      {featured && (
        <span className="bg-primary text-primary-foreground text-micro absolute -top-3 left-6 rounded-full px-3 py-1 font-semibold">
          Most popular
        </span>
      )}

      <h3 className="text-h2 font-display">{plan.name}</h3>
      <p className="text-body text-muted-foreground mt-1.5 min-h-[2.75rem] leading-snug">
        {plan.tagline}
      </p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-display font-display tabular">{dollars(perMonth)}</span>
        {!free && <span className="text-body text-muted-foreground">/month</span>}
      </p>
      <p className="text-caption text-muted-foreground mt-1 min-h-[1.25rem]">
        {free
          ? "Free forever. No card."
          : annual
            ? `${dollars(plan.priceYearlyCents)} billed yearly — save ${saving}%`
            : `${dollars(plan.priceMonthlyCents * 12)} a year at this rate`}
      </p>

      <Button
        asChild
        shape="pill"
        variant={featured ? "default" : "outline"}
        className="mt-6 w-full"
      >
        <Link href="/signin">{free ? "Start free" : `Start with ${plan.name}`}</Link>
      </Button>

      <ul className="mt-6 flex flex-col gap-2.5">
        {(HIGHLIGHTS[plan.id] ?? []).map((line) => (
          <li key={line} className="text-body flex items-start gap-2.5">
            <Check className="text-primary mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {plan.id !== "free" && (
        <p className="text-micro text-muted-foreground mt-5">
          Everything in {plan.id === "pro" ? "Free" : "Pro"}, plus the above.
        </p>
      )}

      {/* Priced but unbuilt features are named as such on the card that sells
          them, not only in the matrix further down. */}
      {plan.features.some((f) => FEATURES[f].soon) && (
        <p className="text-micro text-muted-foreground mt-2">
          Coming soon on this plan:{" "}
          {plan.features
            .filter((f) => FEATURES[f].soon)
            .map((f) => FEATURES[f].label.toLowerCase())
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}

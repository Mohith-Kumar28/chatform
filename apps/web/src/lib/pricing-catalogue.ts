import {
  FEATURES,
  LIMITS,
  PLAN_LIST,
  yearlyPerMonthCents,
  yearlySavingPercent,
} from "@repo/entitlements";

/**
 * The plan catalogue, built on the server so the pricing page is not empty.
 *
 * `/pricing` was a client component whose every section waited on
 * `useGetApiBillingPlans()`. The plan cards, the forty-row feature matrix and
 * the fair-use footnotes were all behind `data &&`, which meant the prerendered
 * HTML of the one page people arrive at from a pricing search contained the
 * heading and nothing else — no prices, no plan names, no feature list. A
 * crawler saw an empty page, and so did anything summarising the page for
 * somebody who never opens it.
 *
 * This rebuilds the same payload from the authoring catalogue in
 * `@repo/entitlements`, which is the same source `tooling/seed-plans.sql` is
 * generated from and which `pnpm plans:verify` asserts has not drifted from the
 * seeded rows. So the server-rendered numbers are the numbers the gates
 * enforce, and the live fetch that lands after hydration agrees with them.
 *
 * The one field it cannot know is `checkoutReady` — whether a Dodo product id
 * exists for the plan — because that lives in the database. It is reported here
 * as `null`, and the page only draws the "contact us to set this up" note once
 * the live payload has arrived with a real answer. Rendering that note against
 * a guess would put a false claim in the HTML, which is the problem this file
 * exists to fix.
 */

export interface CataloguePlan {
  id: "free" | "pro" | "business";
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  priceYearlyPerMonthCents: number;
  yearlySavingPercent: number;
  seatPriceCents: number;
  currency: string;
  features: string[];
  limits: Record<string, number | null>;
  /** `null` on the server-built copy — only the live payload knows. */
  checkoutReady: boolean | null;
}

export interface Catalogue {
  plans: CataloguePlan[];
  features: Record<string, { label: string; blurb: string; minPlan: string; soon: boolean }>;
  limits: Record<string, { label: string; unit: string; mode: string }>;
}

export function buildCatalogue(): Catalogue {
  return {
    plans: PLAN_LIST.map((plan) => ({
      id: plan.id,
      name: plan.name,
      tagline: plan.tagline,
      priceMonthlyCents: plan.priceMonthlyCents,
      priceYearlyCents: plan.priceYearlyCents,
      priceYearlyPerMonthCents: yearlyPerMonthCents(plan),
      yearlySavingPercent: yearlySavingPercent(plan),
      seatPriceCents: plan.seatPriceCents,
      currency: plan.currency,
      features: [...plan.features],
      limits: { ...plan.limits },
      checkoutReady: null,
    })),
    features: Object.fromEntries(
      Object.entries(FEATURES).map(([key, meta]) => [
        key,
        {
          label: meta.label,
          blurb: meta.blurb,
          minPlan:
            PLAN_LIST.find((plan) => (plan.features as readonly string[]).includes(key))?.id ??
            "business",
          soon: meta.soon === true,
        },
      ]),
    ),
    limits: Object.fromEntries(
      Object.entries(LIMITS).map(([key, meta]) => [
        key,
        { label: meta.label, unit: meta.unit, mode: meta.mode },
      ]),
    ),
  };
}

/** Dollars, for the `Offer` nodes in the page's JSON-LD. */
export function dollars(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

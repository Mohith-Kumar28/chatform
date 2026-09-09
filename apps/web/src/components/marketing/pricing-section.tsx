"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FEATURES,
  PLAN_LIST,
  yearlyPerMonthCents,
  yearlySavingPercent,
} from "@repo/entitlements";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PlanCard } from "./plan-card";

/**
 * The way out of a five-line card and into the forty-row matrix.
 *
 * Five highlights per tier is a decision surface, and a decision surface
 * always leaves somebody wanting the rest of it. This is the exit, and it goes
 * directly under the cards on every surface that shows them — it used to
 * appear only on the landing page, so the reader on `/pricing` had no signpost
 * to the table sitting two bands below them.
 */
export function ComparisonLink({ href }: { href: string }) {
  return (
    <p className="text-caption text-muted-foreground text-center">
      Five lines each. There are forty.{" "}
      <Link href={href} className="text-primary font-medium underline underline-offset-4">
        See the detailed comparison →
      </Link>
    </p>
  );
}

/**
 * The landing page's pricing block, off the authoring catalogue.
 *
 * BILLING.md: "Pricing page opens on annual. '$16/mo billed yearly — save
 * 33%.'" — so annual is the default here, not monthly.
 *
 * The four-sentence footnote under the cards is now one line. It explained the
 * fair-use ceiling, the reason AI conversations are metered, and what happens
 * past the cap — three arguments nobody is having at the moment they are
 * choosing a plan. The full explanation lives at the foot of `/pricing`, where
 * somebody who has read the whole page ends up.
 *
 * `compareHref` rather than a boolean, because the link's destination differs
 * by surface and its presence does not. From the landing page the matrix is on
 * another route; from `/pricing` it is an anchor further down the same page.
 * The old `showAllLink` hid the link entirely on `/pricing` — the one surface
 * where somebody is definitely comparing plans.
 */
export function PricingSection({
  compareHref = "/pricing#everything",
}: {
  compareHref?: string;
}) {
  const [cycle, setCycle] = useState<"annual" | "monthly">("annual");
  const annual = cycle === "annual";

  return (
    <div className="flex flex-col items-center gap-9">
      <SegmentedControl
        options={[
          { value: "annual", label: "Yearly · save 33%" },
          { value: "monthly", label: "Monthly" },
        ]}
        value={cycle}
        onChange={setCycle}
        ariaLabel="Billing period"
      />

      <div className="grid w-full items-stretch gap-5 lg:grid-cols-3">
        {PLAN_LIST.map((plan) => (
          <PlanCard
            key={plan.id}
            annual={annual}
            featured={plan.id === "pro"}
            plan={{
              id: plan.id,
              name: plan.name,
              tagline: plan.tagline,
              priceMonthlyCents: plan.priceMonthlyCents,
              priceYearlyCents: plan.priceYearlyCents,
              priceYearlyPerMonthCents: yearlyPerMonthCents(plan),
              yearlySavingPercent: yearlySavingPercent(plan),
            }}
            soonLabels={plan.features
              .filter((f) => FEATURES[f].soon)
              .map((f) => FEATURES[f].label.toLowerCase())}
          />
        ))}
      </div>

      <ComparisonLink href={compareHref} />
    </div>
  );
}

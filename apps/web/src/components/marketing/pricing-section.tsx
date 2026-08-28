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
 * The landing page's pricing block, off the authoring catalogue.
 *
 * BILLING.md: "Pricing page opens on annual. '$16/mo billed yearly — save
 * 33%.'" — so annual is the default here, not monthly.
 *
 * The four-sentence footnote under the cards is now one line. It explained the
 * fair-use ceiling, the reason AI conversations are metered, and what happens
 * past the cap — three arguments nobody is having at the moment they are
 * choosing a plan. The full explanation lives on `/pricing`, linked below.
 */
export function PricingSection({ showAllLink = false }: { showAllLink?: boolean }) {
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

      <p className="text-caption text-muted-foreground text-center">
        AI conversations are metered because each one is a real conversation with a model.
        {showAllLink && (
          <>
            {" "}
            <Link
              href="/pricing"
              className="text-primary font-medium underline underline-offset-4"
            >
              Compare every feature and limit →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

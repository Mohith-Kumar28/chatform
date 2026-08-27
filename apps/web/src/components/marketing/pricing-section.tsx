"use client";

import { useState } from "react";
import { PLAN_LIST } from "@repo/entitlements";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PlanCard } from "./plan-card";

/**
 * BILLING.md: "Pricing page opens on annual. '$16/mo billed yearly — save
 * 33%.'" — so annual is the default here, not monthly.
 */
export function PricingSection({ compact = false }: { compact?: boolean }) {
  const [cycle, setCycle] = useState<"annual" | "monthly">("annual");
  const annual = cycle === "annual";

  return (
    <div className="flex flex-col items-center gap-8">
      <SegmentedControl
        options={[
          { value: "annual", label: "Yearly · save 33%" },
          { value: "monthly", label: "Monthly" },
        ]}
        value={cycle}
        onChange={setCycle}
        ariaLabel="Billing period"
      />

      <div className="grid w-full gap-5 lg:grid-cols-3">
        {PLAN_LIST.map((plan) => (
          <PlanCard key={plan.id} plan={plan} annual={annual} featured={plan.id === "pro"} />
        ))}
      </div>

      <p className="text-caption text-muted-foreground max-w-2xl text-center text-balance">
        &ldquo;Unlimited&rdquo; means no per-plan quota, subject to the hard monthly ceiling —
        5,000 responses on Free, 50,000 on Pro and Business. AI conversations are metered
        separately, because every response here is a real conversation with a real model.{" "}
        {compact ? null : "Past the cap, interviews fall back to fixed questions rather than failing."}
      </p>
    </div>
  );
}

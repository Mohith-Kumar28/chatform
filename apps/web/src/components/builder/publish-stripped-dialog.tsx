"use client";

import { Lock } from "lucide-react";
import { PLANS, type FeatureKey, type PlanId } from "@repo/entitlements";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpgrade } from "@/components/billing/gate";

export interface StrippedSetting {
  path: string;
  feature: FeatureKey;
  label: string;
  requiredPlan: PlanId;
}

/**
 * What the publish left out, and what it would cost to keep it.
 *
 * The form *did* publish — nothing failed, nothing was lost, and the working document
 * still holds every setting exactly as authored, so upgrading and republishing restores
 * all of it with no re-work. What this dialog exists to prevent is the settings
 * disappearing silently, which would read as a bug and destroy trust in every other
 * toggle in the builder.
 *
 * It is also, straightforwardly, the best upsell moment in the product.
 */
export function PublishStrippedDialog({
  stripped,
  onClose,
}: {
  stripped: StrippedSetting[];
  onClose: () => void;
}) {
  const upgrade = useUpgrade();
  if (stripped.length === 0) return null;

  // Several settings can belong to one feature (logo and brand name are both `brand_logo`);
  // listing the feature once is what a person expects to read.
  const byFeature = new Map<FeatureKey, StrippedSetting>();
  for (const s of stripped) if (!byFeature.has(s.feature)) byFeature.set(s.feature, s);
  const items = [...byFeature.values()];

  // Pitch the cheapest plan that covers everything listed, not the most expensive.
  const rank: Record<PlanId, number> = { free: 0, pro: 1, business: 2 };
  const target = items.reduce<PlanId>((acc, s) => (rank[s.requiredPlan] > rank[acc] ? s.requiredPlan : acc), "pro");
  const plan = PLANS[target];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div className="bg-[var(--warning-soft)] text-[var(--warning-foreground)] mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
            <Lock className="size-4" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">
              Published — with {items.length === 1 ? "one setting" : `${items.length} settings`} left out
            </h2>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              Your form is live. These are still saved in your draft and will apply the moment your
              plan includes them — nothing to set up again.
            </p>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
          {items.map((s) => (
            <li key={s.feature} className="flex items-center justify-between gap-3 py-2">
              <span>{s.label}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{PLANS[s.requiredPlan].name}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              onClose();
              upgrade(items[0]!.feature, { surface: "publish", strippedCount: items.length });
            }}
          >
            Unlock with {plan.name}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

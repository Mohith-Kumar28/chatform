"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, ExternalLink } from "lucide-react";
import { PLANS, type PlanId } from "@repo/entitlements";
import { usePlansDialog } from "@/stores/paywall-store";
import { useGetApiBillingPlans } from "@/lib/api/billing/billing";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useBillingActions } from "@/hooks/use-billing-actions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PlanCard, type PlanCardPlan } from "@/components/marketing/plan-card";

/**
 * The price list, wherever it is asked for.
 *
 * Every Upgrade control in the product used to be a link to the plan page. That is a
 * whole navigation — losing the builder you were in, the row you were looking at — to
 * answer one question, and the page it landed on had the cards below the fold, so the
 * answer was not even on screen when you arrived. Now the click shows the cards.
 *
 * Distinct from `UpgradeDialog`, which answers a *refusal*: it names the thing that was
 * blocked, one target plan and what that plan adds. This one answers "what does this
 * cost", so it shows the tiers side by side and lets someone choose.
 *
 * The rows come from `/api/billing/plans` — the **seeded** catalogue, the same endpoint
 * `/pricing` reads — so the prices here cannot drift from the prices there, and neither
 * can drift from what the gates enforce.
 */
export function PlansDialog() {
  const open = usePlansDialog((s) => s.open);
  const intent = usePlansDialog((s) => s.intent);
  const seededCycle = usePlansDialog((s) => s.cycle);
  const close = usePlansDialog((s) => s.closePlans);

  if (!open) return null;
  // Keyed on the cycle a link handed over, so re-opening from a different link
  // does not inherit the previous visit's toggle.
  return <PlansDialogBody key={seededCycle ?? "default"} intent={intent} seededCycle={seededCycle} onClose={close} />;
}

function PlansDialogBody({
  intent,
  seededCycle,
  onClose,
}: {
  intent: PlanId | null;
  seededCycle: "monthly" | "yearly" | null;
  onClose: () => void;
}) {
  const ent = useEntitlements();
  const catalogue = useGetApiBillingPlans();
  const { busy, error, startCheckout, openPortal } = useBillingActions();

  /* Annual first: it is the better deal for the customer and the better number for us,
     and defaulting to it is ordinary practice rather than a trick. */
  const [cycle, setCycle] = useState<"monthly" | "yearly">(seededCycle === "monthly" ? "monthly" : "yearly");

  const currentId: PlanId = ent.data?.planId ?? "free";
  const paying = currentId !== "free";
  const canManage = ent.allows("billing", "manage");

  const rows = ((catalogue.data as { plans?: (PlanCardPlan & { checkoutReady: boolean })[] } | undefined)?.plans ??
    []) as (PlanCardPlan & { checkoutReady: boolean })[];
  /* Free is not offered here. Everyone reading this dialog already has an account on it,
     so a "Start free" card is a card with nothing behind it. */
  const paid = rows.filter((row) => row.id !== "free");
  const saving = paid.find((row) => row.id === "pro")?.yearlySavingPercent ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Two full plan cards is a tall dialog. On a laptop with browser chrome it can
          out-grow the viewport, and a modal that clips its own buttons is worse than one
          that scrolls. */}
      <DialogContent size="3xl" className="max-h-[calc(100dvh-3rem)] gap-0 overflow-y-auto">
        <div className="text-center">
          <DialogTitle className="font-display text-h2 tracking-tight">
            {paying ? "Change your plan" : "Upgrade"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Compare the paid plans and start a checkout.
          </DialogDescription>
        </div>

        {/* One control, and the saving is the argument for it, so it says the number. */}
        <div className="mt-4 flex justify-center">
          <SegmentedControl
            options={[
              { value: "yearly", label: saving > 0 ? `Yearly · save ${saving}%` : "Yearly" },
              { value: "monthly", label: "Monthly" },
            ]}
            value={cycle}
            onChange={(v) => setCycle(v as "monthly" | "yearly")}
            size="sm"
            ariaLabel="Billing cycle"
          />
        </div>

        {catalogue.isPending ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : paid.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {paid.map((row) => {
              const current = row.id === currentId;
              return (
                <PlanCard
                  key={row.id}
                  plan={row}
                  annual={cycle === "yearly"}
                  /* Pro is the recommendation — unless a link named a tier, in which case
                     the card they came to see is the one framed. Two outline cards side
                     by side is a row with no recommendation in it. */
                  featured={!current && row.id === (intent ?? "pro")}
                  ctaLabel={
                    current
                      ? "Your plan"
                      : busy
                        ? "Opening…"
                        : paying
                          ? `Switch to ${row.name}`
                          : `Choose ${row.name}`
                  }
                  /* A paying org switches at the provider, against its own record of the
                     subscription. Only a first purchase runs through checkout here. */
                  onCta={() => (paying ? openPortal() : startCheckout(row.id as PlanId, cycle))}
                  ctaDisabled={current || !canManage || busy || (!paying && !row.checkoutReady)}
                  note={
                    current
                      ? undefined
                      : !paying && !row.checkoutReady
                        ? "Not available in this environment yet."
                        : !canManage
                          ? "Only an owner can change the plan."
                          : undefined
                  }
                />
              );
            })}
          </div>
        ) : (
          /* The catalogue failed or is empty. One working button beats a grid that is
             not there. */
          <div className="mt-6 text-center">
            <Button
              variant="gradient"
              size="lg"
              disabled={!canManage || busy}
              onClick={() => (paying ? openPortal() : startCheckout(intent ?? "pro", cycle))}
            >
              {paying && <CreditCard className="size-4" aria-hidden />}
              {busy ? "Opening…" : `Continue to ${PLANS[intent ?? "pro"].name}`}
            </Button>
          </div>
        )}

        {error && <p className="text-destructive mt-4 text-center text-sm">{error}</p>}

        <p className="text-muted-foreground mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
          <Link href="/pricing" className="hover:text-foreground underline underline-offset-2" onClick={onClose}>
            Compare every feature
          </Link>
          <span aria-hidden>·</span>
          {/* Say where the button goes before it goes there: a dialog that vanishes into
              a payment provider with no warning reads as a redirect that went wrong. */}
          <span className="inline-flex items-center gap-1">
            {paying ? "Changes are priced in the billing portal" : "Checkout and invoices via our payment provider"}
            {paying && <ExternalLink className="size-3" aria-hidden />}
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}

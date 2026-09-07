"use client";

import { useState } from "react";
import { Check, Lock, ArrowRight, CreditCard, ExternalLink } from "lucide-react";
import { FEATURES, PLANS, yearlyPerMonthCents, yearlySavingPercent, type PlanId } from "@repo/entitlements";
import { usePaywall, usePlansDialog } from "@/stores/paywall-store";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useBillingActions } from "@/hooks/use-billing-actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One dialog for every paywall in the product.
 *
 * Driven by the `GateError` envelope, so it renders correctly for a denial it has never
 * been told about — a new gate on the API needs no work here. Mounted once, in the app
 * shell.
 *
 * This is the half of billing that stays ours. Dodo owns the money and cannot own this:
 * it has never heard of `respondent_auth_google`, so it cannot tell someone that the
 * switch they just clicked is a Business feature and what else comes with it. What it
 * *can* own is the transaction, so both buttons below leave — checkout for an org buying
 * its first subscription, the portal for one that already pays.
 */
export function UpgradeDialog() {
  const gate = usePaywall((s) => s.gate);
  const close = usePaywall((s) => s.close);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const openPlans = usePlansDialog((s) => s.openPlans);
  const ent = useEntitlements();
  const { busy, error, startCheckout, openPortal } = useBillingActions();

  if (!gate) return null;

  const targetId: PlanId = gate.requiredPlan ?? "pro";
  const plan = PLANS[targetId];
  const count = typeof gate.context.count === "number" ? gate.context.count : null;
  const noun = typeof gate.context.noun === "string" ? gate.context.noun : null;

  /**
   * What the organization is on *now*. `gate.plan` is a snapshot taken when the denial
   * was raised and can be stale by the time this dialog is open, so entitlements wins
   * where it has loaded.
   */
  const currentId: PlanId = ent.data?.planId ?? gate.plan;
  const paying = currentId !== "free";

  /** The features this upgrade adds over what they have now. */
  const current = PLANS[currentId];
  const gained = plan.features.filter((f) => !(current.features as readonly string[]).includes(f));
  const headline = headlineFor(gate.code, count, noun, gate);

  /**
   * Two destinations, both of them the provider's, and which one is not a preference.
   *
   * A free org has no customer record yet, so the first subscription has to go through
   * checkout. Anything after that — including this upgrade — is a switch between products
   * in one collection, which the portal does against its own record of the subscription.
   * We used to call our own change-plan endpoint here and reconcile the result; that is
   * what charged a customer for Business and left them on Pro.
   */
  const start = () => (paying ? openPortal() : startCheckout(targetId, cycle));

  const perMonth = cycle === "yearly" ? yearlyPerMonthCents(plan) : plan.priceMonthlyCents;
  const saving = yearlySavingPercent(plan);

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <div className="text-center">
          <div className="bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)] mx-auto mb-3 flex size-9 items-center justify-center rounded-full">
            <Lock className="size-4" aria-hidden />
          </div>

          {count !== null && count > 0 && (
            <p className="font-display text-3xl leading-none font-semibold tracking-tight tabular-nums">
              {count.toLocaleString()}
            </p>
          )}
          <h2 className="font-display mt-1 text-lg font-semibold tracking-tight text-balance">{headline}</h2>
          {gate.feature && <p className="text-muted-foreground mt-1.5 text-sm">{FEATURES[gate.feature].blurb}</p>}
        </div>

        {/* The toggle belongs to whoever takes the money. This dialog only takes it from an
            org buying its first subscription; a paying one picks its cycle in the portal,
            alongside the proration it is about to be quoted. Rendering a switch here for
            them would be a control with nothing on the other end.

            Annual first for the people who do see it: it is the better deal for the
            customer and the better number for us, and defaulting to it is standard
            practice rather than a trick. */}
        {!paying && (
          <div className="bg-muted mt-5 flex rounded-lg p-0.5 text-sm">
            {(["yearly", "monthly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={cn(
                  "flex-1 rounded-[0.4rem] px-3 py-1.5 font-medium transition-colors",
                  cycle === c ? "bg-[var(--background)] shadow-sm" : "text-muted-foreground",
                )}
              >
                {c === "yearly" ? `Yearly · save ${saving}%` : "Monthly"}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-baseline justify-center gap-1.5">
          <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">
            ${(perMonth / 100).toFixed(0)}
          </span>
          <span className="text-muted-foreground text-sm">
            {paying
              ? `/mo · from $${(plan.priceMonthlyCents / 100).toFixed(0)} monthly`
              : `/mo${cycle === "yearly" ? ` · $${(plan.priceYearlyCents / 100).toFixed(0)} billed yearly` : ""}`}
          </span>
        </div>

        {gained.length > 0 && (
          <ul className="mt-4 grid gap-1.5 text-sm">
            {gained.slice(0, 6).map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success-foreground,var(--primary))]" aria-hidden />
                <span className={cn(FEATURES[f].soon && "text-muted-foreground")}>
                  {FEATURES[f].label}
                  {/* Priced but not built. Saying so is not optional: selling an unbuilt
                      feature as included is a misrepresentation, not a tactic. */}
                  {FEATURES[f].soon && <span className="ml-1 text-xs">(coming soon)</span>}
                </span>
              </li>
            ))}
            {gained.length > 6 && (
              <li className="text-muted-foreground pl-5.5 text-xs">and {gained.length - 6} more</li>
            )}
          </ul>
        )}

        {error && <p className="text-destructive mt-3 text-center text-sm">{error}</p>}

        <div className="mt-5 grid gap-2">
          {/* The ask itself, in both hues. This is the one button in the
              product that the gradient is for: if it is not this, it is not
              anything. */}
          <Button variant="gradient" size="lg" onClick={start} disabled={busy}>
            {paying && !busy && <CreditCard className="size-3.5" aria-hidden />}
            {busy ? "Opening…" : paying ? `Switch to ${plan.name}` : `Upgrade to ${plan.name}`}
            {!busy && (paying ? <ExternalLink className="size-3" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />)}
          </Button>
          {/* Say where the button goes before it goes there. A dialog that vanishes into a
              payment provider with no warning reads as a redirect that went wrong. */}
          {paying && (
            <p className="text-muted-foreground text-center text-xs">
              Opens the billing portal, where the change is priced and applied.
            </p>
          )}
          {/* The other tiers, in place. This used to push `/pricing`, which threw away
              whatever the reader was doing when the gate stopped them — and made
              "just show me the options" cost a full page load out of the app. */}
          <button
            type="button"
            onClick={() => {
              close();
              openPlans({ plan: targetId, cycle });
            }}
            className="text-muted-foreground hover:text-foreground h-9 text-sm transition-colors"
          >
            See all plans
          </button>
        </div>

        {gate.resetsAt && (
          <p className="text-muted-foreground mt-3 text-center text-xs">
            Or wait — this resets on {new Date(gate.resetsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The line at the top of the dialog.
 *
 * Written per denial kind rather than generically, because the whole finding from the
 * research is that naming the number converts and naming the feature does not. A quota
 * denial and a locked feature want different sentences.
 */
function headlineFor(
  code: string,
  count: number | null,
  noun: string | null,
  gate: { message: string; limit: number | null; metric: string | null },
): string {
  if (code === "feature_locked" && count !== null && count > 0 && noun) {
    return `${noun} are waiting for you.`;
  }
  if (code === "limit_reached" && gate.limit !== null) {
    return `You've used this month's ${gate.metric?.replaceAll("_", " ") ?? "allowance"}.`;
  }
  if (code === "ceiling_reached") return "This form has hit its monthly response ceiling.";
  if (code === "seat_limit") return "Bring your team along.";
  return gate.message;
}

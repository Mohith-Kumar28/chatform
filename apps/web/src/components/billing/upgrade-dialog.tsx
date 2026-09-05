"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Lock, ArrowRight } from "lucide-react";
import { FEATURES, PLANS, yearlyPerMonthCents, yearlySavingPercent, type PlanId } from "@repo/entitlements";
import { usePaywall } from "@/stores/paywall-store";
import { ApiError } from "@/lib/api/mutator";
import { usePostApiBillingCheckout, usePostApiBillingChangePlan } from "@/lib/api/billing/billing";
import { useEntitlements, ENTITLEMENTS_KEY } from "@/hooks/use-entitlements";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * One dialog for every paywall in the product.
 *
 * Driven by the `GateError` envelope, so it renders correctly for a denial it has never
 * been told about — a new gate on the API needs no work here. Mounted once, in the app
 * shell.
 */
export function UpgradeDialog() {
  const gate = usePaywall((s) => s.gate);
  const close = usePaywall((s) => s.close);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const ent = useEntitlements();
  const checkout = usePostApiBillingCheckout();
  const changePlan = usePostApiBillingChangePlan();

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

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      /**
       * Two paths behind one button, the same split the billing page makes.
       *
       * An organization with no subscription buys one through checkout; one that already
       * pays moves through change-plan, because a second checkout would leave it with two
       * subscriptions and two charges. Sending everyone to checkout is what made an
       * upgrade from Pro come back as "This organization is on Pro. Use change-plan
       * instead." — the API refusing, correctly, to double-charge.
       */
      if (!paying) {
        const res = (await checkout.mutateAsync({
          data: { planId: targetId, cycle } as never,
        })) as unknown as { url: string };
        window.location.assign(res.url);
        return;
      }

      const res = (await changePlan.mutateAsync({
        data: { planId: targetId, cycle } as never,
      })) as unknown as { paymentLink?: string | null };

      // Dodo hands back a hosted link when the change needs money before it applies.
      if (res?.paymentLink) {
        window.location.assign(res.paymentLink);
        return;
      }

      /*
        Applied immediately. Re-read entitlements before closing: the gate that opened
        this dialog is what the caller behind it is still rendering against, and closing
        on stale data leaves the feature locked with no explanation.
      */
      await queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
      setBusy(false);
      close();
    } catch (err) {
      /**
       * Either path can legitimately be unavailable — no Dodo products linked on this
       * environment, or a role without `billing:manage`. Say so rather than leaving a
       * dead button.
       */
      setError(err instanceof ApiError ? err.message : "Could not start the upgrade.");
      setBusy(false);
    }
  };

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

        {/* Annual first: it is the better deal for the customer and the better number for
            us, and defaulting to it is standard practice rather than a trick. */}
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

        <div className="mt-4 flex items-baseline justify-center gap-1.5">
          <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">
            ${(perMonth / 100).toFixed(0)}
          </span>
          <span className="text-muted-foreground text-sm">
            /mo{cycle === "yearly" ? ` · $${(plan.priceYearlyCents / 100).toFixed(0)} billed yearly` : ""}
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
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (paying ? "Upgrading…" : "Opening checkout…") : `Upgrade to ${plan.name}`}
            {!busy && <ArrowRight className="size-3.5" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              router.push("/pricing");
            }}
            className="text-muted-foreground hover:text-foreground h-9 text-sm transition-colors"
          >
            Compare plans
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

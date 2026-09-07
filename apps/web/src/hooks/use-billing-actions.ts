"use client";

import { useState } from "react";
import type { PlanId } from "@repo/entitlements";
import { ApiError } from "@/lib/api/mutator";
import { usePostApiBillingCheckout, usePostApiBillingPortal } from "@/lib/api/billing/billing";

/**
 * The two doors out of this app and into the payment provider.
 *
 * There were three copies of this pair — the plan page, the paywall dialog, and now the
 * plan picker — each with its own `busy`/`error` state and its own popup handling. The
 * subtle one is `openPortal`: the tab has to be claimed *synchronously* on the click, and
 * exactly one of the three copies remembered to. Once that is a shared function it cannot
 * be forgotten by the next caller.
 *
 * Which door is correct is not a preference:
 *
 * - **Checkout** is for an organization with no subscription yet. It has no customer
 *   record at the provider, so there is no portal to open.
 * - **The portal** is for everything after that — switching tier, moving between monthly
 *   and yearly, cancelling. We used to run those ourselves and reconcile the result,
 *   which is what once charged a customer for Business and left them on Pro.
 */
export function useBillingActions() {
  const checkout = usePostApiBillingCheckout();
  const portal = usePostApiBillingPortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** First purchase. Leaves this tab — checkout is the whole page after this. */
  const startCheckout = async (planId: PlanId, cycle: "monthly" | "yearly") => {
    setBusy(true);
    setError(null);
    try {
      const res = (await checkout.mutateAsync({
        data: { planId, cycle } as never,
      })) as unknown as { url: string };
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  };

  /**
   * The portal, in its own tab, claimed on the click.
   *
   * It is somebody else's site: leaving this one to look up an invoice and having to
   * navigate back is the wrong trade. And the tab cannot be opened after the `await` —
   * by then the browser no longer attributes it to a gesture and blocks it as a popup,
   * which is the failure where the button appears to do nothing at all. So a blank tab
   * is claimed first and pointed at the URL once we have it, with `opener` severed.
   */
  const openPortal = async () => {
    setBusy(true);
    setError(null);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const res = (await portal.mutateAsync()) as unknown as { url: string };
      if (tab) tab.location.replace(res.url);
      // Popup blocked, or a context that returns no handle: same tab beats no tab.
      else window.location.assign(res.url);
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiError ? err.message : "Could not open the billing portal.");
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, startCheckout, openPortal };
}

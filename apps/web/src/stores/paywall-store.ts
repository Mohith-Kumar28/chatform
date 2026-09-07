import { create } from "zustand";
import type { GateError, PlanId } from "@repo/entitlements";

/**
 * The one place a paywall is opened from.
 *
 * `mutator.ts` pushes here on any 402, so every existing and future call site gets the
 * right dialog with no per-call-site work. It is a module-level store rather than React
 * context because the fetch mutator is not inside the tree.
 */
interface PaywallState {
  /** The denial currently being shown, or null. */
  gate: GateError | null;
  /** Set when the dialog was opened by a click rather than by a failed request. */
  source: "request" | "click";
  open: (gate: GateError, source?: "request" | "click") => void;
  close: () => void;
}

export const usePaywall = create<PaywallState>((set) => ({
  gate: null,
  source: "request",
  open: (gate, source = "request") => set({ gate, source }),
  close: () => set({ gate: null }),
}));

/**
 * Called from outside React by the fetch mutator.
 *
 * Role denials (403 `forbidden`) are deliberately dropped rather than shown: upgrading
 * cannot fix a role, so a pricing dialog would be actively misleading. Those surface as
 * ordinary errors for the calling component to render in place.
 */
export function openPaywall(gate: GateError): void {
  if (gate.code === "forbidden") return;
  usePaywall.getState().open(gate);
}

/**
 * The plan picker, opened from anywhere.
 *
 * Separate from the paywall above, and the split is the point. `usePaywall` is a
 * *denial* — something was refused, and the dialog names the thing. This one is a
 * *browse*: somebody pressed Upgrade with nothing blocked, and what they want is the
 * price list.
 *
 * It exists because every Upgrade control in the product used to be a link to the plan
 * page, which put a full navigation between the ask and the answer — and landed on a
 * page whose cards were below the fold anyway. A dialog puts the prices where the click
 * was.
 */
interface PlansState {
  open: boolean;
  /** The tier a link named, if it named one. Only used to seed emphasis. */
  intent: PlanId | null;
  /** Seeded from `?cycle=`, so `/pricing` can hand its toggle over intact. */
  cycle: "monthly" | "yearly" | null;
  openPlans: (opts?: { plan?: PlanId | null; cycle?: "monthly" | "yearly" | null }) => void;
  closePlans: () => void;
}

export const usePlansDialog = create<PlansState>((set) => ({
  open: false,
  intent: null,
  cycle: null,
  openPlans: (opts) => {
    // Never two modals deep. A denial that is still on screen when the price list opens
    // leaves the reader closing one dialog to find another underneath it.
    usePaywall.getState().close();
    set({ open: true, intent: opts?.plan ?? null, cycle: opts?.cycle ?? null });
  },
  closePlans: () => set({ open: false }),
}));

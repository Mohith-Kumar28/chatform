import { create } from "zustand";
import type { GateError } from "@repo/entitlements";

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

import type { PaymentProviderName } from "@repo/form-schema";

/**
 * The browser's copy of the verified-payment event payloads.
 *
 * Mirrors `ServerEvent` in `apps/api/src/lib/events.ts` and `CheckoutLaunch` in
 * `apps/api/src/lib/payments/types.ts`. The web app does not depend on the API
 * package, so the shapes are restated here, the way `use-chat.ts` restates
 * `verify_required`; when one side changes, change the other in the same
 * commit. The respondent chat and the builder preview both read these — they
 * are separate components that drift silently, which is why the types they
 * share live in one file rather than in either.
 */

export type PaymentProvider = PaymentProviderName;

/** What the browser needs to open checkout. Never contains a secret. */
export type CheckoutLaunch =
  | { kind: "cashfree_sdk"; orderId: string; paymentSessionId: string; mode: "sandbox" | "production" }
  | {
      kind: "razorpay_checkout";
      orderId: string;
      /** The merchant's publishable key. */
      key: string;
      amountMinor: number;
      currency: string;
      name: string;
      description?: string;
      prefill?: { name?: string; email?: string; contact?: string };
    }
  | { kind: "redirect"; url: string; sessionId: string };

/** `payment_required` — a checkout is waiting on the respondent. Re-sent on resync. */
export interface PaymentRequiredEvent {
  ref: string;
  provider: PaymentProvider;
  amountMinor: number;
  /** Major units. */
  amount: number;
  currency: string;
  /** Already formatted, e.g. "₹499". */
  display: string;
  launch: CheckoutLaunch;
  recordId: string;
  /** Epoch ms. */
  expiresAt: number;
  /** A builder preview: checkout is simulated and never reaches a gateway. */
  preview?: boolean;
}

/** `payment_settled` — the gateway confirmed it; the answer and next question follow. */
export interface PaymentSettledEvent {
  ref: string;
  recordId: string;
  status: "paid";
}

/** `payment_failed` — this attempt did not go through; the card stays up for a retry. */
export interface PaymentFailedEvent {
  ref: string;
  recordId: string;
  code: string;
  message: string;
}

/** `POST /p/sessions/:id/payments` — 200 body. */
export interface StartPaymentResponse {
  recordId: string;
  launch: CheckoutLaunch;
  expiresAt: number;
  /**
   * A builder preview's simulated checkout. The browser never opens `launch`
   * for one. `payment_required` says the same, but the request and the event
   * race, and this is the copy that cannot arrive late.
   */
  preview?: boolean;
}

/** Error codes `POST /p/sessions/:id/payments` answers with, in `{ error: { code } }`. */
export type StartPaymentErrorCode =
  | "plan_required"
  | "payment_unavailable"
  | "stale_ref"
  | "too_many_attempts"
  | "preview_live_account"
  | "session_not_found"
  | "session_closed"
  /** The question already holds a verified payment; the server put that answer back and moved on. */
  | "already_paid"
  /** The gateway needs a number for the receipt and the session has none. Start again with `phone`. */
  | "phone_required"
  /** A `*_test_` API key session on a live account. Never reaches the hosted chat. */
  | "live_account_in_test_mode";

/** `POST /p/sessions/:id/payments` — the error body. */
export interface StartPaymentError {
  code?: StartPaymentErrorCode | string;
  message?: string;
  /** A builder preview that cannot take this payment for real: offer Simulate. */
  preview?: boolean;
}

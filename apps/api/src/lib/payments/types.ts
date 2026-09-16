/**
 * The contract every payment gateway adapter, route and session method agrees on.
 *
 * Cashfree, Razorpay and Stripe disagree about nearly everything — what an order
 * is called, whether amounts are minor units, how a webhook is signed, whether a
 * token expires — and all of that stays inside `cashfree.ts`, `razorpay.ts` and
 * `stripe.ts`. Everything above them speaks only these types, which is what lets
 * the session flow, the webhook router and the reconciliation list be written
 * once.
 *
 * Amounts cross this boundary in minor units, always, with the currency beside
 * them. A float rupee amount compared against a gateway's integer paise is how a
 * 499.00 payment fails to match a 49900 record — see `toMinorUnits` in
 * `@repo/form-schema`.
 */

export type PaymentProvider = "cashfree" | "razorpay" | "stripe";
export type CredentialKind = "oauth" | "restricted_key" | "connect";
export type PaymentEnvironment = "test" | "live";
export type RecordStatus = "created" | "paid" | "failed" | "expired" | "refunded" | "superseded";
export type PaymentAccountStatus = "active" | "needs_reconnect" | "revoked" | "disconnected";

/**
 * A `payment_accounts` row, camelCased. Timestamps are epoch ms.
 *
 * `credentialsEnc` and `webhookSecretEnc` are sealed; only `accounts.ts` opens
 * them, and nothing that leaves the worker ever carries this whole shape.
 */
export interface PaymentAccountRow {
  id: string;
  organizationId: string;
  provider: PaymentProvider;
  credentialKind: CredentialKind;
  environment: PaymentEnvironment;
  providerAccountId: string | null;
  displayLabel: string;
  credentialsEnc: string;
  accessExpiresAt: number | null;
  refreshExpiresAt: number | null;
  refreshLockUntil: number | null;
  webhookSecretEnc: string | null;
  providerWebhookId: string | null;
  status: PaymentAccountStatus;
  lastError: string | null;
  /** Parsed from `currencies_json`. */
  currencies: string[];
  /** Parsed from `capabilities_json`. */
  capabilities: Record<string, unknown>;
  platformFeeBps: number;
  connectedByUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A `respondent_payments` row, camelCased. Timestamps are epoch ms. */
export interface RespondentPaymentRow {
  id: string;
  organizationId: string;
  formId: string;
  formVersionId: string | null;
  sessionId: string;
  submissionId: string | null;
  blockRef: string;
  paymentAccountId: string;
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  status: RecordStatus;
  failureReason: string | null;
  platformFeeMinor: number | null;
  providerFeeMinor: number | null;
  settledToSession: boolean;
  isTest: boolean;
  rawLastEvent: string | null;
  createdAt: number;
  updatedAt: number;
  paidAt: number | null;
  expiresAt: number | null;
}

/** What the browser needs to open checkout. Never contains a secret. */
export type CheckoutLaunch =
  | { kind: "cashfree_sdk"; orderId: string; paymentSessionId: string; mode: "sandbox" | "production" }
  | {
      kind: "razorpay_checkout";
      orderId: string;
      /** The merchant's public key (`public_token` under OAuth) — publishable by design. */
      key: string;
      amountMinor: number;
      currency: string;
      name: string;
      description?: string;
      prefill?: { name?: string; email?: string; contact?: string };
    }
  | { kind: "redirect"; url: string; sessionId: string };

export interface CheckoutRequest {
  /** Our `rpay_…` id: the order id, `client_reference_id` or receipt, per gateway. */
  recordId: string;
  amountMinor: number;
  currency: string;
  title: string;
  description?: string;
  customer: { id: string; name?: string | null; email?: string | null; phone?: string | null };
  returnUrl: string;
  cancelUrl: string;
  /** Epoch ms. */
  expiresAt: number;
  idempotencyKey: string;
}

export interface CheckoutResult {
  providerOrderId: string;
  launch: CheckoutLaunch;
}

/** The gateway's own answer about one order, fetched with the merchant's credential. */
export interface ProviderPaymentStatus {
  status: "created" | "paid" | "failed" | "expired" | "refunded";
  providerPaymentId?: string | null;
  amountMinor: number;
  currency: string;
  /** Epoch ms. */
  paidAt?: number | null;
  failureReason?: string | null;
  /**
   * Money is on its way back, but not all of it has gone yet: a refund the
   * gateway is still processing, or one for part of the amount.
   *
   * `status` stays `paid` for these — the payment did happen, and a partial
   * refund never becomes `refunded` — so a caller deciding whether a payment
   * still *pays for something* has to read this too. Cashfree refunds sit in
   * `PENDING` or `ONHOLD` for days, which is long enough for a respondent to
   * come back and have the same payment counted again; see `heldPayment` in
   * `do/session-do.ts`.
   */
  refundPending?: boolean;
}

export interface AccountDescription {
  providerAccountId: string;
  label: string;
  currencies: string[];
  environment: PaymentEnvironment;
}

export interface PaymentProviderAdapter {
  provider: PaymentProvider;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  fetchStatus(providerOrderId: string): Promise<ProviderPaymentStatus>;
  describeAccount(): Promise<AccountDescription>;
  revoke?(): Promise<void>;
}

/**
 * One thing a verified webhook delivery says happened.
 *
 * A trigger, never a verdict: nothing is settled from these fields alone. The
 * record they point at is re-checked with `fetchStatus` first.
 */
export interface WebhookEvent {
  eventId: string;
  type: "paid" | "failed" | "refunded" | "expired" | "revoked" | "ignored";
  providerAccountId?: string | null;
  providerOrderId?: string | null;
  ourRecordId?: string | null;
  providerPaymentId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  raw: unknown;
}

export type WebhookVerifyResult =
  | { ok: true; events: WebhookEvent[] }
  | { ok: false; reason: string; status: 400 | 401 };

export type ProviderErrorCode = "unauthorized" | "invalid_grant" | "bad_request" | "rate_limited" | "upstream" | "not_found";

/**
 * A gateway call that failed, classified so callers can act without parsing
 * three vendors' error bodies: `unauthorized` forces one token refresh and a
 * retry, `invalid_grant` marks the account `needs_reconnect`.
 *
 * `message` must never carry a token, key or decrypted credential — it is
 * logged and may be stored in `last_error`.
 */
export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

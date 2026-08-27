/**
 * Dodo Payments client — checkout, customer portal, plan changes.
 *
 * Verified against the Dodo OpenAPI (public 1.113.6). The previous version of this code
 * sent `payment_link: true` and `customisation.redirect_url`, neither of which is a field
 * on `POST /checkouts`, and hardcoded the live host so checkout could not be exercised
 * without moving real money. Both are fixed here.
 *
 * Division of responsibility: Dodo is the source of truth for *money*, we are the source
 * of truth for *access*. Subscriptions, invoices, cancellation and payment methods live
 * there; entitlements live in our own tables. We never rebuild the customer portal.
 */

import type { Bindings } from "../env.js";
import { returnOrigin } from "./origins.js";

const TIMEOUT_MS = 15_000;

/**
 * Dodo sits behind Cloudflare, whose bot protection answers a request it does not like with
 * a plain-text "error code: 1010" and HTTP 403 — indistinguishable from a rejected API key
 * unless you read the body. Sending an explicit User-Agent avoids it. Found the hard way
 * while provisioning: the default script UA was blocked on every call.
 */
const USER_AGENT = "chatform/1.0 (+https://chatform.dev)";

/**
 * Test mode unless `DODO_ENVIRONMENT` says otherwise. Defaulting to test rather than live
 * means a missing variable produces a harmless sandbox charge instead of a real one.
 */
export function dodoBase(env: Bindings): string {
  return env.DODO_ENVIRONMENT === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

export class DodoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "DodoError";
  }
}

async function call<T>(env: Bindings, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.DODO_API_KEY) throw new DodoError("DODO_API_KEY is not set", 503, "");
  const res = await fetch(`${dodoBase(env)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.DODO_API_KEY}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    // Never log the body verbatim at full length: Dodo echoes request fields, which can
    // include a customer's email and address.
    console.error("dodo_call_failed", path, res.status, text.slice(0, 300));
    // A Cloudflare block is not an auth failure, and diagnosing it as one costs hours.
    if (text.includes("error code: 1010")) {
      console.error("dodo_blocked_by_cloudflare", "the User-Agent was filtered, not the key");
    }
    throw new DodoError(`Dodo ${path} returned ${res.status}`, res.status, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ───────────────────────────────── checkout ─────────────────────────────────

export interface CheckoutArgs {
  /**
   * Where to send this customer back to. Resolved per-request from the caller's own origin
   * (see `returnOrigin`) so a purchase begun in local dev returns to local dev and one
   * begun in production returns to production.
   */
  returnTo: string;
  productId: string;
  orgId: string;
  planId: string;
  cycle: "monthly" | "yearly";
  userId: string;
  customerEmail: string;
  customerName: string;
  /** Reuses the org's existing Dodo customer so payment methods and invoices stay joined. */
  existingCustomerId?: string | null;
  trialDays?: number;
  discountCode?: string;
}

export interface CheckoutSession {
  session_id: string;
  checkout_url: string | null;
}

/**
 * A hosted checkout session for one subscription product.
 *
 * `metadata.organizationId` is how the webhook attributes the resulting subscription. It
 * is not optional — the webhook rejects an event without it rather than guessing, because
 * guessing is how a Business payment silently provisions Pro.
 *
 * `billing_currency` is sent explicitly because Dodo locks a subscription's currency after
 * the first charge; letting adaptive pricing pick it means the customer's renewal currency
 * depends on where they happened to be standing when they subscribed.
 */
export async function createCheckoutSession(env: Bindings, args: CheckoutArgs): Promise<CheckoutSession> {
  return call<CheckoutSession>(env, "/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: args.productId, quantity: 1 }],
      customer: args.existingCustomerId
        ? { customer_id: args.existingCustomerId }
        : { email: args.customerEmail, name: args.customerName },
      billing_currency: "USD",
      return_url: `${args.returnTo}/billing?checkout=success`,
      cancel_url: `${args.returnTo}/billing?checkout=cancelled`,
      metadata: {
        organizationId: args.orgId,
        planId: args.planId,
        cycle: args.cycle,
        userId: args.userId,
      },
      ...(args.trialDays ? { subscription_data: { trial_period_days: args.trialDays } } : {}),
      ...(args.discountCode ? { discount_codes: [args.discountCode] } : {}),
      feature_flags: { allow_discount_code: true },
      customization: { show_order_details: true },
      show_saved_payment_methods: true,
    }),
  });
}

// ─────────────────────────────── customer portal ───────────────────────────────

export interface PortalSession {
  link: string;
}

/** Where cancellation, payment methods and invoices live. We link, we do not rebuild. */
export async function createPortalSession(
  env: Bindings,
  customerId: string,
  returnTo: string,
): Promise<PortalSession> {
  const returnUrl = encodeURIComponent(`${returnTo}/billing`);
  return call<PortalSession>(env, `/customers/${encodeURIComponent(customerId)}/customer-portal/session?return_url=${returnUrl}`, {
    method: "POST",
  });
}

// ──────────────────────────────── plan changes ────────────────────────────────

export type ProrationMode =
  | "prorated_immediately"
  | "full_immediately"
  | "difference_immediately"
  | "do_not_bill";

export interface ChangePlanArgs {
  subscriptionId: string;
  productId: string;
  /** Upgrades apply now and prorate; downgrades wait for the boundary. */
  direction: "upgrade" | "downgrade";
}

export interface ChangePlanResult {
  payment_id?: string | null;
  payment_link?: string | null;
}

/**
 * Move an existing subscription to a different product.
 *
 * An upgrade charges the difference and applies immediately — the customer clicked because
 * they want the feature now. A downgrade is scheduled for `next_billing_date`, so they
 * keep what they already paid for and entitlements drop at the boundary rather than at the
 * click. Doing it the other way round means selling someone a month and taking it back.
 */
export async function changePlan(env: Bindings, args: ChangePlanArgs): Promise<ChangePlanResult> {
  const upgrade = args.direction === "upgrade";
  return call<ChangePlanResult>(env, `/subscriptions/${encodeURIComponent(args.subscriptionId)}/change-plan`, {
    method: "POST",
    body: JSON.stringify({
      product_id: args.productId,
      quantity: 1,
      proration_billing_mode: upgrade ? "prorated_immediately" : "do_not_bill",
      effective_at: upgrade ? "immediately" : "next_billing_date",
    }),
  });
}

export interface ChangePreview {
  amount?: number | null;
  currency?: string | null;
  next_billing_date?: string | null;
  [key: string]: unknown;
}

/** Quote a plan change before committing to it, so the UI can show the real number. */
export async function previewChangePlan(env: Bindings, args: ChangePlanArgs): Promise<ChangePreview> {
  const upgrade = args.direction === "upgrade";
  return call<ChangePreview>(env, `/subscriptions/${encodeURIComponent(args.subscriptionId)}/preview-change-plan`, {
    method: "POST",
    body: JSON.stringify({
      product_id: args.productId,
      quantity: 1,
      proration_billing_mode: upgrade ? "prorated_immediately" : "do_not_bill",
      effective_at: upgrade ? "immediately" : "next_billing_date",
    }),
  });
}

export interface DodoSubscription {
  subscription_id: string;
  status: string;
  product_id?: string | null;
  customer?: { customer_id?: string; email?: string } | null;
  previous_billing_date?: string | null;
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean | null;
  quantity?: number | null;
  metadata?: Record<string, string> | null;
}

/**
 * Fetch a subscription from Dodo.
 *
 * The reconciliation path: when a webhook payload is ambiguous or arrives out of order,
 * ask Dodo what is true now rather than inferring it from event ordering we do not control.
 */
export async function getSubscription(env: Bindings, subscriptionId: string): Promise<DodoSubscription> {
  return call<DodoSubscription>(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

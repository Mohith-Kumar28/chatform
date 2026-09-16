import { sha256Hex, toMinorUnits } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import { timingSafeEqual } from "../crypto.js";
import type { WebhookEvent, WebhookVerifyResult } from "./types.js";

/**
 * Proving a gateway delivery is genuine, and reading what it claims.
 *
 * Three schemes, one rule each way:
 *
 *   Stripe     `Stripe-Signature: t=…,v1=…[,v1=…]`, hex HMAC-SHA256 over `${t}.${body}`
 *              with the endpoint's own `whsec_` secret — one per connected account.
 *   Cashfree   `x-webhook-signature`, base64 HMAC-SHA256 over `${timestamp}${body}` with the
 *              PARTNER API key, because OAuth-linked merchants' events reach us as partner
 *              webhooks rather than on the merchant's own secret.
 *   Razorpay   `X-Razorpay-Signature`, hex HMAC-SHA256 over the body with the app-level secret.
 *
 * Every verifier signs the raw text exactly as received. Parsing and re-serialising first is
 * the classic way to make every genuine delivery fail: key order and whitespace are part of
 * the signed bytes.
 *
 * None of these throws. A webhook route is reachable by anyone on the internet, so malformed
 * input is the expected case rather than an exceptional one — a truncated header, a body that
 * is not JSON, a timestamp that is not a number all come back as `{ ok: false }` with a status
 * the caller can return as-is. Comparison is `timingSafeEqual`, never `===`: the expected
 * signature is the one secret-derived value an attacker gets to probe byte by byte.
 *
 * What comes back on success is a trigger, not a verdict. `WebhookEvent` carries the ids the
 * payload names so the caller can find its record; the record is only ever settled after the
 * gateway's own status API agrees (see `lib/payments/service.ts`).
 */

/** How far a signed timestamp may be from now, either way. The replay window. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** Anything headers can be read from — `Headers`, or a test's plain lookup. */
export interface HeaderSource {
  get(name: string): string | null;
}

// ─────────────────────────────── HMAC ───────────────────────────────

const encoder = new TextEncoder();

function keyBytes(key: string | Uint8Array): Uint8Array {
  return typeof key === "string" ? encoder.encode(key) : key;
}

/**
 * HMAC-SHA256. The key is imported inside the call — Workers refuse `crypto.subtle` at global
 * scope, and a webhook secret differs per account anyway, so there is nothing to cache.
 */
export async function hmacSha256(key: string | Uint8Array, message: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    keyBytes(key) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(message)));
}

export async function hmacHex(key: string | Uint8Array, message: string): Promise<string> {
  return toHex(await hmacSha256(key, message));
}

export async function hmacBase64(key: string | Uint8Array, message: string): Promise<string> {
  return toBase64(await hmacSha256(key, message));
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  // Cashfree's `cf_payment_id` is a number in some payload versions and a string in others.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ─────────────────────────────── Stripe ───────────────────────────────

/**
 * Verify a Stripe delivery to one account's endpoint.
 *
 * https://docs.stripe.com/webhooks#verify-manually — `t` is seconds; any `v1` entry may match,
 * because Stripe sends one per active secret while an endpoint's secret is being rolled. `v0`
 * entries are test-mode signatures made with a different scheme and are ignored, as the
 * official libraries ignore them.
 */
export async function verifyStripeWebhook(
  secret: string | null | undefined,
  headers: HeaderSource,
  raw: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<WebhookVerifyResult> {
  if (!secret) return { ok: false, reason: "missing_secret", status: 401 };
  const header = headers.get("stripe-signature");
  if (!header) return { ok: false, reason: "missing_signature", status: 400 };

  let timestamp: string | null = null;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === "t") timestamp = value;
    else if (name === "v1" && value) candidates.push(value);
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp", status: 400 };
  if (candidates.length === 0) return { ok: false, reason: "no_signatures", status: 400 };
  // Bounded both ways: a timestamp from the future is as suspicious as a stale one.
  if (Math.abs(nowSec - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp", status: 401 };
  }

  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  // Every candidate is compared, so the work done does not depend on which one matched.
  let matched = false;
  for (const candidate of candidates) {
    if (timingSafeEqual(candidate, expected)) matched = true;
  }
  if (!matched) return { ok: false, reason: "signature_mismatch", status: 401 };

  const event = obj(parseJson(raw));
  if (!event) return { ok: false, reason: "malformed_body", status: 400 };
  return { ok: true, events: [parseStripeEvent(event)] };
}

/**
 * What one Stripe event is about.
 *
 * Only Checkout Session events and `charge.refunded` are subscribed (see `setupStripeRestrictedKey`).
 * A completed session whose `payment_status` is still `unpaid` is a delayed method — a bank
 * debit, say — that has not cleared; `async_payment_succeeded` follows when it does, so the
 * completion itself is ignored rather than read as paid.
 *
 * A partial refund is ignored too. The answer says "Refunded ₹499"; a ₹100 refund of a ₹499
 * payment is not that, and the admin sees partial refunds in their own dashboard.
 */
export function parseStripeEvent(event: Record<string, unknown>): WebhookEvent {
  const type = str(event.type) ?? "";
  const object = obj(obj(event.data)?.object) ?? {};
  const base = {
    eventId: str(event.id) ?? `stripe_${sha256Hex(JSON.stringify(event))}`,
    providerAccountId: str(event.account),
    raw: event,
  };

  if (type.startsWith("checkout.session.")) {
    const metadata = obj(object.metadata);
    const session = {
      ...base,
      providerOrderId: str(object.id),
      ourRecordId: str(object.client_reference_id) ?? str(metadata?.record_id),
      providerPaymentId: typeof object.payment_intent === "string" ? object.payment_intent : str(obj(object.payment_intent)?.id),
      amountMinor: num(object.amount_total),
      currency: str(object.currency)?.toUpperCase() ?? null,
    };
    if (type === "checkout.session.completed") {
      return { ...session, type: object.payment_status === "paid" ? "paid" : "ignored" };
    }
    if (type === "checkout.session.async_payment_succeeded") return { ...session, type: "paid" };
    if (type === "checkout.session.async_payment_failed") return { ...session, type: "failed" };
    if (type === "checkout.session.expired") return { ...session, type: "expired" };
    return { ...session, type: "ignored" };
  }

  if (type === "charge.refunded") {
    return {
      ...base,
      type: object.refunded === true ? "refunded" : "ignored",
      providerOrderId: null,
      // Charges inherit the PaymentIntent's metadata, which is where the checkout put it.
      ourRecordId: str(obj(object.metadata)?.record_id),
      providerPaymentId: str(object.payment_intent),
      amountMinor: num(object.amount),
      currency: str(object.currency)?.toUpperCase() ?? null,
    };
  }

  return { ...base, type: "ignored" };
}

// ─────────────────────────────── Cashfree ───────────────────────────────

/**
 * Verify a Cashfree partner webhook.
 *
 * https://www.cashfree.com/docs/partners/embedded/integration/gateway-integration —
 * `Base64(HMAC-SHA256(timestamp + payload, partnerApiKey))`, timestamp from
 * `x-webhook-timestamp` (milliseconds in Cashfree's own example, so seconds are accepted too).
 *
 * Cashfree sends `x-idempotency-key` per event
 * (https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks). Where it is
 * absent the id is derived from what the event is about rather than from the delivery, so a
 * retry of the same event hashes to the same id and the dedupe table still catches it.
 */
export async function verifyCashfreeWebhook(
  env: Pick<Bindings, "CASHFREE_PARTNER_API_KEY">,
  headers: HeaderSource,
  raw: string,
  nowMs = Date.now(),
): Promise<WebhookVerifyResult> {
  const secret = env.CASHFREE_PARTNER_API_KEY;
  if (!secret) return { ok: false, reason: "missing_secret", status: 401 };
  const signature = headers.get("x-webhook-signature")?.trim();
  const timestamp = headers.get("x-webhook-timestamp")?.trim();
  if (!signature || !timestamp) return { ok: false, reason: "missing_signature", status: 400 };
  if (!/^\d{1,16}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp", status: 400 };

  const ts = Number(timestamp);
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  if (Math.abs(nowMs - tsMs) > WEBHOOK_TOLERANCE_SECONDS * 1000) {
    return { ok: false, reason: "stale_timestamp", status: 401 };
  }

  const expected = await hmacBase64(secret, `${timestamp}${raw}`);
  if (!timingSafeEqual(signature, expected)) return { ok: false, reason: "signature_mismatch", status: 401 };

  const body = obj(parseJson(raw));
  if (!body) return { ok: false, reason: "malformed_body", status: 400 };
  return { ok: true, events: [parseCashfreeEvent(body, headers.get("x-idempotency-key"))] };
}

export function parseCashfreeEvent(body: Record<string, unknown>, deliveryId?: string | null): WebhookEvent {
  const type = str(body.type) ?? "";
  const data = obj(body.data) ?? {};
  const order = obj(data.order);
  const payment = obj(data.payment);
  const refund = obj(data.refund);

  const orderId = str(order?.order_id) ?? str(refund?.order_id);
  const paymentId = str(payment?.cf_payment_id) ?? str(refund?.cf_payment_id);
  const currency = (str(payment?.payment_currency) ?? str(order?.order_currency) ?? str(refund?.refund_currency))?.toUpperCase() ?? null;
  const major = num(payment?.payment_amount) ?? num(order?.order_amount) ?? num(refund?.refund_amount);

  const eventId =
    str(deliveryId) ??
    `cf_${sha256Hex([type, orderId ?? "", paymentId ?? "", str(refund?.cf_refund_id) ?? "", str(body.event_time) ?? ""].join("|"))}`;

  let kind: WebhookEvent["type"] = "ignored";
  if (type === "PAYMENT_SUCCESS_WEBHOOK") kind = "paid";
  else if (type === "PAYMENT_FAILED_WEBHOOK" || type === "PAYMENT_USER_DROPPED_WEBHOOK") kind = "failed";
  else if (type === "REFUND_STATUS_WEBHOOK" && refund?.refund_status === "SUCCESS") kind = "refunded";

  return {
    eventId,
    type: kind,
    providerAccountId: str(obj(body.merchant)?.merchant_id),
    // Our record id IS the Cashfree order id: `createCheckout` sends it as `order_id`.
    providerOrderId: orderId,
    ourRecordId: orderId,
    providerPaymentId: paymentId,
    amountMinor: major !== null && currency ? toMinorUnits(major, currency) : null,
    currency,
    raw: body,
  };
}

// ─────────────────────────────── Razorpay ───────────────────────────────

/**
 * Verify a Razorpay app-level webhook.
 *
 * https://razorpay.com/docs/webhooks/validate-test/ — hex HMAC-SHA256 of the raw body with the
 * webhook secret, in `X-Razorpay-Signature`; `x-razorpay-event-id` is unique per event. Razorpay
 * signs no timestamp, so there is no replay window to enforce here: the dedupe on event id, and
 * re-checking the order with `fetchStatus` before anything settles, are what make a replay
 * harmless.
 */
export async function verifyRazorpayWebhook(
  env: Pick<Bindings, "RAZORPAY_WEBHOOK_SECRET">,
  headers: HeaderSource,
  raw: string,
): Promise<WebhookVerifyResult> {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: "missing_secret", status: 401 };
  const signature = headers.get("x-razorpay-signature")?.trim();
  if (!signature) return { ok: false, reason: "missing_signature", status: 400 };

  const expected = await hmacHex(secret, raw);
  if (!timingSafeEqual(signature.toLowerCase(), expected)) {
    return { ok: false, reason: "signature_mismatch", status: 401 };
  }

  const body = obj(parseJson(raw));
  if (!body) return { ok: false, reason: "malformed_body", status: 400 };
  return { ok: true, events: [parseRazorpayEvent(body, headers.get("x-razorpay-event-id"), raw)] };
}

/**
 * What one Razorpay event is about.
 *
 * `payment.authorized` is passed on as a `paid` trigger even though nothing has been captured:
 * on an account with auto-capture off it is the only event that arrives, and `fetchStatus` is
 * what captures it. The trigger only ever causes a status check.
 */
export function parseRazorpayEvent(body: Record<string, unknown>, deliveryId?: string | null, raw?: string): WebhookEvent {
  const type = str(body.event) ?? "";
  const payload = obj(body.payload) ?? {};
  const payment = obj(obj(payload.payment)?.entity);
  const order = obj(obj(payload.order)?.entity);
  const refund = obj(obj(payload.refund)?.entity);

  const eventId = str(deliveryId) ?? `rzp_${sha256Hex(raw ?? JSON.stringify(body))}`;
  const providerAccountId = str(body.account_id);

  if (type === "account.app.authorization_revoked") {
    return { eventId, type: "revoked", providerAccountId, raw: body };
  }

  let kind: WebhookEvent["type"] = "ignored";
  if (type === "payment.captured" || type === "order.paid" || type === "payment.authorized") kind = "paid";
  else if (type === "payment.failed") kind = "failed";
  else if (type === "refund.processed" || type === "payment.refunded") kind = "refunded";

  const orderId = str(payment?.order_id) ?? str(order?.id);
  return {
    eventId,
    type: kind,
    providerAccountId,
    providerOrderId: orderId,
    // The receipt is our record id; the notes carry it too, for events that have no order.
    ourRecordId: str(order?.receipt) ?? str(obj(payment?.notes)?.record_id),
    providerPaymentId: str(payment?.id) ?? str(refund?.payment_id),
    amountMinor: num(payment?.amount) ?? num(order?.amount),
    currency: (str(payment?.currency) ?? str(order?.currency))?.toUpperCase() ?? null,
    raw: body,
  };
}

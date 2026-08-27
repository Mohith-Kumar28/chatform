/**
 * Standard Webhooks verification for Dodo deliveries.
 *
 * The previous implementation could not accept a single genuine delivery. It signed
 * `${timestamp}.${body}` where the spec signs `${id}.${timestamp}.${body}`; it split the
 * `webhook-signature` header on commas and looked for entries beginning `v1,`, which a
 * comma split can never produce because the spec separates multiple signatures with
 * *spaces*; it compared with `===`, leaking the expected signature through timing; and it
 * read the timestamp without ever bounding it, so a captured valid delivery replayed
 * forever.
 *
 * Spec: https://www.standardwebhooks.com — headers `webhook-id`, `webhook-timestamp`,
 * `webhook-signature`, HMAC-SHA256 over `id.timestamp.payload`, base64, prefixed `v1,`.
 */

import { timingSafeEqual } from "./crypto.js";

/** How far a delivery's timestamp may be from now. The replay window. */
export const TOLERANCE_SECONDS = 5 * 60;

export type VerifyFailure =
  | "missing_secret"
  | "missing_headers"
  | "bad_timestamp"
  | "stale_timestamp"
  | "no_signatures"
  | "signature_mismatch";

export type VerifyResult = { ok: true; id: string } | { ok: false; reason: VerifyFailure };

export interface WebhookHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

/** Compute the base64 HMAC the spec expects for one signing secret. */
export async function sign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${timestamp}.${body}`));
  return base64(new Uint8Array(mac));
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Verify a delivery.
 *
 * Returns the reason on failure so the caller can pick the right status code: a bad
 * signature is a 401 that Dodo should not retry, while a missing secret is a 503 that
 * says the endpoint is misconfigured rather than the sender wrong.
 */
export async function verifyWebhook(
  secret: string | undefined,
  headers: WebhookHeaders,
  rawBody: string,
  nowMs = Date.now(),
): Promise<VerifyResult> {
  if (!secret) return { ok: false, reason: "missing_secret" };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
  // Bounded in both directions: a future timestamp is as suspicious as an old one.
  if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "stale_timestamp" };

  // The header carries space-separated `v1,<base64>` entries — more than one while a
  // secret is being rotated, so any match is a pass.
  const presented = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));
  if (presented.length === 0) return { ok: false, reason: "no_signatures" };

  const expected = await sign(secret, id, timestamp, rawBody);
  // Compare every candidate rather than short-circuiting, so the work done does not depend
  // on which position matched.
  let matched = false;
  for (const candidate of presented) {
    if (timingSafeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true, id } : { ok: false, reason: "signature_mismatch" };
}

/** HTTP status for a failure. 4xx tells Dodo not to retry; 503 says "come back later". */
export function statusForFailure(reason: VerifyFailure): 400 | 401 | 503 {
  switch (reason) {
    case "missing_secret":
      return 503;
    case "missing_headers":
    case "bad_timestamp":
    case "no_signatures":
      return 400;
    case "stale_timestamp":
    case "signature_mismatch":
      return 401;
  }
}

// ──────────────────────────────── payload shapes ────────────────────────────────

/**
 * The delivery envelope. `data.payload_type` discriminates Payment / Subscription /
 * Refund / Dispute / …; we only act on the first three.
 */
export interface DodoWebhookEvent {
  business_id?: string;
  type: string;
  timestamp?: string;
  data: {
    payload_type?: string;
    subscription_id?: string;
    payment_id?: string;
    status?: string;
    product_id?: string;
    currency?: string;
    total_amount?: number;
    settlement_amount?: number;
    quantity?: number;
    previous_billing_date?: string;
    next_billing_date?: string;
    cancel_at_next_billing_date?: boolean;
    trial_period_days?: number;
    customer?: { customer_id?: string; email?: string; name?: string } | null;
    metadata?: Record<string, string> | null;
    payment_link?: string | null;
    [key: string]: unknown;
  };
}

export interface EventTarget {
  orgId: string;
  planId: string | null;
  cycle: "monthly" | "yearly" | null;
}

/**
 * Who an event is about.
 *
 * Metadata is the only trustworthy source: it is what we set at checkout. A missing
 * `organizationId` returns null and the caller records the event and stops, rather than
 * defaulting `planId` to `"pro"` the way the old handler did — which would let a Business
 * payment silently provision Pro.
 */
export function eventTarget(evt: DodoWebhookEvent): EventTarget | null {
  const meta = evt.data?.metadata ?? {};
  const orgId = meta.organizationId;
  if (!orgId) return null;
  const cycle = meta.cycle === "yearly" ? "yearly" : meta.cycle === "monthly" ? "monthly" : null;
  return { orgId, planId: meta.planId ?? null, cycle };
}

/** Dodo sends ISO strings; our columns are epoch-ms. Undefined stays undefined. */
export function toEpochMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

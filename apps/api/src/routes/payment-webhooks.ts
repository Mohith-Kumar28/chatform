import { Hono, type Context } from "hono";
import { describeRoute } from "hono-openapi";
import type { Bindings } from "../env.js";
import { verifyCashfreeWebhook, verifyRazorpayWebhook, verifyStripeWebhook } from "../lib/payments/webhook-sig.js";
import { applyWebhookEvents, errorInfo } from "../lib/payments/service.js";
import type { PaymentProvider, WebhookVerifyResult } from "../lib/payments/types.js";

/**
 * Gateway webhooks for verified respondent payments:
 *
 *   POST /p/payments/webhooks/cashfree            (partner-level, one secret)
 *   POST /p/payments/webhooks/razorpay            (app-level, one secret)
 *   POST /p/payments/webhooks/stripe              (platform-level Connect endpoint, one secret)
 *
 * Mounted on `/p` ahead of the `/p` IP limiter, deliberately. Every merchant's
 * deliveries arrive from the gateway's own small pool of addresses, so a
 * per-address window of 120 a minute would be a platform-wide ceiling on
 * payments a minute — and a 429 answered to a gateway is a settlement delayed
 * until its retry. The signature is the gate here: verified before any D1
 * read, so an unsigned request costs nothing, and the body is read as raw text
 * (`c.req.text()`), because every scheme signs the exact bytes.
 *
 * No respondent token and no session: nothing on `/p` demands either
 * router-wide, and these must not start to.
 *
 * The order of work is `billing.ts handleWebhook`'s, and for its reasons: raw
 * body, verify, then dedupe and act — which `applyWebhookEvents` does, event by
 * event. The status codes are chosen for the gateway reading them:
 *
 *   401/400  the delivery is not genuine or not readable; a retry cannot fix it
 *   5xx      something on our side failed; the gateway retries on its schedule,
 *            and the dedupe row lets that retry through rather than eating it
 *   200      everything else, including events we deliberately ignore — a
 *            4xx for "not interested" would only teach the gateway to retry
 */

export const paymentWebhooksRouter = new Hono<{ Bindings: Bindings }>();

type WebhookCtx = Context<{ Bindings: Bindings }>;

/**
 * What every route does once it has a verdict. Shared so the three gateways
 * cannot drift into answering the same situation with different statuses.
 */
async function respond(
  c: WebhookCtx,
  provider: PaymentProvider,
  verdict: WebhookVerifyResult,
): Promise<Response> {
  if (!verdict.ok) {
    // The reason is ours (`signature_mismatch`, `stale_timestamp`), never
    // anything from the body, so it is safe to log and to send back.
    console.warn("payment_webhook_rejected", { provider, reason: verdict.reason });
    return c.json({ error: { code: verdict.reason } }, verdict.status);
  }
  try {
    const summary = await applyWebhookEvents(c.env, provider, verdict.events);
    if (summary.failed > 0) {
      return c.json({ error: { code: "handler_failed", message: "Event recorded but not processed" } }, 500);
    }
    return c.json({ received: true, ...summary });
  } catch (err) {
    // Reached only if the dedupe table itself could not be written — D1 is
    // down — which is the textbook case for the gateway to try again later.
    console.error("payment_webhook_failed", { provider, ...errorInfo(err) });
    return c.json({ error: { code: "handler_failed", message: "Try again later" } }, 503);
  }
}

const webhookDoc = (provider: string) =>
  describeRoute({
    tags: ["public"],
    summary: `${provider} payment webhook`,
    responses: {
      200: { description: "Received (processed, duplicate, or deliberately ignored)" },
      400: { description: "Unreadable delivery" },
      401: { description: "Signature did not verify" },
      500: { description: "Recorded but not processed; the gateway should retry" },
    },
  });

paymentWebhooksRouter.post("/payments/webhooks/cashfree", webhookDoc("Cashfree"), async (c) => {
  const raw = await c.req.text();
  return respond(c, "cashfree", await verifyCashfreeWebhook(c.env, c.req.raw.headers, raw));
});

paymentWebhooksRouter.post("/payments/webhooks/razorpay", webhookDoc("Razorpay"), async (c) => {
  const raw = await c.req.text();
  return respond(c, "razorpay", await verifyRazorpayWebhook(c.env, c.req.raw.headers, raw));
});

/**
 * One endpoint on chatform's own Stripe account, set to listen to connected
 * accounts, hears every merchant's events. Each names its merchant in
 * `account`, which `applyWebhookEvents` holds against the record's own.
 */
paymentWebhooksRouter.post("/payments/webhooks/stripe", webhookDoc("Stripe"), async (c) => {
  const raw = await c.req.text();
  return respond(c, "stripe", await verifyStripeWebhook(c.env.STRIPE_CONNECT_WEBHOOK_SECRET, c.req.raw.headers, raw));
});

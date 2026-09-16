import { Hono, type Context } from "hono";
import { describeRoute } from "hono-openapi";
import type { Bindings } from "../env.js";
import { loadAccountById, openWebhookSecret } from "../lib/payments/accounts.js";
import { verifyCashfreeWebhook, verifyRazorpayWebhook, verifyStripeWebhook } from "../lib/payments/webhook-sig.js";
import { applyWebhookEvents, errorInfo, type WebhookContext } from "../lib/payments/service.js";
import type { PaymentProvider, WebhookVerifyResult } from "../lib/payments/types.js";

/**
 * Gateway webhooks for verified respondent payments:
 *
 *   POST /p/payments/webhooks/cashfree            (partner-level, one secret)
 *   POST /p/payments/webhooks/razorpay            (app-level, one secret)
 *   POST /p/payments/webhooks/stripe/:accountId   (per account, sealed secret on the row)
 *
 * Mounted on `/p` ahead of the `/p` IP limiter, deliberately. Every merchant's
 * deliveries arrive from the gateway's own small pool of addresses, so a
 * per-address window of 120 a minute would be a platform-wide ceiling on
 * payments a minute — and a 429 answered to a gateway is a settlement delayed
 * until its retry. The signature is the gate here: verify it before any D1
 * read that an unsigned request could trigger, and read the body as raw text
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
  ctx: WebhookContext = {},
): Promise<Response> {
  if (!verdict.ok) {
    // The reason is ours (`signature_mismatch`, `stale_timestamp`), never
    // anything from the body, so it is safe to log and to send back.
    console.warn("payment_webhook_rejected", { provider, reason: verdict.reason });
    return c.json({ error: { code: verdict.reason } }, verdict.status);
  }
  try {
    const summary = await applyWebhookEvents(c.env, provider, verdict.events, ctx);
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
 * Stripe signs with a secret per endpoint, and each connected account has its
 * own endpoint, so the account row has to be read before the signature can be
 * checked — the one place an unsigned request reaches D1 at all.
 *
 * Kept as cheap as that can be: the id's shape is checked first, so garbage
 * never costs a query; the read is one primary-key lookup; and the secret is
 * opened only for a row that is a Stripe account with one. A disconnected
 * account has had its secret wiped and answers 410, which is Stripe's cue that
 * the endpoint is gone rather than failing.
 */
paymentWebhooksRouter.post("/payments/webhooks/stripe/:accountId", webhookDoc("Stripe"), async (c) => {
  const accountId = c.req.param("accountId");
  const raw = await c.req.text();
  if (!/^pac_[A-Za-z0-9_-]{4,40}$/.test(accountId)) {
    return c.json({ error: { code: "unknown_account" } }, 404);
  }
  const account = await loadAccountById(c.env, accountId);
  if (!account || account.provider !== "stripe") return c.json({ error: { code: "unknown_account" } }, 404);
  if (account.status === "disconnected" || !account.webhookSecretEnc) {
    return c.json({ error: { code: "endpoint_gone" } }, 410);
  }

  let secret: string | null;
  try {
    secret = await openWebhookSecret(c.env, account);
  } catch (err) {
    // A key rotation gone wrong, not a bad delivery. 5xx so nothing is lost
    // while it is fixed. The error names the failure, never the secret.
    console.error("payment_webhook_secret_unreadable", { accountId, ...errorInfo(err) });
    return c.json({ error: { code: "handler_failed" } }, 500);
  }

  const verdict = await verifyStripeWebhook(secret, c.req.raw.headers, raw, Math.floor(Date.now() / 1000));
  return respond(c, "stripe", verdict, { accountId: account.id });
});

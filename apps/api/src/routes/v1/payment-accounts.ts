import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import {
  AccountListSchema,
  CashfreeOnboardBody,
  OAuthStartBody,
  PublicAccountSchema,
  StripeKeyBody,
  connectGate,
  handleCashfreeOnboard,
  handleDisconnect,
  handleList,
  handleOAuthStart,
  handleStripeConnect,
} from "../payment-accounts.js";

/**
 * `/v1/payment-accounts` — the developer-API twin of `routes/payment-accounts.ts`, answered by
 * the same handlers with the same shapes.
 *
 * Mounted in `routes/v1.ts`, so it inherits the whole `/v1` chain — telemetry, burst limit, key
 * verification, the `api_access` gate and the meter. Each route declares its scope: `payment:read`
 * to list, `payment:write` for everything that creates or removes a credential. Neither is in any
 * key preset, and a publishable key can never hold either.
 *
 * The OAuth callback has no twin: it is a browser redirect, and lives only on the dashboard's
 * public router. A key can start the flow, but the consent URL it gets back can only be completed
 * in a browser signed in as the person who minted the key — the state is bound to that user.
 */

export const paymentAccountsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

const json = (schema: z.ZodType) => ({ "application/json": { schema: resolver(schema) } });
const errorContent = json(ErrorEnvelope);

paymentAccountsV1Router.get(
  "/payment-accounts",
  requireScope("payment", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "List connected payment gateway accounts",
    description:
      "The Cashfree, Razorpay and Stripe accounts this organization has connected for verified payments. Credentials are never returned. `formsUsing` counts forms whose working document names the account.",
    responses: {
      200: { description: "Accounts", content: json(AccountListSchema) },
      403: { description: "Missing payment:read", content: errorContent },
    },
  }),
  (c) => handleList(c),
);

paymentAccountsV1Router.post(
  "/payment-accounts/oauth/:provider/start",
  requireScope("payment", "write"),
  validator("json", OAuthStartBody),
  describeRoute({
    tags: ["v1"],
    summary: "Start connecting a Cashfree or Razorpay account",
    description:
      "Returns the gateway's consent URL. It must be opened in a browser signed in to chatform as the user who created this key; the state is single-use and expires in ten minutes. `returnTo` must be a page on the chatform app.",
    responses: {
      200: { description: "Consent URL", content: json(z.object({ url: z.string() })) },
      402: { description: "Plan does not include collecting payments", content: errorContent },
      403: { description: "Missing payment:write, or verified payments are not enabled", content: errorContent },
      422: { description: "returnTo is not a page on the app", content: errorContent },
    },
  }),
  async (c) => {
    const refused = await connectGate(c, "v1.payments.connect");
    if (refused) return refused;
    return handleOAuthStart(c, c.req.param("provider"), c.req.valid("json").returnTo);
  },
);

paymentAccountsV1Router.post(
  "/payment-accounts/stripe",
  requireScope("payment", "write"),
  validator("json", StripeKeyBody),
  describeRoute({
    tags: ["v1"],
    summary: "Connect a Stripe account with a restricted key",
    description:
      "Accepts only a restricted key (`rk_test_…` or `rk_live_…`); a full `sk_` secret key is refused with `full_secret_key`. The key is checked by reading the account, creating and immediately expiring a Checkout Session, and creating a webhook endpoint — a missing permission comes back as `missing_permission` with the permission named.",
    responses: {
      200: { description: "Connected", content: json(z.object({ account: PublicAccountSchema })) },
      402: { description: "Plan does not include collecting payments", content: errorContent },
      409: { description: "The Stripe account is connected to another organization", content: errorContent },
      422: { description: "full_secret_key, invalid_key or missing_permission", content: errorContent },
    },
  }),
  async (c) => {
    const refused = await connectGate(c, "v1.payments.connect");
    if (refused) return refused;
    return handleStripeConnect(c, c.req.valid("json").restrictedKey);
  },
);

paymentAccountsV1Router.post(
  "/payment-accounts/cashfree/onboard",
  requireScope("payment", "write"),
  validator("json", CashfreeOnboardBody),
  describeRoute({
    tags: ["v1"],
    summary: "Create a Cashfree account for a business that has none",
    description: "Returns the Cashfree KYC link, or `{ useOAuth: true }` when the email already has a Cashfree account.",
    responses: {
      200: {
        description: "Onboarding link, or a pointer to OAuth",
        content: json(z.union([z.object({ onboardingUrl: z.string() }), z.object({ useOAuth: z.literal(true) })])),
      },
      402: { description: "Plan does not include collecting payments", content: errorContent },
    },
  }),
  async (c) => {
    const refused = await connectGate(c, "v1.payments.onboard");
    if (refused) return refused;
    return handleCashfreeOnboard(c, c.req.valid("json"));
  },
);

paymentAccountsV1Router.delete(
  "/payment-accounts/:id",
  requireScope("payment", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Disconnect a payment account",
    description:
      "Revokes the grant (Cashfree, Razorpay) or deletes the webhook endpoint (Stripe) at the gateway, then wipes the stored credentials. Forms still pointing at the account stop accepting payments until another account is chosen.",
    responses: {
      200: { description: "Disconnected", content: json(z.object({ ok: z.literal(true) })) },
      404: { description: "Not found", content: errorContent },
    },
  }),
  (c) => handleDisconnect(c, c.req.param("id")),
);

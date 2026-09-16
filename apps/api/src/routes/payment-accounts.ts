import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { getAuth, requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { assertFeature, assertPermission, type AuthzVars } from "../lib/authorize.js";
import { getEntitlements } from "../lib/entitlements.js";
import { webOrigins } from "../lib/origins.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { gatewayEnabled } from "../lib/payments/flag.js";
import {
  AccountConflictError,
  disconnectAccount,
  findConnectedByProviderAccount,
  listAccounts,
  loadAccountForOrg,
  newPaymentAccountId,
  saveOAuthAccount,
  saveStripeKeyAccount,
  toPublicAccount,
} from "../lib/payments/accounts.js";
import {
  cashfreeAuthorizeUrl,
  cashfreeCreateMerchant,
  cashfreeExchangeCode,
  createCashfreeAdapter,
} from "../lib/payments/cashfree.js";
import { createRazorpayAdapter, razorpayAuthorizeUrl, razorpayExchangeCode } from "../lib/payments/razorpay.js";
import { deleteStripeWebhook, setupStripeRestrictedKey, StripeSetupError } from "../lib/payments/stripe.js";
import { signOAuthState, validateReturnTo, verifyOAuthState, type OAuthProvider, type OAuthTokens } from "../lib/payments/oauth-state.js";
import { providerConfigured } from "../lib/payments/registry.js";
import { ProviderError, type AccountDescription, type PaymentAccountRow } from "../lib/payments/types.js";

/**
 * Connecting a form admin's own payment gateway account — Cashfree and Razorpay over partner
 * OAuth, Stripe with a pasted restricted key.
 *
 * Two routers, for the reason `billingPublicRouter` gives:
 *
 *   - `paymentAccountsPublicRouter` holds only the OAuth callback. The gateway redirects the
 *     admin's browser there, and it is mounted before every `/api` router that declares
 *     `.use("*", requireSession)`, or those would answer it with 401 before it could explain
 *     anything. It is not unauthenticated: it demands both a valid single-use state and a
 *     session belonging to the person who started the connect.
 *   - `paymentAccountsRouter` is everything else, with its guards scoped to its own paths.
 *
 * Who may do what:
 *
 *   - Seeing the connected accounts takes `webhook:read`; connecting and disconnecting take
 *     `webhook:create` and `webhook:delete`. A gateway account is an integration in the same
 *     sense a webhook is — set up from the same Integrate tab, by the same people — and editors
 *     already hold those while viewers only read. There is no separate RBAC resource for it.
 *   - Connecting needs `collect_payments` on the plan and the gateway flag for the organization.
 *     Listing and disconnecting need neither: someone on a lapsed plan must still be able to see
 *     and remove a live credential, the same rule API keys follow.
 *   - Nothing that creates or removes a credential is allowed while a platform admin is acting
 *     as the customer. Impersonation is for reproducing a problem; linking a merchant account to
 *     someone's organization, or cutting one off, is the customer's decision to make.
 *
 * The handlers are exported so `routes/v1/payment-accounts.ts` answers with the same logic and the
 * same shapes rather than a copy that drifts.
 */

type Ctx = Context<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>;

export const paymentAccountsRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

export const paymentAccountsPublicRouter = new Hono<{ Bindings: Bindings }>();

paymentAccountsRouter.use("/payment-accounts", requireSession, requireOrg);
paymentAccountsRouter.use("/payment-accounts/*", requireSession, requireOrg);

// ─────────────────────────────── shapes ───────────────────────────────

export const PublicAccountSchema = z.object({
  id: z.string(),
  provider: z.enum(["cashfree", "razorpay", "stripe"]),
  credentialKind: z.enum(["oauth", "restricted_key", "connect"]),
  environment: z.enum(["test", "live"]),
  label: z.string(),
  status: z.enum(["active", "needs_reconnect", "revoked", "disconnected"]),
  lastError: z.string().nullable(),
  currencies: z.array(z.string()),
  createdAt: z.number(),
  formsUsing: z.number().optional(),
});

export const AccountListSchema = z.object({
  accounts: z.array(PublicAccountSchema),
  /** Whether gateway payments are switched on for this organization at all. */
  enabled: z.boolean(),
  providers: z.object({
    cashfree: z.object({ configured: z.boolean() }),
    razorpay: z.object({ configured: z.boolean() }),
    stripe: z.object({ configured: z.boolean() }),
  }),
});

export const OAuthStartBody = z.object({ returnTo: z.string().min(1).max(1000) });
export const StripeKeyBody = z.object({ restrictedKey: z.string().min(1).max(500) });
export const CashfreeOnboardBody = z.object({
  email: z.string().email().max(200),
  phone: z.string().min(8).max(20),
  businessName: z.string().min(2).max(100),
  businessType: z.string().min(2).max(60),
  /** Optional: where the business lives online. Absent, the app's own origin stands in. */
  website: z.string().url().max(250).optional(),
  signatoryName: z.string().min(2).max(100).optional(),
  /** Where Cashfree sends the admin back after KYC. Must be one of the app's origins. */
  returnTo: z.string().max(1000).optional(),
});

const json = (schema: z.ZodType) => ({ "application/json": { schema: resolver(schema) } });
const errorContent = json(ErrorEnvelope);

function problem(c: Ctx, status: 400 | 403 | 404 | 409 | 422 | 502 | 503, code: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ error: { code, message, ...extra } }, status);
}

function isOAuthProvider(value: string | undefined): value is OAuthProvider {
  return value === "cashfree" || value === "razorpay";
}

/** The redirect URI registered with each gateway: on the API's own origin, never the web app's. */
export function oauthRedirectUri(env: Bindings, provider: OAuthProvider): string {
  return `${env.APP_ORIGIN.replace(/\/$/, "")}/api/payment-accounts/oauth/${provider}/callback`;
}

export function stripeWebhookUrl(env: Bindings, accountId: string): string {
  return `${env.APP_ORIGIN.replace(/\/$/, "")}/p/payments/webhooks/stripe/${accountId}`;
}

/** `{ errName, errMessage }` — Workers Logs serialise an `Error` as `{}`. */
function errorInfo(err: unknown): { errName: string; errMessage: string } {
  if (err instanceof Error) return { errName: err.name, errMessage: err.message.slice(0, 300) };
  return { errName: typeof err, errMessage: String(err).slice(0, 300) };
}

// ─────────────────────────────── gates ───────────────────────────────

/** Refuse anything that creates or removes a credential while acting as someone else. */
export function refuseImpersonation(c: Ctx): Response | null {
  if (!c.get("impersonatorId")) return null;
  return problem(
    c,
    403,
    "impersonation_forbidden",
    "Payment accounts can only be connected or disconnected by the customer themselves, not while signed in as them.",
  );
}

/** Flag, then plan. The flag first, so an organization outside the rollout is not shown an upsell. */
export async function connectGate(c: Ctx, surface: string): Promise<Response | null> {
  const orgId = c.get("orgId");
  if (!gatewayEnabled(c.env, orgId)) {
    return problem(c, 403, "gateway_payments_disabled", "Verified payments are not available for this organization yet.");
  }
  return assertFeature(c, "collect_payments", { surface });
}

// ─────────────────────────────── handlers ───────────────────────────────

export async function handleList(c: Ctx): Promise<Response> {
  const orgId = c.get("orgId")!;
  return c.json({
    accounts: await listAccounts(c.env, orgId),
    enabled: gatewayEnabled(c.env, orgId),
    providers: {
      cashfree: { configured: providerConfigured(c.env, "cashfree") },
      razorpay: { configured: providerConfigured(c.env, "razorpay") },
      stripe: { configured: providerConfigured(c.env, "stripe") },
    },
  });
}

export async function handleOAuthStart(c: Ctx, provider: string | undefined, returnToRaw: string): Promise<Response> {
  const orgId = c.get("orgId")!;
  const userId = c.get("userId");
  if (!isOAuthProvider(provider)) return problem(c, 404, "not_found", "Unknown payment provider");
  if (!userId) {
    return problem(c, 400, "no_user", "Connecting over OAuth has to be finished in a browser by a signed-in person.");
  }
  if (!providerConfigured(c.env, provider)) {
    return problem(c, 503, "provider_not_configured", `${provider === "cashfree" ? "Cashfree" : "Razorpay"} is not set up on this deployment yet.`);
  }
  const returnTo = validateReturnTo(c.env, returnToRaw);
  if (!returnTo) return problem(c, 422, "invalid_return_to", "returnTo must be a page on this app.");

  const { state } = await signOAuthState(c.env, { orgId, userId, provider, returnTo });
  try {
    const url =
      provider === "cashfree"
        ? await cashfreeAuthorizeUrl(c.env, state)
        : razorpayAuthorizeUrl(c.env, state, oauthRedirectUri(c.env, provider));
    return c.json({ url });
  } catch (err) {
    console.error("payment_oauth_start_failed", { orgId, provider, ...errorInfo(err) });
    return problem(c, 502, "provider_unavailable", "The payment provider did not answer. Try again in a minute.");
  }
}

export async function handleStripeConnect(c: Ctx, restrictedKey: string): Promise<Response> {
  const orgId = c.get("orgId")!;
  const userId = c.get("userId") ?? null;

  let reuse: PaymentAccountRow | null = null;
  let accountId = "";
  try {
    const setup = await setupStripeRestrictedKey(restrictedKey, async (description: AccountDescription) => {
      reuse = await findConnectedByProviderAccount(c.env, "stripe", description.environment, description.providerAccountId);
      if (reuse && reuse.organizationId !== orgId) throw new AccountConflictError();
      accountId = reuse?.id ?? newPaymentAccountId();
      return stripeWebhookUrl(c.env, accountId);
    });

    /**
     * A reconnect replaces the old endpoint rather than leaving two subscribed to the same
     * account — two endpoints means every payment is delivered, and processed, twice.
     */
    const previous = reuse as PaymentAccountRow | null;
    if (previous?.providerWebhookId && previous.providerWebhookId !== setup.webhookId) {
      await deleteStripeWebhook(setup.auth, previous.providerWebhookId).catch((err: unknown) =>
        console.warn("stripe_old_webhook_delete_failed", { accountId, ...errorInfo(err) }),
      );
    }

    const saved = await saveStripeKeyAccount(c.env, {
      id: accountId,
      orgId,
      userId,
      key: restrictedKey.trim(),
      description: setup.description,
      webhookId: setup.webhookId,
      webhookSecret: setup.webhookSecret,
    });
    return c.json({ account: toPublicAccount(saved) });
  } catch (err) {
    if (err instanceof StripeSetupError) {
      if (err.code === "upstream") return problem(c, 502, "provider_unavailable", err.message);
      return problem(c, 422, err.code, err.message, err.permission ? { permission: err.permission } : {});
    }
    if (err instanceof AccountConflictError) {
      return problem(c, 409, "account_connected_elsewhere", "This Stripe account is already connected to another chatform organization.");
    }
    console.error("stripe_connect_failed", { orgId, ...errorInfo(err) });
    throw err;
  }
}

export async function handleCashfreeOnboard(c: Ctx, body: z.infer<typeof CashfreeOnboardBody>): Promise<Response> {
  const orgId = c.get("orgId")!;
  if (!providerConfigured(c.env, "cashfree")) {
    return problem(c, 503, "provider_not_configured", "Cashfree is not set up on this deployment yet.");
  }
  const origin = webOrigins(c.env)[0]!;
  const returnUrl = body.returnTo ? validateReturnTo(c.env, body.returnTo) : origin;
  if (!returnUrl) return problem(c, 422, "invalid_return_to", "returnTo must be a page on this app.");

  try {
    const result = await cashfreeCreateMerchant(c.env, {
      // Our reference for the merchant: 40 characters, alphanumeric and underscores.
      merchantId: `cf_${orgId.replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      email: body.email,
      phone: body.phone,
      businessName: body.businessName,
      businessType: body.businessType,
      website: body.website ?? origin,
      signatoryName: body.signatoryName ?? body.businessName,
      returnUrl,
    });
    if ("useOAuth" in result) return c.json({ useOAuth: true as const });
    return c.json({ onboardingUrl: result.onboardingUrl });
  } catch (err) {
    if (err instanceof ProviderError && err.code === "bad_request") {
      return problem(c, 422, "invalid_merchant_details", err.message || "Cashfree refused those details.");
    }
    console.error("cashfree_onboard_failed", { orgId, ...errorInfo(err) });
    return problem(c, 502, "provider_unavailable", "Cashfree did not answer. Try again in a minute.");
  }
}

export async function handleDisconnect(c: Ctx, accountId: string | undefined): Promise<Response> {
  const orgId = c.get("orgId")!;
  const account = accountId ? await loadAccountForOrg(c.env, orgId, accountId) : null;
  if (!account) return problem(c, 404, "not_found", "Payment account not found");
  if (account.status !== "disconnected") await disconnectAccount(c.env, account);
  return c.json({ ok: true as const });
}

// ─────────────────────────────── dashboard routes ───────────────────────────────

paymentAccountsRouter.get(
  "/payment-accounts",
  describeRoute({
    tags: ["dashboard"],
    summary: "List connected payment gateway accounts",
    description: "Never returns a credential. `enabled` says whether verified payments are on for this organization.",
    responses: { 200: { description: "Accounts", content: json(AccountListSchema) } },
  }),
  async (c) => {
    const denied = await assertPermission(c, "webhook", "read");
    if (denied) return denied;
    return handleList(c);
  },
);

paymentAccountsRouter.post(
  "/payment-accounts/oauth/:provider/start",
  validator("json", OAuthStartBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Start connecting a Cashfree or Razorpay account",
    description:
      "Returns the gateway's consent URL. The state inside it is signed, single-use, expires in ten minutes, and can only be completed by the same signed-in user.",
    responses: {
      200: { description: "Consent URL", content: json(z.object({ url: z.string() })) },
      402: { description: "Plan does not include collecting payments", content: errorContent },
      403: { description: "Not permitted, flagged off, or impersonating", content: errorContent },
      422: { description: "returnTo is not a page on this app", content: errorContent },
    },
  }),
  async (c) => {
    const refused = refuseImpersonation(c) ?? (await assertPermission(c, "webhook", "create")) ?? (await connectGate(c, "payments.connect"));
    if (refused) return refused;
    return handleOAuthStart(c, c.req.param("provider"), c.req.valid("json").returnTo);
  },
);

paymentAccountsRouter.post(
  "/payment-accounts/stripe",
  validator("json", StripeKeyBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Connect a Stripe account with a restricted key",
    description:
      "Accepts only `rk_test_…` / `rk_live_…`. The key is exercised (account read, a Checkout Session created and expired, a webhook endpoint created) before it is stored, sealed.",
    responses: {
      200: { description: "Connected", content: json(z.object({ account: PublicAccountSchema })) },
      402: { description: "Plan does not include collecting payments", content: errorContent },
      409: { description: "Account already connected to another organization", content: errorContent },
      422: { description: "full_secret_key, invalid_key or missing_permission", content: errorContent },
    },
  }),
  async (c) => {
    const refused = refuseImpersonation(c) ?? (await assertPermission(c, "webhook", "create")) ?? (await connectGate(c, "payments.connect"));
    if (refused) return refused;
    return handleStripeConnect(c, c.req.valid("json").restrictedKey);
  },
);

paymentAccountsRouter.post(
  "/payment-accounts/cashfree/onboard",
  validator("json", CashfreeOnboardBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create a Cashfree account for an admin who has none",
    description: "Returns the KYC link, or `{ useOAuth: true }` when the email already has a Cashfree account.",
    responses: {
      200: {
        description: "Onboarding link, or a pointer to Connect",
        content: json(z.union([z.object({ onboardingUrl: z.string() }), z.object({ useOAuth: z.literal(true) })])),
      },
      402: { description: "Plan does not include collecting payments", content: errorContent },
    },
  }),
  async (c) => {
    const refused = refuseImpersonation(c) ?? (await assertPermission(c, "webhook", "create")) ?? (await connectGate(c, "payments.onboard"));
    if (refused) return refused;
    return handleCashfreeOnboard(c, c.req.valid("json"));
  },
);

paymentAccountsRouter.delete(
  "/payment-accounts/:id",
  describeRoute({
    tags: ["dashboard"],
    summary: "Disconnect a payment account",
    description: "Revokes the grant or deletes the Stripe webhook at the gateway, then wipes the stored credentials.",
    responses: {
      200: { description: "Disconnected", content: json(z.object({ ok: z.literal(true) })) },
      404: { description: "Not found", content: errorContent },
    },
  }),
  async (c) => {
    const refused = refuseImpersonation(c) ?? (await assertPermission(c, "webhook", "delete"));
    if (refused) return refused;
    return handleDisconnect(c, c.req.param("id"));
  },
);

// ─────────────────────────────── the OAuth callback ───────────────────────────────

/**
 * Where to send the admin back, with an outcome on the query string. Only ever a URL validated
 * when the state was signed, or the app's default origin when the state could not be read.
 */
function backTo(returnTo: string, params: Record<string, string>): string {
  const url = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

paymentAccountsPublicRouter.get(
  "/payment-accounts/oauth/:provider/callback",
  describeRoute({
    tags: ["dashboard"],
    summary: "OAuth callback from Cashfree or Razorpay",
    description:
      "A browser redirect, not an API. Redirects to the returnTo page with `?payments=connected&provider=…` or `?payments=error&reason=…`.",
    responses: { 302: { description: "Back to the app" } },
  }),
  async (c) => {
    const provider = c.req.param("provider");
    const fallback = `${webOrigins(c.env)[0]!}/`;

    const verified = await verifyOAuthState(c.env, c.req.query("state"));
    if (!verified.ok) {
      // Back to the page that started it when the state is genuine but spent or stale; the
      // root only when it cannot be read or trusted at all.
      return c.redirect(
        backTo(verified.returnTo ?? fallback, {
          payments: "error",
          ...(verified.provider ? { provider: verified.provider } : {}),
          reason: `state_${verified.reason}`,
        }),
        302,
      );
    }
    const { payload } = verified;
    const fail = (reason: string) => c.redirect(backTo(payload.returnTo, { payments: "error", provider: payload.provider, reason }), 302);

    if (provider !== payload.provider) return fail("provider_mismatch");
    const declined = c.req.query("error");
    if (declined) return fail(declined.replace(/[^a-z_]/gi, "").slice(0, 40) || "access_denied");
    const code = c.req.query("code");
    if (!code) return fail("missing_code");

    /**
     * The browser finishing this must be signed in as the person who started it. The state alone
     * proves an organization asked for a connection; it does not prove the person approving at
     * the gateway is that organization's. Without this, a consent link started by an attacker
     * and approved by a victim would put the victim's merchant account in the attacker's
     * organization.
     */
    const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.id !== payload.userId) return fail("session_mismatch");

    const member = await c.env.DB.prepare(`SELECT role FROM members WHERE user_id = ? AND organization_id = ?`)
      .bind(payload.userId, payload.orgId)
      .first<{ role: string }>();
    if (!member) return fail("not_a_member");
    // Re-checked, because ten minutes is long enough for a plan to lapse or the flag to change.
    if (!gatewayEnabled(c.env, payload.orgId)) return fail("disabled");
    const ent = await getEntitlements(c.env, payload.orgId);
    if (!ent.features.collect_payments) return fail("plan_required");

    let tokens: OAuthTokens;
    let description: AccountDescription;
    try {
      if (payload.provider === "cashfree") {
        tokens = await cashfreeExchangeCode(c.env, code);
        /*
         * From the token exchange, and only from there. Cashfree echoes `merchant_id` on the
         * redirect as well, but the redirect's query string is the connecting admin's to edit —
         * and every later partner-key call (describe, revoke) is addressed by this id, not by
         * the merchant's token. Taken from the query, one org could store a row under another
         * merchant's id, read its name, hold its unique slot, and revoke its grant on disconnect.
         * The token response is the server-to-server answer to our own code exchange.
         */
        const merchantId = tokens.providerAccountId;
        if (!merchantId) {
          console.warn("payment_oauth_no_merchant_id", { orgId: payload.orgId, provider: payload.provider });
          return fail("no_merchant_id");
        }
        description = await createCashfreeAdapter(c.env, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          merchantId,
        }).describeAccount();
      } else {
        tokens = await razorpayExchangeCode(c.env, code, oauthRedirectUri(c.env, "razorpay"));
        if (!tokens.providerAccountId || !tokens.publicToken) return fail("no_merchant_id");
        description = await createRazorpayAdapter(c.env, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          publicToken: tokens.publicToken,
          accountId: tokens.providerAccountId,
        }).describeAccount();
      }
    } catch (err) {
      console.error("payment_oauth_exchange_failed", { orgId: payload.orgId, provider: payload.provider, ...errorInfo(err) });
      return fail("exchange_failed");
    }

    try {
      await saveOAuthAccount(c.env, {
        orgId: payload.orgId,
        userId: payload.userId,
        provider: payload.provider,
        tokens,
        description,
      });
    } catch (err) {
      if (err instanceof AccountConflictError) return fail("connected_elsewhere");
      console.error("payment_oauth_save_failed", { orgId: payload.orgId, provider: payload.provider, ...errorInfo(err) });
      return fail("save_failed");
    }

    return c.redirect(backTo(payload.returnTo, { payments: "connected", provider: payload.provider }), 302);
  },
);

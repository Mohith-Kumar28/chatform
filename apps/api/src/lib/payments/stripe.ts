import { currencyExponent } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import {
  ProviderError,
  type AccountDescription,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentEnvironment,
  type PaymentProviderAdapter,
  type ProviderErrorCode,
  type ProviderPaymentStatus,
} from "./types.js";

/**
 * Stripe, on the form admin's own account, reached through Stripe Connect.
 *
 * The admin presses Connect, approves chatform on Stripe's own page, and comes back. Nothing is
 * pasted and nothing of theirs is stored but the account id (`acct_…`): every call is made with
 * chatform's platform key and a `Stripe-Account` header naming their account, which makes each
 * checkout a direct charge. The money lands in their balance and is paid out to their bank by
 * Stripe; it never passes through ours.
 *
 * The API version is pinned on every request. Without it each call would be answered in whatever
 * version the platform account happened to default to, and a dashboard upgrade would change what
 * a Checkout Session looks like underneath running forms.
 */

export const STRIPE_API = "https://api.stripe.com";
export const STRIPE_CONNECT = "https://connect.stripe.com";
export const STRIPE_API_VERSION = "2024-06-20";
const TIMEOUT_MS = 10_000;

/** The platform's key, acting on one connected account. */
export interface StripeAuth {
  platformKey: string;
  accountId: string;
}

type StripeEnv = Pick<Bindings, "STRIPE_PLATFORM_SECRET_KEY" | "STRIPE_CONNECT_CLIENT_ID" | "STRIPE_CONNECT_WEBHOOK_SECRET">;

/** All three or nothing: a Connect button that cannot hear about the payment is worse than none. */
export function stripeConfigured(env: StripeEnv): boolean {
  return Boolean(env.STRIPE_PLATFORM_SECRET_KEY && env.STRIPE_CONNECT_CLIENT_ID && env.STRIPE_CONNECT_WEBHOOK_SECRET);
}

/** Live only on a live platform key. A test key connects test accounts, which take test cards. */
export function stripeMode(env: StripeEnv): PaymentEnvironment {
  return /^(sk|rk)_live_/.test(env.STRIPE_PLATFORM_SECRET_KEY ?? "") ? "live" : "test";
}

function platformKey(env: StripeEnv): string {
  if (!env.STRIPE_PLATFORM_SECRET_KEY) throw new ProviderError("bad_request", "stripe_connect_not_configured");
  return env.STRIPE_PLATFORM_SECRET_KEY;
}

export function stripeAuth(env: StripeEnv, accountId: string): StripeAuth {
  return { platformKey: platformKey(env), accountId };
}

/**
 * The events the platform's Connect endpoint is subscribed to, and nothing else.
 * `account.application.deauthorized` is the admin removing chatform from inside Stripe.
 */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "account.application.deauthorized",
] as const;

type Params = Record<string, unknown>;

/**
 * Stripe's form encoding: `a[b][0][c]=1`.
 *
 * Arrays are indexed rather than written `a[]=`, which Stripe accepts for both and which keeps
 * an array of objects (`line_items`) unambiguous. `undefined` and `null` are skipped rather
 * than sent as empty strings — an empty string is how Stripe is told to *unset* a field.
 */
export function encodeStripeForm(params: Params): string {
  const pairs: string[] = [];
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${prefix}[${i}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Params)) walk(prefix ? `${prefix}[${k}]` : k, v);
      return;
    }
    pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };
  walk("", params);
  return pairs.join("&");
}

interface StripeErrorBody {
  error?: { type?: string; code?: string; message?: string; param?: string };
}

/** A Stripe failure, with Stripe's own error code beside ours. */
export class StripeApiError extends ProviderError {
  constructor(
    code: ProviderErrorCode,
    message: string,
    httpStatus: number,
    public stripeCode: string | null,
  ) {
    super(code, message, httpStatus);
    this.name = "StripeApiError";
  }
}

/**
 * Whose fault a refusal is decides what happens to the account.
 *
 * `account_invalid` is Stripe saying the platform no longer has this account: the admin removed
 * chatform in their Stripe settings, or the account was closed. That is `invalid_grant`, which
 * marks the one account `needs_reconnect`. A 401 is different in kind. The key is ours, shared by
 * every connected account, so a bad one is our outage and must never be read as theirs, or one
 * mistyped secret would flag every Stripe account on the platform at once.
 */
function classify(status: number, stripeCode: string | null): ProviderErrorCode {
  if (stripeCode === "account_invalid") return "invalid_grant";
  if (status === 401) return "upstream";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "bad_request";
}

/**
 * One Stripe call. `params` become the query string on GET and DELETE and the form body
 * otherwise. Throws `StripeApiError`; its message is Stripe's, which names a key only by its
 * redacted prefix, never in full.
 */
export async function stripeFetch<T>(
  auth: StripeAuth,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Params,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const encoded = params ? encodeStripeForm(params) : "";
  const hasBody = method === "POST";
  const url = `${STRIPE_API}${path}${!hasBody && encoded ? `?${encoded}` : ""}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${auth.platformKey}`,
    "stripe-account": auth.accountId,
    "stripe-version": STRIPE_API_VERSION,
    ...(hasBody ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: hasBody ? encoded : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new StripeApiError("upstream", `stripe_unreachable: ${err instanceof Error ? err.name : "error"}`, 0, null);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const err = (body as StripeErrorBody).error;
    const message = err?.message ?? `Stripe ${path} returned ${res.status}`;
    throw new StripeApiError(classify(res.status, err?.code ?? null), message, res.status, err?.code ?? null);
  }
  return body as T;
}

// ─────────────────────────────── adapter ───────────────────────────────

interface StripeAccount {
  id: string;
  email?: string | null;
  country?: string | null;
  default_currency?: string | null;
  business_profile?: { name?: string | null } | null;
  settings?: { dashboard?: { display_name?: string | null } | null } | null;
}

interface StripeCharge {
  id: string;
  created?: number;
  refunded?: boolean;
  amount?: number;
  amount_refunded?: number;
}

interface StripePaymentIntent {
  id: string;
  status?: string;
  created?: number;
  latest_charge?: string | StripeCharge | null;
  last_payment_error?: { message?: string; code?: string } | null;
}

export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  status?: "open" | "complete" | "expired" | null;
  payment_status?: "paid" | "unpaid" | "no_payment_required";
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  payment_intent?: string | StripePaymentIntent | null;
  created?: number;
}

/**
 * Our minor units, which are ISO 4217's, in the integer Stripe wants — or null when Stripe cannot
 * charge that amount at all.
 *
 * Stripe mostly agrees with ISO, and the three places it does not are each a hundredfold error
 * that still verifies: the confirmation echoes back the same wrongly converted number the record
 * holds, so `confirmPaymentRecord` would see a match. So the conversion lives at the one seam
 * that talks to Stripe, both ways, and the record stays in ISO units like every other gateway's.
 * https://docs.stripe.com/currencies#zero-decimal and #special-cases:
 *
 * - **MGA** has two decimals in ISO and none at Stripe: Ar 5000 is `5000`, not `500000`. An
 *   amount with a fractional ariary cannot be charged.
 * - **ISK** and **UGX** went zero-decimal, but Stripe still takes them written with two: 5 ISK is
 *   `500`.
 * - **Three-decimal currencies** (KWD, BHD, …) are sent as-is, but the last digit must be 0.
 */
const STRIPE_ZERO_DECIMAL_ISO_TWO = new Set(["MGA"]);
const STRIPE_TWO_DECIMAL_ISO_ZERO = new Set(["ISK", "UGX"]);

export function toStripeAmount(amountMinor: number, currency: string): number | null {
  const code = currency.toUpperCase();
  if (STRIPE_ZERO_DECIMAL_ISO_TWO.has(code)) return amountMinor % 100 === 0 ? amountMinor / 100 : null;
  if (STRIPE_TWO_DECIMAL_ISO_ZERO.has(code)) return amountMinor * 100;
  if (currencyExponent(code) === 3) return amountMinor % 10 === 0 ? amountMinor : null;
  return amountMinor;
}

/** The inverse of `toStripeAmount`, for what Stripe reports back. */
export function fromStripeAmount(stripeAmount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (STRIPE_ZERO_DECIMAL_ISO_TWO.has(code)) return stripeAmount * 100;
  if (STRIPE_TWO_DECIMAL_ISO_ZERO.has(code)) return Math.round(stripeAmount / 100);
  return stripeAmount;
}

/**
 * Stripe Checkout requires `expires_at` between 30 minutes and 24 hours from creation
 * (https://docs.stripe.com/api/checkout/sessions/create). A minute of slack on the lower bound,
 * because "now" here and "creation" at Stripe are not the same instant.
 */
function clampExpiry(expiresAtMs: number, nowMs: number): number {
  const min = nowMs + 31 * 60_000;
  const max = nowMs + 23.5 * 60 * 60_000;
  return Math.floor(Math.min(Math.max(expiresAtMs, min), max) / 1000);
}

export function createStripeAdapter(auth: StripeAuth, environment: PaymentEnvironment): PaymentProviderAdapter {
  return {
    provider: "stripe",

    // https://docs.stripe.com/api/checkout/sessions/create
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      const unitAmount = toStripeAmount(req.amountMinor, req.currency);
      if (unitAmount === null) throw new ProviderError("bad_request", "stripe_amount_precision");
      const session = await stripeFetch<StripeCheckoutSession>(
        auth,
        "POST",
        "/v1/checkout/sessions",
        {
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: req.currency.toLowerCase(),
                unit_amount: unitAmount,
                product_data: { name: req.title.slice(0, 250), description: req.description?.slice(0, 500) || undefined },
              },
            },
          ],
          client_reference_id: req.recordId,
          metadata: { record_id: req.recordId },
          // Copied onto the charge, which is how `charge.refunded` finds its way back to the record.
          payment_intent_data: { metadata: { record_id: req.recordId } },
          customer_email: req.customer.email || undefined,
          success_url: req.returnUrl,
          cancel_url: req.cancelUrl,
          expires_at: clampExpiry(req.expiresAt, Date.now()),
        },
        { idempotencyKey: req.idempotencyKey },
      );
      if (!session.url) throw new ProviderError("upstream", "stripe_session_without_url");
      return { providerOrderId: session.id, launch: { kind: "redirect", url: session.url, sessionId: session.id } };
    },

    // https://docs.stripe.com/api/checkout/sessions/retrieve
    async fetchStatus(sessionId: string): Promise<ProviderPaymentStatus> {
      const session = await stripeFetch<StripeCheckoutSession>(
        auth,
        "GET",
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        { expand: ["payment_intent.latest_charge"] },
      );
      return stripeSessionStatus(session);
    },

    // https://docs.stripe.com/api/accounts/retrieve
    async describeAccount(): Promise<AccountDescription> {
      const account = await stripeFetch<StripeAccount>(auth, "GET", "/v1/account");
      return describeStripeAccount(account, environment);
    },
  };
}

/** A Checkout Session, in the vocabulary every adapter answers in. */
export function stripeSessionStatus(session: StripeCheckoutSession): ProviderPaymentStatus {
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const currency = (session.currency ?? "").toUpperCase();
  const base = {
    amountMinor: fromStripeAmount(session.amount_total ?? 0, currency),
    currency,
    providerPaymentId: intent?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null),
  };

  if (session.payment_status === "paid") {
    const paidAt = (charge?.created ?? intent?.created ?? session.created ?? null) as number | null;
    // Part of the charge refunded: still `paid` to Stripe, and no longer a
    // payment for what it was taken for. See `refundPending`.
    const partlyRefunded = charge?.refunded !== true && (charge?.amount_refunded ?? 0) > 0;
    return {
      ...base,
      status: charge?.refunded === true ? "refunded" : "paid",
      paidAt: paidAt === null ? null : paidAt * 1000,
      ...(partlyRefunded ? { refundPending: true } : {}),
    };
  }
  if (session.status === "expired") return { ...base, status: "expired" };
  // A completed session still unpaid is a delayed method in flight — unless it already failed,
  // in which case the intent carries the reason and wants a new payment method.
  if (session.status === "complete" && intent?.last_payment_error) {
    return { ...base, status: "failed", failureReason: intent.last_payment_error.message ?? intent.last_payment_error.code ?? "failed" };
  }
  return { ...base, status: "created" };
}

function describeStripeAccount(account: StripeAccount, environment: PaymentEnvironment): AccountDescription {
  const label =
    account.settings?.dashboard?.display_name || account.business_profile?.name || account.email || `Stripe ${account.id}`;
  return {
    providerAccountId: account.id,
    label,
    // Stripe charges in 135+ currencies from any account; the default is what the builder
    // offers first. `capabilities.anyCurrency` on the row says the rest are allowed.
    currencies: account.default_currency ? [account.default_currency.toUpperCase()] : [],
    environment,
  };
}

// ─────────────────────────────── connecting ───────────────────────────────

function clientId(env: StripeEnv): string {
  if (!env.STRIPE_CONNECT_CLIENT_ID) throw new ProviderError("bad_request", "stripe_connect_not_configured");
  return env.STRIPE_CONNECT_CLIENT_ID;
}

/**
 * Stripe's consent page: the admin picks one of their Stripe accounts, or creates one there, and
 * approves. `read_write` is what lets the platform create a checkout on the account.
 */
// https://docs.stripe.com/connect/oauth-reference#get-authorize
export function stripeAuthorizeUrl(env: StripeEnv, state: string, redirectUri: string): string {
  const url = new URL(`${STRIPE_CONNECT}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId(env));
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/** The OAuth endpoints answer RFC 6749's flat `{ error, error_description }`, not the API's nested one. */
async function connectCall<T>(env: StripeEnv, path: string, params: Params): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${STRIPE_CONNECT}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${platformKey(env)}`, "content-type": "application/x-www-form-urlencoded" },
      body: encodeStripeForm(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderError("upstream", `stripe_unreachable: ${err instanceof Error ? err.name : "error"}`);
  }
  const text = await res.text();
  let body: { error?: string; error_description?: string } = {};
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const code: ProviderErrorCode = body.error === "invalid_grant" ? "invalid_grant" : res.status >= 500 ? "upstream" : "bad_request";
    throw new ProviderError(code, [body.error, body.error_description].filter(Boolean).join(": ").slice(0, 300) || `stripe_${res.status}`, res.status);
  }
  return body as T;
}

/**
 * Trade the code from the consent redirect for the account it names.
 *
 * The response also carries an access and a refresh token for the account. Neither is kept:
 * Stripe's own advice is to call with the platform key and a `Stripe-Account` header, which
 * leaves nothing of the merchant's to store, seal, rotate or leak.
 */
// https://docs.stripe.com/connect/oauth-reference#post-token
export async function stripeExchangeCode(env: StripeEnv, code: string): Promise<{ accountId: string; livemode: boolean }> {
  const body = await connectCall<{ stripe_user_id?: string; livemode?: boolean }>(env, "/oauth/token", {
    grant_type: "authorization_code",
    code,
  });
  if (!body.stripe_user_id) throw new ProviderError("upstream", "stripe_token_without_account");
  return { accountId: body.stripe_user_id, livemode: body.livemode === true };
}

/**
 * Remove chatform from the account. Already removed is success: it is the state being asked for,
 * and the admin may well have done it from their own Stripe settings.
 */
// https://docs.stripe.com/connect/oauth-reference#post-deauthorize
export async function stripeDeauthorize(env: StripeEnv, accountId: string): Promise<void> {
  try {
    await connectCall(env, "/oauth/deauthorize", { client_id: clientId(env), stripe_user_id: accountId });
  } catch (err) {
    if (err instanceof ProviderError && err.code !== "upstream") return;
    throw err;
  }
}

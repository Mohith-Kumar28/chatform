import { currencyExponent, providerMinMinor } from "@repo/form-schema";
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
 * Stripe, on the form admin's own account.
 *
 * Today the credential is a restricted key the admin pastes (`rk_live_…`), because Stripe Connect
 * is not available to a platform incorporated in India. Every call goes through `StripeAuth` so
 * that the day Connect is, only the credential changes: a platform key plus a `Stripe-Account`
 * header reaches exactly the same endpoints with exactly the same bodies.
 *
 * The API version is pinned on every request and on the webhook endpoint we create. Without it
 * each merchant's calls would be answered in whatever version their account happened to default
 * to — and a restricted key pasted from an account opened in 2019 describes a Checkout Session
 * differently from one opened last week.
 */

export const STRIPE_API = "https://api.stripe.com";
export const STRIPE_API_VERSION = "2024-06-20";
const TIMEOUT_MS = 10_000;

export type StripeAuth =
  | { kind: "restricted_key"; key: string }
  | { kind: "connect"; platformKey: string; accountId: string };

/** The events the per-account endpoint is subscribed to — and nothing else. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
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

/** A Stripe failure with what the connect flow needs to explain it. */
export class StripeApiError extends ProviderError {
  constructor(
    code: ProviderErrorCode,
    message: string,
    httpStatus: number,
    /** `rak_…`, when Stripe names the permission a restricted key lacks. */
    public permission: string | null,
    public stripeCode: string | null,
  ) {
    super(code, message, httpStatus);
    this.name = "StripeApiError";
  }
}

/**
 * The permission a restricted key is missing, from Stripe's own wording: "…Having the
 * 'rak_checkout_session_write' permission would allow this request to continue."
 */
export function missingPermissionFrom(message: string | undefined): string | null {
  return message?.match(/'(rak_[a-z0-9_]+)'/)?.[1] ?? null;
}

function classify(status: number): ProviderErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "bad_request";
}

function authHeaders(auth: StripeAuth): Record<string, string> {
  if (auth.kind === "connect") {
    return { authorization: `Bearer ${auth.platformKey}`, "stripe-account": auth.accountId };
  }
  return { authorization: `Bearer ${auth.key}` };
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
    ...authHeaders(auth),
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
    throw new StripeApiError("upstream", `stripe_unreachable: ${err instanceof Error ? err.name : "error"}`, 0, null, null);
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
    throw new StripeApiError(classify(res.status), message, res.status, missingPermissionFrom(err?.message), err?.code ?? null);
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

export type StripeSetupErrorCode = "full_secret_key" | "invalid_key" | "missing_permission" | "upstream";

/** Why a pasted key was refused, in terms the connect sheet can say plainly. */
export class StripeSetupError extends Error {
  constructor(
    public code: StripeSetupErrorCode,
    message: string,
    public permission?: string,
  ) {
    super(message);
    this.name = "StripeSetupError";
  }
}

/** `rk_test_…` → test, `rk_live_…` → live; anything else is not a restricted key. */
export function parseRestrictedKey(raw: string): { key: string; environment: PaymentEnvironment } {
  const key = raw.trim();
  if (/^sk_(test|live)_/.test(key)) {
    throw new StripeSetupError(
      "full_secret_key",
      "That is your full secret key, which can do anything on your Stripe account. Create a restricted key instead — it only needs the permissions listed in the steps.",
    );
  }
  const match = key.match(/^rk_(test|live)_[A-Za-z0-9]{10,}$/);
  if (!match) {
    throw new StripeSetupError("invalid_key", "That does not look like a Stripe restricted key. It starts with rk_live_ or rk_test_.");
  }
  return { key, environment: match[1] as PaymentEnvironment };
}

function setupErrorFrom(err: unknown, step: string): StripeSetupError {
  if (err instanceof StripeApiError) {
    if (err.httpStatus === 401) {
      return new StripeSetupError("invalid_key", "Stripe did not accept that key. It may have been deleted or rolled — create a new one and paste it again.");
    }
    if (err.httpStatus === 403 || err.permission) {
      return new StripeSetupError(
        "missing_permission",
        err.permission
          ? `The key is missing the “${stripePermissionLabel(err.permission)}” permission. Edit the key in Stripe, switch it on, and try again.`
          : `The key does not have permission to ${step}. Edit the key in Stripe and grant the permissions listed in the steps.`,
        err.permission ?? undefined,
      );
    }
    if (err.code === "rate_limited" || err.code === "upstream") {
      return new StripeSetupError("upstream", "Stripe did not answer just now. Try again in a minute.");
    }
    return new StripeSetupError("invalid_key", `Stripe refused the check (${step}): ${err.message}`);
  }
  return new StripeSetupError("upstream", "Stripe could not be reached. Try again in a minute.");
}

/**
 * A `rak_…` permission in the words Stripe's restricted-key editor uses.
 *
 * Stripe's error names the permission by its API identifier, which appears nowhere in the
 * editor the admin has to go and change — "rak_checkout_session_write" is not a row they can
 * find. The resources a verified payment touches are named exactly; anything else is spelled
 * out from the identifier, which is close enough to search the editor for.
 */
const STRIPE_RESOURCE_LABELS: Record<string, string> = {
  checkout_session: "Checkout Sessions",
  webhook: "Webhook Endpoints",
  payment_intent: "Payment Intents",
  charge: "Charges",
  account: "Accounts",
  accounts: "Accounts",
  accounts_kyc_basic: "Accounts",
  connected_account: "Accounts",
};

export function stripePermissionLabel(permission: string): string {
  const m = permission.match(/^rak_(.+)_(read|write)$/);
  if (!m) return permission;
  const [, resource, access] = m as unknown as [string, string, "read" | "write"];
  const name =
    STRIPE_RESOURCE_LABELS[resource] ??
    resource
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  return `${name} — ${access === "write" ? "Write" : "Read"}`;
}

export interface StripeSetupResult {
  auth: StripeAuth;
  description: AccountDescription;
  webhookId: string;
  webhookSecret: string;
}

/**
 * Check a pasted restricted key can do everything a verified payment needs, then subscribe the
 * account's own endpoint.
 *
 * Proven by doing, not by reading permissions: Stripe has no endpoint that lists a key's
 * permissions, so each capability is exercised once. A Checkout Session is created and expired
 * straight away — the one way to know `create` works before a respondent presses Pay and finds
 * out it does not. It costs nothing and charges nobody; it shows in the admin's dashboard as an
 * expired session named for what it was.
 *
 * `webhookUrl` may be a function of the account, because the URL carries our row id and the
 * caller only knows which row — a reconnect reuses the old one — once it knows which Stripe
 * account the key belongs to.
 */
export async function setupStripeRestrictedKey(
  rawKey: string,
  webhookUrl: string | ((description: AccountDescription) => Promise<string> | string),
): Promise<StripeSetupResult> {
  const { key, environment } = parseRestrictedKey(rawKey);
  const auth: StripeAuth = { kind: "restricted_key", key };
  const adapter = createStripeAdapter(auth, environment);

  let description: AccountDescription;
  try {
    description = await adapter.describeAccount();
  } catch (err) {
    throw setupErrorFrom(err, "read the account");
  }

  // https://docs.stripe.com/api/checkout/sessions/create + /expire
  try {
    const currency = description.currencies[0] ?? "USD";
    const probe = await stripeFetch<StripeCheckoutSession>(auth, "POST", "/v1/checkout/sessions", {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            // Round in every currency's units, so the probe itself is never refused for precision.
            unit_amount: toStripeAmount(Math.max(providerMinMinor(currency), 1000), currency) ?? 1000,
            product_data: { name: "chatform connection check (expired immediately)" },
          },
        },
      ],
      success_url: "https://chatform.in/",
      metadata: { chatform_probe: "1" },
    });
    await stripeFetch(auth, "POST", `/v1/checkout/sessions/${encodeURIComponent(probe.id)}/expire`);
  } catch (err) {
    throw setupErrorFrom(err, "create Checkout Sessions");
  }

  const url = typeof webhookUrl === "function" ? await webhookUrl(description) : webhookUrl;
  // https://docs.stripe.com/api/webhook_endpoints/create — `secret` is only ever returned here.
  let endpoint: { id: string; secret?: string };
  try {
    endpoint = await stripeFetch<{ id: string; secret?: string }>(auth, "POST", "/v1/webhook_endpoints", {
      url,
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      api_version: STRIPE_API_VERSION,
      description: "chatform verified payments",
    });
  } catch (err) {
    throw setupErrorFrom(err, "create webhook endpoints");
  }
  if (!endpoint.secret) throw new StripeSetupError("upstream", "Stripe created the webhook but did not return its secret. Try again.");

  return { auth, description, webhookId: endpoint.id, webhookSecret: endpoint.secret };
}

/**
 * Remove the endpoint we created. A 404 is success — it is already gone, which is the state
 * being asked for, and the admin may well have deleted it by hand.
 */
// https://docs.stripe.com/api/webhook_endpoints/delete
export async function deleteStripeWebhook(auth: StripeAuth, id: string): Promise<void> {
  try {
    await stripeFetch(auth, "DELETE", `/v1/webhook_endpoints/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ProviderError && err.code === "not_found") return;
    throw err;
  }
}

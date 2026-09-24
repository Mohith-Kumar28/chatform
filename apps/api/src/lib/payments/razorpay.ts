import type { Bindings } from "../../env.js";
import type { OAuthTokens } from "./oauth-state.js";
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
 * Razorpay, on a merchant who connected chatform's Technology Partner app over OAuth.
 *
 * The access token (90 days) creates orders and reads payments server-side. The browser gets the
 * merchant's `public_token` (`rzp_live_oauth_…`) as Checkout's `key` — publishable by design, and
 * the only credential that ever leaves the worker.
 *
 * Checkout's own success handler returns a signature we cannot check: it is an HMAC with the
 * merchant's key secret, which OAuth never gives us. So nothing is taken from the handler. The
 * order's payments are fetched with the merchant's token instead, which is also the only way a
 * payment made while our webhook was down is ever noticed.
 */

export const RAZORPAY_AUTH = "https://auth.razorpay.com";
export const RAZORPAY_API = "https://api.razorpay.com";
const TIMEOUT_MS = 10_000;

export interface RazorpayCredentials {
  accessToken: string;
  refreshToken: string;
  publicToken: string;
  accountId: string;
}

/** Test unless `RAZORPAY_ENVIRONMENT` is exactly `live`. */
export function razorpayMode(env: Pick<Bindings, "RAZORPAY_ENVIRONMENT">): PaymentEnvironment {
  return env.RAZORPAY_ENVIRONMENT?.trim().toLowerCase() === "live" ? "live" : "test";
}

export function razorpayConfigured(env: Bindings): boolean {
  return Boolean(env.RAZORPAY_OAUTH_CLIENT_ID && env.RAZORPAY_OAUTH_CLIENT_SECRET);
}

function clientCredentials(env: Bindings): { client_id: string; client_secret: string } {
  if (!env.RAZORPAY_OAUTH_CLIENT_ID || !env.RAZORPAY_OAUTH_CLIENT_SECRET) {
    throw new ProviderError("bad_request", "razorpay_not_configured");
  }
  return { client_id: env.RAZORPAY_OAUTH_CLIENT_ID, client_secret: env.RAZORPAY_OAUTH_CLIENT_SECRET };
}

/**
 * Razorpay answers in two error dialects: the OAuth server's RFC 6749 `{ error: "invalid_grant" }`
 * and the API's `{ error: { code, description } }`. Both are read; neither is ever logged whole.
 */
interface RazorpayErrorBody {
  error?: string | { code?: string; description?: string; reason?: string };
  error_description?: string;
}

function describeError(body: RazorpayErrorBody): { code: string | null; message: string } {
  if (typeof body.error === "string") return { code: body.error, message: body.error_description ?? body.error };
  return { code: body.error?.code ?? null, message: body.error?.description ?? body.error?.reason ?? "" };
}

function classify(status: number): ProviderErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "bad_request";
}

async function razorpayCall<T>(
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: unknown },
  opts: { grant?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderError("upstream", `razorpay_unreachable: ${err instanceof Error ? err.name : "error"}`);
  }
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const { code, message } = describeError(body as RazorpayErrorBody);
    /**
     * On the token endpoint a 4xx means the grant is dead — an expired code, a refresh token
     * already rotated, an app the merchant revoked. `invalid_grant` is what sends the account to
     * `needs_reconnect` rather than retrying something that cannot succeed.
     */
    const kind: ProviderErrorCode =
      code === "invalid_grant" || (opts.grant && res.status >= 400 && res.status < 500 && res.status !== 429)
        ? "invalid_grant"
        : classify(res.status);
    throw new ProviderError(kind, [code, message].filter(Boolean).join(": ").slice(0, 300) || `razorpay_${res.status}`, res.status);
  }
  return body as T;
}

// ─────────────────────────────── OAuth ───────────────────────────────

// https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps/
export function razorpayAuthorizeUrl(env: Bindings, state: string, redirectUri: string): string {
  const { client_id } = clientCredentials(env);
  const url = new URL(`${RAZORPAY_AUTH}/authorize`);
  url.searchParams.set("client_id", client_id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", state);
  return url.toString();
}

interface RazorpayTokenResponse {
  access_token?: string;
  refresh_token?: string;
  public_token?: string;
  token_type?: string;
  expires_in?: number;
  razorpay_account_id?: string;
}

/** Refresh tokens last 180 days; the response does not say so, the docs do. */
const RAZORPAY_REFRESH_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function tokensFrom(res: RazorpayTokenResponse, fallback: { accountId?: string | null; publicToken?: string | null } = {}): OAuthTokens {
  if (!res.access_token || !res.refresh_token) throw new ProviderError("upstream", "razorpay_token_missing");
  const now = Date.now();
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt: typeof res.expires_in === "number" ? now + res.expires_in * 1000 : null,
    refreshExpiresAt: now + RAZORPAY_REFRESH_TTL_MS,
    providerAccountId: res.razorpay_account_id ?? fallback.accountId ?? null,
    publicToken: res.public_token ?? fallback.publicToken ?? null,
  };
}

// https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps/ — POST /token
export async function razorpayExchangeCode(env: Bindings, code: string, redirectUri: string): Promise<OAuthTokens> {
  const res = await razorpayCall<RazorpayTokenResponse>(
    `${RAZORPAY_AUTH}/token`,
    {
      method: "POST",
      body: { ...clientCredentials(env), grant_type: "authorization_code", redirect_uri: redirectUri, code, mode: razorpayMode(env) },
    },
    { grant: true },
  );
  return tokensFrom(res);
}

// https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps/ — refresh
export async function razorpayRefresh(
  env: Bindings,
  refreshToken: string,
  previous: { accountId?: string | null; publicToken?: string | null } = {},
): Promise<OAuthTokens> {
  const res = await razorpayCall<RazorpayTokenResponse>(
    `${RAZORPAY_AUTH}/token`,
    { method: "POST", body: { ...clientCredentials(env), grant_type: "refresh_token", refresh_token: refreshToken } },
    { grant: true },
  );
  return tokensFrom(res, previous);
}

// https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps/ — POST /revoke
export async function razorpayRevoke(env: Bindings, token: string, hint: "access_token" | "refresh_token" = "access_token"): Promise<void> {
  await razorpayCall(`${RAZORPAY_AUTH}/revoke`, {
    method: "POST",
    body: { ...clientCredentials(env), token_type_hint: hint, token },
  });
}

// ─────────────────────────────── adapter ───────────────────────────────

interface RazorpayOrder {
  id: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  receipt?: string;
  status?: "created" | "attempted" | "paid";
}

interface RazorpayPayment {
  id: string;
  amount?: number;
  currency?: string;
  status?: "created" | "authorized" | "captured" | "refunded" | "failed";
  captured?: boolean;
  amount_refunded?: number;
  refund_status?: "partial" | "full" | null;
  created_at?: number;
  error_description?: string | null;
  error_reason?: string | null;
}

export function createRazorpayAdapter(env: Bindings, creds: RazorpayCredentials): PaymentProviderAdapter {
  const auth = { authorization: `Bearer ${creds.accessToken}` };

  return {
    provider: "razorpay",

    // https://razorpay.com/docs/api/orders/create/
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      const order = await razorpayCall<RazorpayOrder>(`${RAZORPAY_API}/v1/orders`, {
        method: "POST",
        headers: auth,
        body: {
          amount: req.amountMinor,
          currency: req.currency.toUpperCase(),
          // Receipts are capped at 40 characters; `rpay_…` ids are well inside that.
          receipt: req.recordId.slice(0, 40),
          notes: { record_id: req.recordId },
        },
      });
      const prefill = {
        name: req.customer.name || undefined,
        email: req.customer.email || undefined,
        contact: req.customer.phone || undefined,
      };
      return {
        providerOrderId: order.id,
        launch: {
          kind: "razorpay_checkout",
          orderId: order.id,
          key: creds.publicToken,
          amountMinor: req.amountMinor,
          currency: req.currency.toUpperCase(),
          // Razorpay's checkout header is the payee, and it draws the name's first letter as the
          // logo. The form is who the respondent thinks they are paying; the question is what for.
          name: req.description || req.title,
          description: req.description ? req.title : undefined,
          prefill: prefill.name || prefill.email || prefill.contact ? prefill : undefined,
        },
      };
    },

    /**
     * The order's payments, captured first.
     *
     * An `authorized` payment is money the respondent has sent that the merchant has not yet
     * taken — an account with auto-capture switched off leaves every payment there until someone
     * captures it, and Razorpay refunds it automatically days later. We capture it here, for
     * exactly the amount on the order, so a merchant's dashboard setting cannot quietly turn a
     * verified payment into one that bounces back. If capture is refused, it is reported as not
     * yet paid rather than guessed at.
     */
    // https://razorpay.com/docs/api/orders/fetch-payments/
    async fetchStatus(orderId: string): Promise<ProviderPaymentStatus> {
      const id = encodeURIComponent(orderId);
      const order = await razorpayCall<RazorpayOrder>(`${RAZORPAY_API}/v1/orders/${id}`, { method: "GET", headers: auth });
      const list = await razorpayCall<{ items?: RazorpayPayment[] }>(`${RAZORPAY_API}/v1/orders/${id}/payments`, {
        method: "GET",
        headers: auth,
      });
      const items = list.items ?? [];
      const currency = (order.currency ?? "INR").toUpperCase();
      const amountMinor = order.amount ?? 0;

      const settled = (p: RazorpayPayment, status: "paid" | "refunded"): ProviderPaymentStatus => ({
        status,
        providerPaymentId: p.id,
        amountMinor: p.amount ?? amountMinor,
        currency: (p.currency ?? currency).toUpperCase(),
        paidAt: p.created_at ? p.created_at * 1000 : null,
      });

      const captured = items.find((p) => p.status === "captured" || p.status === "refunded");
      if (captured) {
        const fullyRefunded =
          captured.refund_status === "full" ||
          (captured.amount != null && (captured.amount_refunded ?? 0) >= captured.amount && captured.amount > 0);
        if (fullyRefunded) return settled(captured, "refunded");
        // Part of it has gone back, so the payment no longer covers what it was
        // taken for. Still `paid` — Razorpay only calls it refunded when all of
        // it is — so the flag is the only thing that says so. See `refundPending`.
        const partlyRefunded = captured.refund_status === "partial" || (captured.amount_refunded ?? 0) > 0;
        return { ...settled(captured, "paid"), ...(partlyRefunded ? { refundPending: true } : {}) };
      }

      const authorized = items.find((p) => p.status === "authorized");
      if (authorized) {
        try {
          // https://razorpay.com/docs/api/payments/capture/
          const done = await razorpayCall<RazorpayPayment>(`${RAZORPAY_API}/v1/payments/${encodeURIComponent(authorized.id)}/capture`, {
            method: "POST",
            headers: auth,
            body: { amount: authorized.amount ?? amountMinor, currency: (authorized.currency ?? currency).toUpperCase() },
          });
          if (done.status === "captured") return settled(done, "paid");
        } catch (err) {
          // A 401 still has to reach `withAdapter`, which refreshes and asks again.
          if (err instanceof ProviderError && err.code === "unauthorized") throw err;
        }
        return { status: "created", providerPaymentId: authorized.id, amountMinor, currency };
      }

      const failed = items.filter((p) => p.status === "failed");
      if (failed.length > 0 && failed.length === items.length) {
        const last = failed[failed.length - 1]!;
        return { status: "failed", amountMinor, currency, failureReason: last.error_description ?? last.error_reason ?? "failed" };
      }
      return { status: "created", amountMinor, currency };
    },

    async describeAccount(): Promise<AccountDescription> {
      return {
        providerAccountId: creds.accountId,
        label: `Razorpay ${creds.accountId}`,
        // INR only until international collection on OAuth-linked accounts is confirmed.
        currencies: ["INR"],
        // The public token says which mode the grant was issued in; the variable is the fallback.
        environment: creds.publicToken.startsWith("rzp_live_")
          ? "live"
          : creds.publicToken.startsWith("rzp_test_")
            ? "test"
            : razorpayMode(env),
      };
    },

    async revoke(): Promise<void> {
      // The refresh token first: revoking only the access token leaves a credential that can
      // mint a new one.
      await razorpayRevoke(env, creds.refreshToken, "refresh_token").catch(() => undefined);
      await razorpayRevoke(env, creds.accessToken, "access_token");
    },
  };
}

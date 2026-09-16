import { fromMinorUnits, toMinorUnits } from "@repo/form-schema";
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
 * Cashfree, on a merchant linked to chatform's partner account over OAuth.
 *
 * Two hosts, and they are not the same service: the partner API (`api[-sandbox].cashfree.com/partners`)
 * mints auth links and tokens and knows about merchants; the payment gateway (`[sandbox.|api.]cashfree.com/pg`)
 * creates orders and answers for them, and is called as the merchant with their Bearer token.
 *
 * Sandbox unless `CASHFREE_ENVIRONMENT` is exactly `production`, so a missing variable can never
 * move real money.
 *
 * Tokens: access 24 hours, refresh 90 days, and a refresh rotates the refresh token — the old one
 * stops working the moment the new pair is issued. That is why refreshing is leased in
 * `accounts.ts`: two requests refreshing at once would each invalidate the other's result.
 */

export const CASHFREE_PG_API_VERSION = "2023-08-01";
export const CASHFREE_PARTNER_API_VERSION = "2023-01-01";
const TIMEOUT_MS = 10_000;

export type CashfreeMode = "sandbox" | "production";

export interface CashfreeCredentials {
  accessToken: string;
  refreshToken: string;
  merchantId: string;
}

export function cashfreeMode(env: Pick<Bindings, "CASHFREE_ENVIRONMENT">): CashfreeMode {
  return env.CASHFREE_ENVIRONMENT?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

export function cashfreeEnvironment(env: Pick<Bindings, "CASHFREE_ENVIRONMENT">): PaymentEnvironment {
  return cashfreeMode(env) === "production" ? "live" : "test";
}

export function cashfreePgBase(env: Pick<Bindings, "CASHFREE_ENVIRONMENT">): string {
  return cashfreeMode(env) === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

export function cashfreePartnerBase(env: Pick<Bindings, "CASHFREE_ENVIRONMENT">): string {
  return cashfreeMode(env) === "production"
    ? "https://api.cashfree.com/partners"
    : "https://api-sandbox.cashfree.com/partners";
}

/** Both halves the partner OAuth flow needs. The client secret is not one of them. */
export function cashfreeConfigured(env: Bindings): boolean {
  return Boolean(env.CASHFREE_PARTNER_CLIENT_ID && env.CASHFREE_PARTNER_API_KEY);
}

interface CashfreeErrorBody {
  message?: string;
  code?: string;
  type?: string;
}

function classify(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "bad_request";
}

/**
 * One Cashfree call. Errors carry Cashfree's `code` and `message` — which describe the request,
 * never echo a token — and are classified so `withAdapter` knows a 401 wants a refresh.
 */
async function cashfreeCall<T>(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown },
  classifyStatus: (status: number, body: CashfreeErrorBody) => ProviderErrorCode = (s) => classify(s),
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
    throw new ProviderError("upstream", `cashfree_unreachable: ${err instanceof Error ? err.name : "error"}`);
  }
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const err = body as CashfreeErrorBody;
    const detail = [err.code, err.message].filter(Boolean).join(": ").slice(0, 300);
    throw new ProviderError(classifyStatus(res.status, err), detail || `cashfree_${res.status}`, res.status);
  }
  return body as T;
}

function partnerHeaders(env: Bindings): Record<string, string> {
  if (!env.CASHFREE_PARTNER_API_KEY || !env.CASHFREE_PARTNER_CLIENT_ID) {
    throw new ProviderError("bad_request", "cashfree_not_configured");
  }
  return {
    "x-partner-apikey": env.CASHFREE_PARTNER_API_KEY,
    "oauth-client-id": env.CASHFREE_PARTNER_CLIENT_ID,
  };
}

// ─────────────────────────────── OAuth ───────────────────────────────

/**
 * The consent link for a merchant.
 *
 * Not a URL we build: Cashfree mints it server-side, valid for an hour, and the redirect URI is
 * the one registered on the partner dashboard rather than a parameter. `state` must be 8–64
 * characters, which is why `oauth-state.ts` keeps its payload in D1.
 */
// https://www.cashfree.com/docs/partners/embedded/oauth-flow — POST /partners/oauth/auth_link
export async function cashfreeAuthorizeUrl(env: Bindings, state: string): Promise<string> {
  const res = await cashfreeCall<{ auth_link?: string }>(`${cashfreePartnerBase(env)}/oauth/auth_link`, {
    method: "POST",
    headers: partnerHeaders(env),
    body: { response_type: "code", scope: "read_write", state },
  });
  if (!res.auth_link) throw new ProviderError("upstream", "cashfree_auth_link_missing");
  return res.auth_link;
}

interface CashfreeTokenResponse {
  merchant_id?: string;
  connection_status?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

const CASHFREE_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function tokensFrom(res: CashfreeTokenResponse, fallbackMerchant: string | null): OAuthTokens {
  if (!res.access_token || !res.refresh_token) throw new ProviderError("upstream", "cashfree_token_missing");
  const now = Date.now();
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt: now + (typeof res.expires_in === "number" ? res.expires_in : 86_400) * 1000,
    refreshExpiresAt: now + CASHFREE_REFRESH_TTL_MS,
    providerAccountId: res.merchant_id ?? fallbackMerchant,
  };
}

/**
 * A refused grant. Cashfree does not document an OAuth error body, so any 4xx on the token
 * endpoint is read as the grant being dead: a code past its five minutes, or a refresh token
 * already rotated away. Retrying either can never succeed, and calling it `invalid_grant` is
 * what moves the account to `needs_reconnect` instead of failing forever.
 */
const grantRefused = (status: number): ProviderErrorCode =>
  status >= 400 && status < 500 && status !== 429 ? "invalid_grant" : classify(status);

// https://www.cashfree.com/docs/partners/embedded/oauth-flow — POST /partners/oauth/token
export async function cashfreeExchangeCode(env: Bindings, code: string): Promise<OAuthTokens> {
  const res = await cashfreeCall<CashfreeTokenResponse>(
    `${cashfreePartnerBase(env)}/oauth/token`,
    { method: "POST", headers: partnerHeaders(env), body: { grant_type: "authorization_code", code } },
    grantRefused,
  );
  return tokensFrom(res, null);
}

// https://www.cashfree.com/docs/partners/embedded/oauth-flow — grant_type=refresh_token
export async function cashfreeRefresh(env: Bindings, refreshToken: string, merchantId: string | null = null): Promise<OAuthTokens> {
  const res = await cashfreeCall<CashfreeTokenResponse>(
    `${cashfreePartnerBase(env)}/oauth/token`,
    { method: "POST", headers: partnerHeaders(env), body: { grant_type: "refresh_token", refresh_token: refreshToken } },
    grantRefused,
  );
  return tokensFrom(res, merchantId);
}

// https://www.cashfree.com/docs/partners/embedded/oauth-flow — POST /partners/oauth/<merchant-id>/revoke
export async function cashfreeRevoke(env: Bindings, merchantId: string): Promise<void> {
  await cashfreeCall(`${cashfreePartnerBase(env)}/oauth/${encodeURIComponent(merchantId)}/revoke`, {
    method: "POST",
    headers: partnerHeaders(env),
    body: {},
  });
}

// ─────────────────────────────── onboarding ───────────────────────────────

export interface CashfreeMerchantInput {
  merchantId: string;
  email: string;
  phone: string;
  businessName: string;
  businessType: string;
  website: string;
  signatoryName: string;
  returnUrl: string;
}

/**
 * Create a Cashfree account for an admin who has none, and hand back the KYC link.
 *
 * `merchant_already_exists` (409) is not a failure: the email already has a Cashfree account,
 * and the right move is the Connect button, so the caller is told to use OAuth instead.
 */
// https://www.cashfree.com/docs/api-reference/platforms/latest/merchant-onboarding/create-merchant
// https://www.cashfree.com/docs/api-reference/platforms/latest/merchant-onboarding/create-standard-onboarding-link-with-login-required-by-merchant
export async function cashfreeCreateMerchant(
  env: Bindings,
  input: CashfreeMerchantInput,
): Promise<{ onboardingUrl: string; merchantId: string } | { useOAuth: true }> {
  if (!env.CASHFREE_PARTNER_API_KEY) throw new ProviderError("bad_request", "cashfree_not_configured");
  const headers = { "x-partner-apikey": env.CASHFREE_PARTNER_API_KEY, "x-api-version": CASHFREE_PARTNER_API_VERSION };
  try {
    await cashfreeCall(`${cashfreePartnerBase(env)}/merchants`, {
      method: "POST",
      headers,
      body: {
        merchant_id: input.merchantId,
        merchant_email: input.email,
        merchant_name: input.businessName,
        poc_phone: input.phone,
        merchant_site_url: input.website,
        business_type: input.businessType,
        business_model: "B2C",
        signatory_name: input.signatoryName,
      },
    });
  } catch (err) {
    if (err instanceof ProviderError && (err.httpStatus === 409 || err.message.startsWith("merchant_already_exists"))) {
      return { useOAuth: true };
    }
    throw err;
  }
  const link = await cashfreeCall<{ onboarding_link?: string }>(
    `${cashfreePartnerBase(env)}/merchants/${encodeURIComponent(input.merchantId)}/onboarding_link/standard`,
    { method: "POST", headers, body: { type: "account_onboarding", return_url: input.returnUrl } },
  );
  if (!link.onboarding_link) throw new ProviderError("upstream", "cashfree_onboarding_link_missing");
  return { onboardingUrl: link.onboarding_link, merchantId: input.merchantId };
}

// ─────────────────────────────── adapter ───────────────────────────────

/** Cashfree's `customer_id`: 3–50 characters, alphanumeric. */
function customerId(id: string): string {
  const clean = id.replace(/[^A-Za-z0-9]/g, "").slice(0, 50);
  return clean.length >= 3 ? clean : `cust${clean}`;
}

/**
 * Cashfree wants a ten-digit phone. An Indian number arriving as `+91 98765 43210` is sent as
 * its last ten digits; anything else is sent as its digits and Cashfree judges it.
 */
export function cashfreePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** ISO 8601 with an explicit offset, which is the only form `order_expiry_time` documents. */
function isoWithOffset(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

interface CashfreeOrder {
  cf_order_id?: string | number;
  order_id: string;
  payment_session_id?: string;
  order_status?: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED";
  order_amount?: number;
  order_currency?: string;
}

interface CashfreePayment {
  cf_payment_id?: string | number;
  payment_status?: string;
  payment_amount?: number;
  payment_currency?: string;
  payment_time?: string;
  payment_completion_time?: string;
  error_details?: { error_description?: string; error_reason?: string } | null;
}

interface CashfreeRefund {
  refund_status?: string;
  refund_amount?: number;
}

export function createCashfreeAdapter(env: Bindings, creds: CashfreeCredentials): PaymentProviderAdapter {
  const mode = cashfreeMode(env);
  const base = cashfreePgBase(env);
  const headers = (extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${creds.accessToken}`,
    "x-api-version": CASHFREE_PG_API_VERSION,
    ...extra,
  });

  return {
    provider: "cashfree",

    // https://www.cashfree.com/docs/api-reference/payments/previous/v2023-08-01/orders/create
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      /**
       * A phone number is required by Cashfree, full stop. Refused here with a code the session
       * flow can recognise and turn into "what number should the receipt go to?" — rather than
       * sending a placeholder the respondent never gave, which Cashfree would text.
       */
      if (!req.customer.phone) throw new ProviderError("bad_request", "phone_required");

      const order = await cashfreeCall<CashfreeOrder>(`${base}/orders`, {
        method: "POST",
        headers: headers({ "x-idempotency-key": req.idempotencyKey, "x-request-id": req.recordId }),
        body: {
          order_id: req.recordId,
          order_amount: fromMinorUnits(req.amountMinor, req.currency),
          order_currency: req.currency.toUpperCase(),
          customer_details: {
            customer_id: customerId(req.customer.id),
            customer_phone: cashfreePhone(req.customer.phone),
            customer_name: req.customer.name || undefined,
            customer_email: req.customer.email || undefined,
          },
          order_meta: { return_url: req.returnUrl },
          order_expiry_time: isoWithOffset(req.expiresAt),
          order_note: req.title.length >= 3 ? req.title.slice(0, 200) : undefined,
        },
      });
      if (!order.payment_session_id) throw new ProviderError("upstream", "cashfree_session_missing");
      return {
        providerOrderId: order.order_id,
        launch: { kind: "cashfree_sdk", orderId: order.order_id, paymentSessionId: order.payment_session_id, mode },
      };
    },

    /**
     * The order, then its payments, then — only once something has been paid — its refunds.
     * The order alone is not enough: `order_status` stays `ACTIVE` while a respondent retries
     * after a failed attempt, and it never says refunded.
     */
    // https://www.cashfree.com/docs/api-reference/payments/latest/payments/get-payments-for-an-order
    async fetchStatus(orderId: string): Promise<ProviderPaymentStatus> {
      const id = encodeURIComponent(orderId);
      const order = await cashfreeCall<CashfreeOrder>(`${base}/orders/${id}`, { method: "GET", headers: headers() });
      const payments = await cashfreeCall<CashfreePayment[]>(`${base}/orders/${id}/payments`, {
        method: "GET",
        headers: headers(),
      });
      const currency = (order.order_currency ?? "INR").toUpperCase();
      const amountMinor = toMinorUnits(order.order_amount ?? 0, currency);
      const list = Array.isArray(payments) ? payments : [];

      const success = list.find((p) => p.payment_status === "SUCCESS");
      if (success) {
        const refunds = await cashfreeCall<CashfreeRefund[]>(`${base}/orders/${id}/refunds`, {
          method: "GET",
          headers: headers(),
        }).catch(() => [] as CashfreeRefund[]);
        const refundList = Array.isArray(refunds) ? refunds : [];
        const refundedMinor = refundList
          .filter((r) => r.refund_status === "SUCCESS")
          .reduce((sum, r) => sum + toMinorUnits(r.refund_amount ?? 0, currency), 0);
        /*
         * A refund Cashfree has taken in but not finished. `PENDING` and `ONHOLD` can last
         * days, and for all of them the payment still reads SUCCESS here — so without this
         * a respondent whose refund is in flight looks, to everything above, exactly like
         * one who was never refunded. A partial SUCCESS refund counts too: the payment no
         * longer covers what it was taken for.
         */
        const refundPending =
          refundedMinor < amountMinor &&
          (refundedMinor > 0 ||
            refundList.some((r) => !["SUCCESS", "FAILED", "CANCELLED"].includes((r.refund_status ?? "").toUpperCase())));
        const when = Date.parse(success.payment_completion_time ?? success.payment_time ?? "");
        return {
          status: refundedMinor > 0 && refundedMinor >= amountMinor ? "refunded" : "paid",
          providerPaymentId: success.cf_payment_id != null ? String(success.cf_payment_id) : null,
          amountMinor: success.payment_amount != null ? toMinorUnits(success.payment_amount, currency) : amountMinor,
          currency: (success.payment_currency ?? currency).toUpperCase(),
          paidAt: Number.isFinite(when) ? when : null,
          ...(refundPending ? { refundPending: true } : {}),
        };
      }

      if (order.order_status === "EXPIRED" || order.order_status === "TERMINATED") {
        return { status: "expired", amountMinor, currency };
      }
      const failed = list.find((p) => ["FAILED", "USER_DROPPED", "CANCELLED", "VOID"].includes(p.payment_status ?? ""));
      if (failed && !list.some((p) => p.payment_status === "PENDING")) {
        return {
          status: "failed",
          amountMinor,
          currency,
          failureReason: failed.error_details?.error_description ?? failed.payment_status?.toLowerCase() ?? "failed",
        };
      }
      return { status: "created", amountMinor, currency };
    },

    /**
     * The merchant's name, from the partner API. A lookup that fails still yields a usable
     * description — the merchant id is what matters, and it came with the token.
     */
    // https://www.cashfree.com/docs/api-reference/platforms/latest/merchant-onboarding/get-merchant-status
    async describeAccount(): Promise<AccountDescription> {
      let label = `Cashfree ${creds.merchantId}`;
      if (env.CASHFREE_PARTNER_API_KEY) {
        try {
          const merchant = await cashfreeCall<{ merchant_name?: string; merchant_email?: string }>(
            `${cashfreePartnerBase(env)}/merchants/${encodeURIComponent(creds.merchantId)}`,
            {
              method: "GET",
              headers: { "x-partner-apikey": env.CASHFREE_PARTNER_API_KEY, "x-api-version": CASHFREE_PARTNER_API_VERSION },
            },
          );
          label = merchant.merchant_name || merchant.merchant_email || label;
        } catch {
          /* keep the id-based label */
        }
      }
      // INR only until Cashfree confirms international collection works for OAuth-linked merchants.
      return { providerAccountId: creds.merchantId, label, currencies: ["INR"], environment: cashfreeEnvironment(env) };
    },

    async revoke(): Promise<void> {
      await cashfreeRevoke(env, creds.merchantId);
    },
  };
}

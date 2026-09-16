import { describe, it, expect, afterEach } from "vitest";
import { env } from "cloudflare:test";
import type { Bindings } from "../src/env.js";
import {
  createStripeAdapter,
  encodeStripeForm,
  setupStripeRestrictedKey,
  StripeApiError,
  StripeSetupError,
  STRIPE_WEBHOOK_EVENTS,
  stripeSessionStatus,
  toStripeAmount,
} from "../src/lib/payments/stripe.js";
import { createCashfreeAdapter, cashfreeRefresh, cashfreePhone } from "../src/lib/payments/cashfree.js";
import { createRazorpayAdapter, razorpayRefresh, razorpayAuthorizeUrl } from "../src/lib/payments/razorpay.js";
import { ProviderError, type CheckoutRequest } from "../src/lib/payments/types.js";

/**
 * The gateway adapters, against a recorded `fetch`.
 *
 * What is pinned is the request each gateway receives — URL, headers, encoding, the fields that
 * tie an order back to our record — and how each gateway's answer is translated into the one
 * status vocabulary everything above the adapters speaks. Nothing here reaches a real gateway.
 */

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function mockFetch(handler: (call: Call) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
    };
    calls.push(call);
    const res = await handler(call);
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const E = env as unknown as Bindings;

const request = (over: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  recordId: "rpay_test0001",
  amountMinor: 49900,
  currency: "INR",
  title: "Workshop ticket",
  description: "One seat",
  customer: { id: "usr_abc_123", name: "Ada", email: "ada@example.com", phone: "+91 98765 43210" },
  returnUrl: "https://chatform.in/pay/return?r=rpay_test0001",
  cancelUrl: "https://chatform.in/pay/return?r=rpay_test0001&cancel=1",
  expiresAt: Date.now() + 30 * 60_000,
  idempotencyKey: "idem-rpay_test0001-1",
  ...over,
});

describe("Stripe", () => {
  it("form-encodes nested params the way Stripe expects", () => {
    const encoded = encodeStripeForm({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "usd", product_data: { name: "A & B" } } }],
      metadata: { record_id: "rpay_1" },
      skipped: undefined,
      nulled: null,
      expand: ["payment_intent.latest_charge"],
    });
    const parsed = [...new URLSearchParams(encoded)];
    expect(parsed).toEqual([
      ["mode", "payment"],
      ["line_items[0][quantity]", "1"],
      ["line_items[0][price_data][currency]", "usd"],
      ["line_items[0][price_data][product_data][name]", "A & B"],
      ["metadata[record_id]", "rpay_1"],
      ["expand[0]", "payment_intent.latest_charge"],
    ]);
  });

  it("creates a Checkout Session with the record tied in, on a restricted key", async () => {
    mockFetch(() => ({ body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } }));
    const adapter = createStripeAdapter({ kind: "restricted_key", key: "rk_test_abc123456789" }, "test");
    const before = Math.floor(Date.now() / 1000);
    const result = await adapter.createCheckout(request({ currency: "USD", amountMinor: 1999, expiresAt: Date.now() + 60_000 }));

    expect(result).toEqual({
      providerOrderId: "cs_test_1",
      launch: { kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1", sessionId: "cs_test_1" },
    });
    const [call] = calls;
    expect(call!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(call!.method).toBe("POST");
    expect(call!.headers.get("authorization")).toBe("Bearer rk_test_abc123456789");
    expect(call!.headers.get("stripe-account")).toBeNull();
    expect(call!.headers.get("idempotency-key")).toBe("idem-rpay_test0001-1");
    expect(call!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(call!.headers.get("stripe-version")).toBeTruthy();

    const form = new URLSearchParams(call!.body);
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("1999");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("client_reference_id")).toBe("rpay_test0001");
    expect(form.get("metadata[record_id]")).toBe("rpay_test0001");
    expect(form.get("payment_intent_data[metadata][record_id]")).toBe("rpay_test0001");
    expect(form.get("success_url")).toBe("https://chatform.in/pay/return?r=rpay_test0001");
    expect(form.get("customer_email")).toBe("ada@example.com");
    // One minute asked for; Stripe's floor is thirty.
    expect(Number(form.get("expires_at"))).toBeGreaterThanOrEqual(before + 30 * 60);
  });

  it("sends Stripe its own minor units where they differ from ISO 4217, and reads them back", async () => {
    // Ar 5000: two decimals in ISO, none at Stripe.
    expect(toStripeAmount(500000, "MGA")).toBe(5000);
    expect(toStripeAmount(500050, "MGA")).toBeNull();
    // 5000 kr: no decimals in ISO, still written with two at Stripe.
    expect(toStripeAmount(5000, "ISK")).toBe(500000);
    expect(toStripeAmount(5000, "UGX")).toBe(500000);
    // Three decimals, but Stripe wants the last one to be zero.
    expect(toStripeAmount(12340, "KWD")).toBe(12340);
    expect(toStripeAmount(12345, "KWD")).toBeNull();
    expect(toStripeAmount(1999, "USD")).toBe(1999);
    expect(toStripeAmount(500, "JPY")).toBe(500);

    mockFetch(() => ({ body: { id: "cs_isk", url: "https://checkout.stripe.com/c/pay/cs_isk" } }));
    const adapter = createStripeAdapter({ kind: "restricted_key", key: "rk_test_abc123456789" }, "test");
    await adapter.createCheckout(request({ currency: "ISK", amountMinor: 5000 }));
    expect(new URLSearchParams(calls[0]!.body).get("line_items[0][price_data][unit_amount]")).toBe("500000");
    // The confirmation is compared against the record in ISO units, so it has to come back in them.
    expect(stripeSessionStatus({ id: "cs_isk", payment_status: "paid", amount_total: 500000, currency: "isk" }).amountMinor).toBe(5000);
    expect(stripeSessionStatus({ id: "cs_mga", payment_status: "paid", amount_total: 5000, currency: "mga" }).amountMinor).toBe(500000);

    await expect(adapter.createCheckout(request({ currency: "KWD", amountMinor: 12345 }))).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("sends Stripe-Account with the platform key for the Connect variant", async () => {
    mockFetch(() => ({ body: { id: "acct_merchant", default_currency: "eur", settings: { dashboard: { display_name: "Merchant" } } } }));
    const adapter = createStripeAdapter({ kind: "connect", platformKey: "sk_live_platform", accountId: "acct_merchant" }, "live");
    const description = await adapter.describeAccount();
    expect(description).toEqual({ providerAccountId: "acct_merchant", label: "Merchant", currencies: ["EUR"], environment: "live" });
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/account");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer sk_live_platform");
    expect(calls[0]!.headers.get("stripe-account")).toBe("acct_merchant");
  });

  it("maps sessions to paid, refunded, expired, failed and created", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ status: "complete", payment_status: "paid", payment_intent: { id: "pi_1", latest_charge: { id: "ch", created: 1700000000, refunded: false } } }, "paid"],
      [{ status: "complete", payment_status: "paid", payment_intent: { id: "pi_1", latest_charge: { id: "ch", created: 1700000000, refunded: true } } }, "refunded"],
      [{ status: "expired", payment_status: "unpaid", payment_intent: null }, "expired"],
      [{ status: "complete", payment_status: "unpaid", payment_intent: { id: "pi_1", last_payment_error: { message: "Bank declined" } } }, "failed"],
      [{ status: "open", payment_status: "unpaid", payment_intent: null }, "created"],
    ];
    for (const [session, expected] of cases) {
      mockFetch(() => ({ body: { id: "cs_1", amount_total: 1999, currency: "usd", ...session } }));
      const status = await createStripeAdapter({ kind: "restricted_key", key: "rk_test_x1234567890" }, "test").fetchStatus("cs_1");
      expect(status.status, expected).toBe(expected);
      expect(status.amountMinor).toBe(1999);
      expect(status.currency).toBe("USD");
      expect(calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions/cs_1?expand%5B0%5D=payment_intent.latest_charge");
      if (expected === "paid") expect(status).toMatchObject({ providerPaymentId: "pi_1", paidAt: 1700000000000 });
    }
  });

  it("classifies Stripe errors and names a missing restricted-key permission", async () => {
    mockFetch(() => ({ status: 401, body: { error: { type: "invalid_request_error", message: "Invalid API Key provided: rk_test_***" } } }));
    const adapter = createStripeAdapter({ kind: "restricted_key", key: "rk_test_x1234567890" }, "test");
    await expect(adapter.fetchStatus("cs_1")).rejects.toMatchObject({ code: "unauthorized", httpStatus: 401 });

    mockFetch(() => ({
      status: 403,
      body: {
        error: {
          type: "invalid_request_error",
          message:
            "The provided key 'rk_test_***' does not have the required permissions for this endpoint on account 'acct_1'. Having the 'rak_checkout_session_write' permission would allow this request to continue.",
        },
      },
    }));
    const err = await adapter.createCheckout(request({ currency: "USD" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeApiError);
    expect((err as StripeApiError).permission).toBe("rak_checkout_session_write");
  });

  describe("setupStripeRestrictedKey", () => {
    it("refuses a full secret key before calling Stripe", async () => {
      mockFetch(() => ({ body: {} }));
      const err = await setupStripeRestrictedKey("sk_live_51Habcdefghijk", "https://x").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StripeSetupError);
      expect((err as StripeSetupError).code).toBe("full_secret_key");
      expect((await setupStripeRestrictedKey("pk_live_nope", "https://x").catch((e: StripeSetupError) => e)).code).toBe("invalid_key");
      expect(calls).toHaveLength(0);
    });

    it("reads the account, proves checkout works, and subscribes the endpoint", async () => {
      mockFetch((call) => {
        if (call.url.endsWith("/v1/account")) return { body: { id: "acct_42", default_currency: "usd", business_profile: { name: "Acme" } } };
        if (call.url.endsWith("/v1/checkout/sessions")) return { body: { id: "cs_probe", url: "https://checkout" } };
        if (call.url.endsWith("/v1/checkout/sessions/cs_probe/expire")) return { body: { id: "cs_probe", status: "expired" } };
        if (call.url.endsWith("/v1/webhook_endpoints")) return { body: { id: "we_1", secret: "whsec_abc" } };
        return { status: 404, body: { error: { message: "no" } } };
      });
      let seen = "";
      const result = await setupStripeRestrictedKey("rk_live_abcdefghijklmnop", (d) => {
        seen = d.providerAccountId;
        return `https://api.example/p/payments/webhooks/stripe/pac_${d.providerAccountId}`;
      });
      expect(seen).toBe("acct_42");
      expect(result).toMatchObject({
        webhookId: "we_1",
        webhookSecret: "whsec_abc",
        description: { providerAccountId: "acct_42", label: "Acme", environment: "live", currencies: ["USD"] },
      });
      expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
        "GET /v1/account",
        "POST /v1/checkout/sessions",
        "POST /v1/checkout/sessions/cs_probe/expire",
        "POST /v1/webhook_endpoints",
      ]);
      const hook = new URLSearchParams(calls[3]!.body);
      expect(hook.get("url")).toBe("https://api.example/p/payments/webhooks/stripe/pac_acct_42");
      expect(hook.getAll("enabled_events[0]")).toEqual([STRIPE_WEBHOOK_EVENTS[0]]);
      expect([...hook.keys()].filter((k) => k.startsWith("enabled_events"))).toHaveLength(STRIPE_WEBHOOK_EVENTS.length);
    });

    it("says which permission is missing", async () => {
      mockFetch((call) => {
        if (call.url.endsWith("/v1/account")) return { body: { id: "acct_42", default_currency: "usd" } };
        if (call.url.includes("/v1/checkout/sessions")) return { body: { id: "cs_probe" } };
        return {
          status: 403,
          body: { error: { message: "The provided key 'rk_live_***' … Having the 'rak_webhook_write' permission would allow this request to continue." } },
        };
      });
      const err = (await setupStripeRestrictedKey("rk_live_abcdefghijklmnop", "https://x").catch((e: unknown) => e)) as StripeSetupError;
      expect(err.code).toBe("missing_permission");
      expect(err.permission).toBe("rak_webhook_write");
    });
  });
});

describe("Cashfree", () => {
  const creds = { accessToken: "cf_access_token", refreshToken: "cf_refresh", merchantId: "cfm_1" };

  it("creates an order as the merchant, with our record as the order id", async () => {
    mockFetch(() => ({ body: { order_id: "rpay_test0001", payment_session_id: "session_abc", order_status: "ACTIVE" } }));
    const result = await createCashfreeAdapter(E, creds).createCheckout(request());
    expect(result).toEqual({
      providerOrderId: "rpay_test0001",
      launch: { kind: "cashfree_sdk", orderId: "rpay_test0001", paymentSessionId: "session_abc", mode: "sandbox" },
    });
    const [call] = calls;
    expect(call!.url).toBe("https://sandbox.cashfree.com/pg/orders");
    expect(call!.headers.get("authorization")).toBe("Bearer cf_access_token");
    expect(call!.headers.get("x-api-version")).toBe("2023-08-01");
    expect(call!.headers.get("x-idempotency-key")).toBe("idem-rpay_test0001-1");
    const body = JSON.parse(call!.body);
    expect(body).toMatchObject({
      order_id: "rpay_test0001",
      order_amount: 499,
      order_currency: "INR",
      customer_details: { customer_id: "usrabc123", customer_phone: "9876543210", customer_email: "ada@example.com" },
      order_meta: { return_url: "https://chatform.in/pay/return?r=rpay_test0001" },
    });
    expect(body.order_expiry_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
  });

  it("refuses to create an order without a phone, before calling Cashfree", async () => {
    mockFetch(() => ({ body: {} }));
    const err = await createCashfreeAdapter(E, creds)
      .createCheckout(request({ customer: { id: "usr_1", email: "a@b.c" } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: "bad_request", message: "phone_required" });
    expect(calls).toHaveLength(0);
  });

  it("uses the production host when told to", async () => {
    mockFetch(() => ({ body: { order_id: "rpay_test0001", payment_session_id: "s" } }));
    await createCashfreeAdapter({ ...E, CASHFREE_ENVIRONMENT: "production" }, creds).createCheckout(request());
    expect(calls[0]!.url).toBe("https://api.cashfree.com/pg/orders");
  });

  it("normalises Indian phone numbers", () => {
    expect(cashfreePhone("+91 98765 43210")).toBe("9876543210");
    expect(cashfreePhone("09876543210")).toBe("9876543210");
    expect(cashfreePhone("9876543210")).toBe("9876543210");
  });

  it("maps an order and its payments", async () => {
    const run = async (order: Record<string, unknown>, payments: unknown[], refunds: unknown[] = []) => {
      mockFetch((call) => {
        if (call.url.endsWith("/payments")) return { body: payments };
        if (call.url.endsWith("/refunds")) return { body: refunds };
        return { body: { order_id: "rpay_1", order_amount: 499, order_currency: "INR", ...order } };
      });
      return createCashfreeAdapter(E, creds).fetchStatus("rpay_1");
    };
    const paid = await run({ order_status: "PAID" }, [
      { cf_payment_id: 12, payment_status: "FAILED" },
      { cf_payment_id: 5114910270045, payment_status: "SUCCESS", payment_amount: 499, payment_currency: "INR", payment_completion_time: "2026-09-16T10:00:00+05:30" },
    ]);
    expect(paid).toMatchObject({ status: "paid", providerPaymentId: "5114910270045", amountMinor: 49900, currency: "INR" });
    expect(paid.paidAt).toBe(Date.parse("2026-09-16T10:00:00+05:30"));

    expect((await run({ order_status: "PAID" }, [{ cf_payment_id: 1, payment_status: "SUCCESS", payment_amount: 499 }], [{ refund_status: "SUCCESS", refund_amount: 499 }])).status).toBe("refunded");
    expect((await run({ order_status: "EXPIRED" }, [])).status).toBe("expired");
    expect((await run({ order_status: "ACTIVE" }, [{ payment_status: "USER_DROPPED" }])).status).toBe("failed");
    expect((await run({ order_status: "ACTIVE" }, [{ payment_status: "FAILED" }, { payment_status: "PENDING" }])).status).toBe("created");
    expect((await run({ order_status: "ACTIVE" }, [])).status).toBe("created");
  });

  it("reads a refused refresh as a dead grant", async () => {
    mockFetch(() => ({ status: 401, body: { message: "refresh token invalid", code: "invalid_refresh_token" } }));
    const err = await cashfreeRefresh({ ...E, CASHFREE_PARTNER_API_KEY: "k", CASHFREE_PARTNER_CLIENT_ID: "c" }, "old").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "invalid_grant" });
    expect(calls[0]!.url).toBe("https://api-sandbox.cashfree.com/partners/oauth/token");
    expect(calls[0]!.headers.get("x-partner-apikey")).toBe("k");
    expect(calls[0]!.headers.get("oauth-client-id")).toBe("c");
    expect(JSON.parse(calls[0]!.body)).toEqual({ grant_type: "refresh_token", refresh_token: "old" });
  });
});

describe("Razorpay", () => {
  const creds = { accessToken: "rzp_access", refreshToken: "rzp_refresh", publicToken: "rzp_test_oauth_pub", accountId: "acc_1" };
  const configured = { ...E, RAZORPAY_OAUTH_CLIENT_ID: "client_1", RAZORPAY_OAUTH_CLIENT_SECRET: "secret_1" };

  it("creates an order with the record as receipt and launches with the public token", async () => {
    mockFetch(() => ({ body: { id: "order_abc", amount: 49900, currency: "INR", status: "created" } }));
    const result = await createRazorpayAdapter(E, creds).createCheckout(request());
    expect(calls[0]!.url).toBe("https://api.razorpay.com/v1/orders");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer rzp_access");
    expect(JSON.parse(calls[0]!.body)).toEqual({ amount: 49900, currency: "INR", receipt: "rpay_test0001", notes: { record_id: "rpay_test0001" } });
    expect(result).toMatchObject({
      providerOrderId: "order_abc",
      launch: { kind: "razorpay_checkout", orderId: "order_abc", key: "rzp_test_oauth_pub", amountMinor: 49900, currency: "INR", prefill: { contact: "+91 98765 43210" } },
    });
    expect(JSON.stringify(result.launch)).not.toContain("rzp_access");
  });

  it("maps captured, authorized-then-captured, refused capture and failed payments", async () => {
    const run = async (items: unknown[], capture?: { status?: number; body: unknown }) => {
      mockFetch((call) => {
        if (call.url.endsWith("/capture")) return capture ?? { body: {} };
        if (call.url.endsWith("/payments")) return { body: { entity: "collection", count: items.length, items } };
        return { body: { id: "order_1", amount: 49900, currency: "INR" } };
      });
      return createRazorpayAdapter(E, creds).fetchStatus("order_1");
    };
    expect(await run([{ id: "pay_1", status: "captured", amount: 49900, currency: "INR", created_at: 1700000000 }])).toMatchObject({
      status: "paid",
      providerPaymentId: "pay_1",
      paidAt: 1700000000000,
    });

    const captured = await run([{ id: "pay_2", status: "authorized", amount: 49900, currency: "INR" }], {
      body: { id: "pay_2", status: "captured", amount: 49900, currency: "INR" },
    });
    expect(captured.status).toBe("paid");
    const capture = calls.find((c) => c.url.endsWith("/capture"))!;
    expect(capture.url).toBe("https://api.razorpay.com/v1/payments/pay_2/capture");
    expect(JSON.parse(capture.body)).toEqual({ amount: 49900, currency: "INR" });

    expect((await run([{ id: "pay_3", status: "authorized", amount: 49900 }], { status: 400, body: { error: { code: "BAD_REQUEST_ERROR" } } })).status).toBe("created");
    expect(await run([{ id: "pay_4", status: "failed", error_description: "Card declined" }])).toMatchObject({ status: "failed", failureReason: "Card declined" });
    expect((await run([{ id: "pay_5", status: "refunded", amount: 49900, amount_refunded: 49900 }])).status).toBe("refunded");
    expect((await run([])).status).toBe("created");
  });

  it("builds the consent URL and reads invalid_grant on refresh", async () => {
    const url = new URL(razorpayAuthorizeUrl(configured, "nonce.mac", "http://localhost/api/payment-accounts/oauth/razorpay/callback"));
    expect(url.origin + url.pathname).toBe("https://auth.razorpay.com/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client_1",
      response_type: "code",
      redirect_uri: "http://localhost/api/payment-accounts/oauth/razorpay/callback",
      scope: "read_write",
      state: "nonce.mac",
    });

    mockFetch(() => ({ status: 400, body: { error: "invalid_grant", error_description: "Token has been revoked" } }));
    await expect(razorpayRefresh(configured, "dead")).rejects.toMatchObject({ code: "invalid_grant" });
    expect(JSON.parse(calls[0]!.body)).toEqual({ client_id: "client_1", client_secret: "secret_1", grant_type: "refresh_token", refresh_token: "dead" });
  });
});

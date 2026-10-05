import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { webOrigins } from "../src/lib/origins.js";
import { open } from "../src/lib/secret-box.js";
import { startImpersonation } from "../src/lib/impersonation.js";
import {
  AccountConflictError,
  loadAccountById,
  loadAccountForOrg,
  openCredentials,
  saveOAuthAccount,
  saveStripeConnectAccount,
  sweepPaymentTokens,
  withAdapter,
} from "../src/lib/payments/accounts.js";
import { signOAuthState } from "../src/lib/payments/oauth-state.js";
import { ProviderError, type PaymentAccountRow } from "../src/lib/payments/types.js";

/**
 * Connected payment accounts: storage, token freshness, and the connect routes.
 *
 * The properties worth defending here are the ones that fail silently in production: two
 * requests refreshing one rotating token at once (the loser kills a healthy account), an OAuth
 * callback completed by the wrong person, another tenant's account id that answers anything but
 * 404, and one bad platform key read as every Stripe merchant having revoked us.
 */

const E = env as unknown as Bindings;
const mutableEnv = env as unknown as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};
function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (!(k in saved)) saved[k] = mutableEnv[k];
    mutableEnv[k] = v;
  }
}

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_pay_${orgId}`, orgId, `dodo_pay_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

let a: Tenant;
let b: Tenant;
let free: Tenant;

beforeAll(async () => {
  await applySchema();
  a = await seedTenant("payacc_a");
  b = await seedTenant("payacc_b");
  free = await seedTenant("payacc_free");
  await subscribePro(a.orgId);
  await subscribePro(b.orgId);
  setEnv({
    PAYMENTS_GATEWAY_ENABLED: "on",
    RAZORPAY_OAUTH_CLIENT_ID: "rzp_client_test",
    RAZORPAY_OAUTH_CLIENT_SECRET: "rzp_client_secret_test",
    CASHFREE_PARTNER_CLIENT_ID: "cf_client_test",
    CASHFREE_PARTNER_API_KEY: "cf_partner_key_test",
    STRIPE_PLATFORM_SECRET_KEY: "sk_test_platform1234567890",
    STRIPE_CONNECT_CLIENT_ID: "ca_test_client",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_test_connect",
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) mutableEnv[k] = v;
});

function cashfreeTokens(over: Partial<Parameters<typeof saveOAuthAccount>[1]["tokens"]> = {}) {
  return {
    accessToken: "cf_old_access",
    refreshToken: "cf_old_refresh",
    accessExpiresAt: Date.now() + 60 * 60_000,
    refreshExpiresAt: Date.now() + 80 * 86_400_000,
    providerAccountId: null,
    ...over,
  };
}

async function cashfreeAccount(orgId: string, merchant: string, tokens = cashfreeTokens()): Promise<PaymentAccountRow> {
  return saveOAuthAccount(E, {
    orgId,
    userId: null,
    provider: "cashfree",
    tokens,
    description: { providerAccountId: merchant, label: `Cashfree ${merchant}`, currencies: ["INR"], environment: "test" },
  });
}

const tokenReply = (access: string, refresh: string) => ({
  body: { access_token: access, refresh_token: refresh, expires_in: 86_400, merchant_id: "ignored", token_type: "bearer" },
});

// ─────────────────────────────── storage ───────────────────────────────

describe("account storage", () => {
  it("seals credentials bound to the row, and never stores a token in the clear", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_seal");
    const raw = await env.DB.prepare(`SELECT credentials_enc FROM payment_accounts WHERE id = ?`)
      .bind(acct.id)
      .first<{ credentials_enc: string }>();
    expect(raw!.credentials_enc).toMatch(/^v1:/);
    expect(raw!.credentials_enc).not.toContain("cf_old_access");
    expect(await openCredentials(E, acct)).toMatchObject({ kind: "oauth", accessToken: "cf_old_access" });
    // The same ciphertext on a different row id does not open.
    await expect(open(E, raw!.credentials_enc, "pac_someoneelse")).rejects.toThrow("secret_box_open_failed");
  });

  it("scopes every lookup to the organization", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_scope");
    expect(await loadAccountForOrg(E, a.orgId, acct.id)).not.toBeNull();
    expect(await loadAccountForOrg(E, b.orgId, acct.id)).toBeNull();
  });

  it("updates a reconnect in place and refuses the same merchant in another organization", async () => {
    const first = await cashfreeAccount(a.orgId, "cfm_dupe");
    await env.DB.prepare(`UPDATE payment_accounts SET status = 'needs_reconnect' WHERE id = ?`).bind(first.id).run();
    const again = await cashfreeAccount(a.orgId, "cfm_dupe", cashfreeTokens({ accessToken: "cf_new" }));
    expect(again.id).toBe(first.id);
    expect(again.status).toBe("active");
    expect(await openCredentials(E, again)).toMatchObject({ accessToken: "cf_new" });
    await expect(cashfreeAccount(b.orgId, "cfm_dupe")).rejects.toBeInstanceOf(AccountConflictError);
  });
});

// ─────────────────────────────── token freshness ───────────────────────────────

describe("withAdapter", () => {
  it("refreshes an expired token exactly once when two requests race for it", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_race", cashfreeTokens({ accessExpiresAt: Date.now() - 1000 }));
    let tokenCalls = 0;
    mockFetch(async (call) => {
      if (call.url.endsWith("/partners/oauth/token")) {
        tokenCalls++;
        await sleep(400);
        return tokenReply("cf_race_access", "cf_race_refresh");
      }
      return { status: 404, body: {} };
    });

    const read = (account: PaymentAccountRow) =>
      withAdapter(E, account, async (adapter, current) => {
        expect(adapter.provider).toBe("cashfree");
        return openCredentials(E, current);
      });
    const [one, two] = await Promise.all([read(acct), read(acct)]);

    expect(tokenCalls).toBe(1);
    expect(one).toMatchObject({ accessToken: "cf_race_access", refreshToken: "cf_race_refresh" });
    expect(two).toMatchObject({ accessToken: "cf_race_access" });
    const row = await loadAccountById(E, acct.id);
    expect(row!.refreshLockUntil).toBeNull();
    expect(row!.accessExpiresAt!).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(JSON.parse(calls[0]!.body)).toEqual({ grant_type: "refresh_token", refresh_token: "cf_old_refresh" });
  });

  it("marks the account needs_reconnect when the refresh grant is dead", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_dead", cashfreeTokens({ accessExpiresAt: Date.now() - 1000 }));
    mockFetch(() => ({ status: 401, body: { code: "invalid_refresh_token", message: "expired" } }));
    const err = await withAdapter(E, acct, async () => "unreachable").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("invalid_grant");
    const row = await loadAccountById(E, acct.id);
    expect(row!.status).toBe("needs_reconnect");
    expect(row!.lastError).toContain("Reconnect");
    expect(row!.refreshLockUntil).toBeNull();
    // And it stays refused rather than retrying the dead grant.
    await expect(withAdapter(E, row!, async () => "x")).rejects.toMatchObject({ status: "needs_reconnect" });
  });

  it("forces one refresh and retries once when the gateway refuses a token", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_401");
    let tokenCalls = 0;
    mockFetch((call) => {
      if (call.url.endsWith("/partners/oauth/token")) {
        tokenCalls++;
        return tokenReply("cf_after_401", "cf_after_401_refresh");
      }
      return { status: 404, body: {} };
    });
    let attempts = 0;
    const result = await withAdapter(E, acct, async (_adapter, current) => {
      attempts++;
      const creds = await openCredentials(E, current);
      if (creds.kind === "oauth" && creds.accessToken === "cf_old_access") throw new ProviderError("unauthorized", "token rejected", 401);
      return creds;
    });
    expect(attempts).toBe(2);
    expect(tokenCalls).toBe(1);
    expect(result).toMatchObject({ accessToken: "cf_after_401" });
  });

  it("marks a Stripe account needs_reconnect when Stripe says the platform lost it, and only then", async () => {
    const stripe = await saveStripeConnectAccount(E, {
      orgId: a.orgId,
      userId: null,
      description: { providerAccountId: "acct_refused", label: "Refused", currencies: ["USD"], environment: "test" },
    });
    // Our own key refused: an outage of ours, and nothing about this merchant.
    mockFetch(() => ({ status: 401, body: { error: { message: "Invalid API Key provided" } } }));
    await expect(withAdapter(E, stripe, (adapter) => adapter.fetchStatus("cs_1"))).rejects.toMatchObject({ code: "upstream" });
    expect((await loadAccountById(E, stripe.id))!.status).toBe("active");

    mockFetch(() => ({
      status: 403,
      body: { error: { code: "account_invalid", message: "The provided key does not have access to account 'acct_refused'" } },
    }));
    await expect(withAdapter(E, stripe, (adapter) => adapter.fetchStatus("cs_1"))).rejects.toMatchObject({ code: "invalid_grant" });
    expect((await loadAccountById(E, stripe.id))!.status).toBe("needs_reconnect");
  });

  it("the cron sweep renews tokens that expire within the hour", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_sweep", cashfreeTokens({ accessExpiresAt: Date.now() + 20 * 60_000 }));
    mockFetch((call) =>
      call.url.endsWith("/partners/oauth/token") ? tokenReply("cf_swept", "cf_swept_refresh") : { status: 404, body: {} },
    );
    expect(await sweepPaymentTokens(E)).toBeGreaterThanOrEqual(1);
    expect(await openCredentials(E, (await loadAccountById(E, acct.id))!)).toMatchObject({ accessToken: "cf_swept" });
  });
});

// ─────────────────────────────── routes ───────────────────────────────

const cookieJson = (t: Tenant, extra: Record<string, string> = {}) => ({ cookie: t.cookie, "content-type": "application/json", ...extra });

describe("connect routes", () => {
  it("answers 404 for another organization's account and leaves it connected", async () => {
    const theirs = await cashfreeAccount(b.orgId, "cfm_theirs");
    const res = await fetchApi(`/api/payment-accounts/${theirs.id}`, { method: "DELETE", headers: { cookie: a.cookie } });
    expect(res.status).toBe(404);
    expect((await loadAccountById(E, theirs.id))!.status).toBe("active");

    mockFetch(() => ({ body: { connection_status: "Unlinked" } }));
    const own = await fetchApi(`/api/payment-accounts/${theirs.id}`, { method: "DELETE", headers: { cookie: b.cookie } });
    expect(own.status).toBe(200);
    const row = (await loadAccountById(E, theirs.id))!;
    expect(row.status).toBe("disconnected");
    expect(row.credentialsEnc).toBe("");
    expect(calls[0]!.url).toBe("https://api-sandbox.cashfree.com/partners/oauth/cfm_theirs/revoke");
  });

  it("gates connecting on the plan and on the rollout flag, but not listing", async () => {
    const startBody = JSON.stringify({ returnTo: `${webOrigins(E)[0]}/forms/frm_x/integrate` });
    const locked = await fetchApi("/api/payment-accounts/oauth/stripe/start", {
      method: "POST",
      headers: cookieJson(free),
      body: startBody,
    });
    expect(locked.status).toBe(402);
    expect(((await locked.json()) as { error: { code: string } }).error.code).toBe("feature_locked");
    expect((await fetchApi("/api/payment-accounts", { headers: { cookie: free.cookie } })).status).toBe(200);

    setEnv({ PAYMENTS_GATEWAY_ENABLED: "" });
    try {
      const off = await fetchApi("/api/payment-accounts/oauth/stripe/start", {
        method: "POST",
        headers: cookieJson(a),
        body: startBody,
      });
      expect(off.status).toBe(403);
      expect(((await off.json()) as { error: { code: string } }).error.code).toBe("gateway_payments_disabled");
      const listed = (await (await fetchApi("/api/payment-accounts", { headers: { cookie: a.cookie } })).json()) as { enabled: boolean };
      expect(listed.enabled).toBe(false);

    } finally {
      setEnv({ PAYMENTS_GATEWAY_ENABLED: "on" });
    }
  });

  it("refuses to connect or disconnect while impersonating", async () => {
    setEnv({ PLATFORM_ADMIN_EMAILS: "payacc_a@example.com" });
    try {
      const { token } = await startImpersonation(E, { adminId: a.userId, userId: b.userId, orgId: b.orgId });
      const res = await fetchApi("/api/payment-accounts/oauth/stripe/start", {
        method: "POST",
        headers: cookieJson(a, { "x-chatform-impersonate": token }),
        body: JSON.stringify({ returnTo: `${webOrigins(E)[0]}/forms/frm_x/integrate` }),
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("impersonation_forbidden");
      // Looking is fine.
      expect((await fetchApi("/api/payment-accounts", { headers: { cookie: a.cookie, "x-chatform-impersonate": token } })).status).toBe(200);
    } finally {
      setEnv({ PLATFORM_ADMIN_EMAILS: saved.PLATFORM_ADMIN_EMAILS });
    }
  });
});

describe("OAuth connect", () => {
  const returnTo = () => `${webOrigins(E)[0]}/forms/frm_x/integrate`;

  async function start(t: Tenant, provider = "razorpay"): Promise<string> {
    const res = await fetchApi(`/api/payment-accounts/oauth/${provider}/start`, {
      method: "POST",
      headers: cookieJson(t),
      body: JSON.stringify({ returnTo: returnTo() }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    return new URL(url).searchParams.get("state")!;
  }

  function razorpayTokenEndpoint() {
    mockFetch((call) =>
      call.url === "https://auth.razorpay.com/token"
        ? {
            body: {
              access_token: "rzp_access_cb",
              refresh_token: "rzp_refresh_cb",
              public_token: "rzp_test_oauth_cb",
              token_type: "Bearer",
              expires_in: 7_862_400,
              razorpay_account_id: "acc_callback1",
            },
          }
        : { status: 404, body: {} },
    );
  }

  const callback = (state: string, t?: Tenant, provider = "razorpay") =>
    fetchApi(`/api/payment-accounts/oauth/${provider}/callback?code=authcode&state=${encodeURIComponent(state)}`, {
      headers: t ? { cookie: t.cookie } : {},
    });

  const outcome = (res: Response) => {
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    return { base: `${loc.origin}${loc.pathname}`, payments: loc.searchParams.get("payments"), reason: loc.searchParams.get("reason") };
  };

  it("refuses a returnTo that is not one of the app's origins", async () => {
    const res = await fetchApi("/api/payment-accounts/oauth/razorpay/start", {
      method: "POST",
      headers: cookieJson(a),
      body: JSON.stringify({ returnTo: "https://evil.example/steal" }),
    });
    expect(res.status).toBe(422);
  });

  it("connects when the same signed-in user completes it, exactly once", async () => {
    const state = await start(a);
    expect(state).toMatch(/^[0-9a-f]{32}\.[A-Za-z0-9_-]{24}$/);
    razorpayTokenEndpoint();

    const ok = outcome(await callback(state, a));
    expect(ok).toMatchObject({ payments: "connected", base: returnTo() });
    const exchange = JSON.parse(calls[0]!.body);
    expect(exchange).toMatchObject({ grant_type: "authorization_code", code: "authcode", redirect_uri: "http://localhost/api/payment-accounts/oauth/razorpay/callback", mode: "test" });

    const row = await env.DB.prepare(`SELECT id FROM payment_accounts WHERE organization_id = ? AND provider_account_id = 'acc_callback1'`)
      .bind(a.orgId)
      .first<{ id: string }>();
    expect(row).not.toBeNull();
    const account = (await loadAccountById(E, row!.id))!;
    expect(await openCredentials(E, account)).toMatchObject({ publicToken: "rzp_test_oauth_cb", accessToken: "rzp_access_cb" });

    expect(outcome(await callback(state, a)).reason).toBe("state_used");
  });

  it("refuses a tampered, unknown or expired state", async () => {
    const state = await start(a);
    const [nonce, mac] = state.split(".") as [string, string];
    const flipped = `${nonce}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    expect(outcome(await callback(flipped, a)).reason).toBe("state_bad_signature");
    expect(outcome(await callback(`${"0".repeat(32)}.${mac}`, a)).reason).toBe("state_unknown");
    expect(outcome(await callback("not-a-state", a)).reason).toBe("state_malformed");

    const { state: old } = await signOAuthState(
      E,
      { orgId: a.orgId, userId: a.userId, provider: "razorpay", returnTo: returnTo() },
      Date.now() - 11 * 60_000,
    );
    // Genuine but stale: back to the page that started it, which can say so.
    expect(outcome(await callback(old, a))).toMatchObject({ reason: "state_expired", base: returnTo() });
    // Unreadable: nowhere to trust but the app's own root.
    expect(outcome(await callback(flipped, a)).base).not.toBe(returnTo());
  });

  it("refuses a callback completed by anyone other than the user who started it", async () => {
    razorpayTokenEndpoint();
    const state = await start(a);
    expect(outcome(await callback(state, b))).toMatchObject({ payments: "error", reason: "session_mismatch", base: returnTo() });
    // Spent by the refusal: the rightful user cannot finish a flow someone else touched.
    expect(outcome(await callback(state, a)).reason).toBe("state_used");
    expect(calls).toHaveLength(0);

    const other = await start(a);
    expect(outcome(await callback(other)).reason).toBe("session_mismatch");
  });

  it("takes a Cashfree merchant id from the token exchange, never from the redirect's query", async () => {
    const { state } = await signOAuthState(E, { orgId: a.orgId, userId: a.userId, provider: "cashfree", returnTo: returnTo() });
    // The token response names no merchant; the query string, which the admin controls, names someone else's.
    mockFetch((call) =>
      call.url === "https://api-sandbox.cashfree.com/partners/oauth/token"
        ? { body: { access_token: "cf_access_cb", refresh_token: "cf_refresh_cb", expires_in: 86_400, token_type: "bearer" } }
        : { body: { merchant_name: "Victim Pvt Ltd", merchant_email: "owner@victim.example" } },
    );
    const res = await fetchApi(
      `/api/payment-accounts/oauth/cashfree/callback?code=authcode&merchant_id=cfm_victim&state=${encodeURIComponent(state)}`,
      { headers: { cookie: a.cookie } },
    );
    expect(outcome(res).reason).toBe("no_merchant_id");
    // Nothing was looked up or stored under the id from the query.
    expect(calls.map((c) => c.url)).toEqual(["https://api-sandbox.cashfree.com/partners/oauth/token"]);
    const row = await env.DB.prepare(`SELECT id FROM payment_accounts WHERE provider_account_id = 'cfm_victim'`).first();
    expect(row).toBeNull();
  });

  function stripeConnectEndpoints(accountId: string, livemode = false) {
    mockFetch((call) => {
      if (call.url === "https://connect.stripe.com/oauth/token") return { body: { stripe_user_id: accountId, livemode, scope: "read_write" } };
      if (call.url === "https://connect.stripe.com/oauth/deauthorize") return { body: { stripe_user_id: accountId } };
      if (call.url === "https://api.stripe.com/v1/account") {
        return { body: { id: accountId, default_currency: "usd", business_profile: { name: "Route Co" } } };
      }
      return { status: 404, body: { error: { message: "unexpected" } } };
    });
  }

  it("connects a Stripe account with one approval, storing no key of the merchant's", async () => {
    const res = await fetchApi("/api/payment-accounts/oauth/stripe/start", {
      method: "POST",
      headers: cookieJson(a),
      body: JSON.stringify({ returnTo: returnTo() }),
    });
    const consent = new URL(((await res.json()) as { url: string }).url);
    expect(`${consent.origin}${consent.pathname}`).toBe("https://connect.stripe.com/oauth/authorize");
    expect(Object.fromEntries(consent.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "ca_test_client",
      scope: "read_write",
      redirect_uri: "http://localhost/api/payment-accounts/oauth/stripe/callback",
    });

    stripeConnectEndpoints("acct_route");
    expect(outcome(await callback(consent.searchParams.get("state")!, a, "stripe"))).toMatchObject({ payments: "connected", base: returnTo() });
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer sk_test_platform1234567890");
    expect(new URLSearchParams(calls[0]!.body).get("code")).toBe("authcode");
    // Described on the merchant's account, with the platform's key.
    expect(calls[1]!.headers.get("stripe-account")).toBe("acct_route");

    const row = await env.DB.prepare(`SELECT id FROM payment_accounts WHERE organization_id = ? AND provider_account_id = 'acct_route'`)
      .bind(a.orgId)
      .first<{ id: string }>();
    const account = (await loadAccountById(E, row!.id))!;
    expect(account).toMatchObject({ provider: "stripe", credentialKind: "connect", environment: "test", displayLabel: "Route Co" });
    expect(await openCredentials(E, account)).toEqual({ kind: "connect", accountId: "acct_route" });

    const list = await fetchApi("/api/payment-accounts", { headers: { cookie: a.cookie } });
    const text = await list.text();
    expect(text).not.toContain("sk_test_platform");
    expect(text).not.toContain("credentials");
    const body = JSON.parse(text) as { accounts: { id: string }[]; enabled: boolean; providers: Record<string, { configured: boolean }> };
    expect(body.enabled).toBe(true);
    expect(body.providers).toEqual({ cashfree: { configured: true }, razorpay: { configured: true }, stripe: { configured: true } });
    expect(body.accounts.map((x) => x.id)).toContain(account.id);

    // Connecting it again keeps the row; forms and past payments point at its id.
    stripeConnectEndpoints("acct_route");
    expect(outcome(await callback(await start(a, "stripe"), a, "stripe")).payments).toBe("connected");
    const rows = await env.DB.prepare(`SELECT id FROM payment_accounts WHERE provider_account_id = 'acct_route'`).all<{ id: string }>();
    expect(rows.results.map((r) => r.id)).toEqual([account.id]);

    // The same Stripe account from another organization is refused.
    stripeConnectEndpoints("acct_route");
    expect(outcome(await callback(await start(b, "stripe"), b, "stripe")).reason).toBe("connected_elsewhere");

    // Disconnecting removes chatform from the account at Stripe.
    stripeConnectEndpoints("acct_route");
    const gone = await fetchApi(`/api/payment-accounts/${account.id}`, { method: "DELETE", headers: { cookie: a.cookie } });
    expect(gone.status).toBe(200);
    const deauth = calls.find((c) => c.url === "https://connect.stripe.com/oauth/deauthorize")!;
    expect(Object.fromEntries(new URLSearchParams(deauth.body))).toEqual({ client_id: "ca_test_client", stripe_user_id: "acct_route" });
    expect((await loadAccountById(E, account.id))!.credentialsEnc).toBe("");
  });

  it("refuses a live Stripe account approved against a test platform key", async () => {
    stripeConnectEndpoints("acct_live_one", true);
    expect(outcome(await callback(await start(a, "stripe"), a, "stripe")).reason).toBe("mode_mismatch");
    expect(await env.DB.prepare(`SELECT id FROM payment_accounts WHERE provider_account_id = 'acct_live_one'`).first()).toBeNull();
  });

  it("does not offer Stripe until the platform key, client id and webhook secret are all set", async () => {
    setEnv({ STRIPE_CONNECT_WEBHOOK_SECRET: "" });
    try {
      const res = await fetchApi("/api/payment-accounts/oauth/stripe/start", {
        method: "POST",
        headers: cookieJson(a),
        body: JSON.stringify({ returnTo: returnTo() }),
      });
      expect(res.status).toBe(503);
      const listed = (await (await fetchApi("/api/payment-accounts", { headers: { cookie: a.cookie } })).json()) as {
        providers: Record<string, { configured: boolean }>;
      };
      expect(listed.providers.stripe).toEqual({ configured: false });
    } finally {
      setEnv({ STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_test_connect" });
    }
  });

  it("refuses a provider that does not match the state", async () => {
    const state = await start(a, "razorpay");
    expect(outcome(await callback(state, a, "cashfree")).reason).toBe("provider_mismatch");
  });
});

describe("/v1 parity", () => {
  it("answers the same shapes under payment:read / payment:write", async () => {
    const key = await seedKey(a, "payv1rw", { scopes: { payment: ["read", "write"] } });
    const v1 = await fetchApi("/v1/payment-accounts", { headers: { "x-api-key": key.raw } });
    expect(v1.status).toBe(200);
    const dash = await fetchApi("/api/payment-accounts", { headers: { cookie: a.cookie } });
    expect(await v1.json()).toEqual(await dash.json());

    const theirs = await cashfreeAccount(b.orgId, "cfm_v1_theirs");
    const cross = await fetchApi(`/v1/payment-accounts/${theirs.id}`, { method: "DELETE", headers: { "x-api-key": key.raw } });
    expect(cross.status).toBe(404);
  });

  it("refuses a key without the payment scope", async () => {
    const res = await fetchApi("/v1/payment-accounts", { headers: { "x-api-key": a.apiKeyRaw } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "insufficient_scope", required: "payment:read" } });

    const readOnly = await seedKey(a, "payv1ro", { scopes: { payment: ["read"] } });
    const write = await fetchApi("/v1/payment-accounts/oauth/stripe/start", {
      method: "POST",
      headers: { "x-api-key": readOnly.raw, "content-type": "application/json" },
      body: JSON.stringify({ returnTo: `${webOrigins(E)[0]}/forms/frm_x/integrate` }),
    });
    expect(write.status).toBe(403);
  });
});

describe("cleanup", () => {
  async function insertPayment(t: Tenant, accountId: string, id: string, over: { isTest?: number; createdAt?: number } = {}) {
    const now = over.createdAt ?? Date.now();
    await env.DB.prepare(
      `INSERT INTO respondent_payments (id, organization_id, form_id, session_id, block_ref, payment_account_id, provider, environment,
                                        provider_order_id, amount_minor, currency, status, is_test, created_at, updated_at)
       VALUES (?, ?, ?, 'chs_pay', 'q_pay', ?, 'stripe', 'test', ?, 49900, 'INR', 'created', ?, ?, ?)`,
    )
      .bind(id, t.orgId, t.formId, accountId, `cs_${id}`, over.isTest ?? 0, now, now)
      .run();
  }

  it("revokes the gateway side when an account's workspace is deleted, and the rows go with it", async () => {
    const t = await seedTenant("payacc_del");
    const stripe = await saveStripeConnectAccount(E, {
      orgId: t.orgId,
      userId: t.userId,
      description: { providerAccountId: "acct_delete_me", label: "Delete me", currencies: ["USD"], environment: "test" },
    });
    await insertPayment(t, stripe.id, "rpay_delete_me");

    mockFetch(() => ({ body: { stripe_user_id: "acct_delete_me" } }));
    const res = await fetchApi("/api/auth/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: t.cookie, origin: "http://localhost:3000" },
      body: JSON.stringify({ confirmation: "payacc_del@example.com", password: "supersecret123" }),
    });
    expect(res.ok).toBe(true);
    // Revoked when the account is purged, thirty days on, not when it is scheduled.
    expect(calls.find((c) => c.url.endsWith("/oauth/deauthorize"))).toBeUndefined();
    await env.DB.prepare(`UPDATE users SET deleted_at = ? WHERE id = ?`).bind(Date.now() - 31 * 86_400_000, t.userId).run();
    const { purgeDeletedAccounts } = await import("../src/lib/account-deletion.js");
    await purgeDeletedAccounts(E);

    const deauth = calls.find((c) => c.url === "https://connect.stripe.com/oauth/deauthorize");
    expect(new URLSearchParams(deauth?.body).get("stripe_user_id")).toBe("acct_delete_me");
    expect(await loadAccountById(E, stripe.id)).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM respondent_payments WHERE id = 'rpay_delete_me'`).first()).toBeNull();
  });

  it("prunes test payments past retention and keeps real ones", async () => {
    const acct = await cashfreeAccount(a.orgId, "cfm_prune");
    const old = Date.now() - 31 * 86_400_000;
    await insertPayment(a, acct.id, "rpay_prune_test", { isTest: 1, createdAt: old });
    await insertPayment(a, acct.id, "rpay_prune_real", { isTest: 0, createdAt: old });
    await insertPayment(a, acct.id, "rpay_prune_recent", { isTest: 1 });

    const { pruneTestData } = await import("../src/lib/sweeps.js");
    await pruneTestData(E);
    const ids = (await env.DB.prepare(`SELECT id FROM respondent_payments WHERE id LIKE 'rpay_prune_%'`).all<{ id: string }>()).results.map(
      (r) => r.id,
    );
    expect(ids.sort()).toEqual(["rpay_prune_real", "rpay_prune_recent"]);
  });
});

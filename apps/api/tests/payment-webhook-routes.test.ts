import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import type { SessionDO } from "../src/do/session-do.js";
import { saveStripeKeyAccount } from "../src/lib/payments/accounts.js";

/**
 * The webhook routes with their real signature checks.
 *
 * `gateway-payments.test.ts` swaps every verifier for a header, which is the right trade for
 * testing what happens after a delivery is believed and the wrong one for testing whether it
 * should be. Here nothing about a delivery is mocked: the body is signed with the secret the
 * route really reads — Razorpay's from the environment, Stripe's opened from the account row it
 * was sealed into — and goes through the router, the verifier, the event parser, the dedupe and
 * settlement. Only the gateway's own API, behind `withAdapter`, is faked, because a webhook is a
 * trigger to go and ask it.
 */

const gw = vi.hoisted(() => ({
  orders: new Map<string, { amountMinor: number; currency: string; status: string }>(),
}));

vi.mock("../src/lib/payments/flag.js", () => ({ gatewayEnabled: () => true }));

vi.mock("../src/lib/payments/accounts.js", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  const { ProviderError } = await import("../src/lib/payments/types.js");
  const adapter = (account: { provider: string }) => ({
    provider: account.provider,
    async createCheckout(req: { recordId: string; amountMinor: number; currency: string }) {
      const orderId = `ord_${req.recordId}`;
      gw.orders.set(orderId, { amountMinor: req.amountMinor, currency: req.currency, status: "created" });
      return { providerOrderId: orderId, launch: { kind: "redirect", url: `https://checkout.example/${orderId}`, sessionId: orderId } };
    },
    async fetchStatus(orderId: string) {
      const o = gw.orders.get(orderId);
      if (!o) throw new ProviderError("not_found", "no such order", 404);
      return { status: o.status, providerPaymentId: `pay_${orderId.slice(-6)}`, amountMinor: o.amountMinor, currency: o.currency, paidAt: Date.now() };
    },
    async describeAccount() {
      throw new Error("unused");
    },
  });
  return {
    ...real,
    withAdapter: async (_env: unknown, account: { provider: string }, fn: (a: unknown, acc: unknown) => unknown) =>
      fn(adapter(account), account),
  };
});

const E = env as unknown as Bindings;
const mutableEnv = env as unknown as Record<string, string | undefined>;
const RAZORPAY_SECRET = "rzp_webhook_secret_for_routes";
const STRIPE_SECRET = "whsec_route_test_secret";
let savedRazorpaySecret: string | undefined;

const enc = new TextEncoder();
async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

let t: Tenant;
const STRIPE_ACCOUNT = "pac_routestripe01";
const OTHER_STRIPE_ACCOUNT = "pac_routestripe02";
const GONE_STRIPE_ACCOUNT = "pac_routestripe03";
const RAZORPAY_ACCOUNT = "pac_routerazorpay1";

function doc(account: string) {
  return {
    schemaVersion: 9,
    title: "Routes",
    blocks: [
      { id: "blk_rtname001", ref: "q_name", type: "short_text", title: "Name?", required: true },
      {
        id: "blk_rtpay0001",
        ref: "q_pay",
        type: "payment",
        title: "Fee",
        required: true,
        method: "gateway",
        paymentAccountId: account,
        currency: "INR",
        amountMode: "fixed",
        amount: 499,
      },
      { id: "blk_rtafter01", ref: "q_after", type: "short_text", title: "Else?", required: false },
    ],
    endings: [{ id: "end_rt00001", ref: "end_done", title: "Done", bodyMd: "Thanks." }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    layout: {},
    settings: {
      agent: { mode: "template" },
      onComplete: { requireSubmit: false },
      requireAuth: { enabled: true, method: "google", afterBlocks: 0 },
    },
    theme: {},
  };
}

async function publish(label: string, account: string): Promise<string> {
  const formId = `frm_${label}`;
  const now = Date.now();
  const json = JSON.stringify(doc(account));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, 'salt', ?8, ?8)`,
    ).bind(formId, t.orgId, t.workspaceId, t.userId, label, `${label}-form`, json, now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(`ver_${label}`, formId, json, now, t.userId),
    env.DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ?1 WHERE id = ?2`).bind(`ver_${label}`, formId),
  ]);
  return `${label}-form`;
}

async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?1, ?2, 'USD', ?3, ?4, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?1, ?2, 'pro', ?3, 'monthly', 'active', ?4, ?5, 1, ?6, ?6)`,
  )
    .bind(`sub_rt_${orgId}`, orgId, `dodo_rt_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function stripeAccount(id: string, providerAccountId: string): Promise<void> {
  await saveStripeKeyAccount(E, {
    id,
    orgId: t.orgId,
    userId: t.userId,
    key: `rk_test_${id}`,
    description: { providerAccountId, label: `Stripe ${providerAccountId}`, currencies: ["INR"], environment: "test" },
    webhookId: `we_${id}`,
    webhookSecret: STRIPE_SECRET,
  });
}

let stripeSlug: string;
let razorpaySlug: string;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("pwroutes");
  await subscribePro(t.orgId);
  savedRazorpaySecret = mutableEnv.RAZORPAY_WEBHOOK_SECRET;
  mutableEnv.RAZORPAY_WEBHOOK_SECRET = RAZORPAY_SECRET;

  await stripeAccount(STRIPE_ACCOUNT, "acct_route_one");
  await stripeAccount(OTHER_STRIPE_ACCOUNT, "acct_route_two");
  await stripeAccount(GONE_STRIPE_ACCOUNT, "acct_route_gone");
  await env.DB.prepare(`UPDATE payment_accounts SET status = 'disconnected', webhook_secret_enc = NULL WHERE id = ?1`)
    .bind(GONE_STRIPE_ACCOUNT)
    .run();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO payment_accounts (id, organization_id, provider, credential_kind, environment, provider_account_id,
                                   display_label, credentials_enc, status, currencies_json, created_at, updated_at)
     VALUES (?1, ?2, 'razorpay', 'oauth', 'test', 'acc_route_rzp', 'Razorpay', 'sealed', 'active', '["INR"]', ?3, ?3)`,
  )
    .bind(RAZORPAY_ACCOUNT, t.orgId, now)
    .run();

  stripeSlug = await publish("pwstripe", STRIPE_ACCOUNT);
  razorpaySlug = await publish("pwrazorpay", RAZORPAY_ACCOUNT);
});

afterAll(() => {
  mutableEnv.RAZORPAY_WEBHOOK_SECRET = savedRazorpaySecret;
});

const stubFor = (sid: string) => env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;

/** A signed-in respondent with a checkout open on the payment question. Returns the record id. */
async function openCheckout(slug: string): Promise<{ sid: string; recordId: string }> {
  const opened = await fetchApi(`/p/forms/${slug}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const { sessionId: sid, respondentToken: token } = (await opened.json()) as { sessionId: string; respondentToken: string };
  await stubFor(sid).attachIdentity({
    provider: "google",
    subject: `google-route-${sid}`,
    // One person per checkout: the same email would adopt the same open response, and with it the payment.
    email: `payer-${sid.slice(-8)}@routes.example`,
    phone: null,
    name: "Route",
    pictureUrl: null,
    verifiedAt: Date.now(),
  });
  const headers = { "content-type": "application/json", "x-respondent-token": token };
  await fetchApi(`/p/sessions/${sid}/messages`, { method: "POST", headers, body: JSON.stringify({ type: "structured", ref: "q_name", value: "R" }) });
  const started = await fetchApi(`/p/sessions/${sid}/payments`, { method: "POST", headers, body: JSON.stringify({ ref: "q_pay" }) });
  expect(started.status, await started.clone().text()).toBe(200);
  const { recordId } = (await started.json()) as { recordId: string };
  return { sid, recordId };
}

function stripeEvent(recordId: string, eventId: string): string {
  return JSON.stringify({
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `ord_${recordId}`,
        client_reference_id: recordId,
        payment_status: "paid",
        payment_intent: "pi_route",
        amount_total: 49900,
        currency: "inr",
      },
    },
  });
}

async function stripeDelivery(accountId: string, body: string, signedBody = body): Promise<Response> {
  const ts = Math.floor(Date.now() / 1000);
  return fetchApi(`/p/payments/webhooks/stripe/${accountId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${ts},v1=${await hmacHex(STRIPE_SECRET, `${ts}.${signedBody}`)}` },
    body,
  });
}

describe("POST /p/payments/webhooks/stripe/:accountId", () => {
  it("refuses a tampered body with a 401, and settles the genuine one", async () => {
    const { sid, recordId } = await openCheckout(stripeSlug);
    gw.orders.get(`ord_${recordId}`)!.status = "paid";
    const body = stripeEvent(recordId, `evt_route_${recordId}`);

    const tampered = await stripeDelivery(STRIPE_ACCOUNT, body.replace("49900", "100"), body);
    expect(tampered.status).toBe(401);
    expect((await stubFor(sid).getStatus())?.answers.q_pay).toBeUndefined();

    const genuine = await stripeDelivery(STRIPE_ACCOUNT, body);
    expect(genuine.status).toBe(200);
    expect(await genuine.json()).toMatchObject({ processed: 1 });
    const state = await stubFor(sid).getStatus();
    expect(state?.answers.q_pay).toMatchObject({ verified: true, paymentRecordId: recordId });
    expect(state?.currentRef).toBe("q_after");
  });

  it("answers 404 for an unknown account and 410 for a disconnected one", async () => {
    const body = stripeEvent("rpay_nothing", "evt_route_nowhere");
    expect((await stripeDelivery("pac_routenosuch9", body)).status).toBe(404);
    expect((await stripeDelivery("not-an-account", body)).status).toBe(404);
    expect((await stripeDelivery(RAZORPAY_ACCOUNT, body)).status).toBe(404);
    expect((await stripeDelivery(GONE_STRIPE_ACCOUNT, body)).status).toBe(410);
  });

  it("ignores an event for a record on another account, even signed with a valid secret", async () => {
    const { sid, recordId } = await openCheckout(stripeSlug);
    gw.orders.get(`ord_${recordId}`)!.status = "paid";
    // Delivered to the other account's endpoint, which shares nothing but the secret in this fixture.
    const res = await stripeDelivery(OTHER_STRIPE_ACCOUNT, stripeEvent(recordId, `evt_route_other_${recordId}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 1, processed: 0 });
    expect((await stubFor(sid).getStatus())?.answers.q_pay).toBeUndefined();
  });
});

describe("POST /p/payments/webhooks/razorpay", () => {
  it("refuses a tampered body with a 401, and settles the genuine one", async () => {
    const { sid, recordId } = await openCheckout(razorpaySlug);
    gw.orders.get(`ord_${recordId}`)!.status = "paid";
    const body = JSON.stringify({
      event: "payment.captured",
      account_id: "acc_route_rzp",
      payload: {
        payment: { entity: { id: "pay_route", order_id: `ord_${recordId}`, amount: 49900, currency: "INR", notes: { record_id: recordId } } },
      },
    });
    const deliver = async (sent: string) =>
      fetchApi("/p/payments/webhooks/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": await hmacHex(RAZORPAY_SECRET, body),
          "x-razorpay-event-id": `evt_rzp_route_${recordId}`,
        },
        body: sent,
      });

    expect((await deliver(body.replace("49900", "100"))).status).toBe(401);
    const genuine = await deliver(body);
    expect(genuine.status).toBe(200);
    expect(await genuine.json()).toMatchObject({ processed: 1 });
    expect((await stubFor(sid).getStatus())?.answers.q_pay).toMatchObject({ verified: true, paymentRecordId: recordId });
  });
});

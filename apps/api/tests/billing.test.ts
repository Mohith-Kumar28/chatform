import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { sign, verifyWebhook, eventTarget, toEpochMs, TOLERANCE_SECONDS } from "../src/lib/dodo-webhook.js";
import { dispatch } from "../src/routes/billing.js";
import { getEntitlements, invalidateEntitlements } from "../src/lib/entitlements.js";
import { dodoBase } from "../src/lib/dodo.js";
import { PLANS } from "@repo/entitlements";

const DB = () => env as unknown as Bindings;

/** Matches the secret in apps/api/.dev.vars, which the test worker loads. */
const SECRET = (env as unknown as Bindings).DODO_WEBHOOK_SECRET;

let org: Tenant;

async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json, limits_json = excluded.limits_json`,
      )
      .bind(
        plan.id,
        plan.id,
        plan.name,
        plan.priceMonthlyCents,
        plan.priceYearlyCents,
        plan.seatPriceCents,
        JSON.stringify(plan.features),
        JSON.stringify(plan.limits),
        plan.sortOrder,
      )
      .run();
  }
}

function subscriptionEvent(
  type: string,
  orgId: string,
  over: Record<string, unknown> = {},
  meta: Record<string, string> = {},
): Record<string, unknown> {
  return {
    business_id: "biz_test",
    type,
    timestamp: new Date().toISOString(),
    data: {
      payload_type: "Subscription",
      subscription_id: "dodo_sub_1",
      product_id: "prod_pro_monthly",
      status: "active",
      quantity: 1,
      previous_billing_date: new Date(Date.now() - 86_400_000).toISOString(),
      next_billing_date: new Date(Date.now() + 86_400_000 * 29).toISOString(),
      customer: { customer_id: "cus_test_1", email: "billing@example.com" },
      metadata: { organizationId: orgId, planId: "pro", cycle: "monthly", ...meta },
      ...over,
    },
  };
}

/** Post a delivery signed exactly the way Standard Webhooks specifies. */
async function deliver(
  body: unknown,
  opts: { id?: string; timestampSec?: number; secret?: string; signature?: string } = {},
): Promise<Response> {
  const raw = JSON.stringify(body);
  const id = opts.id ?? `evt_${crypto.randomUUID()}`;
  const ts = String(opts.timestampSec ?? Math.floor(Date.now() / 1000));
  const signature = opts.signature ?? `v1,${await sign(opts.secret ?? SECRET!, id, ts, raw)}`;
  return fetchApi("/api/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": signature,
    },
    body: raw,
  });
}

async function clearBilling(orgId: string): Promise<void> {
  for (const t of ["subscriptions", "payments", "dodo_customers", "usage_counters", "feature_access_log", "audit_logs"]) {
    await DB().DB.prepare(`DELETE FROM ${t} WHERE organization_id = ?`).bind(orgId).run();
  }
  await DB().DB.prepare(`DELETE FROM dodo_events`).run();
  await invalidateEntitlements(DB(), orgId);
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  org = await seedTenant("bill");
});

beforeEach(async () => {
  await clearBilling(org.orgId);
});

describe("the environment switch", () => {
  it("defaults to test mode rather than live", () => {
    // A missing variable must produce a sandbox charge, never a real one.
    expect(dodoBase({ DODO_ENVIRONMENT: undefined } as unknown as Bindings)).toBe("https://test.dodopayments.com");
    expect(dodoBase({ DODO_ENVIRONMENT: "" } as unknown as Bindings)).toBe("https://test.dodopayments.com");
    expect(dodoBase({ DODO_ENVIRONMENT: "staging" } as unknown as Bindings)).toBe("https://test.dodopayments.com");
    expect(dodoBase({ DODO_ENVIRONMENT: "live" } as unknown as Bindings)).toBe("https://live.dodopayments.com");
  });
});

describe("Standard Webhooks verification", () => {
  const id = "evt_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const raw = '{"type":"subscription.active"}';

  it("accepts a correctly signed delivery", async () => {
    const sig = `v1,${await sign("s3cret", id, ts, raw)}`;
    const r = await verifyWebhook("s3cret", { id, timestamp: ts, signature: sig }, raw);
    expect(r).toEqual({ ok: true, id });
  });

  it("signs id.timestamp.body, not timestamp.body", async () => {
    // The old implementation signed `${ts}.${raw}` and therefore rejected every genuine
    // delivery. This asserts the spec's three-part payload directly.
    const correct = await sign("s3cret", id, ts, raw);
    const oldWay = await sign("s3cret", "", ts, raw); // "" produces ".ts.body"
    expect(correct).not.toBe(oldWay);
    const r = await verifyWebhook("s3cret", { id, timestamp: ts, signature: `v1,${oldWay}` }, raw);
    expect(r.ok).toBe(false);
  });

  it("accepts a second signature during secret rotation", async () => {
    // Signatures are SPACE separated. The old comma split could never find a `v1,` entry.
    const oldSig = `v1,${await sign("old-secret", id, ts, raw)}`;
    const newSig = `v1,${await sign("new-secret", id, ts, raw)}`;
    const header = `${oldSig} ${newSig}`;
    expect((await verifyWebhook("new-secret", { id, timestamp: ts, signature: header }, raw)).ok).toBe(true);
    expect((await verifyWebhook("old-secret", { id, timestamp: ts, signature: header }, raw)).ok).toBe(true);
    expect((await verifyWebhook("third-secret", { id, timestamp: ts, signature: header }, raw)).ok).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const sig = `v1,${await sign("s3cret", id, ts, raw)}`;
    const r = await verifyWebhook("s3cret", { id, timestamp: ts, signature: sig }, raw + " ");
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a substituted webhook-id", async () => {
    const sig = `v1,${await sign("s3cret", id, ts, raw)}`;
    const r = await verifyWebhook("s3cret", { id: "evt_other", timestamp: ts, signature: sig }, raw);
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects the wrong secret", async () => {
    const sig = `v1,${await sign("other", id, ts, raw)}`;
    expect((await verifyWebhook("s3cret", { id, timestamp: ts, signature: sig }, raw)).ok).toBe(false);
  });

  it("bounds the replay window in both directions", async () => {
    const now = Date.now();
    const make = async (offsetSec: number) => {
      const t = String(Math.floor(now / 1000) + offsetSec);
      return verifyWebhook("s3cret", { id, timestamp: t, signature: `v1,${await sign("s3cret", id, t, raw)}` }, raw, now);
    };
    expect((await make(0)).ok).toBe(true);
    expect((await make(-(TOLERANCE_SECONDS - 5))).ok).toBe(true);
    expect(await make(-(TOLERANCE_SECONDS + 5))).toEqual({ ok: false, reason: "stale_timestamp" });
    // A future timestamp is as suspicious as an old one.
    expect(await make(TOLERANCE_SECONDS + 5)).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("names each failure so the caller can pick a status", async () => {
    expect(await verifyWebhook(undefined, { id, timestamp: ts, signature: "v1,x" }, raw)).toEqual({
      ok: false,
      reason: "missing_secret",
    });
    expect(await verifyWebhook("s", { id: undefined, timestamp: ts, signature: "v1,x" }, raw)).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(await verifyWebhook("s", { id, timestamp: "not-a-number", signature: "v1,x" }, raw)).toEqual({
      ok: false,
      reason: "bad_timestamp",
    });
    expect(await verifyWebhook("s", { id, timestamp: ts, signature: "v2,x" }, raw)).toEqual({
      ok: false,
      reason: "no_signatures",
    });
  });
});

describe("the webhook endpoint", () => {
  it("activates a subscription end to end", async () => {
    const res = await deliver(subscriptionEvent("subscription.active", org.orgId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("pro");
    expect(ent.features.partial_responses).toBe(true);

    const sub = await DB()
      .DB.prepare(`SELECT plan_id, cycle, status, seats, dodo_customer_id FROM subscriptions WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ plan_id: string; cycle: string; status: string; seats: number; dodo_customer_id: string }>();
    expect(sub).toMatchObject({ plan_id: "pro", cycle: "monthly", status: "active", dodo_customer_id: "cus_test_1" });

    // The Dodo customer is recorded so the portal and future checkouts reuse it.
    const cus = await DB()
      .DB.prepare(`SELECT dodo_customer_id, billing_email FROM dodo_customers WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ dodo_customer_id: string; billing_email: string }>();
    expect(cus).toMatchObject({ dodo_customer_id: "cus_test_1", billing_email: "billing@example.com" });
  });

  it("is idempotent across Dodo's eight retries", async () => {
    // Without this, one payment becomes eight subscriptions.
    const evt = subscriptionEvent("subscription.active", org.orgId);
    const id = "evt_retry";
    const first = await deliver(evt, { id });
    expect(await first.json()).toEqual({ received: true });

    for (let i = 0; i < 7; i++) {
      const again = await deliver(evt, { id });
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ received: true, duplicate: true });
    }

    const count = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("rejects a bad signature with 401 and records nothing", async () => {
    const res = await deliver(subscriptionEvent("subscription.active", org.orgId), { secret: "wrong-secret" });
    expect(res.status).toBe(401);
    const events = await DB().DB.prepare(`SELECT COUNT(*) AS n FROM dodo_events`).first<{ n: number }>();
    expect(events?.n).toBe(0);
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
  });

  it("rejects a stale delivery with 401", async () => {
    const res = await deliver(subscriptionEvent("subscription.active", org.orgId), {
      timestampSec: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing headers with 400", async () => {
    const res = await fetchApi("/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("needs no session — Dodo has no cookie", async () => {
    // Regression guard: the webhook is mounted before the auth middleware, so an edit to
    // that middleware can never start rejecting deliveries.
    const res = await deliver(subscriptionEvent("subscription.active", org.orgId));
    expect(res.status).toBe(200);
  });

  it("records but does not act on an event with no organizationId", async () => {
    // The old handler defaulted planId to "pro", so a Business payment could silently
    // provision Pro. Guessing is never better than recording and stopping.
    const evt = subscriptionEvent("subscription.active", org.orgId);
    (evt.data as Record<string, unknown>).metadata = { planId: "business" };
    const res = await deliver(evt);
    expect(res.status).toBe(200);

    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
    const row = await DB().DB.prepare(`SELECT status, error FROM dodo_events LIMIT 1`).first<{ status: string; error: string }>();
    expect(row?.status).toBe("processed");
    expect(row?.error).toContain("no organizationId");
  });

  it("never provisions a paid plan from an unrecognised plan id", async () => {
    const evt = subscriptionEvent("subscription.active", org.orgId, {}, { planId: "enterprise-unlimited" });
    await deliver(evt);
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
  });

  it("marks every lock the org had hit as converted", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO feature_access_log (id, organization_id, feature, surface, first_denied_at, last_denied_at, denial_count)
         VALUES (?, ?, 'partial_responses', 'results.partial', ?, ?, 3)`,
      )
      .bind("fal_conv", org.orgId, Date.now(), Date.now())
      .run();

    await deliver(subscriptionEvent("subscription.active", org.orgId));

    const row = await DB()
      .DB.prepare(`SELECT converted_at FROM feature_access_log WHERE id = 'fal_conv'`)
      .first<{ converted_at: number | null }>();
    expect(row?.converted_at).not.toBeNull();
  });
});

describe("the subscription lifecycle", () => {
  it("keeps entitlements through a failed renewal, then drops them after grace", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("pro");

    await deliver(subscriptionEvent("subscription.on_hold", org.orgId, { status: "on_hold" }), { id: "evt_hold" });
    const held = await getEntitlements(DB(), org.orgId);
    expect(held.planId).toBe("pro"); // dunning is still running
    expect(held.inGrace).toBe(true);

    // Wind the grace window into the past rather than waiting seven days.
    await DB()
      .DB.prepare(`UPDATE subscriptions SET grace_until = ?, current_period_end = ? WHERE organization_id = ?`)
      .bind(Date.now() - 1000, Date.now() - 86_400_000 * 40, org.orgId)
      .run();
    await invalidateEntitlements(DB(), org.orgId);
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("free");
  });

  it("clears the grace window when the renewal finally succeeds", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    await deliver(subscriptionEvent("subscription.on_hold", org.orgId, { status: "on_hold" }), { id: "evt_h2" });
    await deliver(subscriptionEvent("subscription.renewed", org.orgId), { id: "evt_renew" });

    const row = await DB()
      .DB.prepare(`SELECT status, grace_until FROM subscriptions WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ status: string; grace_until: number | null }>();
    expect(row?.status).toBe("active");
    expect(row?.grace_until).toBeNull();
  });

  it("cancels only the subscription the event names", async () => {
    // The old handler ran `WHERE organization_id = ?`, so one cancelled add-on took the
    // whole account down with it.
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    await deliver(subscriptionEvent("subscription.active", org.orgId, { subscription_id: "dodo_sub_2" }), { id: "evt_s2" });

    await deliver(subscriptionEvent("subscription.cancelled", org.orgId, { subscription_id: "dodo_sub_2" }), { id: "evt_c2" });

    const rows = await DB()
      .DB.prepare(`SELECT dodo_subscription_id, status FROM subscriptions WHERE organization_id = ? ORDER BY dodo_subscription_id`)
      .bind(org.orgId)
      .all<{ dodo_subscription_id: string; status: string }>();
    expect(rows.results).toEqual([
      { dodo_subscription_id: "dodo_sub_1", status: "active" },
      { dodo_subscription_id: "dodo_sub_2", status: "canceled" },
    ]);
  });

  it("lets a cancelled subscription run out the period it paid for", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    await deliver(subscriptionEvent("subscription.cancelled", org.orgId), { id: "evt_cancel" });
    // Still Pro: they paid through next_billing_date and nothing about their data changes.
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("pro");
  });

  it("reconciles a plan change from subscription.updated", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    await deliver(
      subscriptionEvent("subscription.updated", org.orgId, { status: "active", quantity: 7 }, { planId: "business" }),
      { id: "evt_upd" },
    );
    const ent = await getEntitlements(DB(), org.orgId);
    expect(ent.planId).toBe("business");
    expect(ent.features.respondent_auth_phone).toBe(true);
    expect(ent.seats).toBe(7); // paid seat add-ons
  });

  it("resolves a plan change by product id, not by stale metadata", async () => {
    /**
     * `subscription.plan_changed` fires when a scheduled downgrade actually applies, which
     * can be weeks after we asked for it — and its metadata still describes the *original*
     * checkout. Trusting that metadata would silently keep the customer on the tier they
     * just left, which is the expensive direction to get wrong.
     */
    await DB()
      .DB.prepare(`UPDATE plans SET dodo_product_monthly_id = 'prod_biz_monthly' WHERE id = 'business'`)
      .run();
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("pro");

    await deliver(
      // metadata still says planId: pro — the product id is what changed.
      subscriptionEvent("subscription.plan_changed", org.orgId, {
        status: "active",
        product_id: "prod_biz_monthly",
      }),
      { id: "evt_planchg" },
    );
    expect((await getEntitlements(DB(), org.orgId)).planId).toBe("business");

    await DB().DB.prepare(`UPDATE plans SET dodo_product_monthly_id = NULL WHERE id = 'business'`).run();
  });

  it("treats a paused subscription as on hold rather than cancelled", async () => {
    // A customer who pauses has not cancelled and is not entitled to more: `resolve()`
    // honours the period they already paid for, exactly as for a failed renewal.
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    await deliver(subscriptionEvent("subscription.paused", org.orgId, { status: "paused" }), { id: "evt_pause" });
    const row = await DB()
      .DB.prepare(`SELECT status FROM subscriptions WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ status: string }>();
    expect(row?.status).toBe("on_hold");
  });

  it("records a cancel_at_period_end flag so the UI can say so", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    await deliver(
      subscriptionEvent("subscription.updated", org.orgId, { status: "active", cancel_at_next_billing_date: true }),
      { id: "evt_cape" },
    );
    expect((await getEntitlements(DB(), org.orgId)).cancelAtPeriodEnd).toBe(true);
  });

  it("records payments and failures", async () => {
    await deliver({
      business_id: "biz",
      type: "payment.succeeded",
      data: {
        payload_type: "Payment",
        payment_id: "pay_1",
        subscription_id: "dodo_sub_1",
        total_amount: 2400,
        currency: "USD",
        metadata: { organizationId: org.orgId, planId: "pro", cycle: "monthly" },
      },
    });
    const paid = await DB()
      .DB.prepare(`SELECT amount_cents, currency, status FROM payments WHERE dodo_payment_id = 'pay_1'`)
      .first<{ amount_cents: number; currency: string; status: string }>();
    expect(paid).toMatchObject({ amount_cents: 2400, currency: "USD", status: "succeeded" });

    await deliver(
      {
        business_id: "biz",
        type: "payment.failed",
        data: {
          payload_type: "Payment",
          payment_id: "pay_2",
          total_amount: 2400,
          metadata: { organizationId: org.orgId },
        },
      },
      { id: "evt_pf" },
    );
    const failed = await DB()
      .DB.prepare(`SELECT status FROM payments WHERE dodo_payment_id = 'pay_2'`)
      .first<{ status: string }>();
    expect(failed?.status).toBe("failed");
  });

  it("ignores event types it has no business acting on", async () => {
    const res = await deliver({
      business_id: "biz",
      type: "dispute.opened",
      data: { payload_type: "Dispute", metadata: { organizationId: org.orgId } },
    });
    expect(res.status).toBe(200);
    const row = await DB().DB.prepare(`SELECT status, error FROM dodo_events LIMIT 1`).first<{ status: string; error: string }>();
    expect(row?.status).toBe("processed");
    expect(row?.error).toContain("needs no action");
  });

  it("returns 5xx and keeps the event when a handler throws", async () => {
    // Recovery is: fix the bug, replay from the Dodo dashboard. The event row's
    // dodo_event_id is what makes that replay safe.
    const broken = { business_id: "b", type: "subscription.active", data: { metadata: { organizationId: "org_does_not_exist" }, subscription_id: "s1" } };
    const res = await deliver(broken, { id: "evt_broken" });
    expect(res.status).toBe(500);
    const row = await DB()
      .DB.prepare(`SELECT status, error FROM dodo_events WHERE dodo_event_id = 'evt_broken'`)
      .first<{ status: string; error: string | null }>();
    expect(row?.status).toBe("failed");
    expect(row?.error).toBeTruthy();
  });

  it("writes an audit trail a human can read", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    const row = await DB()
      .DB.prepare(`SELECT action, actor_type, resource_id FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(org.orgId)
      .first<{ action: string; actor_type: string; resource_id: string }>();
    expect(row).toMatchObject({ action: "subscription.activated", actor_type: "webhook", resource_id: "dodo_sub_1" });
  });
});

describe("payload helpers", () => {
  it("reads the target out of metadata only", () => {
    expect(eventTarget({ type: "x", data: { metadata: { organizationId: "o1", planId: "pro", cycle: "yearly" } } })).toEqual({
      orgId: "o1",
      planId: "pro",
      cycle: "yearly",
    });
    expect(eventTarget({ type: "x", data: {} })).toBeNull();
    expect(eventTarget({ type: "x", data: { metadata: { organizationId: "o1", cycle: "weekly" } } })).toEqual({
      orgId: "o1",
      planId: null,
      cycle: null, // an unrecognised cycle is null, not silently "monthly"
    });
  });

  it("converts Dodo's ISO dates to epoch ms", () => {
    expect(toEpochMs("2026-08-27T00:00:00Z")).toBe(Date.UTC(2026, 7, 27));
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs("not a date")).toBeNull();
  });
});

describe("billing routes", () => {
  const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

  it("serves the plan catalogue without a session", async () => {
    const res = await fetchApi("/api/billing/plans");
    expect(res.status).toBe(200);
    const body = await res.json<{
      plans: { id: string; priceMonthlyCents: number; priceYearlyPerMonthCents: number; yearlySavingPercent: number; checkoutReady: boolean }[];
      features: Record<string, { soon: boolean; minPlan: string }>;
    }>();
    expect(body.plans.map((p) => p.id)).toEqual(["free", "pro", "business"]);
    const pro = body.plans.find((p) => p.id === "pro")!;
    expect(pro.priceMonthlyCents).toBe(2400);
    expect(pro.priceYearlyPerMonthCents).toBe(1600);
    expect(pro.yearlySavingPercent).toBe(33);
    // No Dodo product linked in this environment, so Pro is not buyable — the pricing
    // page needs to know rather than offering a button that 503s.
    expect(pro.checkoutReady).toBe(false);
    expect(body.plans.find((p) => p.id === "free")!.checkoutReady).toBe(true);
    // Unbuilt-but-priced features must be flagged so the page can label them.
    expect(body.features.custom_domain.soon).toBe(true);
    expect(body.features.partial_responses.soon).toBe(false);
    expect(body.features.partial_responses.minPlan).toBe("pro");
  });

  it("requires a session for entitlements", async () => {
    expect((await fetchApi("/api/billing/entitlements")).status).toBe(401);
  });

  it("returns plan, usage, gauges and permissions in one call", async () => {
    const res = await fetchApi("/api/billing/entitlements", { headers: auth(org) });
    expect(res.status).toBe(200);
    const body = await res.json<{
      planId: string;
      features: Record<string, boolean>;
      usage: Record<string, number>;
      gauges: Record<string, number>;
      role: string;
      roleLabel: string;
      permissions: Record<string, string[]>;
      periodResetsAt: number;
    }>();
    expect(body.planId).toBe("free");
    expect(body.features.partial_responses).toBe(false);
    expect(body.usage.responses).toBe(0);
    expect(body.gauges.forms_count).toBe(1);
    expect(body.gauges.seats).toBe(1);
    expect(body.role).toBe("owner");
    expect(body.roleLabel).toBe("Owner");
    expect(body.permissions.billing).toEqual(["read", "manage"]);
    expect(body.periodResetsAt).toBeGreaterThan(Date.now());
  });

  it("keeps the legacy usage payload working with correct numbers", async () => {
    const res = await fetchApi("/api/billing/usage", { headers: auth(org) });
    const body = await res.json<{ plan: string; planId: string; limits: Record<string, number | null> }>();
    expect(body.plan).toBe("Free"); // a string, which is what the UI already reads
    expect(body.planId).toBe("free");
    expect(body.limits.responses_ceiling_per_month).toBe(5000);
  });

  it("refuses checkout when the plan has no Dodo product", async () => {
    const res = await fetchApi("/api/billing/checkout", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ planId: "pro", cycle: "monthly" }),
    });
    expect(res.status).toBe(503);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("plan_not_configured");
  });

  it("refuses a second checkout for an org that already pays", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    const res = await fetchApi("/api/billing/checkout", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ planId: "business", cycle: "monthly" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("already_subscribed");
  });

  it("refuses a plan change with no subscription", async () => {
    const res = await fetchApi("/api/billing/change-plan", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ planId: "business", cycle: "monthly" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("no_subscription");
  });

  it("sends a downgrade-to-free at the portal, where cancellation belongs", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    const res = await fetchApi("/api/billing/change-plan", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ planId: "free" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("use_portal");
  });

  it("refuses a change to the plan already held", async () => {
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    const res = await fetchApi("/api/billing/change-plan", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ planId: "pro", cycle: "monthly" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("same_plan");
  });

  it("has nothing to manage before the org has ever been billed", async () => {
    const res = await fetchApi("/api/billing/portal", { method: "POST", headers: auth(org) });
    expect(res.status).toBe(404);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("no_customer");
  });

  it("reports missing billing configuration instead of failing at checkout", async () => {
    const res = await fetchApi("/api/billing/config-check", { headers: auth(org) });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; environment: string; problems: string[] }>();
    expect(body.ok).toBe(false);
    expect(body.environment).toBe("test");
    expect(body.problems.join(" ")).toContain("no monthly Dodo product id");
  });

  it("lists payment history", async () => {
    await deliver({
      business_id: "b",
      type: "payment.succeeded",
      data: { payload_type: "Payment", payment_id: "pay_h", total_amount: 2400, metadata: { organizationId: org.orgId } },
    });
    const res = await fetchApi("/api/billing/invoices", { headers: auth(org) });
    const body = await res.json<{ invoices: { id: string; amount_cents: number }[] }>();
    expect(body.invoices[0]).toMatchObject({ id: "pay_h", amount_cents: 2400 });
  });

  it("does not let a non-owner start a checkout", async () => {
    // Billing is owner-only, and the denial is 403 with no upgrade prompt — upgrading
    // cannot fix a role.
    await DB().DB.prepare(`UPDATE members SET role = 'editor' WHERE organization_id = ?`).bind(org.orgId).run();
    const res = await fetchApi("/api/billing/checkout", {
      method: "POST",
      headers: auth(org),
      body: JSON.stringify({ planId: "pro", cycle: "monthly" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string; upgradeUrl: string | null; requiredPlan: string | null } }>();
    expect(body.error.code).toBe("forbidden");
    expect(body.error.upgradeUrl).toBeNull();
    expect(body.error.requiredPlan).toBeNull();
    await DB().DB.prepare(`UPDATE members SET role = 'owner' WHERE organization_id = ?`).bind(org.orgId).run();
  });

  it("keeps one tenant's billing out of another's", async () => {
    const other = await seedTenant("bill2");
    await deliver(subscriptionEvent("subscription.active", org.orgId));
    const res = await fetchApi("/api/billing/entitlements", { headers: { cookie: other.cookie } });
    expect((await res.json<{ planId: string }>()).planId).toBe("free");
  });
});

describe("dispatch, called directly", () => {
  it("is safe to call twice with the same event", async () => {
    // The endpoint dedupes on webhook-id, but the handler itself must also be idempotent —
    // a replay from the Dodo dashboard arrives with a fresh id.
    const evt = subscriptionEvent("subscription.active", org.orgId) as never;
    await dispatch(DB(), evt);
    await dispatch(DB(), evt);
    const count = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE organization_id = ?`)
      .bind(org.orgId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

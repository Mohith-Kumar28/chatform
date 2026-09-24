import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { Block as BlockSchema, type FormDoc } from "@repo/form-schema";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { withDefaultPaymentAccount } from "../src/lib/payments/default-account.js";
import { setDefaultAccount } from "../src/lib/payments/accounts.js";

/**
 * A payment the AI writes without a link lands on the default account, and
 * nothing else about a draft is touched: a link or UPI id the model was given
 * stays, a question the form already had stays, and without a plan, the flag
 * or an account the draft comes back exactly as it went in.
 */

const E = env as unknown as Bindings;
const mutableEnv = env as unknown as Record<string, string | undefined>;
let savedFlag: string | undefined;

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
    .bind(`sub_dpa_${orgId}`, orgId, `dodo_dpa_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function insertAccount(id: string, orgId: string, provider: string, createdAt: number, currencies = '["INR"]') {
  await env.DB.prepare(
    `INSERT INTO payment_accounts (id, organization_id, provider, credential_kind, environment, provider_account_id,
                                   display_label, credentials_enc, status, currencies_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'oauth', 'test', ?4, 'Test account', 'sealed', 'active', ?5, ?6, ?6)`,
  )
    .bind(id, orgId, provider, `acc_${id}`, currencies, createdAt)
    .run();
}

const payment = (ref: string, extra: Record<string, unknown> = {}) =>
  BlockSchema.parse({ id: `id_${ref}`.padEnd(12, "0").slice(0, 12), ref, type: "payment", title: "Ticket", method: "link", amount: 499, currency: "USD", ...extra });

const docWith = (...blocks: ReturnType<typeof payment>[]): FormDoc =>
  ({ blocks, endings: [], logic: [], variables: [] }) as unknown as FormDoc;

let pro: Tenant;
let free: Tenant;
let empty: Tenant;

beforeAll(async () => {
  await applySchema();
  savedFlag = mutableEnv.PAYMENTS_GATEWAY_ENABLED;
  mutableEnv.PAYMENTS_GATEWAY_ENABLED = "on";
  pro = await seedTenant("dpa_pro");
  free = await seedTenant("dpa_free");
  empty = await seedTenant("dpa_empty");
  await subscribePro(pro.orgId);
  await subscribePro(empty.orgId);
  // The oldest is the default until another is chosen.
  await insertAccount("pac_dpa_old", pro.orgId, "razorpay", Date.now() - 10_000);
  await insertAccount("pac_dpa_new", pro.orgId, "stripe", Date.now(), '["USD"]');
  await insertAccount("pac_dpa_free", free.orgId, "razorpay", Date.now());
});

afterAll(() => {
  mutableEnv.PAYMENTS_GATEWAY_ENABLED = savedFlag;
});

describe("withDefaultPaymentAccount", () => {
  it("puts a new link-less payment on the default account, in its currency", async () => {
    const out = await withDefaultPaymentAccount(E, pro.orgId, docWith(payment("b_pay")));
    const block = out.blocks[0] as Extract<FormDoc["blocks"][number], { type: "payment" }>;
    expect(block.method).toBe("gateway");
    expect(block.paymentAccountId).toBe("pac_dpa_old");
    expect(block.currency).toBe("INR");
  });

  it("follows the account made default", async () => {
    await setDefaultAccount(E, pro.orgId, "pac_dpa_new");
    const out = await withDefaultPaymentAccount(E, pro.orgId, docWith(payment("b_pay")));
    const block = out.blocks[0] as Extract<FormDoc["blocks"][number], { type: "payment" }>;
    expect(block.paymentAccountId).toBe("pac_dpa_new");
    expect(block.currency).toBe("USD");
    await setDefaultAccount(E, pro.orgId, "pac_dpa_old");
  });

  it("keeps a link or a UPI id the model was given", async () => {
    const doc = docWith(
      payment("b_link", { url: "https://rzp.io/l/abc" }),
      payment("b_upi", { method: "upi", upiId: "acme@okhdfcbank", currency: "INR" }),
    );
    expect(await withDefaultPaymentAccount(E, pro.orgId, doc)).toEqual(doc);
  });

  it("leaves a payment the form already had alone", async () => {
    const before = docWith(payment("b_pay"));
    const after = docWith(payment("b_pay"), payment("b_new"));
    const out = await withDefaultPaymentAccount(E, pro.orgId, after, before);
    expect((out.blocks[0] as { method: string }).method).toBe("link");
    expect((out.blocks[1] as { method: string }).method).toBe("gateway");
  });

  it("does nothing without the plan, an account, or the flag", async () => {
    const doc = docWith(payment("b_pay"));
    expect(await withDefaultPaymentAccount(E, free.orgId, doc)).toEqual(doc);
    expect(await withDefaultPaymentAccount(E, empty.orgId, doc)).toEqual(doc);
    mutableEnv.PAYMENTS_GATEWAY_ENABLED = "";
    expect(await withDefaultPaymentAccount(E, pro.orgId, doc)).toEqual(doc);
    mutableEnv.PAYMENTS_GATEWAY_ENABLED = "on";
  });
});

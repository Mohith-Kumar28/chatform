import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Publishing a form that asks for money through a connected gateway.
 *
 * Lint sees the document; these checks see D1. The failures worth pinning are
 * the ones that would otherwise surface only when a respondent presses Pay: the
 * plan does not include payments, the account belongs to another organization
 * or has lost its connection, or a rupee-only gateway is asked to charge
 * dollars. Manual link and UPI payments stay free and unchecked.
 */

const mutableEnv = env as unknown as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};
function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (!(k in saved)) saved[k] = mutableEnv[k];
    mutableEnv[k] = v;
  }
}

let pro: Tenant;
let free: Tenant;
let other: Tenant;
let key: string;

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
    .bind(`sub_pp_${orgId}`, orgId, `dodo_pp_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function seedAccount(
  id: string,
  orgId: string,
  over: { provider?: string; status?: string; environment?: string } = {},
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO payment_accounts (id, organization_id, provider, credential_kind, environment, provider_account_id,
                                   display_label, credentials_enc, status, currencies_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'oauth', ?4, ?5, 'Test account', 'sealed', ?6, '["INR"]', ?7, ?7)`,
  )
    .bind(id, orgId, over.provider ?? "razorpay", over.environment ?? "test", `acc_${id}`, over.status ?? "active", now)
    .run();
}

function gatewayDoc(label: string, block: Record<string, unknown>) {
  return {
    schemaVersion: 9,
    title: `${label} tickets`,
    blocks: [
      { id: `blk_${label}e`, ref: "q_email", type: "email", title: "Email?", required: true },
      {
        id: `blk_${label}p`,
        ref: "q_ticket",
        type: "payment",
        title: "Ticket",
        required: true,
        method: "gateway",
        amountMode: "fixed",
        amount: 499,
        currency: "INR",
        ...block,
      },
    ],
    endings: [{ id: `end_${label}`, ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    layout: {},
    settings: { requireAuth: { enabled: true, method: "google" } },
    theme: {},
  };
}

const session = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

async function saveAndPublish(t: Tenant, doc: unknown): Promise<Response> {
  const saved = await fetchApi(`/api/forms/${t.formId}/doc`, {
    method: "PUT",
    headers: session(t),
    body: JSON.stringify({ doc }),
  });
  expect(saved.status, await saved.clone().text()).toBe(200);
  return fetchApi(`/api/forms/${t.formId}/publish`, { method: "POST", headers: session(t) });
}

type Refusal = { error: { code: string; feature?: string; issues?: { code: string; refs: string[] }[] } };

beforeAll(async () => {
  await applySchema();
  pro = await seedTenant("paypub");
  free = await seedTenant("paypubfree");
  other = await seedTenant("paypubother");
  await subscribePro(pro.orgId);
  await subscribePro(other.orgId);
  key = (await seedKey(pro, "paypubkey", { scopes: { form: ["read", "write", "publish"] } })).raw;
  setEnv({ PAYMENTS_GATEWAY_ENABLED: "on", PAYMENTS_GATEWAY_ORGS: undefined });

  await seedAccount("pac_pp_rzp", pro.orgId);
  await seedAccount("pac_pp_stripe", pro.orgId, { provider: "stripe" });
  await seedAccount("pac_pp_stale", pro.orgId, { status: "needs_reconnect" });
  await seedAccount("pac_pp_gone", pro.orgId, { provider: "cashfree", status: "disconnected" });
  await seedAccount("pac_pp_theirs", other.orgId);
  await seedAccount("pac_pp_free", free.orgId);
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) mutableEnv[k] = v;
});

describe("publishing a verified payment question", () => {
  it("publishes on an active account in the organization", async () => {
    const res = await saveAndPublish(pro, gatewayDoc("ppok", { paymentAccountId: "pac_pp_rzp" }));
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("needs a plan that includes collecting payments", async () => {
    const res = await saveAndPublish(free, gatewayDoc("ppfree", { paymentAccountId: "pac_pp_free" }));
    expect(res.status).toBe(402);
    expect(((await res.json()) as Refusal).error).toMatchObject({ code: "feature_locked", feature: "collect_payments" });
  });

  it("still lets a free plan publish a manual payment link", async () => {
    const res = await saveAndPublish(
      free,
      gatewayDoc("pplink", { method: "link", url: "https://pay.example.com/ticket", currency: "USD" }),
    );
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("treats another organization's account as one that does not exist", async () => {
    const res = await saveAndPublish(pro, gatewayDoc("pptheirs", { paymentAccountId: "pac_pp_theirs" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as Refusal;
    expect(body.error.code).toBe("payment_setup_invalid");
    expect(body.error.issues).toEqual([expect.objectContaining({ code: "payment_account_missing", refs: ["q_ticket"] })]);
  });

  it("refuses an account that was disconnected", async () => {
    const res = await saveAndPublish(pro, gatewayDoc("ppgone", { paymentAccountId: "pac_pp_gone" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as Refusal).error.issues?.[0]?.code).toBe("payment_account_missing");
  });

  it("refuses an account that needs reconnecting", async () => {
    const res = await saveAndPublish(pro, gatewayDoc("ppstale", { paymentAccountId: "pac_pp_stale" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as Refusal).error.issues?.[0]?.code).toBe("payment_account_inactive");
  });

  it("keeps Razorpay and Cashfree to rupees, and Stripe to whatever it presents", async () => {
    const rupeesOnly = await saveAndPublish(pro, gatewayDoc("ppusd", { paymentAccountId: "pac_pp_rzp", currency: "USD" }));
    expect(rupeesOnly.status).toBe(422);
    expect(((await rupeesOnly.json()) as Refusal).error.issues?.[0]?.code).toBe("payment_currency_unsupported");

    const stripe = await saveAndPublish(pro, gatewayDoc("ppstripe", { paymentAccountId: "pac_pp_stripe", currency: "USD" }));
    expect(stripe.status, await stripe.clone().text()).toBe(200);
  });

  it("refuses a fixed Stripe price that Stripe cannot charge in its own units", async () => {
    // A thousandth of a dinar: Stripe takes three-decimal amounts only in tens.
    const fils = await saveAndPublish(pro, gatewayDoc("ppkwd", { paymentAccountId: "pac_pp_stripe", currency: "KWD", amount: 12.345 }));
    expect(fils.status).toBe(422);
    expect(((await fils.json()) as Refusal).error.issues?.[0]?.code).toBe("payment_amount_unsupported");

    const round = await saveAndPublish(pro, gatewayDoc("ppkwdok", { paymentAccountId: "pac_pp_stripe", currency: "KWD", amount: 12.34 }));
    expect(round.status, await round.clone().text()).toBe(200);
  });

  it("refuses while verified payments are off for the organization", async () => {
    setEnv({ PAYMENTS_GATEWAY_ENABLED: "" });
    try {
      const res = await saveAndPublish(pro, gatewayDoc("ppflag", { paymentAccountId: "pac_pp_rzp" }));
      expect(res.status).toBe(422);
      expect(((await res.json()) as Refusal).error.issues?.[0]?.code).toBe("payment_gateway_disabled");
    } finally {
      setEnv({ PAYMENTS_GATEWAY_ENABLED: "on" });
    }
  });

  it("applies the same checks to a publish through the API", async () => {
    const created = await fetchApi(`/v1/forms`, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ title: "Tickets", doc: gatewayDoc("ppv1", { paymentAccountId: "pac_pp_theirs" }) }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const res = await fetchApi(`/v1/forms/${id}/publish`, { method: "POST", headers: { "x-api-key": key } });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Refusal).error.issues?.[0]?.code).toBe("payment_account_missing");
  });
});

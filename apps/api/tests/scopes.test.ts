import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { clampScopes, PERMISSION_TO_SCOPE, PUBLISHABLE_SCOPES } from "../src/lib/scopes.js";

/**
 * Scopes, now that they are read.
 *
 * They were written at mint time and never checked, while `requirePermission`
 * returned early for any request carrying a key — so a key that claimed
 * `forms:read` could delete another form, rewrite webhooks, or read every
 * response. These are the assertions that keep that from coming back.
 */

let t: Tenant;

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
    .bind(`sub_sc_${orgId}`, orgId, `dodo_sc_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("scopes");
  await subscribePro(t.orgId);
});

describe("scope enforcement", () => {
  it("refuses a route the key has no scope for, and names the missing scope", async () => {
    const readOnly = await seedKey(t, "sconly", { scopes: { form: ["read"] } });

    const allowed = await fetchApi("/v1/forms", { headers: { "x-api-key": readOnly.raw } });
    expect(allowed.status).toBe(200);

    const denied = await fetchApi(`/v1/forms/${t.formId}/chat/sessions`, {
      method: "POST",
      headers: { "x-api-key": readOnly.raw, "content-type": "application/json" },
      body: "{}",
    });
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: { code: string; required: string } };
    expect(body.error.code).toBe("insufficient_scope");
    expect(body.error.required).toBe("session:create");
    expect(denied.headers.get("www-authenticate")).toContain("insufficient_scope");
  });

  it("never lets a key mint another key or touch billing", () => {
    // Deny by default: absence from the map is the refusal, so a new RBAC
    // permission is unreachable by a key until somebody deliberately maps it.
    expect(PERMISSION_TO_SCOPE["apikey.create"]).toBeUndefined();
    expect(PERMISSION_TO_SCOPE["billing.manage"]).toBeUndefined();
    expect(PERMISSION_TO_SCOPE["audit.read"]).toBeUndefined();
    expect(PERMISSION_TO_SCOPE["workspace.create"]).toBeUndefined();
  });

  it("clamps a publishable key to its ceiling however it is asked", () => {
    const greedy = clampScopes("pk_live", {
      form: ["read", "write", "publish"],
      response: ["read", "delete"],
      session: ["create", "write", "read"],
      analytics: ["read"],
    });
    expect(greedy.form).toEqual(["read"]);
    expect(greedy.response).toBeUndefined();
    expect(greedy.analytics).toBeUndefined();
    expect(greedy.session).toEqual(PUBLISHABLE_SCOPES.session);
  });

  it("drops scopes that are not in the vocabulary at all", () => {
    const nonsense = clampScopes("sk_live", { form: ["read", "detonate"], nonsense: ["read"] });
    expect(nonsense.form).toEqual(["read"]);
    expect(nonsense.nonsense).toBeUndefined();
  });
});

describe("cross-tenant", () => {
  it("returns 404, not 403, for another organization's form", async () => {
    const other = await seedTenant("scopesb");
    const res = await fetchApi(`/v1/forms/${other.formId}`, {
      headers: { "x-api-key": t.apiKeyRaw },
    });
    // 404 rather than 403: a scoped key must not be able to learn which ids exist.
    expect(res.status).toBe(404);
  });
});

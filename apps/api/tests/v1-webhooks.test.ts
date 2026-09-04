import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Webhook management with an API key.
 *
 * These operations only existed behind a session, so the webhook:* scopes named
 * an ability no key actually had and the SDK's webhook methods answered 401 on
 * every call.
 */

let t: Tenant;
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
    .bind(`sub_wh_${orgId}`, orgId, `dodo_wh_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1wh");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1whkey", {
    scopes: { form: ["read"], webhook: ["read", "write"], session: ["create"] },
  })).raw;
});

describe("managing endpoints", () => {
  it("creates one and returns the secret exactly once", async () => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://acme.example/hook", events: ["response.completed"] }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; secret: string; secretPreview: string };
    expect(created.secret.startsWith("whsec_")).toBe(true);

    const list = (await (await api("/v1/webhooks")).json()) as { id: string; secret?: string }[];
    const listed = list.find((w) => w.id === created.id);
    expect(listed).toBeTruthy();
    // Only a preview afterwards — the same treatment an API key gets.
    expect(listed).not.toHaveProperty("secret");
  });

  it("refuses an event name we do not send", async () => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://acme.example/hook", events: ["response.exploded"] }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; known: string[] } };
    // Storing it silently means an endpoint that never fires and a customer who
    // cannot tell why.
    expect(body.error.code).toBe("unknown_event");
    expect(body.error.known).toContain("response.completed");
  });

  it("still accepts the older event names", async () => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://acme.example/legacy", events: ["submission.completed"] }),
    });
    expect(res.status).toBe(201);
  });

  it("deletes one, and says not found the second time", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/gone", events: ["response.completed"] }),
      })
    ).json()) as { id: string };

    expect((await api(`/v1/webhooks/${created.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/v1/webhooks/${created.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("scopes and tenancy", () => {
  it("refuses a key without webhook:write", async () => {
    const readOnly = (await seedKey(t, "v1whread", { scopes: { webhook: ["read"] } })).raw;
    const res = await fetchApi("/v1/webhooks", {
      method: "POST",
      headers: { "x-api-key": readOnly, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://acme.example/nope", events: ["response.completed"] }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { required: string } }).error.required).toBe("webhook:write");
  });

  it("does not show another organization's endpoints", async () => {
    const other = await seedTenant("v1whb");
    await subscribePro(other.orgId);
    const otherKey = (await seedKey(other, "v1whbkey", { scopes: { webhook: ["read"] } })).raw;
    const list = (await (
      await fetchApi("/v1/webhooks", { headers: { "x-api-key": otherKey } })
    ).json()) as unknown[];
    expect(list).toHaveLength(0);
  });
});

describe("deliveries", () => {
  it("lists attempts and replays one", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/replay", events: ["response.completed"] }),
      })
    ).json()) as { id: string };

    const message = { event: "response.completed", organizationId: t.orgId, formId: t.formId, submissionId: "sbm_x" };
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, message_json, attempt, status, created_at)
       VALUES ('whd_v1', ?, 'response.completed', '{}', ?, 1, 'failed', ?)`,
    )
      .bind(created.id, JSON.stringify(message), Date.now())
      .run();

    const listed = (await (await api(`/v1/webhooks/${created.id}/deliveries`)).json()) as { data: unknown[] };
    expect(listed.data).toHaveLength(1);

    expect((await api(`/v1/webhooks/${created.id}/deliveries/whd_v1/replay`, { method: "POST" })).status).toBe(200);
  });

  it("refuses to replay a delivery whose message was never stored", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/old", events: ["response.completed"] }),
      })
    ).json()) as { id: string };
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempt, status, created_at)
       VALUES ('whd_old', ?, 'response.completed', '{}', 1, 'failed', ?)`,
    )
      .bind(created.id, Date.now())
      .run();

    const res = await api(`/v1/webhooks/${created.id}/deliveries/whd_old/replay`, { method: "POST" });
    // Its event cannot be reconstructed honestly, and guessing is worse than
    // refusing.
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_replayable");
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * The key management routes.
 *
 * These are wrappers over the Better Auth plugin rather than a passthrough, and
 * the wrapping is the point: the plugin's own endpoints would mint a key with no
 * paid-feature check, no role check, no audit row and no origin allowlist. The
 * last test here is the one that proves that door is shut.
 */

let t: Tenant;

async function setPlan(orgId: string, planId: "pro" | "free"): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  if (planId === "pro") {
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
      .bind(`sub_k_${orgId}`, orgId, `dodo_k_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
      .run();
  } else {
    await env.DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(orgId).run();
  }
  await invalidateEntitlements(env as never, orgId);
}

const post = (body: unknown, cookie: string) =>
  fetchApi("/api/keys", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("keysmgmt");
  await setPlan(t.orgId, "pro");
});

describe("creating keys", () => {
  it("returns the raw key exactly once", async () => {
    const res = await post({ name: "CI deploy", keyType: "sk_live" }, t.cookie);
    expect(res.status).toBe(200);
    const created = (await res.json()) as { id: string; key: string; start: string; keyType: string };
    expect(created.key.startsWith("sk_live_")).toBe(true);
    expect(created.start).toBe(created.key.slice(0, 14));

    const list = await fetchApi("/api/keys", { headers: { cookie: t.cookie } });
    const keys = (await list.json()) as { id: string; key?: string }[];
    const listed = keys.find((k) => k.id === created.id);
    expect(listed, "the key should be listed").toBeTruthy();
    expect(listed).not.toHaveProperty("key");
  });

  it("refuses a publishable key with no allowed origins", async () => {
    const res = await post({ name: "widget", keyType: "pk_live" }, t.cookie);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    // A pk_ key with no origin allowlist is not publishable, it is just leaked.
    expect(body.error.code).toBe("origins_required");
  });

  it("clamps a publishable key's scopes to the ceiling, whatever was asked for", async () => {
    const res = await post(
      {
        name: "widget",
        keyType: "pk_live",
        origins: ["https://acme.example"],
        scopes: { form: ["read", "publish"], response: ["read"], session: ["create"] },
      },
      t.cookie,
    );
    expect(res.status).toBe(200);
    const created = (await res.json()) as { scopes: Record<string, string[]> };
    expect(created.scopes.form).toEqual(["read"]);
    expect(created.scopes.response).toBeUndefined();
  });

  it("writes an audit row for every mint", async () => {
    const res = await post({ name: "audited", keyType: "sk_test" }, t.cookie);
    const created = (await res.json()) as { id: string };
    const row = await env.DB.prepare(
      `SELECT action, actor_type FROM audit_logs WHERE resource_id = ? AND action = 'api_key.create'`,
    )
      .bind(created.id)
      .first<{ action: string; actor_type: string }>();
    expect(row?.actor_type).toBe("user");
  });

  it("lists the organization's keys, not just the caller's own", async () => {
    // The old implementation filtered by user_id, so a teammate could not see —
    // let alone revoke — a key a colleague had created.
    const list = await fetchApi("/api/keys", { headers: { cookie: t.cookie } });
    const keys = (await list.json()) as unknown[];
    expect(keys.length).toBeGreaterThan(1);
  });
});

describe("plan gating", () => {
  it("blocks minting on a lapsed plan but still allows listing and revoking", async () => {
    const lapsed = await seedTenant("keyslapsed");
    await setPlan(lapsed.orgId, "free");

    const create = await post({ name: "nope" }, lapsed.cookie);
    expect(create.status).toBe(402);

    // Listing and revoking must keep working: someone whose plan lapsed still
    // needs to see and turn off what is already out there.
    const list = await fetchApi("/api/keys", { headers: { cookie: lapsed.cookie } });
    expect(list.status).toBe(200);
    const revoke = await fetchApi(`/api/keys/key_keyslapsed`, {
      method: "DELETE",
      headers: { cookie: lapsed.cookie },
    });
    expect(revoke.status).toBe(200);
  });
});

describe("rotation", () => {
  it("keeps the old key alive for the grace period and records the swap", async () => {
    const created = (await (await post({ name: "rotate me" }, t.cookie)).json()) as { id: string; key: string };

    const res = await fetchApi(`/api/keys/${created.id}/rotate`, {
      method: "POST",
      headers: { cookie: t.cookie, "content-type": "application/json" },
      body: JSON.stringify({ graceHours: 24 }),
    });
    expect(res.status).toBe(200);
    const rotated = (await res.json()) as { key: string; replacedKeyId: string; oldKeyExpiresAt: number };
    expect(rotated.key).not.toBe(created.key);
    expect(rotated.replacedKeyId).toBe(created.id);
    expect(rotated.oldKeyExpiresAt).toBeGreaterThan(Date.now());

    // A deploy is not atomic: the old key has to keep working while the new one
    // rolls out.
    const old = await env.DB.prepare(`SELECT enabled, expires_at FROM api_keys WHERE id = ?`)
      .bind(created.id)
      .first<{ enabled: number; expires_at: number }>();
    expect(old!.enabled).toBe(1);
    expect(old!.expires_at).toBeGreaterThan(Date.now());

    // The rotation audit row is the only durable record of the swap — the old
    // row is deleted outright once it expires, so if this is not written the
    // history is simply gone.
    const audited = await env.DB.prepare(
      `SELECT meta FROM audit_logs WHERE action = 'api_key.rotate' AND json_extract(meta, '$.replacedKeyId') = ?`,
    )
      .bind(created.id)
      .first<{ meta: string }>();
    expect(audited, "a rotation must leave an audit row naming the key it replaced").toBeTruthy();
    expect(JSON.parse(audited!.meta).graceHours).toBe(24);
  });

  it("cuts the old key immediately when no grace is asked for", async () => {
    const created = (await (await post({ name: "cut now" }, t.cookie)).json()) as { id: string };
    await fetchApi(`/api/keys/${created.id}/rotate`, {
      method: "POST",
      headers: { cookie: t.cookie, "content-type": "application/json" },
      body: JSON.stringify({ graceHours: 0 }),
    });
    const old = await env.DB.prepare(`SELECT enabled FROM api_keys WHERE id = ?`)
      .bind(created.id)
      .first<{ enabled: number }>();
    expect(old!.enabled).toBe(0);
  });
});

describe("the plugin's own endpoints", () => {
  it("are not reachable, even with a valid session", async () => {
    // They would mint a key with no feature gate, no role check, no audit row
    // and no origin allowlist. /api/keys is the only door.
    for (const path of ["/api/auth/api-key/create", "/api/auth/api-key/list", "/api/auth/api-key/delete"]) {
      const res = await fetchApi(path, {
        method: "POST",
        headers: { cookie: t.cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "backdoor" }),
      });
      expect(res.status, `${path} must not be reachable`).toBe(404);
    }
  });
});

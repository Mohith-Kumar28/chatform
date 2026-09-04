import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, seedLegacyKey, fetchApi, type Tenant } from "./helpers.js";
import { hexToBase64Url, hashApiKey, originAllowed } from "../src/lib/apikeys.js";

/**
 * Presenting a key, and what happens when it should not work.
 *
 * The surface this covers is the one an attacker probes first, so the
 * assertions are as much about what is *not* revealed — which key existed, which
 * was revoked — as about what is allowed.
 */

let t: Tenant;

/** Pro, because /v1 is gated on the `api_access` feature. */
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
    .bind(`sub_ak_${orgId}`, orgId, `dodo_ak_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const forms = (headers: Record<string, string>) => fetchApi("/v1/forms", { headers });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("akeys");
  await subscribePro(t.orgId);
});

describe("transports", () => {
  it("accepts a key as Bearer and as x-api-key", async () => {
    expect((await forms({ authorization: `Bearer ${t.apiKeyRaw}` })).status).toBe(200);
    expect((await forms({ "x-api-key": t.apiKeyRaw })).status).toBe(200);
  });

  it("refuses a request with no key, and says how to send one", async () => {
    const res = await forms({});
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toMatch(/x-api-key/);
  });

  it("ignores a key in the query string", async () => {
    // A secret key in a URL lands in access logs, proxy logs and Referer
    // headers. /p accepts ?t= for EventSource; /v1 must never follow.
    expect((await fetchApi(`/v1/forms?key=${t.apiKeyRaw}`)).status).toBe(401);
  });
});

describe("key state", () => {
  it("refuses unknown, disabled and expired keys without saying which", async () => {
    const disabled = await seedKey(t, "akdisabled", { enabled: false });
    const expired = await seedKey(t, "akexpired", { expiresAt: Date.now() - 60_000 });

    const unknownRes = await forms({ authorization: "Bearer sk_live_nosuchkeyatall" });
    const disabledRes = await forms({ authorization: `Bearer ${disabled.raw}` });
    const expiredRes = await forms({ authorization: `Bearer ${expired.raw}` });

    expect(unknownRes.status).toBe(401);
    expect(disabledRes.status).toBe(401);
    expect(expiredRes.status).toBe(401);

    // The code differs so an integrator can act; the message never does, so a
    // probe cannot learn that a guessed key once existed.
    const bodies = await Promise.all([unknownRes.json(), disabledRes.json(), expiredRes.json()]);
    const codes = bodies.map((b) => (b as { error: { code: string } }).error.code);
    expect(codes).toEqual(["invalid_api_key", "api_key_disabled", "api_key_expired"]);
    const messages = new Set(bodies.map((b) => (b as { error: { message: string } }).error.message));
    expect(messages.size).toBe(1);
  });

  it("deletes an expired key's row on use, so nothing may depend on it surviving", async () => {
    const expired = await seedKey(t, "akgone", { expiresAt: Date.now() - 60_000 });
    await forms({ authorization: `Bearer ${expired.raw}` });
    const row = await env.DB.prepare(`SELECT id FROM api_keys WHERE id = ?`).bind(expired.id).first();
    expect(row, "the plugin hard-deletes an expired key — the audit row is the only history").toBeNull();
  });
});

describe("key type policy", () => {
  it("refuses a secret key that arrives from a browser", async () => {
    const res = await forms({ authorization: `Bearer ${t.apiKeyRaw}`, origin: "https://acme.example" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("secret_key_in_browser");
    // The message has to tell them what to do, because the key is already leaked.
    expect(body.error.message).toMatch(/rotate/i);
    expect(body.error.message).toMatch(/pk_/);
  });

  it("allows a publishable key only from its listed origins", async () => {
    const pk = await seedKey(t, "akpub", {
      type: "pk_live",
      origins: ["https://acme.example", "https://*.preview.acme.example"],
      scopes: { form: ["read"], session: ["create", "write", "read"] },
    });

    expect((await forms({ "x-api-key": pk.raw, origin: "https://acme.example" })).status).toBe(200);
    expect((await forms({ "x-api-key": pk.raw, origin: "https://x.preview.acme.example" })).status).toBe(200);
    expect((await forms({ "x-api-key": pk.raw, origin: "https://evil.example" })).status).toBe(403);
    // No Origin at all is not a browser request, and a publishable key is only
    // publishable because it is pinned to one.
    expect((await forms({ "x-api-key": pk.raw })).status).toBe(403);
  });

  it("does not let a lookalike host satisfy a wildcard", () => {
    expect(originAllowed("https://app.example.com", ["https://*.example.com"])).toBe(true);
    expect(originAllowed("https://evil-example.com", ["https://*.example.com"])).toBe(false);
    expect(originAllowed("http://app.example.com", ["https://*.example.com"])).toBe(false);
    expect(originAllowed("https://example.com", [])).toBe(false);
  });
});

describe("legacy keys", () => {
  it("re-encodes the same digest bytes, losslessly", async () => {
    // The bulk backfill and the lazy repair both rely on this being exactly the
    // plugin's hasher for the same input.
    const { sha256Hex } = await import("@repo/form-schema");
    for (let i = 0; i < 25; i++) {
      const raw = `sk_live_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      expect(hexToBase64Url(sha256Hex(raw))).toBe(await hashApiKey(raw));
    }
  });

  it("repairs a pre-plugin key on first use and keeps it working", async () => {
    const legacy = await seedLegacyKey(t, "abcdef");
    const res = await forms({ authorization: `Bearer ${legacy.raw}` });
    expect(res.status, "a key minted before the plugin must not stop working").toBe(200);

    const row = await env.DB.prepare(
      `SELECT key, reference_id, prefix, config_id FROM api_keys WHERE id = ?`,
    )
      .bind(legacy.id)
      .first<{ key: string; reference_id: string; prefix: string; config_id: string }>();
    expect(row!.key).toBe(await hashApiKey(legacy.raw));
    expect(row!.reference_id).toBe(t.orgId);
    expect(row!.prefix).toBe("sk_live_");
    expect(row!.config_id).toBe("default");

    const audited = await env.DB.prepare(
      `SELECT action FROM audit_logs WHERE resource_id = ? AND action = 'api_key.legacy_migrated'`,
    )
      .bind(legacy.id)
      .first();
    expect(audited).toBeTruthy();

    // Still works on the second call, now through the normal path.
    expect((await forms({ authorization: `Bearer ${legacy.raw}` })).status).toBe(200);
  });

  it("keeps what a legacy key could always do, and nothing the bypass gave it", async () => {
    const legacy = await seedLegacyKey(t, "beefed");
    expect((await forms({ authorization: `Bearer ${legacy.raw}` })).status).toBe(200);

    // Creating a webhook was never in the legacy scope array. It only worked
    // because requirePermission returned early for any key at all.
    const res = await fetchApi("/api/webhooks", {
      method: "POST",
      headers: { authorization: `Bearer ${legacy.raw}`, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/hook", events: ["response.completed"] }),
    });
    expect(res.status).not.toBe(200);
  });
});

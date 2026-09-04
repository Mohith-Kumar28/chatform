import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * The per-key window, and the headers that make it usable.
 *
 * A rate limit a caller cannot see is a rate limit they cannot back off from, so
 * the headers are as much the feature as the limit is. This exercises layer two
 * — the per-key window stored on the key row and enforced atomically inside
 * verification. Layer one (the edge burst binding) is skipped where the runtime
 * does not implement `ratelimits`, and layer three is the monthly quota, which
 * `gates.test.ts` already covers as a 402.
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
    .bind(`sub_rl_${orgId}`, orgId, `dodo_rl_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("ratelimit");
  await subscribePro(t.orgId);
});

describe("per-key window", () => {
  it("counts down, then refuses with Retry-After", async () => {
    const key = await seedKey(t, "rlsmall", { rateLimitMax: 3, rateLimitTimeWindow: 60_000 });
    const call = () => fetchApi("/v1/forms", { headers: { "x-api-key": key.raw } });

    const first = await call();
    expect(first.status).toBe(200);
    expect(first.headers.get("ratelimit-limit")).toBe("3");
    expect(first.headers.get("ratelimit-remaining")).toBe("2");
    expect(first.headers.get("ratelimit-policy")).toBe("3;w=60");

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);

    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
    const retry = Number(blocked.headers.get("retry-after"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(60);

    const body = (await blocked.json()) as { error: { code: string; scope: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.scope).toBe("key");
  });

  it("lets the window roll over", async () => {
    const key = await seedKey(t, "rlroll", { rateLimitMax: 1, rateLimitTimeWindow: 60_000 });
    const call = () => fetchApi("/v1/forms", { headers: { "x-api-key": key.raw } });

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);

    // Push the window's start into the past rather than waiting a minute.
    await env.DB.prepare(`UPDATE api_keys SET last_request = ? WHERE id = ?`)
      .bind(Date.now() - 120_000, key.id)
      .run();

    expect((await call()).status).toBe(200);
    const row = await env.DB.prepare(`SELECT request_count FROM api_keys WHERE id = ?`)
      .bind(key.id)
      .first<{ request_count: number }>();
    expect(row!.request_count, "the counter resets rather than accumulating").toBe(1);
  });

  it("is a 429, not the 402 a spent quota returns", async () => {
    // Two different refusals that a client must handle differently: 429 means
    // slow down and retry, 402 means the month is spent and retrying is futile.
    const key = await seedKey(t, "rlcode", { rateLimitMax: 1, rateLimitTimeWindow: 60_000 });
    await fetchApi("/v1/forms", { headers: { "x-api-key": key.raw } });
    const blocked = await fetchApi("/v1/forms", { headers: { "x-api-key": key.raw } });
    expect(blocked.status).toBe(429);
    expect(blocked.status).not.toBe(402);
  });
});

describe("edge burst layer", () => {
  it.skipIf(!(env as unknown as { RATE_LIMIT?: unknown }).RATE_LIMIT)(
    "absorbs a spray of requests before any database work",
    async () => {
      const key = await seedKey(t, "rlburst", { rateLimitMax: 10_000 });
      let sawBurst = false;
      for (let i = 0; i < 40; i++) {
        const res = await fetchApi("/v1/forms", { headers: { "x-api-key": key.raw } });
        if (res.status === 429) {
          const body = (await res.json()) as { error: { scope: string } };
          if (body.error.scope === "burst") sawBurst = true;
          break;
        }
      }
      expect(sawBurst).toBe(true);
    },
  );
});

import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { BLOCK_TYPES } from "@repo/form-schema";

/**
 * The self-describing endpoints.
 *
 * These are what lets an integrator build a UI for 26 block types without
 * reading our source, and what the generated block reference is built from — so
 * the assertion that matters is coverage: every type, every time.
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
    .bind(`sub_meta_${orgId}`, orgId, `dodo_meta_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1meta");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1metakey")).raw;
});

describe("GET /v1/blocks", () => {
  it("describes every block type, with a schema and an answer contract", async () => {
    const res = await fetchApi("/v1/blocks", { headers: { "x-api-key": key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      schema_version: number;
      blocks: {
        type: string;
        summary: string;
        config_schema: { properties?: Record<string, unknown> };
        public_block: { ref: string; type: string };
        answer: { shape: string; ts_type: string; error_codes: string[] };
      }[];
    };

    expect(body.blocks.map((b) => b.type).sort()).toEqual([...BLOCK_TYPES].sort());
    for (const block of body.blocks) {
      expect(block.summary, `${block.type} has no summary`).toBeTruthy();
      expect(block.answer.shape, `${block.type} has no answer shape`).toBeTruthy();
      // The projection is produced by running toPublicBlock, not by describing
      // it, so this also proves every catalogued block actually parses.
      expect(block.public_block.type).toBe(block.type);
      expect(block.config_schema.properties, `${block.type} has no config schema`).toBeTruthy();
    }
  });

  it("serves one type on its own, with the counter-examples", async () => {
    const res = await fetchApi("/v1/blocks/rating", { headers: { "x-api-key": key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      answer: { counter_examples: { value: unknown; code: string }[]; error_codes: string[] };
    };
    expect(body.type).toBe("rating");
    expect(body.answer.error_codes).toContain("out_of_range");
    expect(body.answer.counter_examples.some((c) => c.code === "out_of_range")).toBe(true);
  });

  it("404s an unknown type rather than inventing one", async () => {
    const res = await fetchApi("/v1/blocks/telepathy", { headers: { "x-api-key": key } });
    expect(res.status).toBe(404);
  });

  it("is stable across calls", async () => {
    // Memoised per isolate; a second call must not produce a different document.
    const a = await (await fetchApi("/v1/blocks", { headers: { "x-api-key": key } })).text();
    const b = await (await fetchApi("/v1/blocks", { headers: { "x-api-key": key } })).text();
    expect(a).toBe(b);
  });
});

describe("GET /v1/me", () => {
  it("tells a key what it is and what it may do", async () => {
    const res = await fetchApi("/v1/me", { headers: { "x-api-key": key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      organization_id: string;
      key: { type: string; mode: string; scopes: Record<string, string[]> };
      plan: string;
    };
    expect(body.organization_id).toBe(t.orgId);
    expect(body.key.type).toBe("sk_live");
    expect(body.key.mode).toBe("live");
    expect(body.key.scopes.form).toContain("read");
    expect(body.plan).toBe("pro");
  });

  it("reports a test key as test mode", async () => {
    const testKey = (await seedKey(t, "v1metatest", { type: "sk_test" })).raw;
    const res = await fetchApi("/v1/me", { headers: { "x-api-key": testKey } });
    const body = (await res.json()) as { key: { mode: string; type: string } };
    expect(body.key.mode).toBe("test");
    expect(body.key.type).toBe("sk_test");
  });
});

describe("GET /v1/events", () => {
  it("lists the canonical names and the aliases that still match", async () => {
    const res = await fetchApi("/v1/events", { headers: { "x-api-key": key } });
    const body = (await res.json()) as { events: { name: string; also_matches: string[] }[] };
    const completed = body.events.find((e) => e.name === "response.completed");
    expect(completed).toBeTruthy();
    // An integration written against the old name has to keep working, and an
    // integrator reading this should be able to see why.
    expect(completed!.also_matches).toContain("submission.completed");
  });
});

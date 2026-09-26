import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { PLANS } from "@repo/entitlements";

/**
 * A gift from the platform console tells the customer, with the same card a
 * paying customer gets. Kept apart from `admin.test.ts` so the queue spy
 * cannot leak into the console's other suites.
 */

const DB = () => env as unknown as Bindings;
let admin: Tenant;
let customer: Tenant;
let jobs: { kind: string; [k: string]: unknown }[];

async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(plan.id, plan.id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, plan.seatPriceCents,
        JSON.stringify(plan.features), JSON.stringify(plan.limits), plan.sortOrder)
      .run();
  }
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  admin = await seedTenant("giftadmin");
  customer = await seedTenant("giftee");
});

beforeEach(async () => {
  (env as unknown as Record<string, string>).PLATFORM_ADMIN_EMAILS = "giftadmin@example.com";
  await DB().DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(customer.orgId).run();
  await invalidateEntitlements(DB(), customer.orgId);
  jobs = [];
  vi.spyOn(DB().Q_EMAIL, "send").mockImplementation(async (j: unknown) => {
    jobs.push(j as { kind: string });
  });
});

afterEach(() => vi.restoreAllMocks());

const post = (path: string, body: unknown) =>
  fetchApi(path, {
    method: "POST",
    headers: { cookie: admin.cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("gifts from the console", () => {
  it("mails the owner when a plan is gifted, marked as a gift with its end", async () => {
    const res = await post(`/api/admin/accounts/${customer.orgId}/plan`, { planId: "pro", months: 3, reason: "launch friend" });
    expect(res.status).toBe(200);
    const { endsAt } = await res.json<{ endsAt: number }>();
    const mail = jobs.find((j) => j.kind === "plan_upgraded");
    expect(mail).toMatchObject({ organizationId: customer.orgId, planId: "pro", previousPlanId: "free", gifted: true, endsAt });
  });

  it("does not mail when the gift is not a step up", async () => {
    const first = await post(`/api/admin/accounts/${customer.orgId}/plan`, { planId: "business", months: null, reason: "first" });
    expect(first.status).toBe(200);
    expect(jobs.filter((j) => j.kind === "plan_upgraded")).toHaveLength(1);
    jobs.length = 0;
    await post(`/api/admin/accounts/${customer.orgId}/plan`, { planId: "business", months: null, reason: "again" });
    expect(jobs.filter((j) => j.kind === "plan_upgraded")).toHaveLength(0);
  });

  it("mails the owner when a feature is switched on", async () => {
    const res = await post(`/api/admin/accounts/${customer.orgId}/overrides`, {
      kind: "feature",
      key: "partial_responses",
      value: "true",
      reason: "trial",
      expiresInDays: 14,
    });
    expect(res.status).toBe(200);
    const mail = jobs.find((j) => j.kind === "access_granted");
    expect(mail).toMatchObject({ organizationId: customer.orgId, grants: [{ kind: "feature", key: "partial_responses", value: "true" }] });
    expect(mail?.expiresAt).toBeGreaterThan(Date.now());
  });
});

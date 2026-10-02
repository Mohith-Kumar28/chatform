import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { PLANS } from "@repo/entitlements";

/**
 * The tiles above the forms grid: every form in a workspace, added up, the last
 * thirty days against the thirty before. Test responses and archived forms do
 * not count, and a member sees only the workspaces they were added to.
 */

const DB = () => (env as unknown as Bindings).DB;
const DAY = 86_400_000;

let owner: Tenant;
const wsB = "ws_orgov_b";
const formB = "frm_orgov_b";
const formArchived = "frm_orgov_gone";

type Overview = {
  today: number;
  kpis: Record<"responses" | "views" | "partial", { value: number; previous: number }> &
    Record<"completionRate" | "medianMs", { value: number | null; previous: number | null }>;
  series: Record<string, number[]>;
  locked: string[];
};

async function overview(cookie: string, ws: string): Promise<Overview> {
  const res = await fetchApi(`/api/analytics/overview?ws=${ws}`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as Overview;
}

function submission(id: string, formId: string, status: string, ageMs: number, durationMs: number, isTest = 0) {
  const at = Date.now() - ageMs;
  return DB()
    .prepare(
      `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at, completed_at, updated_at, duration_ms)
       VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?)`,
    )
    .bind(id, formId, owner.orgId, status, isTest, at - durationMs, status === "completed" ? at : null, at, durationMs);
}

async function subscribePro() {
  await DB()
    .prepare(
      `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
       VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await DB()
    .prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                  current_period_start, current_period_end, seats, created_at, updated_at)
       VALUES ('sub_orgov', ?, 'pro', 'dodo_orgov', 'monthly', 'active', ?, ?, 1, ?, ?)`,
    )
    .bind(owner.orgId, Date.now() - 1000, Date.now() + DAY * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as unknown as Bindings, owner.orgId);
}

beforeAll(async () => {
  await applySchema();
  owner = await seedTenant("orgov");
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const form = (id: string, ws: string, deletedAt: number | null) =>
    DB()
      .prepare(
        `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, 'F', ?, 'draft', ?, 'salt', ?, ?, ?)`,
      )
      .bind(id, owner.orgId, ws, owner.userId, id, JSON.stringify(minimalDoc(id)), now, now, deletedAt);
  await DB().batch([
    DB()
      .prepare(`INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, 'Sales', 'sales', ?, ?)`)
      .bind(wsB, owner.orgId, owner.userId, now + 1),
    form(formB, wsB, null),
    form(formArchived, owner.workspaceId, now),
    // Workspace A, this window: two finished, one still going, one test.
    submission("sub_orgov_1", owner.formId, "completed", 60_000, 1000),
    submission("sub_orgov_2", owner.formId, "completed", 120_000, 3000),
    submission("sub_orgov_3", owner.formId, "in_progress", 60_000, 0),
    submission("sub_orgov_t", owner.formId, "completed", 60_000, 1000, 1),
    // Workspace A, the window before.
    submission("sub_orgov_old", owner.formId, "completed", DAY * 40, 9000),
    // Workspace B, this window.
    submission("sub_orgov_b", formB, "completed", 60_000, 5000),
    // An archived form's response is not counted anywhere.
    submission("sub_orgov_gone", formArchived, "completed", 60_000, 1000),
    DB()
      .prepare(`INSERT INTO analytics_rollup_daily (id, date, form_id, views) VALUES (?, ?, ?, 5), (?, ?, ?, 2)`)
      .bind(`av_${today}_${owner.formId}`, today, owner.formId, `av_${today}_${formB}`, today, formB),
  ]);
});

describe("GET /api/analytics/overview", () => {
  it("adds up one workspace", async () => {
    const o = await overview(owner.cookie, owner.workspaceId);
    expect(o.kpis.responses).toEqual({ value: 2, previous: 1 });
    expect(o.kpis.partial).toEqual({ value: 1, previous: 0 });
    expect(o.kpis.views).toEqual({ value: 5, previous: 0 });
    expect(o.kpis.completionRate.value).toBeCloseTo(2 / 3);
    expect(o.kpis.completionRate.previous).toBe(1);
    expect(o.today).toBe(2);
    expect(o.series.responses).toHaveLength(30);
    expect(o.series.responses.at(-1)).toBe(2);
  });

  it("adds up every workspace with ws=all", async () => {
    const o = await overview(owner.cookie, "all");
    expect(o.kpis.responses.value).toBe(3);
    expect(o.kpis.views.value).toBe(7);
  });

  it("withholds the median without advanced analytics", async () => {
    const o = await overview(owner.cookie, "all");
    expect(o.kpis.medianMs).toEqual({ value: null, previous: null });
    expect(o.locked).toEqual(["medianMs"]);
  });

  it("counts only the workspaces a member was added to", async () => {
    const t = await seedTenant("orgov_mem");
    await DB().batch([
      DB()
        .prepare(`INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES ('mem_orgov_m', ?, ?, 'member', ?)`)
        .bind(owner.orgId, t.userId, Date.now()),
      DB()
        .prepare(`INSERT INTO workspace_members (id, workspace_id, member_id, role, created_at) VALUES ('wm_orgov', ?, 'mem_orgov_m', 'viewer', ?)`)
        .bind(owner.workspaceId, Date.now()),
      DB().prepare(`UPDATE sessions SET active_organization_id = ? WHERE user_id = ?`).bind(owner.orgId, t.userId),
    ]);
    expect((await overview(t.cookie, "all")).kpis.responses.value).toBe(2);
    const res = await fetchApi(`/api/analytics/overview?ws=${wsB}`, { headers: { cookie: t.cookie } });
    expect(res.status).toBe(404);
  });

  it("returns the median on Pro, and /v1 serves the same numbers", async () => {
    await subscribePro();
    const o = await overview(owner.cookie, "all");
    expect(o.kpis.medianMs).toEqual({ value: 3000, previous: 9000 });
    expect(o.locked).toEqual([]);

    const { raw } = await seedKey(owner, "orgov_key", { scopes: { analytics: ["read"] } });
    const res = await fetchApi(`/v1/analytics/overview`, { headers: { "x-api-key": raw } });
    expect(res.status).toBe(200);
    const v1 = (await res.json()) as Overview;
    expect(v1.kpis).toEqual(o.kpis);
  });
});

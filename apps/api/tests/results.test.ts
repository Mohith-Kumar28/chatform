import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";

/**
 * The submissions list and its status filter.
 *
 * The filter regressed when the status was moved out of an interpolated string
 * into a bound parameter: mixing `?` with `?1` makes SQLite renumber the
 * placeholders, so the statement wanted two bindings while three were supplied
 * and every request 500'd. The tenancy suite only asserted the 404 path, so
 * nothing caught it.
 */

let t: Tenant;

/** Put the tenant on Pro. The plan row exists because `subscriptions.plan_id` is an FK. */
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
    .bind(`sub_rs_${orgId}`, orgId, `dodo_rs_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("results");

  const now = Date.now();
  // submissions.form_version_id is a real FK — a published version must exist.
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES ('ver_x', ?, 1, ?, 'sum', ?, ?, ?)`,
  )
    .bind(t.formId, JSON.stringify(minimalDoc("results")), now, t.userId, now)
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at, duration_ms)
       VALUES (?, ?, 'ver_x', ?, 'chs_done', 'completed', ?, ?, 4200)`,
    ).bind("sbm_done", t.formId, t.orgId, now - 5000, now),
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at)
       VALUES (?, ?, 'ver_x', ?, 'chs_part', 'in_progress', ?)`,
    ).bind("sbm_partial", t.formId, t.orgId, now - 2000),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_1', 'sbm_done', ?, 'q_email', 'email', ?, ?)`,
    ).bind(t.formId, JSON.stringify("grace@hopper.dev"), now),
  ]);
});

const auth = () => ({ cookie: t.cookie });

interface Row {
  id: string;
  status: string;
  answers: { blockRef: string; value: unknown }[];
  transcript: unknown[];
}

describe("submissions list", () => {
  it("returns rows with their answers", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, { headers: auth() });
    expect(res.status).toBe(200);
    const rows = await res.json<Row[]>();
    expect(rows.length).toBeGreaterThan(0);
    const done = rows.find((r) => r.id === "sbm_done");
    expect(done?.answers[0]?.value).toBe("grace@hopper.dev");
  });

  it("filters by status", async () => {
    const completed = await fetchApi(`/api/forms/${t.formId}/submissions?status=completed`, {
      headers: auth(),
    });
    expect(completed.status).toBe(200);
    const rows = await completed.json<Row[]>();
    expect(rows.every((r) => r.status === "completed")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(false);
  });

  it("status=all degrades to completed-only on Free rather than erroring", async () => {
    // Unfinished responses are a Pro feature. `all` is what the dashboard sends by
    // default, so it narrows instead of failing — the results page must still render.
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    expect(res.status).toBe(200);
    const rows = await res.json<Row[]>();
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(false);
  });

  it("status=all returns both once the plan includes partials", async () => {
    await subscribePro(t.orgId);
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    const rows = await res.json<Row[]>();
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(true);
  });

  it("analytics responds", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/analytics`, { headers: auth() });
    expect(res.status).toBe(200);
    const a = await res.json<{ completed: number }>();
    expect(a.completed).toBeGreaterThanOrEqual(1);
  });

  it("CSV export responds with rows", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions/export`, { headers: auth() });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("grace@hopper.dev");
  });
});

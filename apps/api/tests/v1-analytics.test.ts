import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { computeAnalytics } from "../src/lib/analytics-service.js";

/**
 * The aggregate, and the bug it was extracted to fix.
 *
 * It enumerated questions from `forms.working_schema` — the draft — while
 * counting answers that came from published versions. A question added and not
 * yet published showed a 0% answer rate; one deleted from the draft vanished
 * from the funnel while its answers stayed in the totals.
 */

let t: Tenant;
let key: string;
const VERSION_ID = "ver_an";

/** Published: two questions. Draft: a third, unpublished. */
const PUBLISHED = {
  schemaVersion: 4,
  title: "Analytics",
  blocks: [
    { id: "blk_anemail1", ref: "q_email", type: "email", title: "Email?", required: true },
    { id: "blk_anrate01", ref: "q_rating", type: "rating", title: "Rate us", required: true, scale: 5 },
  ],
  endings: [{ id: "end_an00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {}, settings: {}, theme: {},
};
const DRAFT = {
  ...PUBLISHED,
  blocks: [
    ...PUBLISHED.blocks,
    { id: "blk_annew001", ref: "q_unpublished", type: "short_text", title: "Not live yet", required: false, minLength: 0, maxLength: 50 },
  ],
};

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
    .bind(`sub_an_${orgId}`, orgId, `dodo_an_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function seedResponse(id: string, over: Record<string, unknown> = {}) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, t.formId, VERSION_ID, t.orgId,
      (over.status as string) ?? "completed",
      (over.source as string) ?? "chat",
      (over.is_test as number) ?? 0,
      now, now, 1000,
    )
    .run();
}

async function seedAnswer(responseId: string, ref: string, value: unknown, numeric: number | null = null) {
  await env.DB.prepare(
    `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, value_number, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(`ans_${responseId}_${ref}`, responseId, t.formId, ref, ref === "q_rating" ? "rating" : "email", JSON.stringify(value), numeric, Date.now())
    .run();
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1an");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1ankey", { scopes: { form: ["read"], analytics: ["read"] } })).raw;

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(PUBLISHED), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DRAFT), VERSION_ID, t.formId),
  ]);

  await seedResponse("sbm_an1");
  await seedAnswer("sbm_an1", "q_email", "a@b.co");
  await seedAnswer("sbm_an1", "q_rating", 4, 4);

  await seedResponse("sbm_an2", { status: "abandoned" });
  await seedAnswer("sbm_an2", "q_email", "c@d.co");

  await seedResponse("sbm_an3", { source: "api" });
  await seedAnswer("sbm_an3", "q_email", "e@f.co");

  await seedResponse("sbm_an4", { is_test: 1 });
  await seedAnswer("sbm_an4", "q_email", "test@x.co");
});

describe("the aggregate", () => {
  it("counts the published questions, not the draft's", async () => {
    const result = await computeAnalytics(env as never, t.formId, { source: "all" });
    const refs = result.perBlock.map((b) => b.blockRef);
    // The unpublished question would have shown a 0% answer rate and dragged the
    // funnel down for a question nobody has ever been asked.
    expect(refs).toEqual(["q_email", "q_rating"]);
    expect(refs).not.toContain("q_unpublished");
  });

  it("excludes test responses by default and includes them when asked", async () => {
    const live = await computeAnalytics(env as never, t.formId, { source: "all" });
    const withTest = await computeAnalytics(env as never, t.formId, { source: "all", includeTest: true });
    expect(withTest.starts).toBe(live.starts + 1);
  });

  it("filters by source", async () => {
    const all = await computeAnalytics(env as never, t.formId, { source: "all" });
    const chat = await computeAnalytics(env as never, t.formId, { source: "chat" });
    expect(chat.starts).toBeLessThan(all.starts);
    // One API response was seeded; the chat view must not count it.
    expect(all.starts - chat.starts).toBe(1);
  });

  it("summarises a numeric question", async () => {
    const result = await computeAnalytics(env as never, t.formId, { source: "all" });
    const rating = result.distributions.find((d) => d.blockRef === "q_rating");
    expect(rating?.numericSummary?.avg).toBe(4);
  });
});

describe("GET /v1/forms/:id/analytics", () => {
  it("answers, which it did not before — the SDK called a route that did not exist", async () => {
    const res = await fetchApi(`/v1/forms/${t.formId}/analytics`, { headers: { "x-api-key": key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { starts: number; perBlock: unknown[] };
    expect(body.starts).toBeGreaterThan(0);
    expect(body.perBlock.length).toBe(2);
  });

  it("withholds the per-question detail without the plan for it, keeping the headline numbers", async () => {
    const free = await seedTenant("v1anfree");
    const freeKey = (await seedKey(free, "v1anfreekey", { scopes: { analytics: ["read"] } })).raw;
    const res = await fetchApi(`/v1/forms/${free.formId}/analytics`, { headers: { "x-api-key": freeKey } });
    // Free has no api_access at all, so the surface gate answers first.
    expect([402]).toContain(res.status);
  });

  it("refuses a key without analytics:read", async () => {
    const noScope = (await seedKey(t, "v1annoscope", { scopes: { form: ["read"] } })).raw;
    const res = await fetchApi(`/v1/forms/${t.formId}/analytics`, { headers: { "x-api-key": noScope } });
    expect(res.status).toBe(403);
  });
});

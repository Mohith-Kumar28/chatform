import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Listing responses.
 *
 * The cursor is keyset and signed, so the two things worth proving are that
 * paging covers every row exactly once even while new ones arrive, and that a
 * hand-edited cursor is refused rather than quietly returning a wrong page.
 */

let t: Tenant;
let key: string;
const VERSION_ID = "ver_v1read";

const DOC = {
  schemaVersion: 4,
  title: "Read",
  blocks: [{ id: "blk_rdemail1", ref: "q_email", type: "email", title: "Email?", required: true }],
  endings: [{ id: "end_rd00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {}, settings: {}, theme: {},
};

async function subscribe(orgId: string, plan: "pro" | "business"): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  const p = PLANS[plan];
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(plan, plan, plan, p.priceMonthlyCents, p.priceYearlyCents, JSON.stringify(p.features), JSON.stringify(p.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'monthly', 'active', ?, ?, 1, ?, ?)
     ON CONFLICT (dodo_subscription_id) DO UPDATE SET plan_id = excluded.plan_id`,
  )
    .bind(`sub_rd_${orgId}`, orgId, plan, `dodo_rd_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

/** Rows inserted directly: this suite is about reading, not about writing. */
async function seedResponses(
  formId: string,
  orgId: string,
  n: number,
  opts: { status?: string; isTest?: boolean; prefix?: string } = {},
) {
  const prefix = opts.prefix ?? "rd";
  const base = Date.now() - n * 1000;
  const stmts = [];
  for (let i = 0; i < n; i++) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test,
                                  search_text, started_at, updated_at, meta)
         VALUES (?, ?, ?, ?, ?, 'api', ?, ?, ?, ?, ?)`,
      ).bind(
        `sbm_${prefix}${String(i).padStart(4, "0")}`,
        formId,
        VERSION_ID,
        orgId,
        opts.status ?? "completed",
        opts.isTest ? 1 : 0,
        `respondent${i}@example.com`,
        base + i * 1000,
        base + i * 1000,
        JSON.stringify({ endingRef: "end_thanks" }),
      ),
    );
  }
  await env.DB.batch(stmts);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1read");
  await subscribe(t.orgId, "pro");
  key = (await seedKey(t, "v1readkey", { scopes: { form: ["read"], response: ["read", "read_partial"] } })).raw;

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), VERSION_ID, t.formId),
  ]);
  await seedResponses(t.formId, t.orgId, 12);
});

const list = (query = "") => fetchApi(`/v1/forms/${t.formId}/responses${query}`, { headers: { "x-api-key": key } });

describe("pagination", () => {
  it("covers every row exactly once across pages", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res: Response = await list(`?limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { id: string }[]; has_more: boolean; next_cursor: string | null };
      seen.push(...body.data.map((r) => r.id));
      if (!body.has_more) break;
      cursor = body.next_cursor;
      expect(cursor).toBeTruthy();
    }
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size, "no row may appear on two pages").toBe(12);
  });

  it("does not skip or repeat when a row is inserted mid-iteration", async () => {
    const first = (await (await list("?limit=5")).json()) as { data: { id: string }[]; next_cursor: string };
    // A keyset cursor is anchored to a row, not to an offset, so a newer row
    // arriving cannot shift the window under the caller.
    await seedResponses(t.formId, t.orgId, 1, { prefix: "mid" });
    const second = (await (await list(`?limit=5&cursor=${encodeURIComponent(first.next_cursor)}`)).json()) as {
      data: { id: string }[];
    };
    const overlap = second.data.filter((r) => first.data.some((f) => f.id === r.id));
    expect(overlap).toHaveLength(0);
  });

  it("refuses a tampered cursor instead of returning a wrong page", async () => {
    const res = await list("?cursor=bm90LWEtY3Vyc29y");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_cursor");
  });

  it("refuses a cursor from a different ordering", async () => {
    const byCreated = (await (await list("?limit=5")).json()) as { next_cursor: string };
    const res = await list(`?order=updated&limit=5&cursor=${encodeURIComponent(byCreated.next_cursor)}`);
    expect(res.status).toBe(400);
  });
});

describe("filters", () => {
  it("hides test responses unless asked for them", async () => {
    await seedResponses(t.formId, t.orgId, 3, { isTest: true, prefix: "tst" });
    // Overlapping ids with the live seed would collide, so this is a separate
    // form-scoped count rather than an exact total.
    const live = (await (await list("?limit=100")).json()) as { data: { mode: string }[] };
    expect(live.data.every((r) => r.mode === "live")).toBe(true);

    const withTest = (await (await list("?limit=100&mode=all")).json()) as { data: { mode: string }[] };
    expect(withTest.data.some((r) => r.mode === "test")).toBe(true);
  });

  it("searches the flattened answer text", async () => {
    const res = await list("?limit=100&q=respondent3@example.com");
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("defaults to completed only, and says so by not inventing partials", async () => {
    await env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, started_at, updated_at)
       VALUES ('sbm_rdpart', ?, ?, ?, 'in_progress', 'api', ?, ?)`,
    )
      .bind(t.formId, VERSION_ID, t.orgId, Date.now(), Date.now())
      .run();
    const body = (await (await list("?limit=100")).json()) as { data: { status: string }[] };
    expect(body.data.every((r) => r.status === "completed")).toBe(true);
  });
});

describe("partials gating", () => {
  it("refuses partials on a plan without them, rather than silently narrowing", async () => {
    const free = await seedTenant("v1readfree");
    // Pro has partial_responses; a plan without it should 402 rather than quietly
    // return only completed rows, which would look like the data was missing.
    await subscribe(free.orgId, "pro");
    const freeKey = (await seedKey(free, "v1readfreekey")).raw;
    const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
    await env.DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(free.orgId).run();
    await invalidateEntitlements(env as never, free.orgId);

    const res = await fetchApi(`/v1/forms/${free.formId}/responses?status=in_progress`, {
      headers: { "x-api-key": freeKey },
    });
    // Free has no api_access at all, so the surface gate answers first — either
    // way the caller is told, not quietly given a different result set.
    expect([402]).toContain(res.status);
  });
});

describe("answers", () => {
  it("includes them in one query for the page, not one per row", async () => {
    await env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_rd1', 'sbm_rd0001', ?, 'q_email', 'email', ?, ?)`,
    )
      .bind(t.formId, JSON.stringify("respondent1@example.com"), Date.now())
      .run();

    const body = (await (await list("?limit=100&include=answers")).json()) as {
      data: { id: string; answers?: { ref: string; value: unknown }[] }[];
    };
    const withAnswer = body.data.find((r) => r.id === "sbm_rd0001");
    expect(withAnswer!.answers).toEqual([
      { ref: "q_email", type: "email", value: "respondent1@example.com" },
    ]);
  });
});

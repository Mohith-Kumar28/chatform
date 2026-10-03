import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, seedTenant } from "./helpers.js";
import { drainStoragePurges, prunePendingUploads } from "../src/lib/storage-purges.js";

/**
 * Deleting a row must take what it pointed at outside D1 with it.
 *
 * Uploads live in R2, conversations in a Durable Object each, knowledge in
 * Vectorize. The database's own triggers queue those on every delete, cascades
 * included, and the cron drains the queue; these tests walk the routes that
 * used to leave them behind.
 */

type T = Awaited<ReturnType<typeof seedTenant>>;
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function addUpload(t: T, id: string, sessionId: string | null, opts: { status?: string; createdAt?: number } = {}) {
  const key = `uploads/${t.orgId}/${t.formId}/${sessionId ?? "none"}/${id}.png`;
  await env.DB.prepare(
    `INSERT INTO files (id, organization_id, form_id, session_id, uploaded_by, r2_key, filename, mime, size_bytes, status, created_at)
     VALUES (?1, ?2, ?3, ?4, 'respondent', ?5, 'x.png', 'image/png', 5, ?6, ?7)`,
  )
    .bind(id, t.orgId, t.formId, sessionId, key, opts.status ?? "confirmed", opts.createdAt ?? Date.now())
    .run();
  await env.R2.put(key, "bytes");
  return key;
}

async function addSession(t: T, id: string, submissionId?: string) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES (?1, ?2, 1, '{}', 'ck', ?3, ?4, ?3) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(`fv_${t.formId}`, t.formId, now, t.userId)
    .run();
  if (submissionId) {
    await env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at)
       VALUES (?1, ?2, ?6, ?3, ?4, 'completed', ?5, ?5)`,
    )
      .bind(submissionId, t.formId, t.orgId, id, now, `fv_${t.formId}`)
      .run();
  }
  await env.DB.prepare(
    `INSERT INTO chat_sessions (id, form_id, organization_id, respondent_token_hash, status, submission_id, created_at, last_activity_at)
     VALUES (?1, ?2, ?3, ?4, 'completed', ?5, ?6, ?6)`,
  )
    .bind(id, t.formId, t.orgId, `h_${id}`, submissionId ?? null, now)
    .run();
}

const queued = async (ref: string) =>
  (await env.DB.prepare(`SELECT kind FROM storage_purges WHERE ref = ?`).bind(ref).all<{ kind: string }>()).results?.map((r) => r.kind) ?? [];

describe("storage purges", () => {
  beforeAll(applySchema);

  it("deleting a response takes its uploads and its conversation object", async () => {
    const t = await seedTenant("purgeresp");
    await addSession(t, "chs_purgeresp", "sbm_purgeresp");
    const key = await addUpload(t, "file_purgeresp", "chs_purgeresp");

    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, {
      method: "DELETE",
      headers: { "content-type": "application/json", cookie: t.cookie, origin: "http://localhost:3000" },
      body: JSON.stringify({ ids: ["sbm_purgeresp"] }),
    });
    expect(res.ok).toBe(true);

    expect(await env.DB.prepare(`SELECT id FROM files WHERE id = 'file_purgeresp'`).first()).toBeNull();
    expect(await queued(key)).toEqual(["r2"]);
    expect(await queued("chs_purgeresp")).toEqual(["session"]);

    await drainStoragePurges(env);
    expect(await env.R2.head(key)).toBeNull();
    expect(await queued(key)).toEqual([]);
    expect(await queued("chs_purgeresp")).toEqual([]);
  });

  it("deleting an organization from settings cleans up like account deletion, and cancels billing", async () => {
    const t = await seedTenant("purgeorg");
    await addSession(t, "chs_purgeorg");
    const key = await addUpload(t, "file_purgeorg", "chs_purgeorg");
    const { PLANS } = await import("@repo/entitlements");
    await env.DB.prepare(
      `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
       VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
    )
      .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
      .run();
    await env.DB.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                  current_period_start, current_period_end, seats, created_at, updated_at)
       VALUES ('sub_purgeorg', ?1, 'pro', 'dodo_sub_purgeorg', 'monthly', 'active', ?2, ?3, 1, ?2, ?2)`,
    )
      .bind(t.orgId, Date.now(), Date.now() + 20 * 86_400_000)
      .run();

    const calls: { method: string; url: string; body: string }[] = [];
    const bindings = env as unknown as { DODO_API_KEY?: string };
    bindings.DODO_API_KEY = "test_key";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("dodopayments")) return realFetch(input, init);
      calls.push({ method: init?.method ?? "GET", url, body: typeof init?.body === "string" ? init.body : "" });
      const body = (init?.method ?? "GET") === "GET" ? { subscription_id: "dodo_sub_purgeorg", status: "active" } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const res = await fetchApi("/api/auth/organization/delete", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: t.cookie, origin: "http://localhost:3000" },
        body: JSON.stringify({ organizationId: t.orgId }),
      });
      expect(res.ok).toBe(true);
    } finally {
      delete bindings.DODO_API_KEY;
    }

    const cancel = calls.find((c) => c.method === "PATCH");
    expect(cancel?.url).toMatch(/\/subscriptions\/dodo_sub_purgeorg$/);
    expect(JSON.parse(cancel!.body)).toEqual({ status: "cancelled" });

    expect(await env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(t.orgId).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM forms WHERE id = ?`).bind(t.formId).first()).toBeNull();
    expect(await env.R2.head(key)).toBeNull();
    // The conversation went by cascade, and was still queued.
    expect(await queued("chs_purgeorg")).toEqual(["session"]);
  });

  it("deleting a workspace keeps its archived forms restorable elsewhere", async () => {
    const t = await seedTenant("purgews");
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES ('ws_purgews_b', ?, 'Second', 'second', ?, ?)`).bind(
        t.orgId,
        t.userId,
        now,
      ),
      env.DB.prepare(`UPDATE forms SET workspace_id = 'ws_purgews_b', deleted_at = ?1, purge_at = ?2 WHERE id = ?3`).bind(
        now,
        now + 30 * 86_400_000,
        t.formId,
      ),
    ]);

    const res = await fetchApi("/api/workspaces/ws_purgews_b", {
      method: "DELETE",
      headers: { cookie: t.cookie, origin: "http://localhost:3000" },
    });
    expect(res.ok).toBe(true);

    const form = await env.DB.prepare(`SELECT workspace_id AS ws FROM forms WHERE id = ?`).bind(t.formId).first<{ ws: string }>();
    expect(form?.ws).toBe(t.workspaceId);
  });

  it("drops uploads that were never confirmed, a day on", async () => {
    const t = await seedTenant("purgepend");
    const stale = await addUpload(t, "file_purgepend_old", null, { status: "pending", createdAt: Date.now() - 2 * 86_400_000 });
    const fresh = await addUpload(t, "file_purgepend_new", null, { status: "pending" });

    await prunePendingUploads(env);
    await drainStoragePurges(env);

    expect(await env.R2.head(stale)).toBeNull();
    expect(await env.R2.head(fresh)).not.toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM files WHERE id = 'file_purgepend_new'`).first()).toBeTruthy();
  });
});

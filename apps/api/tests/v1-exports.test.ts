import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { runExport } from "../src/lib/exports.js";
import { signDownload } from "../src/lib/signed-url.js";

/**
 * Exports and signed downloads.
 *
 * `response:export` and `file:read` were grantable scopes with no endpoint
 * behind them, so the two things worth proving are that the whole round trip
 * works — request, queue, R2, signed URL, bytes — and that the signature is
 * actually a credential: an unsigned, edited or expired link must get nothing.
 */

let t: Tenant;
let key: string;
let noScopeKey: string;
const VERSION_ID = "ver_v1exp";

const DOC = {
  schemaVersion: 4,
  title: "Export",
  blocks: [
    { id: "blk_xpemail1", ref: "q_email", type: "email", title: "Email?", required: true },
    { id: "blk_xprate01", ref: "q_rating", type: "rating", title: "Rate us", required: false, max: 5 },
  ],
  endings: [{ id: "end_xp00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
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
    .bind(`sub_xp_${orgId}`, orgId, plan, `dodo_xp_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1exp");
  await subscribe(t.orgId, "business");
  key = (await seedKey(t, "v1expkey", {
    scopes: { form: ["read"], response: ["read", "export"], file: ["read", "write"] },
  })).raw;
  noScopeKey = (await seedKey(t, "v1expnos", { scopes: { form: ["read"], response: ["read"] } })).raw;

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

  // Two completed responses and one still in progress, so the default status
  // filter has something to leave out.
  const rows = [
    { id: "sbm_xp0001", status: "completed", email: "ada@example.com", rating: 5 },
    { id: "sbm_xp0002", status: "completed", email: "grace@example.com", rating: 3 },
    { id: "sbm_xp0003", status: "in_progress", email: "alan@example.com", rating: null },
  ];
  const stmts = [];
  for (const [i, r] of rows.entries()) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test,
                                  search_text, started_at, updated_at, meta)
         VALUES (?, ?, ?, ?, ?, 'api', 0, ?, ?, ?, ?)`,
      ).bind(r.id, t.formId, VERSION_ID, t.orgId, r.status, r.email, now + i, now + i, JSON.stringify({ endingRef: "end_thanks" })),
      env.DB.prepare(
        `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
         VALUES (?, ?, ?, 'q_email', 'email', ?, ?)`,
      ).bind(`ans_xp${i}a`, r.id, t.formId, JSON.stringify(r.email), now),
    );
    if (r.rating !== null) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, value_number, updated_at)
           VALUES (?, ?, ?, 'q_rating', 'rating', ?, ?, ?)`,
        ).bind(`ans_xp${i}b`, r.id, t.formId, JSON.stringify(r.rating), r.rating, now),
      );
    }
  }
  await env.DB.batch(stmts);
});

function post(path: string, body?: unknown, k = key) {
  return fetchApi(path, {
    method: "POST",
    headers: { "x-api-key": k, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

describe("requesting an export", () => {
  it("refuses a key without response:export", async () => {
    const res = await post(`/v1/forms/${t.formId}/exports`, {}, noScopeKey);
    expect(res.status).toBe(403);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("insufficient_scope");
  });

  it("404s a form in another organization", async () => {
    const other = await seedTenant("v1expother");
    const res = await post(`/v1/forms/${other.formId}/exports`);
    expect(res.status).toBe(404);
  });

  it("queues and returns the row before any work happens", async () => {
    const res = await post(`/v1/forms/${t.formId}/exports`, { format: "csv" });
    expect(res.status).toBe(202);
    const body = await res.json() as { id: string; status: string; download_url: string | null };
    expect(body.status).toBe("queued");
    // Nothing to download yet, and saying otherwise would hand out a URL for
    // an object that does not exist.
    expect(body.download_url).toBeNull();
    expect(body.id).toMatch(/^exp_/);
  });
});

describe("running an export", () => {
  it("writes a CSV of completed responses with labelled columns", async () => {
    const created = await (await post(`/v1/forms/${t.formId}/exports`, { format: "csv" })).json() as { id: string };
    await runExport(env as never, created.id);

    const res = await fetchApi(`/v1/exports/${created.id}`, { headers: { "x-api-key": key } });
    const view = await res.json() as { status: string; row_count: number; download_url: string };
    expect(view.status).toBe("ready");
    // The in-progress row is left out: the default status filter is completed.
    expect(view.row_count).toBe(2);
    expect(view.download_url).toContain("/d/export/");

    const dl = await fetchApi(new URL(view.download_url).pathname + new URL(view.download_url).search);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("text/csv");
    const csv = await dl.text();
    // The question, not the ref, and the ref in brackets so a column can still
    // be matched back to the document.
    expect(csv.split("\n")[0]).toContain("Email? (q_email)");
    expect(csv).toContain("ada@example.com");
    expect(csv).not.toContain("alan@example.com");
  });

  it("includes unfinished responses when they are asked for", async () => {
    const created = await (await post(`/v1/forms/${t.formId}/exports`, { status: ["completed", "in_progress"] })).json() as { id: string };
    await runExport(env as never, created.id);
    const view = await (await fetchApi(`/v1/exports/${created.id}`, { headers: { "x-api-key": key } })).json() as {
      row_count: number; download_url: string;
    };
    expect(view.row_count).toBe(3);
    const url = new URL(view.download_url);
    expect(await (await fetchApi(url.pathname + url.search)).text()).toContain("alan@example.com");
  });

  it("emits one JSON object per line for format=json", async () => {
    const created = await (await post(`/v1/forms/${t.formId}/exports`, { format: "json" })).json() as { id: string };
    await runExport(env as never, created.id);
    const view = await (await fetchApi(`/v1/exports/${created.id}`, { headers: { "x-api-key": key } })).json() as { download_url: string };
    const url = new URL(view.download_url);
    const text = await (await fetchApi(url.pathname + url.search)).text();
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as { object: string; answers: Record<string, unknown> };
    expect(first.object).toBe("response");
    expect(first.answers.q_email).toBeTypeOf("string");
  });

  it("is a no-op on redelivery, because the queue is at-least-once", async () => {
    const created = await (await post(`/v1/forms/${t.formId}/exports`)).json() as { id: string };
    await runExport(env as never, created.id);
    const after = await env.DB.prepare(`SELECT completed_at FROM exports WHERE id = ?`).bind(created.id).first<{ completed_at: number }>();
    await runExport(env as never, created.id);
    const again = await env.DB.prepare(`SELECT completed_at, status FROM exports WHERE id = ?`).bind(created.id).first<{ completed_at: number; status: string }>();
    expect(again!.status).toBe("ready");
    expect(again!.completed_at).toBe(after!.completed_at);
  });
});

describe("signed downloads", () => {
  let readyId: string;

  beforeAll(async () => {
    const created = await (await post(`/v1/forms/${t.formId}/exports`)).json() as { id: string };
    await runExport(env as never, created.id);
    readyId = created.id;
  });

  it("gives nothing without a signature", async () => {
    expect((await fetchApi(`/d/export/${readyId}`)).status).toBe(404);
  });

  it("gives nothing for a tampered signature", async () => {
    const { url } = await signDownload(env as never, "export", readyId);
    const u = new URL(url);
    u.searchParams.set("sig", "0".repeat(32));
    expect((await fetchApi(u.pathname + u.search)).status).toBe(404);
  });

  it("gives nothing once expired", async () => {
    // A negative TTL is an already-past deadline signed with the real secret,
    // which is the only way to distinguish "expired" from "forged" here.
    const { url } = await signDownload(env as never, "export", readyId, -60);
    const u = new URL(url);
    expect((await fetchApi(u.pathname + u.search)).status).toBe(404);
  });

  it("will not serve one kind's object under the other kind's signature", async () => {
    const { url } = await signDownload(env as never, "file", readyId);
    const u = new URL(url);
    // Same id, same secret, different kind — the kind is inside the payload.
    expect((await fetchApi(`/d/export/${readyId}${u.search}`)).status).toBe(404);
  });
});

describe("files", () => {
  it("resolves a confirmed file to metadata and a signed URL, and serves the bytes", async () => {
    const now = Date.now();
    const r2Key = `uploads/${t.orgId}/${t.formId}/sess_xp/file_xp0001-cv.txt`;
    await env.R2.put(r2Key, "hello from a respondent");
    await env.DB.prepare(
      `INSERT INTO files (id, organization_id, form_id, session_id, uploaded_by, r2_key, filename, mime, size_bytes, status, created_at, confirmed_at)
       VALUES ('file_xp0001', ?, ?, 'sess_xp', 'respondent', ?, 'cv.txt', 'text/plain', 23, 'confirmed', ?, ?)`,
    )
      .bind(t.orgId, t.formId, r2Key, now, now)
      .run();

    const res = await fetchApi(`/v1/files/file_xp0001`, { headers: { "x-api-key": key } });
    expect(res.status).toBe(200);
    const view = await res.json() as { filename: string; download_url: string };
    expect(view.filename).toBe("cv.txt");

    const u = new URL(view.download_url);
    const dl = await fetchApi(u.pathname + u.search);
    expect(await dl.text()).toBe("hello from a respondent");
    // Respondent bytes are never served with a renderable type from one of our
    // origins, whatever they were uploaded as.
    expect(dl.headers.get("content-type")).toBe("application/octet-stream");
    expect(dl.headers.get("content-disposition")).toContain("attachment");
  });

  it("404s a file belonging to another organization", async () => {
    const other = await seedTenant("v1expfile");
    await env.DB.prepare(
      `INSERT INTO files (id, organization_id, form_id, uploaded_by, r2_key, filename, mime, size_bytes, status, created_at, confirmed_at)
       VALUES ('file_xpother', ?, ?, 'respondent', 'uploads/other/x', 'secret.txt', 'text/plain', 3, 'confirmed', ?, ?)`,
    )
      .bind(other.orgId, other.formId, Date.now(), Date.now())
      .run();
    expect((await fetchApi(`/v1/files/file_xpother`, { headers: { "x-api-key": key } })).status).toBe(404);
  });
});

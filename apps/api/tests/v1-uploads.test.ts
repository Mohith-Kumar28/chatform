import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Uploading a file headlessly.
 *
 * The intent → PUT → confirm trio was respondent-token only, so a
 * `file_upload` question could not be answered over the API at all — which
 * made every form containing one impossible to complete programmatically. The
 * router is now mounted twice from one implementation, and the two auth paths
 * are alternatives rather than a fallback chain: that is the part worth
 * pinning, because a fallback would mean a leaked session id plus any valid
 * key was a way in.
 */

let t: Tenant;
let key: string;
let noScopeKey: string;
let sessionId: string;
let respondentToken: string;
const VERSION_ID = "ver_v1up";

const DOC = {
  schemaVersion: 4,
  title: "Uploads",
  blocks: [
    {
      id: "blk_upfile01", ref: "q_cv", type: "file_upload", title: "Your CV?", required: false,
      accept: ["application/pdf"], maxFiles: 1, maxSizeMB: 10,
    },
  ],
  endings: [{ id: "end_up00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
  theme: {},
};

async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  const p = PLANS.pro;
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(p.priceMonthlyCents, p.priceYearlyCents, JSON.stringify(p.features), JSON.stringify(p.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?)
     ON CONFLICT (dodo_subscription_id) DO UPDATE SET plan_id = excluded.plan_id`,
  )
    .bind(`sub_up_${orgId}`, orgId, `dodo_up_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1up");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1upkey", {
    scopes: { form: ["read"], session: ["create", "write", "read"], file: ["read", "write"] },
  })).raw;
  noScopeKey = (await seedKey(t, "v1upnos", { scopes: { form: ["read"], session: ["create", "write", "read"] } })).raw;

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

  const opened = await fetchApi(`/v1/forms/${t.formId}/sessions`, {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: "{}",
  });
  const body = (await opened.json()) as { sessionId: string; respondentToken: string };
  sessionId = body.sessionId;
  respondentToken = body.respondentToken;
});

const INTENT = { ref: "q_cv", filename: "cv.pdf", mime: "application/pdf", size: 11 };

function intent(path: string, headers: Record<string, string>, body: unknown = INTENT) {
  return fetchApi(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("the API-key path", () => {
  it("runs intent → PUT → confirm end to end", async () => {
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": key });
    expect(res.status).toBe(200);
    const { fileId, uploadUrl } = (await res.json()) as { fileId: string; uploadUrl: string };
    // The URL a key gets back must be one a key can follow.
    expect(uploadUrl).toBe(`/v1/sessions/${sessionId}/uploads/${fileId}`);

    const put = await fetchApi(uploadUrl, {
      method: "PUT",
      headers: { "x-api-key": key, "content-type": "application/pdf" },
      body: "hello world",
    });
    expect(put.status).toBe(200);

    const confirm = await fetchApi(`${uploadUrl}/confirm`, { method: "POST", headers: { "x-api-key": key } });
    expect(confirm.status).toBe(200);

    const row = await env.DB.prepare(`SELECT status, organization_id FROM files WHERE id = ?`)
      .bind(fileId)
      .first<{ status: string; organization_id: string }>();
    expect(row!.status).toBe("confirmed");
    // The same row a respondent upload writes, in the same organization.
    expect(row!.organization_id).toBe(t.orgId);
  });

  it("refuses a key without file:write", async () => {
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": noScopeKey });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("insufficient_scope");
  });

  it("404s a session belonging to another organization", async () => {
    const other = await seedTenant("v1upother");
    await subscribePro(other.orgId);
    const otherKey = (await seedKey(other, "v1upotherk", {
      scopes: { form: ["read"], session: ["create", "write", "read"], file: ["write"] },
    })).raw;
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": otherKey });
    expect(res.status).toBe(404);
  });
});

describe("the two paths are alternatives, not a fallback chain", () => {
  it("does not accept a respondent token on the /v1 mount", async () => {
    // A session token is not organization proof. If /v1 fell back to it, a
    // leaked token would reach a surface that assumes an API key.
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, {
      "x-respondent-token": respondentToken,
    });
    expect(res.status).toBe(401);
  });

  it("does not accept an API key on the /p mount", async () => {
    // And the reverse: a valid key must not be a way past a wrong or missing
    // respondent token, or a leaked session id plus any key would be a way in.
    const res = await intent(`/p/sessions/${sessionId}/uploads/intent`, { "x-api-key": key });
    expect(res.status).toBe(401);
  });

  it("still works for a respondent holding the session's own token", async () => {
    const res = await intent(`/p/sessions/${sessionId}/uploads/intent`, {
      "x-respondent-token": respondentToken,
    });
    expect(res.status).toBe(200);
    const { fileId, uploadUrl } = (await res.json()) as { fileId: string; uploadUrl: string };
    // The mount decides the URL handed back, so a respondent is never told to
    // PUT against a path only a key can reach.
    expect(uploadUrl).toBe(`/p/sessions/${sessionId}/uploads/${fileId}`);
  });
});

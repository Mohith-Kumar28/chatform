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

/**
 * A real PDF, fifteen bytes of it.
 *
 * This fixture used to declare `application/pdf` and upload the string
 * "hello world", which `confirm` now refuses — the bytes have to be the type
 * the intent registered. Worth keeping the fixture honest rather than relaxing
 * the check: an upload whose contents disagree with its label is the case the
 * check exists for.
 */
const PDF_BYTES = "%PDF-1.7\n%%EOF\n";
const INTENT = { ref: "q_cv", filename: "cv.pdf", mime: "application/pdf", size: PDF_BYTES.length };

function intent(path: string, headers: Record<string, string>, body: unknown = INTENT) {
  return fetchApi(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * What a file is, decided by its bytes.
 *
 * Every type decision in this flow used to come from something the client
 * said: a `mime` field in the intent body, and then a `Content-Type` header on
 * the PUT that was never compared to it. The stored value is what the download
 * and asset routes read when deciding whether something may be rendered
 * inline, so a label nobody checked was a label that decided how the bytes
 * would be served.
 */
describe("bytes decide the type", () => {
  const openIntent = async (body: unknown) => {
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": key }, body);
    expect(res.status).toBe(200);
    return (await res.json()) as { fileId: string; uploadUrl: string };
  };

  it("refuses at confirm when the bytes are not the declared type", async () => {
    const { fileId, uploadUrl } = await openIntent({ ...INTENT, size: 2 });
    // An `MZ` header: a Windows executable wearing a PDF's name.
    const put = await fetchApi(uploadUrl, {
      method: "PUT",
      headers: { "x-api-key": key, "content-type": "application/pdf" },
      body: "MZ",
    });
    expect(put.status).toBe(200);

    const confirm = await fetchApi(`${uploadUrl}/confirm`, { method: "POST", headers: { "x-api-key": key } });
    expect(confirm.status).toBe(415);
    expect(await confirm.json()).toMatchObject({ error: { code: "unsupported_type" } });

    // Refused means gone, not merely unconfirmed: nothing has referenced it,
    // because `confirm` is what makes an upload visible to the form.
    const row = await env.DB.prepare(`SELECT status FROM files WHERE id = ?`).bind(fileId).first<{ status: string }>();
    expect(row!.status).toBe("rejected");
    expect(await env.R2.head(`uploads/${t.orgId}/${t.formId}/${sessionId}/${fileId}-cv.pdf`)).toBe(null);
  });

  it("stores the type the intent allowlisted, not the one the PUT claims", async () => {
    const { fileId, uploadUrl } = await openIntent(INTENT);
    await fetchApi(uploadUrl, {
      method: "PUT",
      // A header that disagrees with the intent. It used to be stored verbatim.
      headers: { "x-api-key": key, "content-type": "text/html" },
      body: PDF_BYTES,
    });
    expect((await fetchApi(`${uploadUrl}/confirm`, { method: "POST", headers: { "x-api-key": key } })).status).toBe(200);

    const row = await env.DB.prepare(`SELECT r2_key, mime FROM files WHERE id = ?`)
      .bind(fileId)
      .first<{ r2_key: string; mime: string }>();
    expect(row!.mime).toBe("application/pdf");
    const stored = await env.R2.head(row!.r2_key);
    expect(stored!.httpMetadata?.contentType).toBe("application/pdf");
  });
});

/**
 * The block's own rules, enforced where they cannot be edited.
 *
 * `accept` and `maxSizeMB` were sent to the client in the `upload_request`
 * event and checked there — which is to say checked by whoever was holding the
 * client.
 */
describe("the block's limits", () => {
  it("refuses a type the question does not accept", async () => {
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": key }, {
      ...INTENT,
      filename: "photo.png",
      mime: "image/png",
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: { code: "unsupported_type" } });
  });

  it("refuses a file larger than the question allows", async () => {
    // The question says 10MB; the plan allows more, so only the block refuses.
    const res = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": key }, {
      ...INTENT,
      size: 11 * 1024 * 1024,
    });
    expect(res.status).toBe(413);
  });
});

/**
 * A file answer names uploads by id, and the ids have to be real.
 *
 * `validateAnswer` can only check the shape of a descriptor — it is a pure
 * function in a package with no database — so `fileId`, `filename`, `mime`,
 * `size` and `r2Key` were all whatever the client posted. The answer is then
 * what the dashboard renders and the download route reads, which means a
 * respondent could label an executable `image/png`, claim a 2 KB file was
 * 40 MB, or point at another session's upload, and the stored answer would say
 * so.
 */
describe("file answers name real uploads", () => {
  const answer = (value: unknown) =>
    fetchApi(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ type: "structured", ref: "q_cv", value }),
    });

  it("refuses a descriptor whose id was never uploaded", async () => {
    const res = await answer([
      { fileId: "file_invented", filename: "cv.pdf", mime: "application/pdf", size: 15, r2Key: "uploads/x" },
    ]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { validation: { ref: string } | null; answers: Record<string, unknown> };
    expect(body.validation?.ref).toBe("q_cv");
    expect(body.answers.q_cv).toBeUndefined();
  });

  it("replaces what the client claimed with what the row says", async () => {
    // A genuine upload, confirmed.
    const opened = await intent(`/v1/sessions/${sessionId}/uploads/intent`, { "x-api-key": key });
    const { fileId, uploadUrl } = (await opened.json()) as { fileId: string; uploadUrl: string };
    await fetchApi(uploadUrl, {
      method: "PUT",
      headers: { "x-api-key": key, "content-type": "application/pdf" },
      body: PDF_BYTES,
    });
    await fetchApi(`${uploadUrl}/confirm`, { method: "POST", headers: { "x-api-key": key } });

    /**
     * The right id, and a pack of lies around it.
     *
     * The size stays under the block's 10MB so that `validateAnswer` — which
     * does check that much — passes it through. Everything the validator
     * cannot know is wrong: the name, the type, and an `r2Key` pointing
     * somewhere else entirely.
     */
    const res = await answer([
      { fileId, filename: "invoice.exe", mime: "application/x-msdownload", size: 5_000_000, r2Key: "uploads/../etc" },
    ]);
    const body = (await res.json()) as { answers: Record<string, unknown> };
    const stored = body.answers.q_cv as { filename: string; mime: string; size: number; r2Key: string }[];
    expect(stored[0]!.filename).toBe("cv.pdf");
    expect(stored[0]!.mime).toBe("application/pdf");
    expect(stored[0]!.size).toBe(PDF_BYTES.length);
    expect(stored[0]!.r2Key).toContain(`uploads/${t.orgId}/`);
  });
});

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
      body: PDF_BYTES,
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

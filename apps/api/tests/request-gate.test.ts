import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant, type Tenant } from "./helpers.js";

/**
 * The two pieces of middleware that now run on every request, and the one
 * thing each of them could plausibly break.
 *
 * `bodyLimit` refuses an oversized body — and has to refuse it the way this
 * API refuses everything else. Its own failure path throws an `HTTPException`,
 * which `app.onError` used to flatten into a 500: the caller would have been
 * told the server broke when in fact it had declined, and the log would carry
 * an `unhandled_error` for a request that was working as designed.
 *
 * `secureHeaders` mutates the response headers in place, and a response handed
 * back from a Durable Object stub — the respondent's SSE stream — has
 * immutable headers in workerd. Whether that throws depends on middleware
 * order, so the stream is exercised here rather than assumed.
 */

let t: Tenant;
const SLUG = "gate-form";

async function publish(): Promise<void> {
  const formId = "frm_requestgate";
  const versionId = "fv_requestgate";
  // Template mode: reaching the agent would make a real model call, and
  // nothing here is about the conversation.
  const doc = { ...minimalDoc("gate"), settings: { agent: { mode: "template" } } };
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'Gate form', ?5, 'published', ?6, 'salt', ?7, ?8, ?8)`,
    ).bind(formId, t.orgId, t.workspaceId, t.userId, SLUG, JSON.stringify(doc), versionId, now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(versionId, formId, JSON.stringify(doc), now, t.userId),
  ]);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("reqgate");
  await publish();
});

describe("body limit", () => {
  const oversized = JSON.stringify({ padding: "x".repeat(400 * 1024) });

  it("refuses an oversized body as a refusal, not a crash", async () => {
    const res = await fetchApi(`/p/forms/${SLUG}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversized,
    });

    expect(res.status).toBe(413);
    // The shape matters as much as the status: a 500 here would mean
    // `app.onError` swallowed the HTTPException again.
    expect(await res.json()).toMatchObject({ error: { code: "too_large" } });
  });

  it("applies to the dashboard and the API surfaces too", async () => {
    for (const [path, headers] of [
      ["/api/forms", { cookie: t.cookie }],
      ["/v1/forms", { authorization: `Bearer ${t.apiKeyRaw}` }],
    ] as const) {
      const res = await fetchApi(path, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: oversized,
      });
      expect(res.status, path).toBe(413);
    }
  });

  it("leaves a normal body alone", async () => {
    const res = await fetchApi(`/p/forms/${SLUG}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone: "Asia/Kolkata" }),
    });
    expect(res.status).toBe(200);
  });

  it("does not stand in front of a route that streams its own bytes", async () => {
    // A 100 MB upload legitimately exceeds the JSON ceiling; those routes are
    // bounded by the plan instead. Reaching the handler's own refusal — rather
    // than a 413 — is the proof the limiter stepped aside.
    const res = await fetchApi("/p/sessions/sess_nonexistent/uploads/file_nope", {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", "x-respondent-token": "nope" },
      body: oversized,
    });
    expect(res.status).not.toBe(413);
    expect([401, 404]).toContain(res.status);
  });
});

describe("security headers", () => {
  it("are on an ordinary JSON response", async () => {
    const res = await fetchApi("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBeTruthy();
    expect(res.headers.get("strict-transport-security")).toBeTruthy();
  });

  it("are on the responses the routers never see", async () => {
    const res = await fetchApi("/no/such/route");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("do not declare a resource policy that would blank every form image", async () => {
    // `/p/assets/:id` is loaded from chatform.in into api.chatform.in. The
    // middleware's default `Cross-Origin-Resource-Policy: same-origin` would
    // make the browser refuse those <img> loads outright.
    const res = await fetchApi("/health");
    expect(res.headers.get("cross-origin-resource-policy")).toBe(null);
  });

  it("do not break the respondent's event stream", async () => {
    const started = await fetchApi(`/p/forms/${SLUG}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const { sessionId, respondentToken } = (await started.json()) as {
      sessionId: string;
      respondentToken: string;
    };

    // The token rides in the query string because EventSource cannot set a
    // header. This response comes back from the Durable Object stub, which is
    // the one whose headers workerd makes immutable.
    const stream = await fetchApi(`/p/sessions/${sessionId}/events?t=${respondentToken}`);
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    await stream.body?.cancel();
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * The embed origin allowlist.
 *
 * `settings.embed` is a setting a customer turns on expecting it to mean
 * something, and the body field it reads from has been accepted and ignored
 * since embedding shipped. The check has to be server-side: a page can claim any
 * origin it likes in a request body, but it cannot forge the Origin header the
 * browser sets.
 */

let t: Tenant;

const DOC = (allowedOrigins: string[]) => ({
  schemaVersion: 4,
  title: "Embeddable",
  blocks: [{ id: "blk_emb00001", ref: "q_email", type: "email", title: "Email?", required: true }],
  endings: [{ id: "end_emb00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  settings: { agent: { mode: "template" }, embed: { allowedOrigins } },
  theme: {},
});

async function publish(slug: string, versionId: string, allowedOrigins: string[]) {
  const now = Date.now();
  const formId = `frm_${slug.replace(/-/g, "")}`.slice(0, 24);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'Embeddable', ?5, 'published', ?6, 'salt', ?7, ?8, ?8)`,
    ).bind(formId, t.orgId, t.workspaceId, t.userId, slug, JSON.stringify(DOC(allowedOrigins)), versionId, now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(versionId, formId, JSON.stringify(DOC(allowedOrigins)), now, t.userId),
  ]);
  return slug;
}

const open = (slug: string, origin?: string) =>
  fetchApi(`/p/forms/${slug}/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({ embed: { origin: origin ?? undefined } }),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("embed");
});

describe("allowlist", () => {
  it("lets any site embed a form with no allowlist", async () => {
    // The default, and what a public form usually wants.
    const slug = await publish("embed-open", "ver_embopen", []);
    expect((await open(slug, "https://anyone.example")).status).toBe(200);
  });

  it("allows a listed origin and refuses an unlisted one", async () => {
    const slug = await publish("embed-locked", "ver_emblock", ["https://acme.example"]);
    expect((await open(slug, "https://acme.example")).status).toBe(200);

    const refused = await open(slug, "https://evil.example");
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("origin_not_allowed");
  });

  it("matches a wildcard on the host, not as a substring", async () => {
    const slug = await publish("embed-wild", "ver_embwild", ["https://*.acme.example"]);
    expect((await open(slug, "https://app.acme.example")).status).toBe(200);
    // The lookalike a substring match would have let through.
    expect((await open(slug, "https://evil-acme.example")).status).toBe(403);
  });

  it("refuses an embedded open with no origin at all", async () => {
    const slug = await publish("embed-noorigin", "ver_embnoorig", ["https://acme.example"]);
    const res = await fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // An embed with no Origin header cannot be shown to be allowed, and the
      // body's claim about itself is worth nothing.
      body: JSON.stringify({ embed: { origin: "https://acme.example" } }),
    });
    expect(res.status).toBe(403);
  });

  it("does not apply the allowlist to a direct visit", async () => {
    // Someone opening the hosted link is not embedding it, and an allowlist for
    // frames must not lock people out of the form's own page.
    const slug = await publish("embed-direct", "ver_embdirect", ["https://acme.example"]);
    const res = await fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });
});

describe("source", () => {
  it("records an embedded session as embed, not chat", async () => {
    const slug = await publish("embed-source", "ver_embsrc", []);
    const res = await open(slug, "https://acme.example");
    const { sessionId } = (await res.json()) as { sessionId: string };
    const row = await env.DB.prepare(`SELECT source FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ source: string }>();
    // Which is what keeps the funnel able to tell embedded traffic apart.
    expect(row!.source).toBe("embed");
  });
});

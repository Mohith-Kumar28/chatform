import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";

/**
 * What the knowledge panel shows of each source: the start of the text read
 * out of it, and the uploaded file itself, so an image or a PDF can be seen
 * rather than named.
 */

let a: Tenant;
let b: Tenant;

async function seedFileSource(t: Tenant, id: string, mime: string, text: string) {
  const fileId = `ast_${id}`;
  const key = `knowledge/${t.orgId}/${t.formId}/${fileId}-f`;
  await env.R2.put(key, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: mime } });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO files (id, organization_id, form_id, uploaded_by, r2_key, filename, mime, size_bytes, status, created_at, confirmed_at)
       VALUES (?, ?, ?, 'builder', ?, 'f', ?, 3, 'confirmed', 1, 1)`,
    ).bind(fileId, t.orgId, t.formId, key, mime),
    env.DB.prepare(
      `INSERT INTO knowledge_sources (id, organization_id, form_id, kind, title, origin, file_id, status, bytes, chunk_count, created_at)
       VALUES (?, ?, ?, 'image', 'f', 'f', ?, 'ready', 3, 1, 1)`,
    ).bind(id, t.orgId, t.formId, fileId),
    env.DB.prepare(`INSERT INTO knowledge_chunks (id, source_id, form_id, ordinal, text, created_at) VALUES (?, ?, ?, 0, ?, 1)`).bind(
      `${id}_0`,
      id,
      t.formId,
      text,
    ),
  ]);
}

const get = (t: Tenant, path: string) => fetchApi(path, { headers: { cookie: t.cookie } });

beforeAll(async () => {
  await applySchema();
  a = await seedTenant("kbpreview_a");
  b = await seedTenant("kbpreview_b");
  await seedFileSource(a, "kbs_png", "image/png", `# Price list\n\n${"x".repeat(2000)}`);
  await seedFileSource(a, "kbs_doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Menu");
});

describe("GET /api/forms/:id/knowledge", () => {
  it("lists each source with its type and the start of its text", async () => {
    const res = await get(a, `/api/forms/${a.formId}/knowledge`);
    const body = (await res.json()) as { sources: { id: string; mime: string | null; excerpt: string | null }[] };
    const png = body.sources.find((s) => s.id === "kbs_png")!;
    expect(png.mime).toBe("image/png");
    expect(png.excerpt?.startsWith("# Price list")).toBe(true);
    expect(png.excerpt!.length).toBeLessThan(2000);
  });
});

describe("GET /api/forms/:id/knowledge/:sourceId/file", () => {
  it("serves an image inline, sandboxed", async () => {
    const res = await get(a, `/api/forms/${a.formId}/knowledge/kbs_png/file`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("downloads a type there is no preview for", async () => {
    const res = await get(a, `/api/forms/${a.formId}/knowledge/kbs_doc/file`);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    await res.body?.cancel();
  });

  it("never serves another organization's file", async () => {
    // Their form: the middleware refuses it.
    expect((await get(b, `/api/forms/${a.formId}/knowledge/kbs_png/file`)).status).toBe(404);
    // Their source id under your own form: not in this form.
    expect((await get(b, `/api/forms/${b.formId}/knowledge/kbs_png/file`)).status).toBe(404);
  });
});

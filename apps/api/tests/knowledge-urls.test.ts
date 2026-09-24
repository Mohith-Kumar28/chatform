import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";

/**
 * The two routes that hand the worker a URL to read.
 *
 * `link` checked the scheme and nothing else, and `crawl` checked nothing at
 * all — so `http://169.254.169.254/` satisfied both. What made that worse than
 * an ordinary SSRF is when the fetch happens: a knowledge source is stored
 * now and read by the queue consumer minutes later, from whatever
 * `knowledge_sources.origin` holds. An unvetted URL accepted here is a stored
 * request that fires out of band, with no caller left to show the result to.
 *
 * The address check therefore runs before the plan gate — which is why these
 * pass on a free-plan tenant, where knowledge is locked anyway.
 */

let t: Tenant;

const post = (path: string, body: unknown) =>
  fetchApi(path, {
    method: "POST",
    headers: { cookie: t.cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("knowurl");
});

const unfetchable = [
  ["the cloud metadata endpoint", "http://169.254.169.254/latest/meta-data/"],
  ["a private address", "http://10.0.0.1/docs"],
  ["another private range", "https://192.168.1.1/docs"],
  ["an internal name", "https://wiki.internal/docs"],
  ["loopback spelled as a decimal", "http://2130706433/docs"],
  ["loopback spelled in hex", "http://0x7f.0.0.1/docs"],
  ["an IPv4-mapped IPv6 metadata address", "http://[::ffff:169.254.169.254]/latest/"],
  ["credentials in the URL", "https://user:pw@docs.example.com/x"],
] as const;

describe("POST /api/forms/:id/knowledge/link", () => {
  it.each(unfetchable)("refuses %s", async (_label, url) => {
    const res = await post(`/api/forms/${t.formId}/knowledge/link`, { url });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "bad_url" } });
  });

  it("refuses a scheme that is not http", async () => {
    // `z.url()` accepts these; only the address rule refuses them.
    for (const url of ["ftp://docs.example.com/x", "file:///etc/passwd"]) {
      const res = await post(`/api/forms/${t.formId}/knowledge/link`, { url });
      expect([400, 422], url).toContain(res.status);
    }
  });
});

describe("POST /api/forms/:id/knowledge/crawl", () => {
  it.each(unfetchable)("refuses %s as a crawl seed", async (_label, url) => {
    // The more dangerous of the two: one seed becomes up to 25 fetches.
    const res = await post(`/api/forms/${t.formId}/knowledge/crawl`, { url, pages: 5 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "bad_url" } });
  });
});

describe("a public URL", () => {
  it("gets past the address check and is stopped by the plan instead", async () => {
    // Proof the guard is not simply refusing everything: a real documentation
    // URL reaches the entitlement gate, which is what should refuse it on a
    // free plan.
    const res = await post(`/api/forms/${t.formId}/knowledge/link`, { url: "https://docs.example.com/guide" });
    expect(res.status).not.toBe(400);
  });
});
